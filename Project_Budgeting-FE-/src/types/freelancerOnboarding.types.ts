export type FreelancerStatus =
    | 'draft' | 'invited' | 'onboarding' | 'changes_requested' | 'completed' | 'active' | 'inactive' | 'blocked'
    | 'available' | 'assigned' | 'on_hold' | 'offboarded';
export type FreelancerAvailability = 'available' | 'partially_available' | 'not_available' | '';
export type KycStatus = 'not_started' | 'submitted' | 'under_review' | 'verified' | 'rejected' | 'changes_requested';
export type IdDocumentType = 'passport' | 'national_id' | 'driving_licence' | 'aadhaar_masked' | 'other' | '';
/** The six data steps of the onboarding wizard (the 7th, Review & Submit, has no data). */
export type OnboardingStepKey = 'basic' | 'identity' | 'address' | 'banking' | 'professional' | 'documents';
/** What the secure-link portal shows: still editable, sent back, waiting for review, done. */
export type PortalStatus = 'in_progress' | 'changes_requested' | 'submitted' | 'approved' | 'closed';

export interface ChoiceOption {
    value: string;
    label: string;
}

/** A document slot computed by the backend for this freelancer (kyc.required_documents). */
export interface RequiredDocumentSlot {
    key: string;
    label: string;
    required: boolean;
    tracks_expiry: boolean;
    help_text: string;
}

/** One unmet requirement - from the detail payload or a 400 `missing` list. */
export interface OnboardingIssue {
    step: OnboardingStepKey;
    /** Field name, or "document:<category>" for a document slot. */
    key: string;
    message: string;
}

interface FreelancerAddressFields {
    permanent_address_line1: string;
    permanent_address_line2: string;
    permanent_city: string;
    permanent_state: string;
    permanent_country: string;
    permanent_pincode: string;
    temp_same_as_permanent: boolean;
    temp_address_line1: string;
    temp_address_line2: string;
    temp_city: string;
    temp_state: string;
    temp_country: string;
    temp_pincode: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    emergency_contact_relationship: string;
}

/** Fields both the admin and the portal read. */
export interface FreelancerProfileFields extends FreelancerAddressFields {
    freelancer_code: string | null;
    /** "First Middle Last" - built by the backend from the name parts. */
    full_name: string;
    /** Blank on freelancers created before the name was split. */
    first_name: string;
    middle_name: string;
    last_name: string;
    email: string;
    /** E.164, e.g. "+919876543210". */
    phone: string;
    alternate_phone: string;
    date_of_birth: string | null;
    gender: string;
    nationality: string;
    profile_photo_url: string | null;
    country_of_residence: string;
    id_document_type: IdDocumentType;
    /** Never the full number - e.g. "XXXX XXXX 1234". */
    id_document_number_masked: string | null;
    has_id_document_number: boolean;
    tax_residency_country: string;
    professional_title: string;
    skills: string;
    years_of_experience: number | null;
    portfolio_url: string;
    linkedin_url: string;
    availability: FreelancerAvailability;
    preferred_start_date: string | null;
    available_until: string | null;
    hours_per_day: string | number | null;
    hours_per_week: string | number | null;
    notice_period_days: number | null;
    timezone: string;
}

/** Admin list row. */
export interface Freelancer extends FreelancerProfileFields {
    id: number;
    location: string;
    /** Mirror of the bank detail's payment method (read-only). */
    payment_method: string;
    currency: string;
    rate: string | number | null;
    notes: string;
    internal_remarks: string;
    status: FreelancerStatus;
    status_display: string;
    kyc_status: KycStatus;
    kyc_status_display: string;
    submitted_at: string | null;
    reviewed_at: string | null;
    last_saved_step: number;
    is_archived: boolean;
    /** Convenience masked PAN (e.g. "ABCDE****F") - never the full number. */
    pan_masked: string | null;
    assigned_projects_count: number;
    /** Steps with nothing missing (server-computed from the same rules as submit). */
    step_completion: Record<OnboardingStepKey, boolean>;
    created_at: string;
    updated_at: string;
}

