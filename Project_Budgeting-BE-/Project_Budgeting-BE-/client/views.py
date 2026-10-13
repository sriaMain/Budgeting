import logging
import time

import cloudinary.utils
import phonenumbers
import pycountry
from django.db import DatabaseError, IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.timezone import now
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from core.document_security import check_document_upload, effective_document_status, parse_expiry_date
from finances.models import Invoice, VendorBill
from product_group.models import Quote
from Project.models import Project
from roles.permission import HasPermissionCode

from . import onboarding
from .models import POC, ClientAuditLog, ClientChangeRequest, ClientDocument, Company, CompanyTag
from .permissions import has_perm, is_maker_locked, user_permissions
from .serializers import (
    BANK_IDENTITY_FIELDS,
    ClientApprovalSerializer,
    ClientAuditLogSerializer,
    ClientChangeRequestSerializer,
    ClientDocumentSerializer,
    CompanySerializer,
    CompanyTagSerializer,
    PointOfContactSerializer,
    _comparable,
)

logger = logging.getLogger(__name__)

# Field groups whose CHANGE needs an extra permission code on top of client.company.edit
# (checked on create, PUT and PATCH alike - only for values that actually change).
COMPLIANCE_FIELDS = {
    "sanctions_screening_status", "beneficial_ownership_status", "tax_residency_status",
    "enhanced_due_diligence_status", "compliance_remarks", "risk_rating",
}
BANKING_FIELDS = {
    "bank_account_holder_name", "bank_name", "bank_account_number", "bank_ifsc_code", "bank_routing_code",
    "bank_swift_code", "bank_iban", "bank_account_type", "bank_branch", "bank_country", "bank_address",
}
COMMERCIAL_FIELDS = {
    "payment_terms", "custom_payment_terms", "withholding_tax_applicable",
    "withholding_tax_percentage", "invoice_requirements", "po_required",
    "billing_frequency", "billing_contact", "billing_email", "commercial_remarks",
}
SECTION_PERMISSIONS = (
    (COMPLIANCE_FIELDS, "client.compliance.edit", "the compliance review"),
    (BANKING_FIELDS, "client.banking.edit", "the bank details"),
    (COMMERCIAL_FIELDS, "client.commercial.edit", "the commercial terms"),
    # Marking the bank account verified / rejected is a reviewer's decision.
    ({"banking_verification_status"}, "client.document.verify", "the bank verification status"),
    # Only enhanced_review / review_due get this far (CompanySerializer rejects the rest).
    ({"kyc_status"}, "client.company.approve", "the KYC status"),
)

LOCKED_MESSAGE = (
    "This client has been submitted for approval and is locked for editing. "
    "A reviewer must approve it or request changes first."
)
CONFLICT_MESSAGE = (
    "This client conflicts with an existing record - the legal name, email or phone number is already registered."
)


def _context(request):
    return {"request": request, "user_permissions": user_permissions(request.user)}


def _log_client_audit(company, action, request, field_name="", old_value="", new_value=""):
    """Client audit trail. Never pass a raw sensitive value (bank / tax / identity data) in
    old_value/new_value - callers log field names only for those."""
    user = getattr(request, "user", None)
    ClientAuditLog.objects.create(
        company=company,
        company_name=company.company_name,
        action=action,
        field_name=str(field_name or "")[:100],
        old_value=("" if old_value is None else str(old_value))[:255],
        new_value=("" if new_value is None else str(new_value))[:255],
        performed_by=user if user and user.is_authenticated else None,
    )


def _changed_fields(instance, validated_data):
    """Names of the validated fields whose value differs from the stored one (or, on create, from
    the model default). A full-payload PUT therefore only touches - and needs permission for -
    what the user actually changed."""
    changed = set()
    for name, value in validated_data.items():
        if name == "tags":
            new = {tag.pk for tag in value}
            old = set(instance.tags.values_list("pk", flat=True)) if instance is not None else set()
            if new != old:
                changed.add(name)
            continue
        current = getattr(instance, name) if instance is not None else Company._meta.get_field(name).get_default()
        if _comparable(current) != _comparable(value):
            changed.add(name)
    return changed


