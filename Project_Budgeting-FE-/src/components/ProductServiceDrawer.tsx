import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Info, Search, X } from 'lucide-react';
import { Drawer } from './Drawer';
import { Tabs } from './Tabs';
import {
  DrawerFormFooter, DrawerSection, FieldError, FieldHint, SegmentedChoice,
  drawerErrorBorder, drawerInputClass, drawerLabelClass,
} from './drawerForm';
import { parseApiErrors } from '../utils/parseApiErrors';
import { formatDateTime } from '../utils/date';
import {
  DELIVERY_TEAM_LABELS, DELIVERY_TYPES, ENGAGEMENT_LABELS, PROCUREMENT_LABELS,
  createCatalogItem, getCatalogTaxes, getResourceOptions, getUnitsOfMeasure, getVendorOptions, kindOf, updateCatalogItem,
  type CatalogItem, type CatalogItemInput, type CatalogKind, type CatalogPermissions, type CatalogTax,
  type DeliveryTeamType, type EngagementType, type InvoicingPolicy, type ProcurementType, type ProductType,
  type ResourceOptions, type ServiceDeliveryType, type UnitOfMeasure, type VendorOption,
} from '../services/catalog';

type TabKey = 'basic' | 'sales' | 'cost' | 'resource' | 'additional';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'JPY'];
// Units a service can be priced in (Fixed Price / Hour / Day / Month / Unit).
const SERVICE_UNIT_CODES = ['fixed', 'hours', 'days', 'months', 'pieces'];

// What a delivery type implies, so picking one pre-selects sensible defaults.
const DELIVERY_DEFAULTS: Record<Exclude<ServiceDeliveryType, ''>, { unit: string; engagement: EngagementType }> = {
  fixed_price: { unit: 'fixed', engagement: 'fixed' },
  milestone: { unit: 'fixed', engagement: 'fixed' },
  time_material: { unit: 'hours', engagement: 'time_and_material' },
  hourly: { unit: 'hours', engagement: 'time_and_material' },
  daily: { unit: 'days', engagement: 'time_and_material' },
  retainer: { unit: 'months', engagement: '' },
  subscription: { unit: 'months', engagement: '' },
};

interface FormState {
  name: string;
  sku: string;
  productType: ProductType;
  shortDescription: string;
  description: string;
  deliveryType: ServiceDeliveryType;
  isActive: boolean;
  internalNotes: string;
  // sales
  canBeSold: boolean;
  salesPrice: string;
  currency: string;
  uomId: string;
  discount: string;
  salesTaxId: string;
  invoicingPolicy: InvoicingPolicy;
  paymentTerms: string;
  engagement: EngagementType;
  contractMonths: string;
  // purchase / cost
  canBePurchased: boolean;
  procurementType: ProcurementType;
  vendorId: string;
  vendorReference: string;
  costPrice: string;
  costCurrency: string;
  purchaseUomId: string;
  purchaseTaxId: string;
  purchaseDescription: string;
  // resource & delivery
  department: string;
  designations: string[];
  costRate: string;
  billingRate: string;
  estimatedHours: string;
  teamType: DeliveryTeamType;
}

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));
const idOrNull = (v: string) => (v === '' ? null : Number(v));
const numOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
const isMoney = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());
const isOptionalMoney = (v: string) => v.trim() === '' || isMoney(v);
// Amount fields start empty (the "0.00" shows as a placeholder); a blank amount is saved as 0.
const amountOrEmpty = (v?: string | null) => (v && Number(v) !== 0 ? v : '');