/** What the requesting user may do (server-computed from their role). */
export interface FreelancerPermissions {
    edit: boolean;
    submit: boolean;
    approve: boolean;
    request_changes: boolean;
    verify: boolean;
    manage_link: boolean;
    view_bank: boolean;
    edit_bank: boolean;
    view_unmasked_bank: boolean;
    view_pan_unmasked: boolean;
    view_unmasked_id: boolean;
    view_documents: boolean;
    upload_documents: boolean;
    delete_documents: boolean;
}

export interface AccessLinkSummary {
    status: 'none' | 'active' | 'expired' | 'revoked';
    expires_at: string | null;
    last_used_at: string | null;
    created_at: string | null;
    revoked_at: string | null;
    revoke_reason: '' | 'reissued' | 'approved' | 'closed' | 'manual';
}

/** Admin detail. */
export interface FreelancerDetail extends Freelancer {
    review_remarks: string;
    changes_requested_sections: OnboardingStepKey[];
    reviewed_by_name: string | null;
    required_documents: RequiredDocumentSlot[];
    submission_issues: OnboardingIssue[];
    approval_issues: OnboardingIssue[];
    permissions: FreelancerPermissions;
    access_link: AccessLinkSummary;
}

/** The secure-link portal's view of the freelancer - no internal notes, rate or status. */
export interface FreelancerPublic extends FreelancerProfileFields {
    last_saved_step: number;
    kyc_status: KycStatus;
    kyc_status_display: string;
    submitted_at: string | null;
    portal_status: PortalStatus;
    can_edit: boolean;
    /** Reviewer's remarks - only while changes are requested. */
    review_remarks: string;
    changes_requested_sections: OnboardingStepKey[];
    required_documents: RequiredDocumentSlot[];
    submission_issues: OnboardingIssue[];
}

/** Returned for a link that was switched off because the onboarding was approved or closed. */
export interface FreelancerPortalClosed {
    portal_status: 'approved' | 'closed';
    can_edit: false;
    link_active: false;
}

/** Profile fields the admin / portal write (admin also: email, currency, rate, notes, internal_remarks). */
export type FreelancerProfilePayload = Partial<{
    first_name: string;
    middle_name: string;
    last_name: string;
    email: string;
    phone: string;
    alternate_phone: string;
    date_of_birth: string | null;
    gender: string;
    nationality: string;
    country_of_residence: string;
    id_document_type: IdDocumentType;
    /** Write-only; omit to keep the number on file. */
    id_document_number: string;
    tax_residency_country: string;
    professional_title: string;
    skills: string;
    years_of_experience: number | string | null;
    portfolio_url: string;
    linkedin_url: string;
    availability: FreelancerAvailability;
    preferred_start_date: string | null;
    available_until: string | null;
    hours_per_day: string | number | null;
    hours_per_week: string | number | null;
    notice_period_days: number | string | null;
    timezone: string;
    last_saved_step: number;
    currency: string;
    rate: string | number | null;
    notes: string;
    internal_remarks: string;
    status: FreelancerStatus;
}> & Partial<FreelancerAddressFields>;

/** @deprecated kept for older imports - use FreelancerProfilePayload. */
export type FreelancerManualPayload = FreelancerProfilePayload;

export type PricingModel = 'hourly' | 'daily' | 'fixed' | 'milestone' | 'retainer';

export interface FreelancerRateCard {
    id: number;
    freelancer: number;
    pricing_model: PricingModel;
    cost_rate: string | number;
    billing_rate: string | number;
    currency: string;
    effective_from: string;
    effective_to: string | null;
    minimum_billable_hours: string | number | null;
    overtime_rate: string | number | null;
    weekend_rate: string | number | null;
    is_active: boolean;
    margin: string | number;
    is_current: boolean;
    created_at: string;
    updated_at: string;
}

export interface FreelancerRateCardPayload {
    pricing_model: PricingModel;
    cost_rate: string | number;
    billing_rate: string | number;
    currency: string;
    effective_from: string;
    effective_to?: string | null;
    minimum_billable_hours?: string | number | null;
    overtime_rate?: string | number | null;
    weekend_rate?: string | number | null;
    is_active?: boolean;
}

