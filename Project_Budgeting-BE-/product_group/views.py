
from .serializers import QuoteSummarySerializer
from .models import Quote
from django.db.models import Avg, Sum, Count
from django.shortcuts import render
from django.http import Http404
from .models import ProductGroup, Product_Services, Quote
from .serializers import ProductGroupSerializer, ProductServicesSerializer, QuoteSerializer, ProductGroupWithModulesSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from .tasks import send_quote_email, send_quotation_status_change_email
from django.db.models import Q
from Project.models import Project

class ProductGroupListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [AllowAny]

    def get(self, request, pk=None):
        # If pk is provided → return single product group
        if pk is not None:
            try:
                product_group = ProductGroup.objects.get(pk=pk)
            except ProductGroup.DoesNotExist:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

            serializer = ProductGroupSerializer(product_group)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # If no pk → return all product groups
        product_groups = ProductGroup.objects.all()
        serializer = ProductGroupSerializer(product_groups, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = ProductGroupSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        try:
            product_group = ProductGroup.objects.get(pk=pk)
        except ProductGroup.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductGroupSerializer(product_group, partial=True, data=request.data)
        if serializer.is_valid():
            serializer.save(modified_by=request.user)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    

    def delete(self, request, pk):
        try:
            product_group = ProductGroup.objects.get(pk=pk)
        except ProductGroup.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        product_group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    


class ProductServicesView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [AllowAny]

    # Similar methods for Product_Services can be implemented here
    def get(self, request, pk=None):
        if pk is not None:
            try:
                product_services = Product_Services.objects.get(pk=pk)
            except ProductGroup.DoesNotExist:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

            serializer = ProductServicesSerializer(product_services)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # If no pk → return all product groups
        product_services = Product_Services.objects.all()
        serializer = ProductServicesSerializer(product_services, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    def post(self, request):
        serializer = ProductServicesSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    

    def put(self, request, pk):
        try:
            product_services = Product_Services.objects.get(pk=pk)
        except Product_Services.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductServicesSerializer(product_services, partial=True, data=request.data)
        if serializer.is_valid():
            serializer.save(modified_by=request.user)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    

    def delete(self, request, pk):
        try:
            product_services = Product_Services.objects.get(pk=pk)
        except Product_Services.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        product_services.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    

class ProductGroupNameListView(APIView):
    """
    API view to get a list of only the product group names.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Use values_list with flat=True to get a simple list of strings
        names = ProductGroup.objects.order_by('product_group_name').values_list('product_group_name', flat=True)
        return Response(names, status=status.HTTP_200_OK)
    
class ProductGroupWithModulesListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        groups = ProductGroup.objects.all()
        serializer = ProductGroupWithModulesSerializer(groups, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
class PipelineDataAPIView(APIView):
    permission_classes = [AllowAny]
    # def get(self, request):
    #     quotes = Quote.objects.all()

    #     # Stats
    #     total_quotes = quotes.count()
    #     average_quote = quotes.aggregate(avg=Avg('total_amount'))['avg'] or 0
    #     total_sum = quotes.aggregate(sum=Sum('total_amount'))['sum'] or 0
    #     # For demo, margin is not calculated, set to 0
    #     total_margin = 0

    #     # Group quotes by stage/status
    #     stages = []
    #     for stage in ['Oppurtunity', 'Scoping', 'Proposal', 'Confirmed', 'Rejected', 'Closed', 'Cancelled']:
    #         stage_quotes = quotes.filter(status__iexact=stage)
    #         serializer = QuoteSummarySerializer(stage_quotes, many=True)
    #         stages.append({
    #             'stage': stage.lower(),
    #             'title': stage.capitalize(),
    #             'count': stage_quotes.count(),
    #             'total_sum': float(stage_quotes.aggregate(sum=Sum('total_amount'))['sum'] or 0),
    #             'quotes': serializer.data
    #         })

    #     data = {
    #         'stats': {
    #             'total_quotes': total_quotes,
    #             'average_quote': float(average_quote),
    #             'total_sum': float(total_sum),
    #             'total_margin': float(total_margin)
    #         },
    #         'stages': stages
    #     }
    #     return Response(data)

from django.db.models import Q, Avg, Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from Project.models import Project
from .models import Quote
from .serializers import QuoteSummarySerializer


# class PipelineDataAPIView(APIView):
#     permission_classes = [AllowAny]

#     ALL_STAGES = [
#         'Oppurtunity',
#         'Scoping',
#         'Proposal',
#         'Confirmed',
#         'Rejected',
#         'Closed',
#         'Cancelled'
#     ]

#     def get_base_queryset(self, request):
#         """
#         Apply all filters EXCEPT status.
#         This queryset is used for stats.
#         """
#         queryset = Quote.objects.select_related("client").all()

#         clients = request.query_params.getlist('client')
#         search = request.query_params.get('search')
#         has_project = request.query_params.get('has_project')
#         min_amount = request.query_params.get('min_amount')
#         max_amount = request.query_params.get('max_amount')

#         # 🔹 CLIENT FILTER
#         if clients:
#             client_filter = Q()
#             for client in clients:
#                 if client.isdigit():
#                     client_filter |= Q(client_id=int(client))
#                 else:
#                     client_filter |= Q(client__company_name__icontains=client)
#             queryset = queryset.filter(client_filter)

#         # 🔹 SEARCH FILTER
#         if search:
#             queryset = queryset.filter(
#                 Q(quote_name__icontains=search)
#             )

#         # 🔹 AMOUNT FILTER
#         if min_amount:
#             queryset = queryset.filter(total_amount__gte=min_amount)

#         if max_amount:
#             queryset = queryset.filter(total_amount__lte=max_amount)

#         # 🔹 HAS PROJECT FILTER
#         if has_project is not None:
#             project_quotes = Project.objects.values_list(
#                 'created_from_quotation',
#                 flat=True
#             )

#             if has_project.lower() == 'true':
#                 queryset = queryset.filter(
#                     quote_no__in=project_quotes
#                 )
#             elif has_project.lower() == 'false':
#                 queryset = queryset.exclude(
#                     quote_no__in=project_quotes
#                 )

#         return queryset

#     def get(self, request):

#         # 🔹 Base dataset (NO status filter)
#         base_queryset = self.get_base_queryset(request)

#         # 🔹 Status filter only for stage visibility
#         requested_statuses = request.query_params.getlist('status')

#         # 📊 STATS (based on base_queryset ONLY)
#         stats_data = base_queryset.aggregate(
#             total_sum=Sum('total_amount'),
#             average_quote=Avg('total_amount')
#         )

#         total_quotes = base_queryset.count()

#         # 🧠 Load all filtered quotes once
#         quotes = list(base_queryset)

#         # 🔹 Prepare stage map
#         stage_map = {stage: [] for stage in self.ALL_STAGES}

#         for quote in quotes:
#             stage_map.get(quote.status, []).append(quote)

#         # 🔹 Decide which stages to show
#         if requested_statuses:
#             stages_to_render = requested_statuses
#         else:
#             stages_to_render = self.ALL_STAGES

#         stages_response = []

#         for stage in stages_to_render:
#             stage_quotes = stage_map.get(stage, [])

#             serializer = QuoteSummarySerializer(stage_quotes, many=True)

#             stage_total = sum(
#                 float(q.total_amount) for q in stage_quotes
#             )

#             stages_response.append({
#                 "stage": stage.lower(),
#                 "title": stage,
#                 "count": len(stage_quotes),
#                 "total_sum": stage_total,
#                 "quotes": serializer.data
#             })

#         return Response({
#         "stats": {
#             "total_quotes": total_quotes,
#             "revenue": float(total_revenue),
#             "expected_profit": float(expected_profit),
#             "avg_margin_percentage": float(round(avg_margin, 2)),
#             "average_quote": float(stats_data["average_quote"] or 0),
#         },
#         "stages": stages_response
#     })


# from decimal import Decimal
# from django.db.models import Q, Sum, Avg
# from rest_framework.views import APIView
# from rest_framework.response import Response
# from rest_framework.permissions import AllowAny


# class PipelineDataAPIView(APIView):
#     permission_classes = [AllowAny]

#     ALL_STAGES = [
#         'Oppurtunity',
#         'Scoping',
#         'Proposal',
#         'Confirmed',
#         'Rejected',
#         'Closed',
#         'Cancelled'
#     ]

#     def get_base_queryset(self, request):
#         queryset = Quote.objects.select_related(
#             "client",
#             "project__budget"   # 🔥 Important
#         ).all()

#         clients = request.query_params.getlist('client')
#         search = request.query_params.get('search')
#         has_project = request.query_params.get('has_project')
#         min_amount = request.query_params.get('min_amount')
#         max_amount = request.query_params.get('max_amount')

#         # CLIENT FILTER
#         if clients:
#             client_filter = Q()
#             for client in clients:
#                 if client.isdigit():
#                     client_filter |= Q(client_id=int(client))
#                 else:
#                     client_filter |= Q(client__company_name__icontains=client)
#             queryset = queryset.filter(client_filter)

#         # SEARCH FILTER
#         if search:
#             queryset = queryset.filter(
#                 Q(quote_name__icontains=search)
#             )

#         # AMOUNT FILTER
#         if min_amount:
#             queryset = queryset.filter(total_amount__gte=min_amount)

#         if max_amount:
#             queryset = queryset.filter(total_amount__lte=max_amount)

#         # HAS PROJECT FILTER
#         if has_project is not None:
#             if has_project.lower() == "true":
#                 queryset = queryset.filter(project__isnull=False)
#             elif has_project.lower() == "false":
#                 queryset = queryset.filter(project__isnull=True)

#         return queryset

#     def get(self, request):

#         base_queryset = self.get_base_queryset(request)
#         requested_statuses = request.query_params.getlist('status')

#         # =========================
#         # 📊 STATS SECTION
#         # =========================

#         stats_data = base_queryset.aggregate(
#             revenue=Sum('total_amount'),
#             average_quote=Avg('total_amount')
#         )

#         total_quotes = base_queryset.count()
#         total_revenue = stats_data["revenue"] or Decimal("0.00")

#         expected_profit = Decimal("0.00")

#         for quote in base_queryset:
#             project = getattr(quote, "project", None)

#             if project:
#                 budget_obj = getattr(project, "budget", None)

#                 if budget_obj and budget_obj.total_budget is not None:
#                     expected_profit += (
#                         quote.total_amount - budget_obj.total_budget
#                     )

#         if total_revenue > 0:
#             avg_margin = (expected_profit / total_revenue) * 100
#         else:
#             avg_margin = Decimal("0.00")

#         # =========================
#         # 📊 PIPELINE STAGES
#         # =========================

#         quotes = list(base_queryset)

#         stage_map = {stage: [] for stage in self.ALL_STAGES}

#         for quote in quotes:
#             stage_map.get(quote.status, []).append(quote)

#         if requested_statuses:
#             stages_to_render = requested_statuses
#         else:
#             stages_to_render = self.ALL_STAGES

#         stages_response = []

#         for stage in stages_to_render:
#             stage_quotes = stage_map.get(stage, [])

#             serializer = QuoteSummarySerializer(stage_quotes, many=True)

#             stage_total = sum(
#                 float(q.total_amount) for q in stage_quotes
#             )

#             stages_response.append({
#                 "stage": stage.lower(),
#                 "title": stage,
#                 "count": len(stage_quotes),
#                 "total_sum": stage_total,
#                 "quotes": serializer.data
#             })

#         return Response({
#             "stats": {
#                 "total_quotes": total_quotes,
#                 "revenue": float(total_revenue),
#                 "expected_profit": float(expected_profit),
#                 "avg_margin_percentage": float(round(avg_margin, 2)),
#                 "average_quote": float(stats_data["average_quote"] or 0),
#             },
#             "stages": stages_response
#         })

from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Q

from .models import Quote
from .serializers import QuoteSummarySerializer
from core.currency_utils import convert_to_inr


class PipelineDataAPIView(APIView):
    permission_classes = [AllowAny]

    ALL_STAGES = [
        "Oppurtunity",
        "Scoping",
        "Proposal",
        "Confirmed",
        "Rejected",
        "Closed",
        "Cancelled"
    ]

    def get_base_queryset(self, request):
        queryset = Quote.objects.select_related(
            "client",
            "project__budget"
        ).all()

        clients = request.query_params.getlist("client")
        search = request.query_params.get("search")
        has_project = request.query_params.get("has_project")
        min_amount = request.query_params.get("min_amount")
        max_amount = request.query_params.get("max_amount")

        # CLIENT FILTER
        if clients:
            client_filter = Q()
            for client in clients:
                if client.isdigit():
                    client_filter |= Q(client_id=int(client))
                else:
                    client_filter |= Q(client__company_name__icontains=client)
            queryset = queryset.filter(client_filter)

        # SEARCH FILTER
        if search:
            queryset = queryset.filter(
                Q(quote_name__icontains=search)
            )

        # AMOUNT FILTER
        if min_amount:
            queryset = queryset.filter(total_amount__gte=min_amount)

        if max_amount:
            queryset = queryset.filter(total_amount__lte=max_amount)

        # HAS PROJECT FILTER
        if has_project is not None:
            if has_project.lower() == "true":
                queryset = queryset.filter(project__isnull=False)
            elif has_project.lower() == "false":
                queryset = queryset.filter(project__isnull=True)

        return queryset

    def get(self, request):

        base_queryset = self.get_base_queryset(request)
        requested_statuses = request.query_params.getlist("status")

        quotes = list(base_queryset)

        # =========================
        # 📊 STATS (IN INR)
        # =========================

        total_quotes = len(quotes)
        total_revenue = 0
        expected_profit = 0

        for quote in quotes:

            quote_amount_inr = convert_to_inr(
                quote.total_amount,
                quote.currency
            )

            total_revenue += quote_amount_inr

            project = getattr(quote, "project", None)

            if project:
                budget_obj = getattr(project, "budget", None)

                if budget_obj and budget_obj.total_budget is not None:
                    expected_profit += (
                        quote_amount_inr -
                        float(budget_obj.total_budget)
                    )

        average_quote = (
            total_revenue / total_quotes if total_quotes else 0
        )

        avg_margin = (
            (expected_profit / total_revenue) * 100
            if total_revenue > 0 else 0
        )

        # =========================
        # 📊 PIPELINE STAGES
        # =========================

        stage_map = {stage: [] for stage in self.ALL_STAGES}

        for quote in quotes:
            stage_map.get(quote.status, []).append(quote)

        stages_to_render = (
            requested_statuses if requested_statuses else self.ALL_STAGES
        )

        stages_response = []

        for stage in stages_to_render:
            stage_quotes = stage_map.get(stage, [])

            serializer = QuoteSummarySerializer(
                stage_quotes,
                many=True
            )

            stage_total = sum(
                convert_to_inr(q.total_amount, q.currency)
                for q in stage_quotes
            )

            stages_response.append({
                "stage": stage.lower(),
                "title": stage,
                "count": len(stage_quotes),
                "total_sum": round(stage_total, 2),
                "quotes": serializer.data
            })

        return Response({
            "stats": {
                "total_quotes": total_quotes,
                "revenue": round(total_revenue, 2),
                "expected_profit": round(expected_profit, 2),
                "avg_margin_percentage": round(avg_margin, 2),
                "average_quote": round(average_quote, 2),
            },
            "stages": stages_response
        })



from rest_framework.permissions import AllowAny
from .models import QuoteItem
class QuoteStatusChoicesView(APIView):
    permission_classes = [AllowAny]
    def get(self, request):
        choices = [{"value": c[0], "label": c[1]} for c in Quote.STATUS_CHOICES]
        return Response(choices)
    
class QuoteItemUnitChoicesView(APIView):
    permission_classes = [AllowAny]
    def get(self, request):
        choices = [{"value": c[0], "label": c[1]} for c in QuoteItem.UNIT_CHOICES]
        return Response(choices)
    

# --- QUOTATION VIEWS ---

class QuoteListCreateView(APIView):
    """
    API view to list all quotes or create a new one.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        quotes = Quote.objects.all().order_by('-date_of_issue')
        serializer = QuoteSerializer(quotes, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = QuoteSerializer(data=request.data)
        if serializer.is_valid():
            # Pass the user from the request to the serializer's create method
            serializer.save(created_by=request.user, author=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class QuoteDetailView(APIView):
    """
    API view to retrieve, update or delete a quote instance.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return Quote.objects.get(pk=pk)
        except Quote.DoesNotExist:
            raise Http404

    def get(self, request, pk):
        quote = self.get_object(pk)
        from .serializers import QuoteDetailSerializer
        serializer = QuoteDetailSerializer(quote)
        return Response(serializer.data)

    

    # def put(self, request, pk):
    #     quote = self.get_object(pk)

    #     # 🔹 STEP 1: store old status BEFORE update
    #     old_status = quote.status

    #     serializer = QuoteSerializer(quote, data=request.data, partial=True)
    #     if serializer.is_valid():
    #         requested_status = serializer.validated_data.get('status')

    #         # Block no-op status updates if the same status is explicitly sent
    #         if requested_status is not None and requested_status == old_status:
    #             return Response(
    #                 {"error": f"Status is already '{old_status}'. No change applied."},
    #                 status=status.HTTP_400_BAD_REQUEST,
    #             )

    #         serializer.save(modified_by=request.user)

    #         # 🔹 STEP 2: check status AFTER update
    #         new_status = serializer.instance.status

    #         # 🔥 STEP 3: trigger Celery task ONLY if status changed
    #         if old_status != new_status:
    #             send_quotation_status_change_email.delay(
    #                 quote.pk,
    #                 old_status,
    #                 new_status
    #             )

    #         return Response(serializer.data)

    #     return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    def put(self, request, pk):
        quote = self.get_object(pk)
        old_status = quote.status

        serializer = QuoteSerializer(
            quote, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)

        requested_status = serializer.validated_data.get("status")

        if requested_status and requested_status == old_status:
            return Response(
                {"error": f"Quote is already in '{old_status}' status."},
                status=status.HTTP_200_OK
            )

        serializer.save(modified_by=request.user)

        return Response(serializer.data, status=status.HTTP_200_OK)





    def delete(self, request, pk):
        quote = self.get_object(pk)
        quote.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)






    


class SendQuoteEmailView(APIView):
    """
    A view to send the quote details to the client via email.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return Quote.objects.get(pk=pk)
        except Quote.DoesNotExist:
            raise Http404

    
    def post(self, request, pk):
        quote = self.get_object(pk)

        if not quote.client or not quote.client.email:
            return Response(
                {"error": "No Point of Contact with an email address is associated with this quote."},
                status=status.HTTP_400_BAD_REQUEST
            )

        subject = f"Quotation: {quote.quote_name} (Ref: {quote.quote_no})"
        recipient_email = quote.client.email

        # Generate public link (set FRONTEND_BASE_URL in your settings.py)
        from django.conf import settings
        public_link = f"{settings.FRONTEND_BASE_URL}/pipeline/quote/{pk}/"

        message = f"""
        Dear {quote.client.company_name},

        Please find the details of your quotation '{quote.quote_name}' below.

        Quote No: {quote.quote_no}
        Total Amount: {quote.total_amount}
        Due Date: {quote.due_date.strftime('%d-%b-%Y')}

        You can view your quote online here:
        {public_link}

        Thank you for your business.

        Best regards,
        {request.user.first_name or 'Your Company'}
        """

        send_quote_email(subject, message, recipient_email)
        return Response({"success": f"Quote is being sent to {recipient_email}.", "link": public_link}, status=status.HTTP_200_OK)
    


# CBV for PDF Invoice Download
class QuoteInvoiceDownloadView(APIView):
    permission_classes = []  # Public access

    def get(self, request, pk):
        from django.template.loader import render_to_string
        from xhtml2pdf import pisa
        from django.http import HttpResponse
        from .models import Quote
        from io import BytesIO
        from django.shortcuts import get_object_or_404

        quote = get_object_or_404(Quote, pk=pk)
        import os
        from django.conf import settings
        logo_path = os.path.join(settings.BASE_DIR, 'static', 'img', 'sria_logo.png')
        context = {
            'quote_no': quote.quote_no,
            'quote_name': quote.quote_name,
            'date_of_issue': quote.date_of_issue,
            'due_date': quote.due_date,
            'status': quote.status,
            'author': quote.author,
            'client_name': quote.client.company_name if quote.client else '',
            'client_address': f"{quote.client.street_address}, {quote.client.city}, {quote.client.state}, {quote.client.country}" if quote.client else '',
            'sub_total': quote.sub_total,
            'tax_percentage': quote.tax_percentage,
            'total_amount': quote.total_amount,
            'total_cost': quote.total_cost,
            'in_house_cost': quote.in_house_cost,
            'outsourced_cost': quote.outsourced_cost,
            'invoiced_sum': quote.invoiced_sum,
            'to_be_invoiced_sum': quote.to_be_invoiced_sum,
            'items': quote.items.all(),
            'logo_path': logo_path,
        }
        html_string = render_to_string('quote_invoice.html', context)
        pdf_buffer = BytesIO()
        pisa.CreatePDF(html_string, pdf_buffer)
        pdf_file = pdf_buffer.getvalue()
        response = HttpResponse(pdf_file, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="invoice_{quote.quote_no}.pdf"'
        return response 