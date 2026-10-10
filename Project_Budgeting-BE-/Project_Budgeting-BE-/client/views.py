import logging
import os
import time

import cloudinary.utils
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.db import DatabaseError
from django.core.exceptions import ValidationError
from django.utils.timezone import now
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from roles.permission import HasPermissionCode
from .models import ClientAuditLog, ClientChangeRequest, ClientDocument, Company, CompanyTag
from .serializers import (
    ClientApprovalReadinessSerializer,
    ClientAuditLogSerializer,
    ClientChangeRequestSerializer,
    ClientDocumentSerializer,
    CompanySerializer,
    CompanyTagSerializer,
)
from rest_framework.permissions import AllowAny as All
from .models import POC
from .serializers import PointOfContactSerializer

from product_group.models import Quote
from product_group.serializers import QuoteSerializer
from Project.models import Project
from Project.serializers import ProjectListSerializer
from finances.models import Invoice, VendorBill
from finances.serializers import InvoiceListSerializer, VendorBillSerializer
import pycountry
import phonenumbers

# Field groups used by CompanyDetailAPIView.patch() to decide which extra
# permission code a PATCH touching that section requires.
COMPLIANCE_FIELDS = {
    "sanctions_screening_status", "beneficial_ownership_status", "tax_residency_status",
    "enhanced_due_diligence_status", "compliance_remarks", "compliance_reviewed_by",
    "compliance_reviewed_at",
}
BANKING_FIELDS = {
    "bank_name", "bank_account_number", "bank_code", "bank_branch", "bank_country",
    "bank_address", "banking_verification_status",
}
COMMERCIAL_FIELDS = {
    "payment_terms", "custom_payment_terms", "withholding_tax_applicable",
    "withholding_tax_percentage", "invoice_requirements", "po_required",
    "billing_frequency", "billing_contact", "billing_email", "commercial_remarks",
}


def _log_client_audit(company, action, request, field_name="", old_value="", new_value=""):
    """Client audit trail (Clients & KYC redesign) - scoped to Client alone,
    mirrors _log_freelancer_audit's shape. Never pass a raw sensitive value in
    old_value/new_value; callers must mask first."""
    user = getattr(request, "user", None)
    ClientAuditLog.objects.create(
        company=company,
        company_name=company.company_name,
        action=action,
        field_name=field_name,
        old_value=str(old_value) if old_value is not None else "",
        new_value=str(new_value) if new_value is not None else "",
        performed_by=user if user and user.is_authenticated else None,
    )

class CountryCodeAPIView(APIView):
    permission_classes = [All]

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

class CompanyListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "client.company.view", "POST": "client.company.create"}

    def get(self, request):
        try:
            companies = Company.objects.all().order_by("company_name")

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

            serializer = CompanySerializer(companies, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except DatabaseError:
            return Response(
                {"error": "Database error while fetching companies."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def post(self, request):
        serializer = CompanySerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            company = serializer.save()
            _log_client_audit(company, "created", request)
            read_serializer = CompanySerializer(company)
            return Response(read_serializer.data, status=status.HTTP_201_CREATED)

        except DRFValidationError as e:
            formatted_errors = {}
            errors = e.detail
            for field, messages in errors.items():
                if isinstance(messages, list) and messages:
                    message = messages[0]
                    field_name = field.replace('_', ' ')
                    if "This field is required." in message:
                        formatted_errors[field] = f"{field_name.lower()} is required"
                    else:
                        formatted_errors[field] = message
            return Response({"errors": formatted_errors}, status=status.HTTP_400_BAD_REQUEST)

        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response(
                {"error": f"Unexpected error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

from rest_framework.permissions import AllowAny 
class ClientDropdownAPIView(APIView):
    permission_classes = [AllowAny]

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
        try:
            company = self.get_object(pk)
            serializer = CompanySerializer(company)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception:
            return Response(
                {"error": "Company not found."}, status=status.HTTP_404_NOT_FOUND
            )

    def put(self, request, pk):
        try:
            company = self.get_object(pk)
            serializer = CompanySerializer(company, data=request.data)

            if serializer.is_valid():
                company = serializer.save()
                return Response(CompanySerializer(company).data, status=status.HTTP_200_OK)

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def patch(self, request, pk):
        try:
            company = self.get_object(pk)
            touched = set(request.data.keys())

            if request.data.get("onboarding_step") == "approved" and not request.user.has_role_permission(
                "client.company.approve"
            ):
                return Response(
                    {"error": "You do not have permission to approve this client."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            for fields, code in (
                (COMPLIANCE_FIELDS, "client.compliance.edit"),
                (BANKING_FIELDS, "client.banking.edit"),
                (COMMERCIAL_FIELDS, "client.commercial.edit"),
            ):
                if touched & fields and not request.user.has_role_permission(code):
                    return Response(
                        {"error": "You do not have permission to edit this section."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

            previous_kyc_status = company.kyc_status
            previous_risk_rating = company.risk_rating
            previous_banking_status = company.banking_verification_status

            serializer = CompanySerializer(company, data=request.data, partial=True)

            if serializer.is_valid():
                updated_company = serializer.save()
                logged_specific = False

                if updated_company.kyc_status != previous_kyc_status:
                    _log_client_audit(
                        updated_company, "kyc_status_changed", request,
                        field_name="kyc_status",
                        old_value=previous_kyc_status,
                        new_value=updated_company.kyc_status,
                    )
                    logged_specific = True
                if updated_company.risk_rating != previous_risk_rating:
                    _log_client_audit(
                        updated_company, "risk_rating_changed", request,
                        field_name="risk_rating",
                        old_value=previous_risk_rating,
                        new_value=updated_company.risk_rating,
                    )
                    logged_specific = True
                if touched & COMPLIANCE_FIELDS:
                    _log_client_audit(updated_company, "compliance_updated", request)
                    logged_specific = True
                if updated_company.banking_verification_status != previous_banking_status:
                    action = (
                        "banking_verified"
                        if updated_company.banking_verification_status == "verified"
                        else "banking_rejected" if updated_company.banking_verification_status == "rejected"
                        else None
                    )
                    if action:
                        _log_client_audit(
                            updated_company, action, request,
                            field_name="banking_verification_status",
                            old_value=previous_banking_status,
                            new_value=updated_company.banking_verification_status,
                        )
                        logged_specific = True
                if touched & COMMERCIAL_FIELDS and updated_company.get_step_status("commercials") == "completed":
                    _log_client_audit(updated_company, "commercials_completed", request)
                    logged_specific = True

                if not logged_specific:
                    _log_client_audit(updated_company, "updated", request)

                return Response(CompanySerializer(updated_company).data, status=status.HTTP_200_OK)

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, pk):
        try:
            company = self.get_object(pk)
            _log_client_audit(company, "deleted", request, field_name="company_name", old_value=company.company_name)
            company.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class CompanyTagListCreateAPIView(APIView):
    permission_classes = [All]
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
        try:
            serializer = CompanyTagSerializer(data=request.data)

            if serializer.is_valid():
                tag = serializer.save()
                return Response(
                    CompanyTagSerializer(tag).data,
                    status=status.HTTP_201_CREATED,
                )

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response(
                {"error": f"Unexpected error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
            
class CompanyTagDetailAPIView(APIView):
    permission_classes = [All]
    def get_object(self, pk):
        return get_object_or_404(CompanyTag, pk=pk)

    def get(self, request, pk):
        try:
            tag = self.get_object(pk)
            serializer = CompanyTagSerializer(tag)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception:
            return Response(
                {"error": "Tag not found."}, status=status.HTTP_404_NOT_FOUND
            )

    def put(self, request, pk):
        try:
            tag = self.get_object(pk)
            serializer = CompanyTagSerializer(tag, data=request.data)

            if serializer.is_valid():
                updated_tag = serializer.save()
                return Response(CompanyTagSerializer(updated_tag).data, status=status.HTTP_200_OK)

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response(
                {"error": f"Unexpected error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def patch(self, request, pk):
        try:
            tag = self.get_object(pk)
            serializer = CompanyTagSerializer(tag, data=request.data, partial=True)

            if serializer.is_valid():
                updated_tag = serializer.save()
                return Response(CompanyTagSerializer(updated_tag).data, status=status.HTTP_200_OK)

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, pk):
        try:
            tag = self.get_object(pk)
            tag.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



class PointOfContactListCreateAPIView(APIView):
    permission_classes = [All]
    def get(self, request):
        try:
            pocs = POC.objects.all()
            serializer = PointOfContactSerializer(pocs, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception:
            return Response(
                {"error": "Failed to fetch POCs."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def post(self, request):
        serializer = PointOfContactSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            poc = serializer.save()
            return Response(
                PointOfContactSerializer(poc).data,
                status=status.HTTP_201_CREATED,
            )
        except DRFValidationError as e:
            formatted_errors = {}
            errors = e.detail
            for field, messages in errors.items():
                if isinstance(messages, list) and messages:
                    message = messages[0]
                    field_name = field.replace('_', ' ')
                    if "This field is required." in message:
                        formatted_errors[field] = f"{field_name.lower()} is required"
                    else:
                        formatted_errors[field] = message
            return Response({"errors": formatted_errors}, status=status.HTTP_400_BAD_REQUEST)

        except DatabaseError:
            return Response(
                {"error": "Database error while creating POC."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        except Exception as e:
            return Response(
                {"error": f"Unexpected error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PointOfContactDetailAPIView(APIView):
    permission_classes = [All]
    def get_object(self, pk):
        return get_object_or_404(POC, pk=pk)

    def get(self, request, pk):
        try:
            poc = self.get_object(pk)
            serializer = PointOfContactSerializer(poc)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception:
            return Response(
                {"error": "POC not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

    def put(self, request, pk):
        poc = self.get_object(pk)
        serializer = PointOfContactSerializer(poc, data=request.data, partial=True)
        try:
            serializer.is_valid(raise_exception=True)
            updated_poc = serializer.save()
            return Response(
                PointOfContactSerializer(updated_poc).data,
                status=status.HTTP_200_OK,
            )
        except DRFValidationError as e:
            formatted_errors = {}
            errors = e.detail
            for field, messages in errors.items():
                if isinstance(messages, list) and messages:
                    message = messages[0]
                    field_name = field.replace('_', ' ')
                    if "This field is required." in message:
                        formatted_errors[field] = f"{field_name.lower()} is required"
                    else:
                        formatted_errors[field] = message
            return Response({"errors": formatted_errors}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response(
                {"error": f"Unexpected error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def patch(self, request, pk):
        poc = self.get_object(pk)
        serializer = PointOfContactSerializer(poc, data=request.data, partial=True)
        try:
            serializer.is_valid(raise_exception=True)
            updated_poc = serializer.save()
            return Response(
                PointOfContactSerializer(updated_poc).data,
                status=status.HTTP_200_OK,
            )
        except DRFValidationError as e:
            formatted_errors = {}
            errors = e.detail
            for field, messages in errors.items():
                if isinstance(messages, list) and messages:
                    message = messages[0]
                    field_name = field.replace('_', ' ')
                    if "This field is required." in message:
                        formatted_errors[field] = f"{field_name.lower()} is required"
                    else:
                        formatted_errors[field] = message
            return Response({"errors": formatted_errors}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def delete(self, request, pk):
        try:
            poc = self.get_object(pk)
            poc.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CompanyPOCListView(APIView):
    """
    API view to retrieve POCs for a specific company or all companies in a flat list.
    """
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.company.view"

    # def get(self, request, company_id=None):
    #     if company_id is not None:
    #         company = get_object_or_404(Company, pk=company_id)
    #         pocs = POC.objects.filter(company=company)
    #         poc_list = []
    #         for poc in pocs:
    #             poc_list.append({
    #                 "id": poc.id,
    #                 "company_name": company.company_name,
    #                 "poc_name": getattr(poc, 'name', getattr(poc, 'poc_name', None)),
    #                 "designation": poc.designation,
    #                 "poc_mobile": str(getattr(poc, 'mobile', getattr(poc, 'poc_mobile', ""))) if getattr(poc, 'mobile', getattr(poc, 'poc_mobile', None)) else None,
    #                 "poc_email": getattr(poc, 'email', getattr(poc, 'poc_email', None)),
    #             })
    #         company_data = CompanySerializer(company).data
    #         company_data["pocs"] = poc_list
    #         return Response(company_data, status=status.HTTP_200_OK)
    #     else:
    #         companies = Company.objects.all()
    #         result = []
    #         for company in companies:
    #             company_data = CompanySerializer(company).data
    #             pocs = POC.objects.filter(company=company)
    #             poc_list = []
    #             for poc in pocs:
    #                 poc_list.append({
    #                     "id": poc.id,
    #                     "company_name": company.company_name,
    #                     "poc_name": getattr(poc, 'name', getattr(poc, 'poc_name', None)),
    #                     "designation": poc.designation,
    #                     "poc_mobile": str(getattr(poc, 'mobile', getattr(poc, 'poc_mobile', ""))) if getattr(poc, 'mobile', getattr(poc, 'poc_mobile', None)) else None,
    #                     "poc_email": getattr(poc, 'email', getattr(poc, 'poc_email', None)),
    #                 })
    #             company_data["pocs"] = poc_list
    #             result.append(company_data)
    #         return Response(result, status=status.HTTP_200_OK)

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

            company_data = CompanySerializer(company).data

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
        companies = Company.objects.all()
        result = []

        for company in companies:
            company_data = CompanySerializer(company).data

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


logger = logging.getLogger(__name__)

MAX_CLIENT_DOCUMENTS = 8
MAX_CLIENT_DOCUMENT_SIZE = 10 * 1024 * 1024  # 10 MB, same limit the frontend enforces
ALLOWED_CLIENT_DOCUMENT_TYPES = {
    ".pdf": {"application/pdf"},
    ".jpg": {"image/jpeg", "image/pjpeg"},
    ".jpeg": {"image/jpeg", "image/pjpeg"},
    ".png": {"image/png"},
}


def _document_error(message, http_status=400, error=None):
    # `detail` kept alongside `message` for existing consumers that read DRF's default key.
    return Response(
        {"success": False, "message": message, "detail": message, "error": error or message},
        status=http_status,
    )


class ClientDocumentListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "client.document.view", "POST": "client.document.upload"}

    def get(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        docs = company.documents.all()
        return Response(ClientDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, pk):
        # Read the multipart body before any early return: answering a large upload without
        # consuming it makes the dev server drop the connection, so the browser only ever saw
        # a network error instead of the real reason (e.g. the document limit).
        file = request.FILES.get("file")
        company = get_object_or_404(Company, pk=pk)

        if not file:
            return _document_error("Please choose a file to upload.", error="file_required")
        if file.size == 0:
            return _document_error("The selected file is empty.", error="file_empty")
        if file.size > MAX_CLIENT_DOCUMENT_SIZE:
            return _document_error("File is too large. Maximum size is 10 MB.", error="file_too_large")

        ext = os.path.splitext(file.name or "")[1].lower()
        content_type = (file.content_type or "").lower()
        allowed_types = ALLOWED_CLIENT_DOCUMENT_TYPES.get(ext)
        # Some OSes send an empty or generic MIME type, so only an explicit mismatch is rejected.
        if not allowed_types or (content_type and content_type != "application/octet-stream" and content_type not in allowed_types):
            return _document_error("Only PDF, JPG, JPEG and PNG files are allowed.", error="unsupported_file_type")

        if company.documents.count() >= MAX_CLIENT_DOCUMENTS:
            return _document_error(
                f"Maximum {MAX_CLIENT_DOCUMENTS} KYC documents are allowed. Delete a document to upload another.",
                error="document_limit_reached",
            )
        if company.documents.filter(file_name=file.name, file_size=file.size).exists():
            return _document_error("This document has already been uploaded for this client.", error="duplicate_document")

        data = request.data.copy()
        data["company"] = company.id
        serializer = ClientDocumentSerializer(data=data, context={"request": request})
        if not serializer.is_valid():
            logger.warning("Client %s document upload rejected: %s", company.id, serializer.errors)
            if "category" in serializer.errors:
                return _document_error("Please select a valid document type.", error="invalid_document_type")
            return _document_error("Unable to upload document. Please check the file and try again.", error="invalid_document")
        try:
            document = serializer.save()
        except Exception:
            logger.exception("Client %s document upload failed while storing the file", company.id)
            return _document_error(
                "Server could not process the document. Please try again.",
                http_status=status.HTTP_502_BAD_GATEWAY,
                error="storage_failed",
            )
        _log_client_audit(
            company, "document_uploaded", request,
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
        document.delete()
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
        logs = company.audit_logs.all()
        return Response(ClientAuditLogSerializer(logs, many=True).data)


class ClientDocumentVerifyView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.document.verify"

    def post(self, request, pk, doc_id):
        company = get_object_or_404(Company, pk=pk)
        document = get_object_or_404(ClientDocument, pk=doc_id, company=company)

        new_status = request.data.get("status")
        if new_status not in ("verified", "rejected"):
            return Response({"status": ["Must be 'verified' or 'rejected'."]}, status=400)
        remarks = (request.data.get("remarks") or "").strip()
        if new_status == "rejected" and not remarks:
            return _document_error("A rejection reason is required.", error="rejection_reason_required")

        document.status = new_status
        document.verified_by = request.user
        document.verified_at = now()
        document.remarks = remarks
        document.save()

        _log_client_audit(
            company, "document_uploaded", request,
            field_name=f"document:{document.get_category_display()}",
            new_value=document.get_status_display(),
        )
        return Response(ClientDocumentSerializer(document, context={"request": request}).data)


class ClientChangeRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "client.company.view", "POST": "client.request_changes"}

    def get(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        return Response(ClientChangeRequestSerializer(company.change_requests.all(), many=True).data)

    def post(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        data = request.data.copy()
        data["company"] = company.id
        serializer = ClientChangeRequestSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        change_request = serializer.save()
        _log_client_audit(
            company, "change_requested", request,
            field_name="section", new_value=change_request.get_section_display(),
        )
        return Response(ClientChangeRequestSerializer(change_request).data, status=201)


class ClientChangeRequestResolveView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.request_changes"

    def post(self, request, pk, cr_id):
        company = get_object_or_404(Company, pk=pk)
        change_request = get_object_or_404(ClientChangeRequest, pk=cr_id, company=company)
        change_request.status = "resolved"
        change_request.resolved_at = now()
        change_request.save()
        _log_client_audit(
            company, "change_resolved", request,
            field_name="section", new_value=change_request.get_section_display(),
        )
        return Response(ClientChangeRequestSerializer(change_request).data)


class ClientSubmitForApprovalView(APIView):
    """Final Approval endpoint - mirrors VendorSubmitForApprovalView. Runs every rule from
    Company.get_approval_blockers() (a pure read of the company's current state) and, only if
    nothing is missing, marks the client Verified/Approved."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "client.company.approve"

    def post(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        _log_client_audit(company, "kyc_submitted", request)

        serializer = ClientApprovalReadinessSerializer(data=request.data, company=company)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        company.kyc_status = "verified"
        company.onboarding_step = "approved"
        company.kyc_verified_by = request.user
        company.kyc_verified_at = now()
        company.approval_remarks = serializer.validated_data.get("approval_remarks", "")
        company.save()

        company.change_requests.filter(status="open").update(status="resolved", resolved_at=now())

        _log_client_audit(
            company, "kyc_status_changed", request,
            field_name="kyc_status", old_value="draft", new_value=company.kyc_status,
        )
        _log_client_audit(company, "project_ready_marked", request)

        return Response(CompanySerializer(company).data, status=status.HTTP_200_OK)
