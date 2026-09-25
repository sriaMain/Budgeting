import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { parseApiErrors } from '../utils/parseApiErrors';
import { fetchPincodeDetails } from '../utils/pincodeLookup';
import { InputField } from './InputField';
import { SelectField } from './SelectField';
import { Checkbox } from './Checkbox';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';
import { DocumentList } from './DocumentList';
import { StatusBadge } from './StatusBadge';
import type { FormErrors } from '../types';
import {
  CLIENT_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  KYC_STATUS_OPTIONS,
  RISK_RATING_OPTIONS,
  EDITABLE_ONBOARDING_STEPS,
  DOCUMENT_CATEGORY_OPTIONS,
  BANKING_VERIFICATION_STATUS_OPTIONS,
  SANCTIONS_SCREENING_OPTIONS,
  BENEFICIAL_OWNERSHIP_OPTIONS,
  TAX_RESIDENCY_STATUS_OPTIONS,
  ENHANCED_DUE_DILIGENCE_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
  INVOICE_REQUIREMENTS_OPTIONS,
  BILLING_FREQUENCY_OPTIONS,
  clientTypeLabel,
  kycStatusLabel,
  computeJurisdiction,
  stepStatusLabel,
  stepStatusVariant,
} from '../pages/ClientListPage';
import type { Client, CompanyTag, ClientDocument, UserRole, StepStatuses } from '../pages/ClientListPage';

interface CountryCodeOption {
  name: string;
  iso_code: string;
  dial_code: string;
}

interface ClientKycDrawerContentProps {
  /** Omit for create mode. */
  client?: Client;
  userRole: UserRole;
  onSaved: (client: Client, meta: { kycAutoChanged: boolean; keepOpen?: boolean }) => void;
  onCancel: () => void;
}

