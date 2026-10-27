import axiosInstance from '../utils/axiosInstance';

/** Products & Services catalog (backend: product_group.Product_Services, /api/product-services/). */

export type ProductType = 'service' | 'consumable' | 'digital';
export type CatalogKind = 'service' | 'product';
export type ServiceDeliveryType = '' | 'fixed_price' | 'time_material' | 'hourly' | 'daily' | 'milestone' | 'retainer' | 'subscription';
export type EngagementType = '' | 'fixed' | 'time_and_material';
export type ProcurementType = '' | 'subcontract' | 'freelancer' | 'software_license' | 'cloud' | 'hardware' | 'other';
export type DeliveryTeamType = '' | 'internal' | 'freelancer' | 'vendor' | 'mixed';
export type InvoicingPolicy = 'ordered' | 'delivered';
export type BillingMethod = '' | 'fixed' | 'hourly' | 'milestone';

export interface CatalogItem {
  id: number;
  product_service_name: string;
  /** Category name (kept for older screens); use product_group_id for the id. */
  product_group: string | null;
  product_group_id: number | null;
  category_path: string | null;
  description: string;
  is_active: boolean;
  internal_reference: string | null;
  product_type: ProductType;
  internal_notes: string;
  short_description: string;
  service_delivery_type: ServiceDeliveryType;
  category_icon: string | null;
  can_be_sold: boolean;
  sales_price: string;
  uom: number | null;
  uom_code: string | null;
  uom_name: string | null;
  sales_tax: number | null;
  sales_tax_name: string | null;
  sales_tax_rate: string | null;
  invoicing_policy: InvoicingPolicy;
  billing_method: BillingMethod;
  currency: string;
  default_discount_percent: string;
  payment_terms_days: number | null;
  default_engagement_type: EngagementType;
  default_contract_months: number | null;
  can_be_purchased: boolean;
  cost_price: string;
  purchase_description: string;
  purchase_uom: number | null;
  purchase_uom_name: string | null;
  purchase_tax: number | null;
  purchase_tax_name: string | null;
  preferred_vendor: number | null;
  preferred_vendor_name: string | null;
  vendor_reference: string;
  cost_currency: string;
  procurement_type: ProcurementType;
  department_name: string;
  suggested_designations: string[] | null;
  default_cost_rate: string | null;
  default_billing_rate: string | null;
  estimated_hours: string | null;
  delivery_team_type: DeliveryTeamType;
  /** Only present for users with catalog.accounting.view. */
  income_account?: number | null;
  income_account_label?: string | null;
  expense_account?: number | null;
  expense_account_label?: string | null;
  /** Quotation + invoice lines using this item. */
  usage_count: number | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Fields the create / edit form sends. */
export type CatalogItemInput = Partial<Pick<CatalogItem,
  | 'product_service_name' | 'description' | 'is_active' | 'internal_reference' | 'product_type' | 'internal_notes'
  | 'short_description' | 'service_delivery_type'
  | 'can_be_sold' | 'sales_price' | 'uom' | 'sales_tax' | 'invoicing_policy' | 'billing_method'
  | 'currency' | 'default_discount_percent' | 'payment_terms_days' | 'default_engagement_type' | 'default_contract_months'
  | 'can_be_purchased' | 'cost_price' | 'purchase_description' | 'purchase_uom' | 'purchase_tax' | 'preferred_vendor'
  | 'vendor_reference' | 'cost_currency' | 'procurement_type'
  | 'department_name' | 'suggested_designations' | 'default_cost_rate' | 'default_billing_rate' | 'estimated_hours'
  | 'delivery_team_type' | 'income_account' | 'expense_account'>> & { product_group?: number | null };

export interface CatalogCategory {
  id: number;
  product_group: string;
  parent: number | null;
  parent_name: string | null;
  full_name: string;
  is_active: boolean;
  icon: string;
  description: string;
}

export type CategoryInput = {
  product_group_name?: string; parent?: number | null; icon?: string; description?: string; is_active?: boolean;
};

interface RelatedList<T> { count: number; results: T[] }
export interface CatalogRelated {
  quotations: RelatedList<{ id: number; name: string; status: string; client: string | null; date: string; total: string | null; currency: string }>;
  invoices: RelatedList<{ id: number; number: string; status: string; client: string | null; date: string; total: string | null }>;
  purchase_orders: RelatedList<{ id: number; number: string; status: string; vendor: string | null; date: string; total: string | null }>;
  projects: RelatedList<{ id: number; name: string; status: string; start_date: string; end_date: string }>;
}
export interface ResourceOptions { departments: string[]; designations: string[] }

export interface UnitOfMeasure { id: number; code: string; name: string; category: string; is_active: boolean; }
export interface CatalogTax { id: number; name: string; rate: string; scope: 'sale' | 'purchase' | 'both'; is_active: boolean; }
export interface GLAccountOption { id: number; code: string; name: string; account_type: string; is_active: boolean; }
export interface VendorOption { id: number; name: string; }
export interface CatalogPermissions { can_manage: boolean; can_view_accounting: boolean; }

export const getCatalogItems = async (): Promise<CatalogItem[]> => (await axiosInstance.get('/product-services/')).data;
export const getCatalogItem = async (id: number): Promise<CatalogItem> => (await axiosInstance.get(`/product-services/${id}/`)).data;
export const createCatalogItem = async (data: CatalogItemInput): Promise<CatalogItem> =>
  (await axiosInstance.post('/product-services/', data)).data;
export const updateCatalogItem = async (id: number, data: CatalogItemInput): Promise<CatalogItem> =>
  (await axiosInstance.put(`/product-services/${id}/`, data)).data;
export const setCatalogItemArchived = async (id: number, archived: boolean): Promise<CatalogItem> =>
  (await axiosInstance.post(`/product-services/${id}/${archived ? 'archive' : 'restore'}/`)).data;

export const getCatalogCategories = async (): Promise<CatalogCategory[]> => (await axiosInstance.get('/product-groups/')).data;
export const createCatalogCategory = async (data: CategoryInput): Promise<CatalogCategory> =>
  (await axiosInstance.post('/product-groups/', data)).data;
export const updateCatalogCategory = async (id: number, data: CategoryInput): Promise<CatalogCategory> =>
  (await axiosInstance.put(`/product-groups/${id}/`, data)).data;
export const getCatalogRelated = async (id: number): Promise<CatalogRelated> =>
  (await axiosInstance.get(`/product-services/${id}/related/`)).data;
export const getResourceOptions = async (): Promise<ResourceOptions> =>
  (await axiosInstance.get('/catalog-resource-options/')).data;
export const getUnitsOfMeasure = async (): Promise<UnitOfMeasure[]> => (await axiosInstance.get('/units-of-measure/')).data;
export const getCatalogTaxes = async (): Promise<CatalogTax[]> => (await axiosInstance.get('/taxes/')).data;
export const getCatalogPermissions = async (): Promise<CatalogPermissions> => (await axiosInstance.get('/catalog-permissions/')).data;
export const getGLAccounts = async (): Promise<GLAccountOption[]> =>
  (await axiosInstance.get('/gl-accounts/', { params: { active_only: true } })).data;
export const getVendorOptions = async (): Promise<VendorOption[]> => {
  const { data } = await axiosInstance.get('/accounts/vendors/');
  const rows = Array.isArray(data) ? data : (data?.results ?? []);
  return rows.map((v: { id: number; name?: string; vendor_name?: string }) => ({ id: v.id, name: v.name || v.vendor_name || `Vendor #${v.id}` }));
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  service: 'Service', consumable: 'Physical Product', digital: 'Digital Product / Licence',
};
export const kindOf = (item: Pick<CatalogItem, 'product_type'>): CatalogKind => (item.product_type === 'service' ? 'service' : 'product');

export const DELIVERY_TYPES: { value: Exclude<ServiceDeliveryType, ''>; label: string; hint: string }[] = [
  { value: 'fixed_price', label: 'Fixed-Price Project', hint: 'One agreed price for the scope' },
  { value: 'time_material', label: 'Time & Material', hint: 'Billed on hours / days worked' },
  { value: 'hourly', label: 'Hourly Service', hint: 'Priced per hour' },
  { value: 'daily', label: 'Daily Service', hint: 'Priced per day' },
  { value: 'milestone', label: 'Milestone-Based Project', hint: 'Billed as milestones complete' },
  { value: 'retainer', label: 'Monthly Retainer', hint: 'Fixed monthly fee' },
  { value: 'subscription', label: 'Recurring Subscription', hint: 'Recurring plan, e.g. hosting or AMC' },
];
export const deliveryLabel = (v: ServiceDeliveryType) => DELIVERY_TYPES.find((d) => d.value === v)?.label ?? '';
export const PROCUREMENT_LABELS: Record<Exclude<ProcurementType, ''>, string> = {
  subcontract: 'Subcontracted development', freelancer: 'Freelancer / contractor',
  software_license: 'Software licence / subscription', cloud: 'Cloud / hosting', hardware: 'Hardware', other: 'Other third-party',
};
export const DELIVERY_TEAM_LABELS: Record<Exclude<DeliveryTeamType, ''>, string> = {
  internal: 'Internal team', freelancer: 'Freelancers', vendor: 'Vendor / partner', mixed: 'Mixed team',
};
export const ENGAGEMENT_LABELS: Record<Exclude<EngagementType, ''>, string> = {
  fixed: 'Fixed Budget / Milestone-Based', time_and_material: 'Time & Material (T&M)',
};
export const BILLING_METHOD_LABELS: Record<Exclude<BillingMethod, ''>, string> = {
  fixed: 'Fixed price', hourly: 'Hourly', milestone: 'Milestone-based',
};