export type ContractType = 'freelancer' | 'independent_contractor' | 'consultant' | 'agency';
export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated';

export interface FreelancerContract {
    id: number;
    freelancer: number;
    contract_type: ContractType;
    start_date: string;
    end_date: string | null;
    status: ContractStatus;
    payment_terms: string;
    notice_period_days: number | null;
    nda_signed: boolean;
    agreement_signed: boolean;
    document: string | null;
    document_name: string;
    notes: string;
    created_at: string;
    updated_at: string;
}

export interface FreelancerContractPayload {
    contract_type: ContractType;
    start_date: string;
    end_date?: string | null;
    status?: ContractStatus;
    payment_terms?: string;
    notice_period_days?: number | string | null;
    nda_signed?: boolean;
    agreement_signed?: boolean;
    document?: File | null;
    notes?: string;
}

export type AssignmentStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface FreelancerProjectAssignment {
    id: number;
    freelancer: number;
    freelancer_name: string;
    project: number;
    project_name: string;
    /** Joined from the assigned project - null if it has no client set. */
    client_name: string | null;
    project_type: string;
    rate_card: number | null;
    role: string;
    start_date: string;
    end_date: string | null;
    estimated_hours: string | number | null;
    allocated_hours: string | number;
    allocation_percent: number;
    planned_units: string | number | null;
    /** cost_rate_snapshot x planned_units - null until both are set. */
    planned_freelancer_cost: string | number | null;
    pricing_model_snapshot: string;
    cost_rate_snapshot: string | number | null;
    billing_rate_snapshot: string | number | null;
    currency_snapshot: string;
    margin: string | number | null;
    status: AssignmentStatus;
    created_at: string;
    updated_at: string;
    capacity_warning?: CapacityCheckResult | null;
}

export interface FreelancerProjectAssignmentPayload {
    freelancer: number;
    project: number;
    rate_card?: number | null;
    role?: string;
    start_date: string;
    end_date?: string | null;
    estimated_hours?: string | number | null;
    allocated_hours: string | number;
    allocation_percent?: number;
    planned_units?: string | number | null;
    status?: AssignmentStatus;
    /** Overrides the freelancer's active rate card for THIS assignment only
     * (Section 12) - never written back to the freelancer's master rate. */
    cost_rate_override?: string | number | null;
    billing_rate_override?: string | number | null;
}

export interface CapacityCheckResult {
    capacity_hours_per_week: number | null;
    existing_allocated_hours_per_week: number;
    requested_hours_per_week: number;
    total_allocated_hours_per_week: number;
    is_over_allocated: boolean;
    over_allocated_by: number;
}

export type TaskAssignmentStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface FreelancerTaskAssignment {
    id: number;
    freelancer: number;
    freelancer_name: string;
    task: number;
    task_title: string;
    project_name: string;
    project_assignment: number;
    estimated_hours: string | number | null;
    allocated_hours: string | number;
    status: TaskAssignmentStatus;
    actual_hours: string | number;
    billable_hours: string | number;
    remaining_hours: string | number;
    cost: string | number | null;
    billing_amount: string | number | null;
    created_at: string;
    updated_at: string;
}

export interface FreelancerTaskAssignmentPayload {
    freelancer: number;
    task: number;
    project_assignment?: number;
    estimated_hours?: string | number | null;
    allocated_hours: string | number;
    status?: TaskAssignmentStatus;
}

export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface FreelancerTimeEntry {
    id: number;
    task_assignment: number;
    freelancer_name: string;
    task_title: string;
    project_name: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    break_minutes: number;
    hours: string | number;
    is_billable: boolean;
    description: string;
    status: TimeEntryStatus;
    submitted_at: string | null;
    reviewed_by: number | null;
    reviewed_at: string | null;
    rejection_reason: string;
    created_at: string;
    updated_at: string;
}