// Standard GSTIN format: 2-digit state code, 10-char PAN, 1-char entity code, "Z", 1 checksum char.
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/;
// Standard PAN format: AAAAA9999A.
const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]{1}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Compact, enterprise-density label/field style for this form only (opt-in via
// InputField/SelectField's labelClassName - every other form in the app is unaffected).
// Same colors as everywhere else in the app (gray-500/gray-900, blue/violet focus rings) -
// only the label typography and field density change, not the palette.
const COMPACT_LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 dark:text-gray-400';
const compactField = { labelClassName: COMPACT_LABEL, className: 'py-2.5' };

interface FormState {
  company_name: string;
  client_type: Client['client_type'];
  currency: Client['currency'];
  email: string;
  country_code: string;
  mobile_number: string;
  selectedTags: number[];

  address1: string;
  address2: string;
  city: string;
  postal_code: string;
  state: string;
  country: string;

  gstin: string;
  registration_no: string;
  pan: string;
  tax_id: string;
  authorised_signatory_name: string;
  authorised_signatory_role: string;

  bank_name: string;
  bank_account_number: string;
  bank_code: string;
  bank_branch: string;
  bank_country: string;
  bank_address: string;
  banking_verification_status: Client['banking_verification_status'];

  sanctions_screening_status: Client['sanctions_screening_status'];
  beneficial_ownership_status: Client['beneficial_ownership_status'];
  tax_residency_status: Client['tax_residency_status'];
  enhanced_due_diligence_status: Client['enhanced_due_diligence_status'];
  compliance_remarks: string;
  compliance_reviewed_by: string;
  compliance_reviewed_at: string;

  payment_terms: Client['payment_terms'];
  custom_payment_terms: string;
  withholding_tax_applicable: boolean;
  withholding_tax_percentage: string;
  invoice_requirements: Client['invoice_requirements'];
  po_required: boolean;
  billing_frequency: Client['billing_frequency'];
  billing_contact: string;
  billing_email: string;
  commercial_remarks: string;

  kyc_status: Client['kyc_status'];
  risk_rating: Client['risk_rating'];
  onboarding_step: Client['onboarding_step'];
  is_active: boolean;
}

/** datetime-local inputs need "YYYY-MM-DDTHH:mm", not a full ISO string with seconds/zone. */
const toDatetimeLocal = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const buildInitialForm = (client?: Client): FormState => ({
  company_name: client?.company_name || '',
  client_type: client?.client_type || 'company',
  currency: client?.currency || 'INR',
  email: client?.email || '',
  country_code: client?.country_code || '+91',
  mobile_number: client?.mobile_number || '',
  selectedTags: client?.tags?.map((t) => t.id) || [],

  address1: client?.address1 || '',
  address2: client?.address2 || '',
  city: client?.city || '',
  postal_code: client?.postal_code || '',
  state: client?.state || '',
  country: client?.country || '',

  gstin: client?.gstin || '',
  registration_no: client?.registration_no || '',
  pan: client?.pan || '',
  tax_id: client?.tax_id || '',
  authorised_signatory_name: client?.authorised_signatory_name || '',
  authorised_signatory_role: client?.authorised_signatory_role || '',

  bank_name: client?.bank_name || '',
  bank_account_number: '',
  bank_code: client?.bank_code || '',
  bank_branch: client?.bank_branch || '',
  bank_country: client?.bank_country || '',
  bank_address: client?.bank_address || '',
  banking_verification_status: client?.banking_verification_status || 'not_verified',

  sanctions_screening_status: client?.sanctions_screening_status || 'not_checked',
  beneficial_ownership_status: client?.beneficial_ownership_status || 'not_verified',
  tax_residency_status: client?.tax_residency_status || 'pending',
  enhanced_due_diligence_status: client?.enhanced_due_diligence_status || 'not_required',
  compliance_remarks: client?.compliance_remarks || '',
  compliance_reviewed_by: client?.compliance_reviewed_by != null ? String(client.compliance_reviewed_by) : '',
  compliance_reviewed_at: toDatetimeLocal(client?.compliance_reviewed_at),

  payment_terms: client?.payment_terms || 'net_30',
  custom_payment_terms: client?.custom_payment_terms || '',
  withholding_tax_applicable: client?.withholding_tax_applicable ?? false,
  withholding_tax_percentage: client?.withholding_tax_percentage != null ? String(client.withholding_tax_percentage) : '',
  invoice_requirements: client?.invoice_requirements || 'standard',
  po_required: client?.po_required ?? false,
  billing_frequency: client?.billing_frequency || 'monthly',
  billing_contact: client?.billing_contact || '',
  billing_email: client?.billing_email || '',
  commercial_remarks: client?.commercial_remarks || '',

  kyc_status: client?.kyc_status || 'draft',
  risk_rating: client?.risk_rating || 'low',
  onboarding_step: client?.onboarding_step || 'intake',
  is_active: client?.is_active ?? true,
});

/**
 * Create/edit KYC form rendered inside <Drawer>. Two-column layout using the app's shared
 * form primitives (InputField/SelectField/Checkbox/SearchableSelect) instead of raw HTML
 * inputs, per the redesign - only AddClientPage/AddClientModal predate this convention.
 *
 * The server can silently override kyc_status on save (see onSaved's kycAutoChanged flag) -
 * callers are expected to re-render from the saved response and surface that explanation.
 */
export const ClientKycDrawerContent: React.FC<ClientKycDrawerContentProps> = ({ client, userRole, onSaved, onCancel }) => {
  const isEditing = !!client;
  const [form, setForm] = useState<FormState>(() => buildInitialForm(client));
  const [tags, setTags] = useState<CompanyTag[]>([]);
  const [countryCodes, setCountryCodes] = useState<CountryCodeOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingPincode, setIsFetchingPincode] = useState(false);
  const [isChangingBankAccount, setIsChangingBankAccount] = useState(!isEditing);
  const [errors, setErrors] = useState<FormErrors>({});

  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  useEffect(() => {
    axiosInstance.get('/company-tags/').then((res) => setTags(res.data)).catch(() => {});
    axiosInstance.get('/country-codes/').then((res) => setCountryCodes(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!client?.id) return;
    setDocsLoading(true);
    axiosInstance
      .get(`/client/${client.id}/documents/`)
      .then((res) => setDocuments(res.data))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setDocsLoading(false));
  }, [client?.id]);

  const jurisdiction = useMemo(() => computeJurisdiction(form.country), [form.country]);

  // Admin and Manager both have client.company.approve (this round grants it to Manager
  // too) - "Approved" itself is no longer a selectable Onboarding Step option for anyone,
  // it's only ever set by the Submit for Approval action below.
  const canApprove = userRole === 'admin' || userRole === 'manager';

  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [approvalMissing, setApprovalMissing] = useState<string[] | null>(null);

  /** Renders a small step-status pill in a section header, sourced from the client's
   * step_statuses. Only available in edit mode, once a client id exists. */
  const stepPill = (stepKey: keyof StepStatuses) => {
    const value = client?.step_statuses?.[stepKey];
    if (!isEditing || !value) return null;
    return <StatusBadge status={value} variant={stepStatusVariant(value)} label={stepStatusLabel(value)} />;
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key as string]: undefined, general: undefined }));
  };

  const handlePostalCodeChange = (value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, '').slice(0, 6);
    setField('postal_code', digitsOnly);
    if (digitsOnly.length === 6) {
      setIsFetchingPincode(true);
      fetchPincodeDetails(digitsOnly)
        .then((details) => {
          if (details) {
            setForm((prev) => ({ ...prev, city: details.city, state: details.state }));
          }
        })
        .finally(() => setIsFetchingPincode(false));
    }
  };

  const handleTagToggle = (tagId: number) => {
    setForm((prev) => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tagId)
        ? prev.selectedTags.filter((id) => id !== tagId)
        : [...prev.selectedTags, tagId],
    }));
  };

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!form.company_name.trim()) errs.company_name = 'Company name is required.';
    const digitsOnly = form.mobile_number.replace(/\D/g, '');
    if (!digitsOnly || digitsOnly.length !== 10) errs.mobile_number = 'A valid 10-digit mobile number is required.';
    if (!form.email.trim()) errs.email = 'Email is required.';
    else if (!EMAIL_REGEX.test(form.email.trim())) errs.email = 'Enter a valid email address.';
    if (!form.country.trim()) errs.country = 'Country is required.';
    if (!form.state.trim()) errs.state = 'State is required.';
    if (form.gstin && !GSTIN_REGEX.test(form.gstin)) errs.gstin = 'Enter a valid 15-character GSTIN.';
    if (form.pan && !PAN_REGEX.test(form.pan)) errs.pan = 'PAN must be in AAAAA9999A format.';
    if (form.payment_terms === 'custom' && !form.custom_payment_terms.trim()) {
      errs.custom_payment_terms = 'Custom payment terms is required when Payment Terms is Custom.';
    }
    if (form.withholding_tax_applicable && !form.withholding_tax_percentage.trim()) {
      errs.withholding_tax_percentage = 'Withholding tax % is required when Withholding Tax Applicable is checked.';
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    // PATCH is server-side partial=True, but the serializer's validate() unconditionally
    // requires country_code + mobile_number - so every submission (create or edit) always
    // sends the complete form, never a partial diff of just the changed fields.
    const payload: Record<string, unknown> = {
      company_name: form.company_name.trim(),
      client_type: form.client_type,
      currency: form.currency,
      email: form.email.trim(),
      country_code: form.country_code,
      mobile_number: form.mobile_number.replace(/\D/g, ''),
      tags: form.selectedTags,
      address1: form.address1,
      address2: form.address2,
      city: form.city,
      postal_code: form.postal_code,
      state: form.state,
      country: form.country,
      gstin: form.gstin,
      registration_no: form.registration_no,
      pan: form.pan,
      tax_id: form.tax_id,
      authorised_signatory_name: form.authorised_signatory_name,
      authorised_signatory_role: form.authorised_signatory_role,
      bank_name: form.bank_name,
      bank_code: form.bank_code,
      bank_branch: form.bank_branch,
      bank_country: form.bank_country,
      bank_address: form.bank_address,
      banking_verification_status: form.banking_verification_status,
      sanctions_screening_status: form.sanctions_screening_status,
      beneficial_ownership_status: form.beneficial_ownership_status,
      tax_residency_status: form.tax_residency_status,
      enhanced_due_diligence_status: form.enhanced_due_diligence_status,
      compliance_remarks: form.compliance_remarks,
      compliance_reviewed_by: form.compliance_reviewed_by.trim() ? Number(form.compliance_reviewed_by.trim()) : null,
      compliance_reviewed_at: form.compliance_reviewed_at ? new Date(form.compliance_reviewed_at).toISOString() : null,
      payment_terms: form.payment_terms,
      custom_payment_terms: form.payment_terms === 'custom' ? form.custom_payment_terms : '',
      withholding_tax_applicable: form.withholding_tax_applicable,
      withholding_tax_percentage: form.withholding_tax_applicable && form.withholding_tax_percentage.trim() ? form.withholding_tax_percentage.trim() : null,
      invoice_requirements: form.invoice_requirements,
      po_required: form.po_required,
      billing_frequency: form.billing_frequency,
      billing_contact: form.billing_contact,
      billing_email: form.billing_email,
      commercial_remarks: form.commercial_remarks,
      kyc_status: form.kyc_status,
      risk_rating: form.risk_rating,
      onboarding_step: form.onboarding_step,
      is_active: form.is_active,
    };
    // bank_account_number is write-only and never returned - only send it when the user
    // actually typed a new one, so an unchanged masked value never overwrites what's on file.
    if (isChangingBankAccount && form.bank_account_number.trim()) {
      payload.bank_account_number = form.bank_account_number.trim();
    }

    try {
      const res = client
        ? await axiosInstance.put(`/client/${client.id}/`, payload)
        : await axiosInstance.post('/client/', payload);

      // Always re-render from the server's response, not the submitted payload - it may
      // have silently forced kyc_status to enhanced_review (high risk / undocumented overseas).
      const saved: Client = res.data;
      const kycAutoChanged = saved.kyc_status !== form.kyc_status;
      // On a create, ask the caller to keep this drawer open (switched into edit mode for
      // the new client) instead of closing it - Documents needs a real client id to attach
      // to, so closing here would force the user to reopen it just to upload KYC documents.
      onSaved(saved, { kycAutoChanged, keepOpen: !client });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const apiErrors = parseApiErrors(err);
      if (status === 403) {
        toast.error(apiErrors.general || "You don't have permission to perform this action.");
      } else {
        setErrors(apiErrors);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // The Final Approval action - replaces the old "select Approved in the Onboarding Step
  // dropdown" flow. Only ever reachable once a client exists and only for admin/manager
  // (the backend grants client.company.approve to both roles this round).
  const handleSubmitForApproval = async () => {
    if (!client?.id) return;
    setIsSubmittingApproval(true);
    setApprovalMissing(null);
    try {
      const res = await axiosInstance.post(`/client/${client.id}/submit-for-approval/`, {});
      toast.success('Client approved and marked project-ready.');
      onSaved(res.data, { kycAutoChanged: false });
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { missing?: string[] } } })?.response;
      if (response?.status === 400 && Array.isArray(response.data?.missing)) {
        setApprovalMissing(response.data!.missing!);
      } else if (response?.status === 403) {
        toast.error("You don't have permission to approve this client.");
      } else {
        toast.error('Failed to submit client for approval.');
      }
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleVerifyDocument = async (docId: number, status: 'verified' | 'rejected', remarks?: string) => {
    if (!client?.id) return;
    const res = await axiosInstance.post(`/client/${client.id}/documents/${docId}/verify/`, { status, remarks });
    setDocuments((prev) => prev.map((d) => (d.id === docId ? res.data : d)));
  };

  const handleUploadDocument = async (category: string, file: File) => {
    if (!client?.id) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', category);
    fd.append('is_required', 'false');
    const res = await axiosInstance.post(`/client/${client.id}/documents/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setDocuments((prev) => [...prev.filter((d) => d.id !== res.data.id), res.data]);
  };

  const handleDeleteDocument = async (docId: number) => {
    if (!client?.id) return;
    await axiosInstance.delete(`/client/${client.id}/documents/${docId}/`);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleDownloadDocument = (docId: number) => {
    if (!client?.id) return;
    axiosInstance
      .get(`/client/${client.id}/documents/${docId}/download/`)
      .then((res) => window.open(res.data.download_url, '_blank'))
      .catch(() => toast.error('Failed to get download link'));
  };

  const documentSlots = DOCUMENT_CATEGORY_OPTIONS.map((opt) => ({
    key: opt.value,
    label: opt.label,
    required: opt.value === 'sanctions_screening' && jurisdiction === 'Overseas',
  }));

  const countryCodeOptions: SearchableSelectOption[] = countryCodes.map((c) => ({
    id: c.dial_code,
    label: c.dial_code,
    sublabel: c.name,
  }));
  const selectedCountryCode = countryCodeOptions.find((o) => o.id === form.country_code) || null;

  const countryOptions: SearchableSelectOption[] = countryCodes.map((c) => ({
    id: c.name,
    label: c.name,
    sublabel: c.iso_code,
  }));
  const selectedCountry =
    countryOptions.find((o) => o.id === form.country) || (form.country ? { id: form.country, label: form.country } : null);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {errors.general && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
          {errors.general}
        </div>
      )}

      {/* General */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">General</h4>
          {stepPill('intake')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div className="md:col-span-2">
            <InputField
              {...compactField}
              label="Legal Name *"
              value={form.company_name}
              onChange={(e) => setField('company_name', e.target.value)}
              error={errors.company_name}
              placeholder="Client legal entity"
            />
          </div>
          <SelectField
            {...compactField}
            label="Client Type"
            options={CLIENT_TYPE_OPTIONS}
            value={form.client_type}
            onChange={(e) => setField('client_type', e.target.value as Client['client_type'])}
          />
          <div className="w-full mb-5">
            <label className={COMPACT_LABEL}>
              Country <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              options={countryOptions}
              value={selectedCountry}
              onChange={(opt) => setField('country', opt ? opt.label : '')}
              placeholder="Select country"
            />
            {errors.country && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.country}</p>}
          </div>
          <SelectField
            {...compactField}
            label="Currency"
            options={CURRENCY_OPTIONS}
            value={form.currency}
            onChange={(e) => setField('currency', e.target.value as Client['currency'])}
          />
          <InputField
            {...compactField}
            label="Registration No."
            value={form.registration_no}
            onChange={(e) => setField('registration_no', e.target.value)}
            placeholder="CIN / LLPIN / company no."
          />
          <InputField
            {...compactField}
            label="Billing Email *"
            type="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            error={errors.email}
            placeholder="finance@client.com"
          />
          <div className="w-full mb-5">
            <label className={COMPACT_LABEL}>
              Phone Number <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="w-36 flex-shrink-0">
                <SearchableSelect
                  options={countryCodeOptions}
                  value={selectedCountryCode}
                  onChange={(opt) => setField('country_code', opt ? String(opt.id) : '+91')}
                  placeholder="Code"
                />
              </div>
              <div className="flex-1">
                <input
                  value={form.mobile_number}
                  onChange={(e) => setField('mobile_number', e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                  maxLength={10}
                  placeholder="98765 43210"
                  className={`w-full px-4 py-2.5 bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white dark:focus:bg-gray-800 dark:focus:ring-violet-500 transition-all ${
                    errors.mobile_number ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-950/40' : ''
                  }`}
                />
              </div>
            </div>
            {errors.mobile_number && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.mobile_number}</p>}
          </div>
          <div className="md:col-span-2 mb-5">
            <p className={COMPACT_LABEL}>Tags</p>
            <div className="flex flex-wrap gap-3">
              {tags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.selectedTags.includes(tag.id)}
                    onChange={() => handleTagToggle(tag.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                  />
                  {tag.name}
                </label>
              ))}
              {tags.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">No tags configured yet.</p>}
            </div>
          </div>
        </div>
      </section>

      {/* Identity & KYC */}
      <section className="border-t pt-6 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">Identity &amp; KYC</h4>
          {stepPill('identity_kyc')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField
            {...compactField}
            label="GSTIN"
            value={form.gstin}
            onChange={(e) => setField('gstin', e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 15))}
            error={errors.gstin}
            placeholder="GSTIN (India, 15 characters)"
          />
          <InputField
            {...compactField}
            label="Tax ID"
            value={form.tax_id}
            onChange={(e) => setField('tax_id', e.target.value)}
            placeholder="VAT / EIN / Tax ID (overseas)"
          />
          <InputField
            {...compactField}
            label="PAN"
            value={form.pan}
            onChange={(e) => setField('pan', e.target.value.toUpperCase().slice(0, 10))}
            error={errors.pan}
            placeholder="AAAAA9999A (India)"
          />
          <InputField
            {...compactField}
            label="Authorised Signatory Name"
            value={form.authorised_signatory_name}
            onChange={(e) => setField('authorised_signatory_name', e.target.value)}
            placeholder="Full name"
          />
          <InputField
            {...compactField}
            label="Authorised Signatory Role"
            value={form.authorised_signatory_role}
            onChange={(e) => setField('authorised_signatory_role', e.target.value)}
            placeholder="e.g. CFO, Director"
          />
        </div>
      </section>

      {/* Address */}
      <section className="border-t pt-6 dark:border-gray-800">
        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 dark:text-gray-300">Registered Address</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div className="md:col-span-2">
            <InputField {...compactField} label="Address 1" value={form.address1} onChange={(e) => setField('address1', e.target.value)} placeholder="Registered office / overseas business address" />
          </div>
          <InputField {...compactField} label="Address 2" value={form.address2} onChange={(e) => setField('address2', e.target.value)} placeholder="Area, landmark (optional)" />
          <div>
            <InputField
              {...compactField}
              label="Postal Code"
              value={form.postal_code}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit pincode"
            />
            {isFetchingPincode && <p className="-mt-4 mb-4 text-xs text-gray-400 dark:text-gray-500">Fetching city and state…</p>}
          </div>
          <InputField {...compactField} label="City" value={form.city} onChange={(e) => setField('city', e.target.value)} placeholder="Enter city" />
          <InputField {...compactField} label="State *" value={form.state} onChange={(e) => setField('state', e.target.value)} error={errors.state} placeholder="Enter state" />
        </div>
      </section>

      {/* Compliance */}
      <section className="border-t pt-6 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">Compliance</h4>
          {stepPill('compliance')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <SelectField
            {...compactField}
            label="Sanctions Screening"
            options={SANCTIONS_SCREENING_OPTIONS}
            value={form.sanctions_screening_status}
            onChange={(e) => setField('sanctions_screening_status', e.target.value as Client['sanctions_screening_status'])}
          />
          <SelectField
            {...compactField}
            label="Beneficial Ownership"
            options={BENEFICIAL_OWNERSHIP_OPTIONS}
            value={form.beneficial_ownership_status}
            onChange={(e) => setField('beneficial_ownership_status', e.target.value as Client['beneficial_ownership_status'])}
          />
          <SelectField
            {...compactField}
            label="Tax Residency"
            options={TAX_RESIDENCY_STATUS_OPTIONS}
            value={form.tax_residency_status}
            onChange={(e) => setField('tax_residency_status', e.target.value as Client['tax_residency_status'])}
          />
          <SelectField
            {...compactField}
            label="Enhanced Due Diligence"
            options={ENHANCED_DUE_DILIGENCE_OPTIONS}
            value={form.enhanced_due_diligence_status}
            onChange={(e) => setField('enhanced_due_diligence_status', e.target.value as Client['enhanced_due_diligence_status'])}
          />
          <div className="md:col-span-2">
            <label className={COMPACT_LABEL}>Compliance Remarks</label>
            <textarea
              value={form.compliance_remarks}
              onChange={(e) => setField('compliance_remarks', e.target.value)}
              rows={3}
              placeholder="Notes for the compliance review"
              className="w-full px-4 py-2.5 bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white dark:focus:bg-gray-800 dark:focus:ring-violet-500 transition-all mb-5"
            />
          </div>
          <div>
            <InputField
              {...compactField}
              label="Reviewed By (User ID)"
              type="number"
              value={form.compliance_reviewed_by}
              onChange={(e) => setField('compliance_reviewed_by', e.target.value)}
              placeholder="User ID of the compliance reviewer"
            />
            {client?.compliance_reviewed_by != null && (
              <p className="-mt-4 mb-4 text-xs text-gray-400 dark:text-gray-500">Currently reviewed by user #{client.compliance_reviewed_by}</p>
            )}
          </div>
          <div>
            <InputField
              {...compactField}
              label="Review Date"
              type="datetime-local"
              value={form.compliance_reviewed_at}
              onChange={(e) => setField('compliance_reviewed_at', e.target.value)}
            />
            {client?.compliance_reviewed_at && (
              <p className="-mt-4 mb-4 text-xs text-gray-400 dark:text-gray-500">
                Currently reviewed on {new Date(client.compliance_reviewed_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Commercials */}
      <section className="border-t pt-6 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">Commercials</h4>
          {stepPill('commercials')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <SelectField
            {...compactField}
            label="Payment Terms"
            options={PAYMENT_TERMS_OPTIONS}
            value={form.payment_terms}
            onChange={(e) => setField('payment_terms', e.target.value as Client['payment_terms'])}
          />
          {form.payment_terms === 'custom' && (
            <InputField
              {...compactField}
              label="Custom Payment Terms *"
              value={form.custom_payment_terms}
              onChange={(e) => setField('custom_payment_terms', e.target.value)}
              error={errors.custom_payment_terms}
            />
          )}
          <div className="flex items-end pb-5">
            <Checkbox
              label="Withholding Tax Applicable"
              checked={form.withholding_tax_applicable}
              onChange={(e) => setField('withholding_tax_applicable', e.target.checked)}
            />
          </div>
          {form.withholding_tax_applicable && (
            <InputField
              {...compactField}
              label="Withholding Tax % *"
              type="number"
              value={form.withholding_tax_percentage}
              onChange={(e) => setField('withholding_tax_percentage', e.target.value)}
              error={errors.withholding_tax_percentage}
              placeholder="e.g. 10"
            />
          )}
          <SelectField
            {...compactField}
            label="Invoice Requirements"
            options={INVOICE_REQUIREMENTS_OPTIONS}
            value={form.invoice_requirements}
            onChange={(e) => setField('invoice_requirements', e.target.value as Client['invoice_requirements'])}
          />
          <div className="flex items-end pb-5">
            <Checkbox label="PO Required" checked={form.po_required} onChange={(e) => setField('po_required', e.target.checked)} />
          </div>
          <SelectField
            {...compactField}
            label="Billing Frequency"
            options={BILLING_FREQUENCY_OPTIONS}
            value={form.billing_frequency}
            onChange={(e) => setField('billing_frequency', e.target.value as Client['billing_frequency'])}
          />
          <InputField {...compactField} label="Billing Contact" value={form.billing_contact} onChange={(e) => setField('billing_contact', e.target.value)} />
          <InputField
            {...compactField}
            label="Billing Email"
            type="email"
            value={form.billing_email}
            onChange={(e) => setField('billing_email', e.target.value)}
          />
          <div className="md:col-span-2">
            <label className={COMPACT_LABEL}>Commercial Remarks</label>
            <textarea
              value={form.commercial_remarks}
              onChange={(e) => setField('commercial_remarks', e.target.value)}
              rows={3}
              placeholder="Notes on commercial terms"
              className="w-full px-4 py-2.5 bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white dark:focus:bg-gray-800 dark:focus:ring-violet-500 transition-all mb-5"
            />
          </div>
        </div>
      </section>

      {/* Banking */}
      <section className="border-t pt-6 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">Banking</h4>
          {stepPill('banking')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField {...compactField} label="Bank Name" value={form.bank_name} onChange={(e) => setField('bank_name', e.target.value)} placeholder="Bank / branch" />
          <div className="md:col-span-2 mb-5">
            <label className={COMPACT_LABEL}>Account Number</label>
            {isEditing && !isChangingBankAccount ? (
              <div className="flex items-center gap-3">
                <span className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">
                  {client?.bank_account_number_masked || 'Not on file'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsChangingBankAccount(true)}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  Change
                </button>
              </div>
            ) : (
              <InputField
                {...compactField}
                value={form.bank_account_number}
                onChange={(e) => setField('bank_account_number', e.target.value.replace(/\s/g, ''))}
                placeholder="Client bank account number"
              />
            )}
          </div>
          <InputField {...compactField} label="IFSC / SWIFT / IBAN" value={form.bank_code} onChange={(e) => setField('bank_code', e.target.value)} placeholder="HDFC0001234 / CHASUS33" />
          <SelectField
            {...compactField}
            label="Banking Verification Status"
            options={BANKING_VERIFICATION_STATUS_OPTIONS}
            value={form.banking_verification_status}
            onChange={(e) => setField('banking_verification_status', e.target.value as Client['banking_verification_status'])}
          />
          <InputField {...compactField} label="Bank Branch" value={form.bank_branch} onChange={(e) => setField('bank_branch', e.target.value)} />
          <InputField {...compactField} label="Bank Country" value={form.bank_country} onChange={(e) => setField('bank_country', e.target.value)} />
          <div className="md:col-span-2">
            <InputField {...compactField} label="Bank Address" value={form.bank_address} onChange={(e) => setField('bank_address', e.target.value)} />
          </div>
        </div>
      </section>

      {/* KYC & Onboarding */}
      <section className="border-t pt-6 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">KYC &amp; Onboarding</h4>
          {stepPill('approved')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <SelectField
            {...compactField}
            label="KYC Status"
            options={KYC_STATUS_OPTIONS}
            value={form.kyc_status}
            onChange={(e) => setField('kyc_status', e.target.value as Client['kyc_status'])}
          />
          <SelectField
            {...compactField}
            label="Risk Rating"
            options={RISK_RATING_OPTIONS}
            value={form.risk_rating}
            onChange={(e) => setField('risk_rating', e.target.value as Client['risk_rating'])}
          />
          <SelectField
            {...compactField}
            label="Onboarding Step"
            options={EDITABLE_ONBOARDING_STEPS}
            value={form.onboarding_step}
            onChange={(e) => setField('onboarding_step', e.target.value as Client['onboarding_step'])}
            error={errors.onboarding_step}
          />
          <div className="flex items-end pb-5">
            <Checkbox label="Active" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} />
          </div>
        </div>
        <p className="text-xs text-gray-400 -mt-3 mb-4 dark:text-gray-500">
          "Approved" is no longer chosen here - it's only set once this client is submitted for
          approval and passes every requirement below.
        </p>
        {isEditing && client?.id && client.onboarding_step !== 'approved' && (
          <div className="pt-2 border-t dark:border-gray-800">
            {canApprove ? (
              <>
                <button
                  type="button"
                  onClick={handleSubmitForApproval}
                  disabled={isSubmittingApproval}
                  className="px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingApproval ? 'Submitting…' : 'Submit for Approval'}
                </button>
                {approvalMissing && approvalMissing.length > 0 && (
                  <div className="mt-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300">
                    <p className="font-semibold mb-1">Cannot approve client. Missing:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {approvalMissing.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Submitting a client for approval requires Admin or Manager permissions.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Documents */}
      <section className="border-t pt-6 dark:border-gray-800">
        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 dark:text-gray-300">Documents</h4>
        {isEditing ? (
          <DocumentList
            slots={documentSlots}
            documents={documents}
            onUpload={handleUploadDocument}
            onDelete={handleDeleteDocument}
            onDownload={handleDownloadDocument}
            onVerify={handleVerifyDocument}
            canVerify={canApprove}
            disabled={docsLoading}
          />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Save this client first, then reopen it here to upload KYC documents (max 8).</p>
        )}
      </section>

      {/* Footer summary */}
      <div className="border-t pt-6 space-y-3 dark:border-gray-800">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {clientTypeLabel(form.client_type)} client &middot; {jurisdiction} &middot; {form.currency} &middot; {kycStatusLabel(form.kyc_status)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Fields marked * are required. All other fields are optional and can be completed as onboarding progresses.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-8 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving…' : isEditing ? 'Update Client' : 'Create Client'}
          </button>
        </div>
      </div>
    </form>
  );
};