const fromItem = (item: CatalogItem | null, kind: CatalogKind): FormState => ({
  name: item?.product_service_name ?? '',
  sku: item?.internal_reference ?? '',
  productType: item?.product_type ?? (kind === 'service' ? 'service' : 'digital'),
  shortDescription: item?.short_description ?? '',
  description: item?.description ?? '',
  deliveryType: item?.service_delivery_type ?? '',
  isActive: item?.is_active ?? true,
  internalNotes: item?.internal_notes ?? '',
  canBeSold: item?.can_be_sold ?? true,
  salesPrice: amountOrEmpty(item?.sales_price),
  currency: item?.currency ?? 'INR',
  uomId: str(item?.uom),
  discount: amountOrEmpty(item?.default_discount_percent),
  salesTaxId: str(item?.sales_tax),
  invoicingPolicy: item?.invoicing_policy ?? 'ordered',
  paymentTerms: str(item?.payment_terms_days),
  engagement: item?.default_engagement_type ?? '',
  contractMonths: str(item?.default_contract_months),
  canBePurchased: item?.can_be_purchased ?? false,
  procurementType: item?.procurement_type ?? '',
  vendorId: str(item?.preferred_vendor),
  vendorReference: item?.vendor_reference ?? '',
  costPrice: amountOrEmpty(item?.cost_price),
  costCurrency: item?.cost_currency ?? 'INR',
  purchaseUomId: str(item?.purchase_uom),
  purchaseTaxId: str(item?.purchase_tax),
  purchaseDescription: item?.purchase_description ?? '',
  department: item?.department_name ?? '',
  designations: item?.suggested_designations ?? [],
  costRate: str(item?.default_cost_rate),
  billingRate: str(item?.default_billing_rate),
  estimatedHours: str(item?.estimated_hours),
  teamType: item?.delivery_team_type ?? '',
});

// Which tab each server-side field lives on, so a validation error opens the right tab.
const FIELD_TAB: Record<string, TabKey> = {
  product_service_name: 'basic', internal_reference: 'basic', product_type: 'basic', product_group: 'basic',
  short_description: 'basic', description: 'basic', service_delivery_type: 'basic',
  sales_price: 'sales', currency: 'sales', uom: 'sales', default_discount_percent: 'sales', sales_tax: 'sales',
  invoicing_policy: 'sales', payment_terms_days: 'sales', default_engagement_type: 'sales', default_contract_months: 'sales',
  cost_price: 'cost', cost_currency: 'cost', purchase_uom: 'cost', purchase_tax: 'cost', purchase_description: 'cost',
  preferred_vendor: 'cost', vendor_reference: 'cost', procurement_type: 'cost',
  department_name: 'resource', suggested_designations: 'resource', default_cost_rate: 'resource',
  default_billing_rate: 'resource', estimated_hours: 'resource', delivery_team_type: 'resource',
  internal_notes: 'additional',
};

interface Props {
  isOpen: boolean;
  /** null = create a new item of `kind` */
  item: CatalogItem | null;
  kind: CatalogKind;
  permissions: CatalogPermissions;
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
}