def _section_denial(user, changed):
    for fields, code, label in SECTION_PERMISSIONS:
        if changed & fields and not has_perm(user, code):
            return Response(
                {"error": f"You do not have permission to change {label} of this client."},
                status=status.HTTP_403_FORBIDDEN,
            )
    return None


def _field_list(fields):
    return ", ".join(sorted(fields))[:100]


def _audit_update(company, request, changed, previous, commercials_before):
    general = set(changed)
    if company.kyc_status != previous["kyc_status"]:
        _log_client_audit(company, "kyc_status_changed", request, field_name="kyc_status",
                          old_value=previous["kyc_status"], new_value=company.kyc_status)
    general.discard("kyc_status")
    if "risk_rating" in changed:
        _log_client_audit(company, "risk_rating_changed", request, field_name="risk_rating",
                          old_value=previous["risk_rating"], new_value=company.risk_rating)
        general.discard("risk_rating")
    compliance = changed & (COMPLIANCE_FIELDS - {"risk_rating"})
    if compliance:
        _log_client_audit(company, "compliance_updated", request, field_name=_field_list(compliance))
        general -= compliance
    if company.banking_verification_status != previous["banking_verification_status"]:
        action = {"verified": "banking_verified", "rejected": "banking_rejected"}.get(company.banking_verification_status, "updated")
        _log_client_audit(company, action, request, field_name="banking_verification_status",
                          old_value=previous["banking_verification_status"], new_value=company.banking_verification_status)
    general.discard("banking_verification_status")
    if commercials_before is not None and commercials_before != "completed" and company.get_step_status("commercials") == "completed":
        _log_client_audit(company, "commercials_completed", request)
    if general:
        # Field names only - bank / tax values are never written to the audit trail.
        _log_client_audit(company, "updated", request, field_name=_field_list(general))


class CountryCodeAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):

        country_list = []

        for country in pycountry.countries:
            try:
                country_code = phonenumbers.country_code_for_region(country.alpha_2)

                if country_code:
                    country_list.append({
                        "name": country.name,
                        "iso_code": country.alpha_2,
                        "dial_code": f"+{country_code}"
                    })

            except Exception:
                continue

        # Remove duplicates (some regions share same code)
        unique_countries = {
            (c["iso_code"]): c for c in country_list
        }.values()

        return Response(
            sorted(unique_countries, key=lambda x: x["name"]),
            status=status.HTTP_200_OK
        )


class ClientPermissionsView(APIView):
    """GET -> the requesting user's Clients & KYC permissions ({flag: bool}). Lets the UI decide
    what to offer before a client exists; the endpoints enforce the same codes."""
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        return Response({"permissions": user_permissions(request.user)})


class CompanyListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "client.company.view", "POST": "client.company.create"}

    def get(self, request):
        try:
            companies = Company.objects.all().prefetch_related("tags", "documents", "change_requests").order_by("company_name")

            search = request.query_params.get("search")
            if search:
                companies = companies.filter(
                    Q(company_name__icontains=search)
                    | Q(email__icontains=search)
                    | Q(pocs__poc_name__icontains=search)
                ).distinct()

            risk = request.query_params.get("risk")
            if risk:
                companies = companies.filter(risk_rating=risk)

            kyc_status = request.query_params.get("kyc_status")
            if kyc_status:
                companies = companies.filter(kyc_status=kyc_status)

            is_active = request.query_params.get("is_active")
            if is_active is not None:
                companies = companies.filter(is_active=is_active.lower() in ("true", "1"))

            serializer = CompanySerializer(companies, many=True, context=_context(request))
            return Response(serializer.data, status=status.HTTP_200_OK)
        except DatabaseError:
            logger.exception("Client list query failed")
            return Response(
                {"error": "Database error while fetching companies."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def post(self, request):
        """Creates a draft client. Only the Basic Information minimum is required (legal name,
        email, phone, country); everything else can follow step by step."""
        serializer = CompanySerializer(data=request.data, context=_context(request))
        serializer.is_valid(raise_exception=True)
        changed = _changed_fields(None, serializer.validated_data)
        denied = _section_denial(request.user, changed)
        if denied:
            return denied
        extra = {}
        if changed & COMPLIANCE_FIELDS:
            extra.update(compliance_reviewed_by=request.user, compliance_reviewed_at=now())
        try:
            with transaction.atomic():
                company = serializer.save(**extra)
        except IntegrityError:
            return Response({"error": CONFLICT_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)
        _log_client_audit(company, "created", request)
        return Response(CompanySerializer(company, context=_context(request)).data, status=status.HTTP_201_CREATED)


class ClientDropdownAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        companies = Company.objects.all().order_by("company_name")

        # Additive, opt-in: only CreateProjectModal passes this, so every other caller
        # (e.g. Navbar's global client search) keeps seeing the full, unfiltered list.
        if request.query_params.get("ready_only") in ("1", "true", "True"):
            companies = [c for c in companies if c.is_project_ready]

        return Response([{"id": c.id, "company_name": c.company_name} for c in companies])


class CompanyDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "client.company.view",
        "PUT": "client.company.edit",
        "PATCH": "client.company.edit",
        "DELETE": "client.company.delete",
    }

    def get_object(self, pk):
        return get_object_or_404(Company, pk=pk)

    def get(self, request, pk):
        company = self.get_object(pk)
        return Response(CompanySerializer(company, context=_context(request)).data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        # Same path as PATCH: older screens send the whole form, so only fields whose values
        # actually change are saved, permission-checked and audited.
        return self._update(request, pk)

    def patch(self, request, pk):
        return self._update(request, pk)

    def _update(self, request, pk):
        company = self.get_object(pk)
        if is_maker_locked(company, request.user):
            return Response({"error": LOCKED_MESSAGE}, status=status.HTTP_409_CONFLICT)

        serializer = CompanySerializer(company, data=request.data, partial=True, context=_context(request))
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        changed = _changed_fields(company, validated)
        denied = _section_denial(request.user, changed)
        if denied:
            return denied
        for name in list(validated):
            if name not in changed:
                validated.pop(name)
        if not changed:
            return Response(CompanySerializer(company, context=_context(request)).data, status=status.HTTP_200_OK)

        previous = {
            "kyc_status": company.kyc_status,
            "risk_rating": company.risk_rating,
            "banking_verification_status": company.banking_verification_status,
        }
        commercials_before = company.get_step_status("commercials") if changed & COMMERCIAL_FIELDS else None
        extra = {}
        if (
            changed & BANK_IDENTITY_FIELDS
            and "banking_verification_status" not in changed
            and company.banking_verification_status != "not_verified"
        ):
            # The account a reviewer verified is not the one on file any more.
            extra["banking_verification_status"] = "not_verified"
        if changed & COMPLIANCE_FIELDS:
            extra.update(compliance_reviewed_by=request.user, compliance_reviewed_at=now())

        try:
            with transaction.atomic():
                updated = serializer.save(**extra)
        except IntegrityError:
            return Response({"error": CONFLICT_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)

        updated = Company.objects.get(pk=updated.pk)
        _audit_update(updated, request, changed, previous, commercials_before)
        return Response(CompanySerializer(updated, context=_context(request)).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        company = self.get_object(pk)
        _log_client_audit(company, "deleted", request, field_name="company_name", old_value=company.company_name)
        company.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CompanyTagListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        try:
            tags = CompanyTag.objects.all().order_by("name")
            serializer = CompanyTagSerializer(tags, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except DatabaseError:
            return Response(
                {"error": "Database error while fetching tags."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def post(self, request):
        serializer = CompanyTagSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tag = serializer.save()
        return Response(CompanyTagSerializer(tag).data, status=status.HTTP_201_CREATED)


class CompanyTagDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get_object(self, pk):
        return get_object_or_404(CompanyTag, pk=pk)

    def get(self, request, pk):
        return Response(CompanyTagSerializer(self.get_object(pk)).data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        serializer = CompanyTagSerializer(self.get_object(pk), data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(CompanyTagSerializer(serializer.save()).data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        serializer = CompanyTagSerializer(self.get_object(pk), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(CompanyTagSerializer(serializer.save()).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        self.get_object(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PointOfContactListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        pocs = POC.objects.select_related("company").all()
        return Response(PointOfContactSerializer(pocs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = PointOfContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                poc = serializer.save()
        except IntegrityError:
            return Response(
                {"error": "This contact already exists for the client (same name, phone and email)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(PointOfContactSerializer(poc).data, status=status.HTTP_201_CREATED)


class PointOfContactDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get_object(self, pk):
        return get_object_or_404(POC, pk=pk)

    def get(self, request, pk):
        return Response(PointOfContactSerializer(self.get_object(pk)).data, status=status.HTTP_200_OK)

    def _update(self, request, pk):
        serializer = PointOfContactSerializer(self.get_object(pk), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                poc = serializer.save()
        except IntegrityError:
            return Response(
                {"error": "This contact already exists for the client (same name, phone and email)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(PointOfContactSerializer(poc).data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self._update(request, pk)

    def patch(self, request, pk):
        return self._update(request, pk)

    def delete(self, request, pk):
        self.get_object(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CompanyPOCListView(APIView):
    """
    API view to retrieve POCs for a specific company or all companies in a flat list.
    """
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.company.view"

    def get(self, request, company_id=None):
        if company_id is not None:
            company = get_object_or_404(Company, pk=company_id)

            # ------------------
            # POCs
            # ------------------
            pocs = POC.objects.filter(company=company)
            poc_list = []
            for poc in pocs:
                poc_list.append({
                    "id": poc.id,
                    "company_name": company.company_name,
                    "salutation": poc.salutation,
                    "first_name": poc.first_name,
                    "middle_name": poc.middle_name,
                    "last_name": poc.last_name,
                    "poc_name": getattr(poc, 'name', getattr(poc, 'poc_name', None)),
                    "designation": poc.designation,
                    "poc_mobile": str(getattr(poc, 'mobile', getattr(poc, 'poc_mobile', ""))) if getattr(poc, 'mobile', getattr(poc, 'poc_mobile', None)) else None,
                    "poc_email": getattr(poc, 'email', getattr(poc, 'poc_email', None)),
                })

            # ------------------
            # Quotations
            # ------------------
            quote_list = []
            for quote in Quote.objects.filter(client=company):
                quote_list.append({
                    "id": quote.quote_no,
                    "quote_name": quote.quote_name,
                    "status": quote.status,
                    "date_of_issue": quote.date_of_issue,
                    "due_date": quote.due_date,
                    "total_amount": quote.total_amount,
                })

            # ------------------
            # Projects
            # ------------------
            project_list = []
            for project in Project.objects.filter(client=company):
                project_list.append({
                    "project_no": project.project_no,
                    "project_name": project.project_name,
                    "status": project.status,
                    "project_type": project.project_type,
                    "currency": project.currency,
                    "start_date": project.start_date,
                    "end_date": project.end_date,
                })

            # ------------------
            # Invoices
            # ------------------
            invoice_list = []
            for invoice in Invoice.objects.filter(client=company):
                invoice_list.append({
                    "id": invoice.id,
                    "invoice_no": invoice.invoice_no,
                    "status": invoice.status,
                    "issue_date": invoice.issue_date,
                    "due_date": invoice.due_date,
                    "total_amount": invoice.total_amount,
                    "paid_amount": invoice.paid_amount,
                    "balance_amount": invoice.balance_amount,
                })

            # ------------------
            # Bills
            # ------------------
            bill_list = []
            bills = VendorBill.objects.filter(
                project__client=company
            )
            for bill in bills:
                bill_list.append({
                    "id": bill.id,
                    "bill_no": bill.bill_no,
                    "status": bill.status,
                    "total_amount": bill.total_amount,
                    "paid_amount": bill.paid_amount,
                    "balance_amount": bill.balance_amount,
                })

            company_data = CompanySerializer(company, context=_context(request)).data

            company_data.update({
                "pocs": poc_list,
                "quotations": quote_list,
                "projects": project_list,
                "invoices": invoice_list,
                "bills": bill_list,
            })

            return Response(company_data, status=status.HTTP_200_OK)

        # ==========================
        # ALL COMPANIES (FULL DATA)
        # ==========================
        companies = Company.objects.all().prefetch_related("tags", "documents", "change_requests")
        context = _context(request)
        result = []

        for company in companies:
            company_data = CompanySerializer(company, context=context).data

            # POCs
            pocs = POC.objects.filter(company=company)
            company_data["pocs"] = [
                {
                    "id": poc.id,
                    "salutation": poc.salutation,
                    "first_name": poc.first_name,
                    "middle_name": poc.middle_name,
                    "last_name": poc.last_name,
                    "poc_name": getattr(poc, 'name', getattr(poc, 'poc_name', None)),
                    "designation": poc.designation,
                    "poc_mobile": str(getattr(poc, 'mobile', getattr(poc, 'poc_mobile', ""))) if getattr(poc, 'mobile', getattr(poc, 'poc_mobile', None)) else None,
                    "poc_email": getattr(poc, 'email', getattr(poc, 'poc_email', None)),
                }
                for poc in pocs
            ]

            # Quotations
            company_data["quotations"] = [
                {
                    "id": q.quote_no,
                    "quote_name": q.quote_name,
                    "status": q.status,
                    "total_amount": q.total_amount,
                }
                for q in Quote.objects.filter(client=company)
            ]

            # Projects
            company_data["projects"] = [
                {
                    "project_no": p.project_no,
                    "project_name": p.project_name,
                    "status": p.status,
                }
                for p in Project.objects.filter(client=company)
            ]

            # Invoices
            company_data["invoices"] = [
                {
                    "invoice_no": i.invoice_no,
                    "status": i.status,
                    "total_amount": i.total_amount,
                }
                for i in Invoice.objects.filter(client=company)
            ]

            result.append(company_data)

        return Response(result, status=status.HTTP_200_OK)


# --------------------------------------------------------------------------- #
# KYC documents                                                                #
# --------------------------------------------------------------------------- #

MAX_CLIENT_DOCUMENTS = 8


def _document_error(message, http_status=400, error=None):
    # `detail` kept alongside `message` for existing consumers that read DRF's default key.
    return Response(
        {"success": False, "message": message, "detail": message, "error": error or message},
        status=http_status,
    )


class ClientDocumentListCreateView(APIView):
    """GET -> the client's documents. POST (multipart) -> upload one: `file`, `category`, and
    optionally `replaces` (id of this client's document it replaces - swapped in one request),
    `expiry_date` (YYYY-MM-DD, not in the past) and `document_number`. Uploading never verifies."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "client.document.view", "POST": "client.document.upload"}

    def get(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        docs = company.documents.select_related("uploaded_by", "verified_by")
        return Response(ClientDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, pk):
        # Read the multipart body before any early return: answering a large upload without
        # consuming it makes the dev server drop the connection, so the browser only ever saw
        # a network error instead of the real reason (e.g. the document limit).
        file = request.FILES.get("file")
        company = get_object_or_404(Company, pk=pk)

        if is_maker_locked(company, request.user):
            return _document_error(LOCKED_MESSAGE, http_status=status.HTTP_409_CONFLICT, error="client_locked")

        problem = check_document_upload(file)
        if problem:
            code, message = problem
            return _document_error(message, error=code)

        category = str(request.data.get("category") or "").strip()
        if category not in dict(ClientDocument.CATEGORY_CHOICES):
            return _document_error("Please select a valid document type.", error="invalid_document_type")

        replaced = None
        replaces = request.data.get("replaces")
        if replaces not in (None, "", "null", "undefined"):
            try:
                replaced = company.documents.get(pk=int(replaces))
            except (TypeError, ValueError, ClientDocument.DoesNotExist):
                return _document_error("The document being replaced was not found for this client.", error="invalid_replaces")
            if replaced.status == "verified" and not has_perm(request.user, "client.document.verify"):
                return _document_error(
                    "This document has been verified - only a reviewer can replace it.",
                    http_status=status.HTTP_403_FORBIDDEN, error="document_locked",
                )

        try:
            expiry_date = parse_expiry_date(request.data.get("expiry_date"))
        except ValueError:
            return _document_error("Enter the expiry date as YYYY-MM-DD.", error="invalid_expiry_date")
        if expiry_date and expiry_date < timezone.localdate():
            return _document_error(
                "The expiry date is in the past - upload a document that is still valid.", error="document_expired",
            )
        document_number = str(request.data.get("document_number") or "").strip()[:100]

        others = company.documents.all()
        if replaced is not None:
            others = others.exclude(pk=replaced.pk)
        if others.count() >= MAX_CLIENT_DOCUMENTS:
            return _document_error(
                f"Maximum {MAX_CLIENT_DOCUMENTS} KYC documents are allowed. Delete a document to upload another.",
                error="document_limit_reached",
            )
        if others.filter(file_name=file.name, file_size=file.size).exists():
            return _document_error("This document has already been uploaded for this client.", error="duplicate_document")

        serializer = ClientDocumentSerializer(
            data={"company": company.id, "category": category, "file": file}, context={"request": request},
        )
        if not serializer.is_valid():
            logger.warning("Client %s document upload rejected (fields: %s)", company.id, sorted(serializer.errors))
            return _document_error("Unable to upload document. Please check the file and try again.", error="invalid_document")
        try:
            with transaction.atomic():
                document = serializer.save(
                    is_required=category in onboarding.required_categories(company),
                    expiry_date=expiry_date,
                    document_number=document_number,
                )
                # Stored first, then the old one removed - a failed upload never loses the file on record.
                if replaced is not None:
                    replaced.delete()
        except Exception:
            logger.exception("Client %s document upload failed while storing the file", company.id)
            return _document_error(
                "Server could not process the document. Please try again.",
                http_status=status.HTTP_502_BAD_GATEWAY,
                error="storage_failed",
            )
        _log_client_audit(
            company, "document_replaced" if replaced is not None else "document_uploaded", request,
            field_name="category", new_value=document.get_category_display(),
        )
        return Response(ClientDocumentSerializer(document, context={"request": request}).data, status=201)


class ClientDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"DELETE": "client.document.delete"}

    def delete(self, request, pk, doc_id):
        company = get_object_or_404(Company, pk=pk)
        document = get_object_or_404(ClientDocument, pk=doc_id, company=company)
        if is_maker_locked(company, request.user):
            return _document_error(LOCKED_MESSAGE, http_status=status.HTTP_409_CONFLICT, error="client_locked")
        if document.status == "verified" and not has_perm(request.user, "client.document.verify"):
            return _document_error(
                "This document has been verified - only a reviewer can remove it.",
                http_status=status.HTTP_403_FORBIDDEN, error="document_locked",
            )
        label = document.get_category_display()
        document.delete()
        _log_client_audit(company, "document_deleted", request, field_name="category", old_value=label)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClientDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.document.view"

    def get(self, request, pk, doc_id):
        company = get_object_or_404(Company, pk=pk)
        document = get_object_or_404(ClientDocument, pk=doc_id, company=company)

        signed_url, _ = cloudinary.utils.cloudinary_url(
            document.file.public_id,
            resource_type="raw",
            sign_url=True,
            expires_at=int(time.time()) + 300,
        )
        return Response({"file_name": document.file_name, "download_url": signed_url})


class ClientAuditLogListView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.audit_log.view"

    def get(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        logs = company.audit_logs.select_related("performed_by")
        return Response(ClientAuditLogSerializer(logs, many=True).data)


DOCUMENT_REVIEW_ACTIONS = {
    "verified": "document_verified",
    "rejected": "document_rejected",
    "under_review": "document_under_review",
}


class ClientDocumentVerifyView(APIView):
    """POST {status: verified | rejected | under_review, remarks} - remarks are required to reject."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.document.verify"

    def post(self, request, pk, doc_id):
        company = get_object_or_404(Company, pk=pk)
        document = get_object_or_404(ClientDocument, pk=doc_id, company=company)

        new_status = request.data.get("status")
        if new_status not in DOCUMENT_REVIEW_ACTIONS:
            raise DRFValidationError({"status": ["Must be 'verified', 'rejected' or 'under_review'."]})
        remarks = str(request.data.get("remarks") or "").strip()
        if new_status == "rejected" and not remarks:
            return _document_error("A rejection reason is required.", error="rejection_reason_required")
        if new_status == "verified" and effective_document_status(document.status, document.expiry_date) == "expired":
            return _document_error(
                "This document has expired - ask for a current one instead of verifying it.", error="document_expired",
            )

        document.status = new_status
        document.verified_by = request.user
        document.verified_at = now()
        document.remarks = remarks
        document.save(update_fields=["status", "verified_by", "verified_at", "remarks"])

        _log_client_audit(
            company, DOCUMENT_REVIEW_ACTIONS[new_status], request,
            field_name=f"document:{document.get_category_display()}",
            new_value=document.get_status_display(),
        )
        return Response(ClientDocumentSerializer(document, context={"request": request}).data)


class ClientBankAccountUnmaskedView(APIView):
    """GET -> the full bank account number, for reviewers comparing it with the bank proof.
    Every reveal is audit-logged (without the number)."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.bank.view_unmasked"

    def get(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        _log_client_audit(company, "bank_account_viewed", request, field_name="bank_account_number")
        response = Response({"account_number": company.bank_account_number or ""})
        response["Cache-Control"] = "no-store"
        return response


# --------------------------------------------------------------------------- #
# Workflow: submit (maker) -> request changes / approve (checker)              #
# --------------------------------------------------------------------------- #

class ClientChangeRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "client.company.view", "POST": "client.request_changes"}

    def get(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        requests_qs = company.change_requests.select_related("requested_by")
        return Response(ClientChangeRequestSerializer(requests_qs, many=True).data)

    def post(self, request, pk):
        """Files a change request and moves the client to changes_requested."""
        company = get_object_or_404(Company, pk=pk)
        data = {
            "company": company.id,
            "section": request.data.get("section"),
            "required_changes": request.data.get("required_changes") or "",
            "comments": request.data.get("comments") or "",
        }
        serializer = ClientChangeRequestSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        previous = company.kyc_status
        with transaction.atomic():
            change_request = serializer.save()
            if previous != "changes_requested":
                company.kyc_status = "changes_requested"
                company.save(update_fields=["kyc_status", "updated_at"])
        _log_client_audit(
            company, "change_requested", request,
            field_name="section", new_value=change_request.get_section_display(),
        )
        if previous != company.kyc_status:
            _log_client_audit(company, "kyc_status_changed", request, field_name="kyc_status",
                              old_value=previous, new_value=company.kyc_status)
        return Response(ClientChangeRequestSerializer(change_request).data, status=201)


class ClientChangeRequestResolveView(APIView):
    """Marks a change request resolved; resolving the last open one returns a client in
    changes_requested to draft so it can be resubmitted."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.request_changes"

    def post(self, request, pk, cr_id):
        company = get_object_or_404(Company, pk=pk)
        change_request = get_object_or_404(ClientChangeRequest, pk=cr_id, company=company)
        if change_request.status == "resolved":
            return Response(ClientChangeRequestSerializer(change_request).data)
        previous = company.kyc_status
        with transaction.atomic():
            change_request.status = "resolved"
            change_request.resolved_at = now()
            change_request.save(update_fields=["status", "resolved_at"])
            if previous == "changes_requested" and not company.change_requests.filter(status="open").exists():
                company.kyc_status = "draft"
                company.save(update_fields=["kyc_status", "updated_at"])
        _log_client_audit(
            company, "change_resolved", request,
            field_name="section", new_value=change_request.get_section_display(),
        )
        if previous != company.kyc_status:
            _log_client_audit(company, "kyc_status_changed", request, field_name="kyc_status",
                              old_value=previous, new_value=company.kyc_status)
        return Response(ClientChangeRequestSerializer(change_request).data)


class ClientSubmitView(APIView):
    """Maker: POST -> submits the client for approval (kyc_status 'submitted').

    Every required field and required document must be in place; missing, rejected or expired
    required documents block it. 400 body: {"error", "errors": {"missing": [...], "issues":
    [{step, field, message}]}}."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.company.edit"

    def post(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        if company.kyc_status not in onboarding.SUBMITTABLE_STATUSES:
            message = {
                "submitted": "This client is already awaiting approval.",
                "verified": "This client is already approved.",
            }.get(company.kyc_status, "This client can't be submitted in its current status.")
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

        issues = onboarding.submission_issues(company)
        if issues:
            raise DRFValidationError({"missing": [issue["message"] for issue in issues], "issues": issues})

        previous = company.kyc_status
        company.kyc_status = "submitted"
        company.save(update_fields=["kyc_status", "updated_at"])
        _log_client_audit(company, "submitted_for_approval", request, field_name="kyc_status",
                          old_value=previous, new_value=company.kyc_status)
        return Response(CompanySerializer(company, context=_context(request)).data, status=status.HTTP_200_OK)


class ClientSubmitForApprovalView(APIView):
    """Approver: POST {approval_remarks?} -> marks the client Verified / Approved (project-ready).

    Served at both /approve/ and the legacy /submit-for-approval/ path. The client must be
    submitted (or a legacy draft), every required document verified and every blocker from
    client/onboarding.py cleared; nothing is logged unless approval actually happens."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.company.approve"

    def post(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        if company.is_project_ready:
            return Response({"error": "This client is already approved."}, status=status.HTTP_400_BAD_REQUEST)
        legacy_verified = company.kyc_status == "verified"  # verified by hand before approvals existed
        if company.kyc_status not in onboarding.APPROVABLE_STATUSES and not legacy_verified and company.kyc_status != "changes_requested":
            return Response({"error": "This client can't be approved in its current status."}, status=status.HTTP_400_BAD_REQUEST)

        body = ClientApprovalSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        blockers = company.get_approval_blockers()
        if blockers:
            raise DRFValidationError({"missing": blockers})

        previous = company.kyc_status
        company.kyc_status = "verified"
        company.onboarding_step = "approved"
        company.kyc_verified_by = request.user
        company.kyc_verified_at = now()
        company.approval_remarks = (body.validated_data.get("approval_remarks") or "").strip()
        company.save()

        _log_client_audit(
            company, "kyc_status_changed", request,
            field_name="kyc_status", old_value=previous, new_value=company.kyc_status,
        )
        _log_client_audit(company, "project_ready_marked", request)

        return Response(CompanySerializer(company, context=_context(request)).data, status=status.HTTP_200_OK)
