from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.db import DatabaseError
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from .models import Company, CompanyTag
from .serializers import CompanySerializer, CompanyTagSerializer
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
    permission_classes = [All]
    def get(self, request):
        try:
            companies = Company.objects.all().order_by("company_name")
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
        companies = Company.objects.values("id", "company_name").order_by("company_name")
        return Response(list(companies))

class CompanyDetailAPIView(APIView):
    permission_classes = [All]
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
            serializer = CompanySerializer(company, data=request.data, partial=True)

            if serializer.is_valid():
                updated_company = serializer.save()
                return Response(CompanySerializer(updated_company).data, status=status.HTTP_200_OK)

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, pk):
        try:
            company = self.get_object(pk)
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
    permission_classes = [All]

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
                purchase_order__project__client=company
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