export interface FreelancerTimeEntryPayload {
    task_assignment: number;
    date: string;
    start_time?: string | null;
    end_time?: string | null;
    break_minutes?: number;
    hours?: string | number;
    is_billable?: boolean;
    description?: string;
}

export interface SimpleTask {
    id: number;
    title: string;
    allocated_hours: string | number;
    status: string;
}

export type BankPaymentMethod = 'bank_transfer' | 'upi' | 'paypal' | 'wise' | 'other';
export type BankPaymentStatus = 'pending' | 'verified' | 'rejected' | 'on_hold';
export type PanVerificationStatus = 'pending' | 'verified' | 'rejected';

/** Payout + tax record. Account number and tax ID are write-only server-side - only the
 * masked forms are ever read. Verification statuses are set by a reviewer only. */
export interface FreelancerBankDetail {
    id: number;
    freelancer: number;
    payment_method: BankPaymentMethod | '';
    /** Admin only (absent on the portal). */
    payment_terms?: string;
    payment_status: BankPaymentStatus;
    verification_remarks: string;
    verified_at: string | null;
    verified_by_name: string | null;
    tax_type: string;
    /** Label of the tax ID for this freelancer's tax country ("PAN", "SSN / ITIN", ...). */
    tax_label: string;
    tax_number_masked: string | null;
    has_tax_number: boolean;
    pan_verification_status: PanVerificationStatus;
    pan_verification_remarks: string;
    bank_country: string;
    account_holder_name: string;
    bank_name: string;
    account_number_masked: string;
    has_account_number: boolean;
    ifsc_code: string;
    routing_code: string;
    swift_code: string;
    iban: string;
    branch_name: string;
    bank_address: string;
    account_type: string;
    upi_id: string;
    paypal_email: string;
    wise_email: string;
    created_at: string;
    updated_at: string;
}

export type FreelancerBankDetailPayload = Partial<{
    payment_method: BankPaymentMethod | '';
    payment_terms: string;
    /** Write-only; omit to keep the value on file. */
    tax_number: string;
    bank_country: string;
    account_holder_name: string;
    bank_name: string;
    /** Write-only; omit to keep the number on file. */
    account_number: string;
    confirm_account_number: string;
    ifsc_code: string;
    routing_code: string;
    swift_code: string;
    iban: string;
    branch_name: string;
    bank_address: string;
    account_type: string;
    upi_id: string;
    paypal_email: string;
    wise_email: string;
}>;

export interface FreelancerBankDetailUnmasked {
    id: number;
    freelancer: number;
    payment_method: BankPaymentMethod | '';
    payment_terms: string;
    payment_status: BankPaymentStatus;
    bank_country: string;
    account_holder_name: string;
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    routing_code: string;
    swift_code: string;
    iban: string;
    branch_name: string;
    account_type: string;
    upi_id: string;
    paypal_email: string;
    wise_email: string;
}

/** Returned only by the dedicated PAN-reveal endpoint (its own permission,
 * independent of the bank-account reveal above). */
export interface FreelancerPANUnmasked {
    id: number;
    freelancer: number;
    tax_type: string;
    tax_number: string;
    pan_verification_status: PanVerificationStatus;
}

export interface FreelancerIdentityUnmasked {
    id_document_type: IdDocumentType;
    id_document_number: string;
}

export interface BankVerificationPayload {
    target: 'bank' | 'pan';
    status: 'pending' | 'verified' | 'rejected' | 'on_hold';
    remarks?: string;
}

export type EquipmentOwnership = 'freelancer_owned' | 'company_provided' | 'client_provided' | 'other' | '';
export type EquipmentCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged' | '';

export interface FreelancerEquipment {
    id: number;
    freelancer: number;
    ownership: EquipmentOwnership;
    brand: string;
    model: string;
    serial_number: string;
    processor: string;
    ram: string;
    storage: string;
    operating_system: string;
    asset_id: string;
    issue_date: string | null;
    return_date: string | null;
    condition: EquipmentCondition;
    remarks: string;
    created_at: string;
    updated_at: string;
}

