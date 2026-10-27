from django.urls import path, re_path
from .views import (ProductGroupListCreateView, ProductGroupNameListView, 
                    ProductServicesView, QuoteListCreateView, QuoteDetailView, SendQuoteEmailView, 
                    ProductGroupWithModulesListView, QuoteStatusChoicesView, QuoteItemUnitChoicesView, 
                    PipelineDataAPIView, QuoteInvoiceDownloadView,
                    ProductServiceArchiveView, UnitOfMeasureListView, TaxListCreateView,
                    CatalogPermissionsView, ProductServiceRelatedView, CatalogResourceOptionsView)


urlpatterns = [
    path('product-groups/', ProductGroupListCreateView.as_view(), name='product-group-list-create'),
    path('product-groups/<int:pk>/', ProductGroupListCreateView.as_view(), name='product-group-detail'),
    path('product-services/', ProductServicesView.as_view(), name='product-services-list-create'),
    path('product-services/<int:pk>/', ProductServicesView.as_view(), name='product-services-detail'),
    re_path(r'^product-services/(?P<pk>\d+)/(?P<action>archive|restore)/$', ProductServiceArchiveView.as_view(), name='product-services-archive'),
    path('product-services/<int:pk>/related/', ProductServiceRelatedView.as_view(), name='product-services-related'),
    path('catalog-resource-options/', CatalogResourceOptionsView.as_view(), name='catalog-resource-options'),
    path('catalog-permissions/', CatalogPermissionsView.as_view(), name='catalog-permissions'),
    path('units-of-measure/', UnitOfMeasureListView.as_view(), name='units-of-measure'),
    path('taxes/', TaxListCreateView.as_view(), name='tax-list-create'),
    path('taxes/<int:pk>/', TaxListCreateView.as_view(), name='tax-detail'),
    path('product-group-names/', ProductGroupNameListView.as_view(), name='product-group-names-list'),
    path('product-groups-with-modules/', ProductGroupWithModulesListView.as_view(), name='product-groups-with-modules'),
    path('quote-status-choices/', QuoteStatusChoicesView.as_view(), name='quote-status-choices'),
    path('quote-item-unit-choices/', QuoteItemUnitChoicesView.as_view(), name='quote-item-unit-choices'),
    # --- QUOTATION URLS ---
    path('quotes/', QuoteListCreateView.as_view(), name='quote-list-create'),
    path('quotes/<int:pk>/', QuoteDetailView.as_view(), name='quote-detail'),
    path('quotes/<int:pk>/send/', SendQuoteEmailView.as_view(), name='quote-send-email'),
    path('pipeline-data/', PipelineDataAPIView.as_view(), name='pipeline-data'),
    path('quotes/<int:pk>/pdf/', QuoteInvoiceDownloadView.as_view(), name='quote-download-invoice'),

]