/** Create / edit drawer for one catalog item. Services and products get different forms. */
const ProductServiceDrawer: React.FC<Props> = ({
  isOpen, item, kind: createKind, permissions, onClose, onSaved,
}) => {
  const kind: CatalogKind = item ? kindOf(item) : createKind;
  const isService = kind === 'service';

  const [form, setForm] = useState<FormState>(() => fromItem(item, kind));
  const [tab, setTab] = useState<TabKey>('basic');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [designationQuery, setDesignationQuery] = useState('');

  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [taxes, setTaxes] = useState<CatalogTax[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [resources, setResources] = useState<ResourceOptions>({ departments: [], designations: [] });
  const [mastersLoaded, setMastersLoaded] = useState(false);

  // Reset the form each time the drawer opens for a (different) item.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const openKey = isOpen ? `${kind}:${item?.id ?? 'new'}:${item?.updated_at ?? ''}` : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (openKey) {
      setForm(fromItem(item, kind));
      setTab('basic');
      setErrors({});
      setDesignationQuery('');
    }
  }

  useEffect(() => {
    if (!isOpen || mastersLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const [u, t, v, r] = await Promise.all([
          getUnitsOfMeasure(),
          getCatalogTaxes(),
          getVendorOptions().catch(() => [] as VendorOption[]),
          getResourceOptions().catch(() => ({ departments: [], designations: [] } as ResourceOptions)),
        ]);
        if (cancelled) return;
        setUnits(u); setTaxes(t); setVendors(v); setResources(r); setMastersLoaded(true);
      } catch {
        if (!cancelled) toast.error('Could not load units and taxes. Please try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, mastersLoaded]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const unitIdFor = (code: string) => str(units.find((u) => u.code === code)?.id);

  const chooseDeliveryType = (value: ServiceDeliveryType) => {
    setForm((f) => {
      const next = { ...f, deliveryType: value };
      if (!value) return next;
      const prev = f.deliveryType ? DELIVERY_DEFAULTS[f.deliveryType] : null;
      const d = DELIVERY_DEFAULTS[value];
      // Only replace a unit / project type the user hasn't changed from the previous default.
      if (!f.uomId || (prev && f.uomId === unitIdFor(prev.unit))) next.uomId = unitIdFor(d.unit) || f.uomId;
      if (!f.engagement || (prev && f.engagement === prev.engagement)) next.engagement = d.engagement;
      return next;
    });
  };

  const tabs: { key: TabKey; label: string }[] = isService
    ? [
      { key: 'basic', label: 'Basic Information' },
      { key: 'sales', label: 'Sales' },
      { key: 'cost', label: 'Purchase / Cost' },
      { key: 'resource', label: 'Resource & Delivery' },
      { key: 'additional', label: 'Additional' },
    ]
    : [
      { key: 'basic', label: 'Basic Information' },
      { key: 'sales', label: 'Sales' },
      { key: 'cost', label: 'Purchase' },
      { key: 'additional', label: 'Additional' },
    ];

  // Archived masters stay selectable only if this item already uses them.
  const usable = <T extends { id: number; is_active?: boolean }>(rows: T[], currentId: string) =>
    rows.filter((r) => r.is_active !== false || String(r.id) === currentId);
  const salesUnits = usable(units, form.uomId).filter((u) => !isService || SERVICE_UNIT_CODES.includes(u.code) || String(u.id) === form.uomId);
  const costUnits = usable(units, form.purchaseUomId);
  const salesTaxes = usable(taxes, form.salesTaxId).filter((t) => t.scope !== 'purchase' || String(t.id) === form.salesTaxId);
  const purchaseTaxes = usable(taxes, form.purchaseTaxId).filter((t) => t.scope !== 'sale' || String(t.id) === form.purchaseTaxId);

  const dt = form.deliveryType;
  const showContract = dt === 'retainer' || dt === 'subscription' || dt === 'time_material';
  const showEstimate = !dt || dt === 'fixed_price' || dt === 'milestone' || dt === 'time_material';
  const showBillingRate = dt === 'time_material' || dt === 'hourly' || dt === 'daily';
  const selectedUnit = units.find((u) => String(u.id) === form.uomId)?.code;
  const priceLabel = !isService ? 'Sales Price'
    : selectedUnit === 'hours' ? 'Price per Hour'
      : selectedUnit === 'days' ? 'Price per Day'
        : selectedUnit === 'months' ? 'Monthly Price'
          : dt === 'fixed_price' || dt === 'milestone' ? 'Starting / Project Price' : 'Sales Price';

  const margin = useMemo(() => {
    const sale = Number(form.salesPrice), cost = Number(form.costPrice);
    if (isService || !form.canBeSold || !form.canBePurchased || !(sale > 0) || Number.isNaN(cost)) return null;
    return { amount: sale - cost, pct: ((sale - cost) / sale) * 100 };
  }, [isService, form.salesPrice, form.costPrice, form.canBeSold, form.canBePurchased]);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.product_service_name = `Enter the ${isService ? 'service' : 'product'} name.`;
    if (form.canBeSold && !isOptionalMoney(form.salesPrice)) e.sales_price = 'Enter a price of 0 or more (up to 2 decimals).';
    if (form.canBeSold && !(isOptionalMoney(form.discount) && Number(form.discount || 0) <= 100)) e.default_discount_percent = 'Enter 0 to 100.';
    if (form.paymentTerms.trim() && !(/^\d+$/.test(form.paymentTerms.trim()) && Number(form.paymentTerms) <= 365)) e.payment_terms_days = 'Enter whole days, 0 to 365.';
    if (form.contractMonths.trim() && !(/^\d+$/.test(form.contractMonths.trim()) && Number(form.contractMonths) <= 120)) e.default_contract_months = 'Enter whole months, 0 to 120.';
    if (form.canBePurchased && !isOptionalMoney(form.costPrice)) e.cost_price = 'Enter a cost of 0 or more (up to 2 decimals).';
    if (isService) {
      if (!isOptionalMoney(form.costRate)) e.default_cost_rate = 'Enter an amount, e.g. 800.00';
      if (!isOptionalMoney(form.billingRate)) e.default_billing_rate = 'Enter an amount, e.g. 1500.00';
      if (!isOptionalMoney(form.estimatedHours)) e.estimated_hours = 'Enter hours, e.g. 120';
    }
    return e;
  };

  const openFirstErrorTab = (e: Record<string, string>) => {
    const first = Object.keys(e).find((k) => FIELD_TAB[k]);
    if (first) setTab(FIELD_TAB[first]);
  };

  // Creating walks through the tabs as steps: Back / Next, then Create on the last step.
  const stepIndex = Math.max(0, tabs.findIndex((t) => t.key === tab));
  const isLastStep = stepIndex === tabs.length - 1;
  const goNext = () => {
    const stepErrors = Object.fromEntries(Object.entries(validate()).filter(([k]) => FIELD_TAB[k] === tab));
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) return;
    setTab(tabs[stepIndex + 1].key);
  };
  const goBack = () => setTab(tabs[Math.max(0, stepIndex - 1)].key);

  const handleSave = async () => {
    const clientErrors = validate();
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) {
      openFirstErrorTab(clientErrors);
      return;
    }
    const payload: CatalogItemInput = {
      product_service_name: form.name.trim(),
      internal_reference: form.sku.trim() || null,
      product_type: isService ? 'service' : form.productType,
      short_description: form.shortDescription.trim(),
      description: form.description,
      internal_notes: form.internalNotes,
      is_active: form.isActive,
      can_be_sold: form.canBeSold,
      sales_price: isMoney(form.salesPrice) ? form.salesPrice.trim() : '0.00',
      currency: form.currency,
      uom: idOrNull(form.uomId),
      default_discount_percent: isMoney(form.discount) ? form.discount.trim() : '0.00',
      sales_tax: idOrNull(form.salesTaxId),
      invoicing_policy: form.invoicingPolicy,
      payment_terms_days: form.paymentTerms.trim() ? Number(form.paymentTerms) : null,
      can_be_purchased: form.canBePurchased,
      cost_price: isMoney(form.costPrice) ? form.costPrice.trim() : '0.00',
      cost_currency: form.costCurrency,
      purchase_uom: idOrNull(form.purchaseUomId),
      purchase_tax: idOrNull(form.purchaseTaxId),
      purchase_description: form.purchaseDescription,
      preferred_vendor: idOrNull(form.vendorId),
      vendor_reference: form.vendorReference.trim(),
      procurement_type: form.procurementType,
    };
    if (isService) {
      Object.assign(payload, {
        service_delivery_type: form.deliveryType,
        default_engagement_type: form.engagement,
        default_contract_months: showContract && form.contractMonths.trim() ? Number(form.contractMonths) : null,
        department_name: form.department,
        suggested_designations: form.designations,
        default_cost_rate: numOrNull(form.costRate),
        default_billing_rate: numOrNull(form.billingRate),
        estimated_hours: numOrNull(form.estimatedHours),
        delivery_team_type: form.teamType,
      });
    } else {
      payload.service_delivery_type = '';
    }

    setIsSaving(true);
    try {
      const saved = item ? await updateCatalogItem(item.id, payload) : await createCatalogItem(payload);
      toast.success(item ? `${isService ? 'Service' : 'Product'} updated.` : `${isService ? 'Service' : 'Product'} created.`);
      onSaved(saved);
    } catch (err) {
      const parsed = parseApiErrors(err) as Record<string, string | undefined>;
      const fieldErrors: Record<string, string> = {};
      Object.entries(parsed).forEach(([k, v]) => { if (v) fieldErrors[k] = v; });
      setErrors(fieldErrors);
      openFirstErrorTab(fieldErrors);
      toast.error(fieldErrors.general || 'Please fix the highlighted fields.');
    } finally {
      setIsSaving(false);
    }
  };

  const input = (field: string) => `${drawerInputClass} ${errors[field] ? drawerErrorBorder : ''}`;
  const tabHasError = (key: TabKey) => Object.keys(errors).some((f) => FIELD_TAB[f] === key);

  const checkbox = (checked: boolean, onChange: (v: boolean) => void, label: string, hint?: string) => (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
      />
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        {hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
      </span>
    </label>
  );

  const field = (id: string, label: React.ReactNode, control: React.ReactNode, error?: string, hint?: React.ReactNode) => (
    <div>
      <label htmlFor={id} className={drawerLabelClass}>{label}</label>
      {control}
      <FieldError message={error} />
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  );

  const currencySelect = (id: string, value: string, onChange: (v: string) => void) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={drawerInputClass}>
      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );

  const unitSelect = (id: string, value: string, onChange: (v: string) => void, rows: UnitOfMeasure[], errKey: string) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={input(errKey)}>
      <option value="">Not set</option>
      {rows.map((u) => <option key={u.id} value={u.id}>{u.code === 'pieces' && isService ? 'Unit' : u.name}</option>)}
    </select>
  );

  const taxSelect = (id: string, value: string, onChange: (v: string) => void, rows: CatalogTax[], errKey: string) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={input(errKey)}>
      <option value="">Not set</option>
      {rows.map((t) => <option key={t.id} value={t.id}>{t.name} ({Number(t.rate)}%)</option>)}
    </select>
  );

  const filteredDesignations = resources.designations
    .filter((d) => !form.designations.includes(d))
    .filter((d) => !designationQuery.trim() || d.toLowerCase().includes(designationQuery.trim().toLowerCase()))
    .slice(0, 8);

  const noun = isService ? 'Service' : 'Product';
  const title = item ? `Edit ${noun}` : `Create ${noun}`;

  return (
    <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        subtitle={item ? [item.product_service_name, item.internal_reference].filter(Boolean).join(' · ') : `Add a ${noun.toLowerCase()} to the catalog`}
        size="lg"
        footer={item ? (
          <DrawerFormFooter
            summary={margin ? (
              <>Margin: <strong className={margin.amount < 0 ? 'text-red-600' : 'text-gray-800 dark:text-gray-200'}>
                {margin.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({margin.pct.toFixed(1)}%)
              </strong></>
            ) : undefined}
            onCancel={onClose}
            onSubmit={handleSave}
            submitLabel="Save Changes"
            isBusy={isSaving}
            submitDisabled={!permissions.can_manage}
          />
        ) : (
          <div className="flex items-center justify-between gap-3 w-full">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Step {stepIndex + 1} of {tabs.length} · <span className="font-medium text-gray-700 dark:text-gray-300">{tabs[stepIndex].label}</span>
            </span>
            <div className="flex gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={stepIndex === 0 ? onClose : goBack}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                {stepIndex === 0 ? 'Cancel' : 'Back'}
              </button>
              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !permissions.can_manage}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : `Create ${noun}`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        )}
      >
        <Tabs
          tabs={tabs.map((t) => ({ key: t.key, label: tabHasError(t.key) ? `${t.label} •` : t.label }))}
          active={tab}
          onChange={(k) => setTab(k as TabKey)}
          className="-mt-2 mb-5"
        />

        {errors.general && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{errors.general}</div>
        )}

        {tab === 'basic' && (
          <DrawerSection>
            <div className="space-y-4">
              {field('ps-name', <>{noun} Name <span className="text-red-500">*</span></>,
                <input id="ps-name" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={100} className={input('product_service_name')}
                  placeholder={isService ? 'e.g. Website Development' : 'e.g. Microsoft 365 Business Licence'} />,
                errors.product_service_name)}
              <div className="grid grid-cols-1 gap-4">
                {field('ps-sku', isService ? 'Service Code' : 'Product Reference / SKU',
                  <input id="ps-sku" value={form.sku} onChange={(e) => set('sku', e.target.value)} maxLength={64} className={input('internal_reference')}
                    placeholder={isService ? 'e.g. SRV-WEB-01' : 'e.g. LIC-M365-01'} />,
                  errors.internal_reference)}
              </div>
              {!isService && (
                <div>
                  <span className={drawerLabelClass}>Product Type</span>
                  <SegmentedChoice<ProductType>
                    options={[{ value: 'digital', label: 'Digital / Licence' }, { value: 'consumable', label: 'Physical' }]}
                    value={form.productType}
                    onChange={(v) => set('productType', v)}
                  />
                  <FieldHint>Stock and warehouse tracking aren't used in this app, so no inventory fields are shown.</FieldHint>
                </div>
              )}
              {field('ps-short', 'Short Description',
                <input id="ps-short" value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} maxLength={255} className={input('short_description')}
                  placeholder="One line shown on the catalog card" />, errors.short_description)}
              {field('ps-desc', 'Detailed Sales Description',
                <textarea id="ps-desc" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} className={input('description')}
                  placeholder="Scope / inclusions - pre-fills the quotation line description" />,
                errors.description, 'Changing it later never alters saved quotations or invoices.')}
              {isService && (
                <div>
                  <span className={drawerLabelClass}>Service Delivery Type</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {DELIVERY_TYPES.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => chooseDeliveryType(form.deliveryType === d.value ? '' : d.value)}
                        aria-pressed={form.deliveryType === d.value}
                        className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${form.deliveryType === d.value
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'}`}
                      >
                        <span className={`block font-medium ${form.deliveryType === d.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>{d.label}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">{d.hint}</span>
                      </button>
                    ))}
                  </div>
                  <FieldError message={errors.service_delivery_type} />
                </div>
              )}
              {item && checkbox(form.isActive, (v) => set('isActive', v), 'Active', 'Archived items are hidden from pickers; documents that already use them are unaffected.')}
            </div>
          </DrawerSection>
        )}

        {tab === 'sales' && (
          <DrawerSection>
            <div className="space-y-4">
              {checkbox(form.canBeSold, (v) => set('canBeSold', v), 'Can be sold', 'Offered on quotations and invoices.')}
              {form.canBeSold && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {field('ps-price', priceLabel,
                      <input id="ps-price" inputMode="decimal" value={form.salesPrice} onChange={(e) => set('salesPrice', e.target.value)} className={input('sales_price')} placeholder="0.00" />,
                      errors.sales_price)}
                    {field('ps-currency', 'Currency', currencySelect('ps-currency', form.currency, (v) => set('currency', v)))}
                    {field('ps-uom', isService ? 'Pricing Unit' : 'Unit of Measure',
                      unitSelect('ps-uom', form.uomId, (v) => set('uomId', v), salesUnits, 'uom'), errors.uom)}
                  </div>
                  <FieldHint>Pre-fills the quotation unit price. The final negotiated price is set on each quotation, not here.</FieldHint>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {field('ps-discount', 'Default Discount %',
                      <input id="ps-discount" inputMode="decimal" value={form.discount} onChange={(e) => set('discount', e.target.value)} className={input('default_discount_percent')} placeholder="0.00" />,
                      errors.default_discount_percent)}
                    {field('ps-stax', 'Sales Tax', taxSelect('ps-stax', form.salesTaxId, (v) => set('salesTaxId', v), salesTaxes, 'sales_tax'), errors.sales_tax)}
                    {field('ps-terms', 'Payment Terms (days)',
                      <input id="ps-terms" inputMode="numeric" value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} className={input('payment_terms_days')} placeholder="e.g. 30" />,
                      errors.payment_terms_days)}
                  </div>
                  {isService && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {field('ps-engagement', 'Default Project Type',
                        <select id="ps-engagement" value={form.engagement} onChange={(e) => set('engagement', e.target.value as EngagementType)} className={input('default_engagement_type')}>
                          <option value="">Not set</option>
                          {(Object.keys(ENGAGEMENT_LABELS) as Exclude<EngagementType, ''>[]).map((k) => <option key={k} value={k}>{ENGAGEMENT_LABELS[k]}</option>)}
                        </select>, errors.default_engagement_type)}
                      {showContract && field('ps-contract', 'Default Contract Duration (months)',
                        <input id="ps-contract" inputMode="numeric" value={form.contractMonths} onChange={(e) => set('contractMonths', e.target.value)} className={input('default_contract_months')} placeholder="e.g. 12" />,
                        errors.default_contract_months)}
                    </div>
                  )}
                </>
              )}
            </div>
          </DrawerSection>
        )}

        {tab === 'cost' && (
          <DrawerSection>
            <div className="space-y-4">
              {isService && (
                <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Only <strong>external supplier / third-party</strong> costs go here. Internal employee cost comes from project resource costing, and project expenses are recorded on the project.</span>
                </div>
              )}
              {checkbox(form.canBePurchased, (v) => set('canBePurchased', v),
                isService ? 'External procurement required' : 'Can be purchased',
                isService ? 'Leave off for services your own team delivers.' : 'Bought from vendors through purchase orders.')}
              {form.canBePurchased && (
                <>
                  {isService && field('ps-proc', 'Procurement Type',
                    <select id="ps-proc" value={form.procurementType} onChange={(e) => set('procurementType', e.target.value as ProcurementType)} className={input('procurement_type')}>
                      <option value="">Not set</option>
                      {(Object.keys(PROCUREMENT_LABELS) as Exclude<ProcurementType, ''>[]).map((k) => <option key={k} value={k}>{PROCUREMENT_LABELS[k]}</option>)}
                    </select>, errors.procurement_type)}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {field('ps-vendor', isService ? 'Default Vendor (optional)' : 'Vendor',
                      <select id="ps-vendor" value={form.vendorId} onChange={(e) => set('vendorId', e.target.value)} className={input('preferred_vendor')}>
                        <option value="">None</option>
                        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        {form.vendorId && !vendors.some((v) => String(v.id) === form.vendorId) && (
                          <option value={form.vendorId}>{item?.preferred_vendor_name || 'Current vendor'}</option>
                        )}
                      </select>, errors.preferred_vendor)}
                    {field('ps-vref', 'Vendor Reference',
                      <input id="ps-vref" value={form.vendorReference} onChange={(e) => set('vendorReference', e.target.value)} maxLength={100} className={input('vendor_reference')} placeholder="Vendor's code for this item" />,
                      errors.vendor_reference)}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {field('ps-cost', isService ? 'Vendor Cost' : 'Cost Price',
                      <input id="ps-cost" inputMode="decimal" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} className={input('cost_price')} placeholder="0.00" />,
                      errors.cost_price)}
                    {field('ps-ccur', 'Cost Currency', currencySelect('ps-ccur', form.costCurrency, (v) => set('costCurrency', v)))}
                    {field('ps-puom', 'Cost Unit', unitSelect('ps-puom', form.purchaseUomId, (v) => set('purchaseUomId', v), costUnits, 'purchase_uom'), errors.purchase_uom)}
                  </div>
                  {field('ps-ptax', 'Purchase Tax', taxSelect('ps-ptax', form.purchaseTaxId, (v) => set('purchaseTaxId', v), purchaseTaxes, 'purchase_tax'), errors.purchase_tax)}
                  {field('ps-pdesc', 'Purchase Description',
                    <textarea id="ps-pdesc" rows={3} value={form.purchaseDescription} onChange={(e) => set('purchaseDescription', e.target.value)} className={drawerInputClass} placeholder="Text for purchase orders" />)}
                </>
              )}
            </div>
          </DrawerSection>
        )}

        {tab === 'resource' && isService && (
          <DrawerSection>
            <div className="space-y-4">
              <FieldHint>Used to suggest the right people when staffing a project. It never stops anyone else being assigned.</FieldHint>
              {field('ps-dept', 'Linked Department',
                <select id="ps-dept" value={form.department} onChange={(e) => set('department', e.target.value)} className={input('department_name')}>
                  <option value="">None</option>
                  {resources.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  {form.department && !resources.departments.includes(form.department) && (
                    <option value={form.department}>{form.department} (no longer in AIRA)</option>
                  )}
                </select>, errors.department_name,
                resources.departments.length ? 'From AIRA HRMS employees.' : 'No departments yet - they appear once employees are fetched from AIRA HRMS.')}
              <div>
                <span className={drawerLabelClass}>Suggested Designations</span>
                {form.designations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {form.designations.map((d) => (
                      <span key={d} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">
                        {d}
                        <button type="button" onClick={() => set('designations', form.designations.filter((x) => x !== d))} aria-label={`Remove ${d}`}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input value={designationQuery} onChange={(e) => setDesignationQuery(e.target.value)}
                    className={`${drawerInputClass} pl-8`} placeholder="Search AIRA designations..." aria-label="Search designations" />
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                {designationQuery.trim() && (
                  <div className="mt-1 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredDesignations.length ? filteredDesignations.map((d) => (
                      <button key={d} type="button" onClick={() => { set('designations', [...form.designations, d]); setDesignationQuery(''); }}
                        className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">{d}</button>
                    )) : <p className="px-3 py-1.5 text-sm text-gray-500">No matching designation.</p>}
                  </div>
                )}
                <FieldError message={errors.suggested_designations} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field('ps-team', 'Delivery Team',
                  <select id="ps-team" value={form.teamType} onChange={(e) => set('teamType', e.target.value as DeliveryTeamType)} className={input('delivery_team_type')}>
                    <option value="">Not set</option>
                    {(Object.keys(DELIVERY_TEAM_LABELS) as Exclude<DeliveryTeamType, ''>[]).map((k) => <option key={k} value={k}>{DELIVERY_TEAM_LABELS[k]}</option>)}
                  </select>, errors.delivery_team_type)}
                {showEstimate && field('ps-hours', 'Estimated Delivery Hours',
                  <input id="ps-hours" inputMode="decimal" value={form.estimatedHours} onChange={(e) => set('estimatedHours', e.target.value)} className={input('estimated_hours')} placeholder="e.g. 120" />,
                  errors.estimated_hours)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field('ps-crate', 'Default Resource Cost Rate (per hour)',
                  <input id="ps-crate" inputMode="decimal" value={form.costRate} onChange={(e) => set('costRate', e.target.value)} className={input('default_cost_rate')} placeholder="Optional" />,
                  errors.default_cost_rate, 'Estimate only - actual staff cost comes from resource costing.')}
                {showBillingRate && field('ps-brate', 'Default Billing Rate (per hour)',
                  <input id="ps-brate" inputMode="decimal" value={form.billingRate} onChange={(e) => set('billingRate', e.target.value)} className={input('default_billing_rate')} placeholder="Optional" />,
                  errors.default_billing_rate)}
              </div>
            </div>
          </DrawerSection>
        )}

        {tab === 'additional' && (
          <div className="space-y-5">
            <DrawerSection>
              {field('ps-notes', 'Internal Notes',
                <textarea id="ps-notes" rows={4} value={form.internalNotes} onChange={(e) => set('internalNotes', e.target.value)} className={drawerInputClass} placeholder="Only visible internally" />)}
            </DrawerSection>
            {item ? (
              <dl className="grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
                <div><dt className="font-medium">Created</dt><dd>{formatDateTime(item.created_at)}{item.created_by ? ` · ${item.created_by}` : ''}</dd></div>
                <div><dt className="font-medium">Last updated</dt><dd>{formatDateTime(item.updated_at)}{item.modified_by ? ` · ${item.modified_by}` : ''}</dd></div>
                <div><dt className="font-medium">Status</dt><dd>{item.is_active ? 'Active' : 'Archived'}</dd></div>
              </dl>
            ) : <FieldHint>Created / updated details appear here after saving.</FieldHint>}
          </div>
        )}
    </Drawer>
  );
};

export default ProductServiceDrawer;