export interface FreelancerEquipmentPayload {
    ownership?: EquipmentOwnership;
    brand?: string;
    model?: string;
    serial_number?: string;
    processor?: string;
    ram?: string;
    storage?: string;
    operating_system?: string;
    asset_id?: string;
    issue_date?: string | null;
    return_date?: string | null;
    condition?: EquipmentCondition;
    remarks?: string;
}

export type AuditLogAction =
    | 'rate_changed' | 'bank_detail_updated' | 'pan_verification_changed'
    | 'status_changed' | 'project_assigned' | 'project_removed'
    | 'submitted' | 'approved' | 'changes_requested'
    | 'document_uploaded' | 'document_replaced' | 'document_deleted'
    | 'document_verified' | 'document_rejected' | 'document_under_review'
    | 'kyc_status_changed' | 'token_revoked' | 'invite_resent';

export interface FreelancerAuditLog {
    id: number;
    freelancer: number;
    action: AuditLogAction;
    action_display: string;
    field_name: string;
    /** Already masked/sanitized server-side when the field is sensitive. */
    old_value: string;
    new_value: string;
    /** Reason given (rejection reason, requested changes). */
    remarks: string;
    performed_by_name: string;
    created_at: string;
}

export interface InviteFreelancerPayload {
    first_name: string;
    middle_name: string;
    last_name: string;
    email: string;
}

export interface FreelancerListFilters {
    status?: string;
    kyc_status?: string;
    search?: string;
    archived?: string;
    location?: string;
    availability?: string;
}

export type FreelancerDocumentCategory =
    | 'resume' | 'pan' | 'government_id' | 'address_proof' | 'bank_proof' | 'tax_form'
    | 'tax_residency_certificate' | 'other';

export type FreelancerDocumentStatus = 'uploaded' | 'under_review' | 'verified' | 'rejected';

export interface FreelancerDocument {
    id: number;
    /** Admin payload only. */
    freelancer?: number;
    file_name: string;
    file_size: number;
    file_type: string;
    category: FreelancerDocumentCategory;
    category_display: string;
    status: FreelancerDocumentStatus;
    /** 'expired' when past expiry_date. */
    effective_status: FreelancerDocumentStatus | 'expired';
    expiry_date: string | null;
    document_number: string;
    uploaded_by?: number | null;
    uploaded_at: string;
    verified_by?: number | null;
    verified_by_name?: string | null;
    verified_at: string | null;
    remarks: string;
}

export interface DocumentUploadOptions {
    onProgress?: (percent: number) => void;
    /** Id of the document this upload replaces (same category) - swapped atomically server-side. */
    replaces?: number;
    expiryDate?: string;
    documentNumber?: string;
}

export interface FreelancerChoices {
    availabilities: ChoiceOption[];
    currencies: ChoiceOption[];
    statuses: ChoiceOption[];
    kyc_statuses: ChoiceOption[];
    genders: ChoiceOption[];
    id_document_types: ChoiceOption[];
    document_categories: ChoiceOption[];
    document_statuses: ChoiceOption[];
    onboarding_steps: ChoiceOption[];
    pricing_models: ChoiceOption[];
    contract_types: ChoiceOption[];
    contract_statuses: ChoiceOption[];
    assignment_statuses: ChoiceOption[];
    task_assignment_statuses: ChoiceOption[];
    time_entry_statuses: ChoiceOption[];
    bank_payment_methods: ChoiceOption[];
    bank_payment_statuses: ChoiceOption[];
    pan_verification_statuses: ChoiceOption[];
    equipment_ownerships: ChoiceOption[];
    equipment_conditions: ChoiceOption[];
}

/** What the public choices endpoint returns - only lists the portal renders. */
export type FreelancerPublicChoices = Pick<
    FreelancerChoices,
    'availabilities' | 'genders' | 'id_document_types' | 'bank_payment_methods' | 'document_categories' | 'onboarding_steps'
>;

/** Errors from submit / approve when something is still missing. */
export interface MissingRequirementsError {
    error: string;
    missing: OnboardingIssue[];
    errors?: Record<string, string[]>;
}
