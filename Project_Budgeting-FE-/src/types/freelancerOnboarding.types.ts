export type FreelancerStatus =
    | 'draft' | 'invited' | 'onboarding' | 'completed' | 'active' | 'inactive' | 'blocked'
    | 'available' | 'assigned' | 'on_hold' | 'offboarded';
export type FreelancerAvailability = 'available' | 'partially_available' | 'not_available' | '';

interface FreelancerAddressFields {
    permanent_address_line1?: string;
    permanent_address_line2?: string;
    permanent_city?: string;
    permanent_state?: string;
    permanent_country?: string;
    permanent_pincode?: string;
    temp_same_as_permanent?: boolean;
    temp_address_line1?: string;
    temp_address_line2?: string;
    temp_city?: string;
    temp_state?: string;
    temp_country?: string;
    temp_pincode?: string;
}

interface FreelancerEmergencyContactFields {
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relationship?: string;
}

export interface Freelancer extends FreelancerAddressFields, FreelancerEmergencyContactFields {
    id: number;
    freelancer_code: string | null;
    full_name: string;
    email: string;
    phone: string;
    alternate_phone: string;
    date_of_birth: string | null;
    gender: string;
    profile_photo: string | null;
    location: string;
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
    payment_method: string;
    currency: string;
    rate: string | number | null;
    notes: string;
    internal_remarks: string;
    status: FreelancerStatus;
    last_saved_step: number;
    is_archived: boolean;
    /** Convenience masked PAN (e.g. "ABCDE****F") - never the full number. */
    pan_masked: string | null;
    assigned_projects_count: number;
    created_at: string;
    updated_at: string;
}

export interface FreelancerManualPayload extends FreelancerAddressFields, FreelancerEmergencyContactFields {
    full_name: string;
    email: string;
    phone?: string;
    alternate_phone?: string;
    date_of_birth?: string | null;
    gender?: string;
    profile_photo?: File | null;
    location?: string;
    professional_title?: string;
    skills?: string;
    years_of_experience?: number | string | null;
    portfolio_url?: string;
    linkedin_url?: string;
    availability?: FreelancerAvailability;
    preferred_start_date?: string | null;
    available_until?: string | null;
    hours_per_day?: string | number | null;
    hours_per_week?: string | number | null;
    notice_period_days?: number | string | null;
    timezone?: string;
    payment_method?: string;
    currency?: string;
    rate?: string | number | null;
    notes?: string;
    internal_remarks?: string;
    /** Admin-only update path also allows setting status directly. */
    status?: FreelancerStatus;
}

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
export type BankPaymentStatus = 'pending' | 'verified' | 'on_hold';
export type PanVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface FreelancerBankDetail {
    id: number;
    freelancer: number;
    payment_method: BankPaymentMethod | '';
    payment_terms: string;
    payment_status: BankPaymentStatus;
    tax_type: string;
    /** PAN is write-only server-side (Section 7) - only the masked form is ever read here. */
    tax_number_masked: string | null;
    pan_verification_status: PanVerificationStatus;
    account_holder_name: string;
    bank_name: string;
    account_number_masked: string;
    ifsc_code: string;
    created_at: string;
    updated_at: string;
}

export interface FreelancerBankDetailPayload {
    payment_method?: BankPaymentMethod | '';
    payment_terms?: string;
    payment_status?: BankPaymentStatus;
    tax_type?: string;
    tax_number?: string;
    pan_verification_status?: PanVerificationStatus;
    account_holder_name?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
}

export interface FreelancerBankDetailUnmasked {
    id: number;
    freelancer: number;
    payment_method: BankPaymentMethod | '';
    payment_terms: string;
    payment_status: BankPaymentStatus;
    account_holder_name: string;
    bank_name: string;
    account_number: string;
    ifsc_code: string;
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

export type AuditLogAction =
    | 'rate_changed' | 'bank_detail_updated' | 'pan_verification_changed'
    | 'status_changed' | 'project_assigned' | 'project_removed';

export interface FreelancerAuditLog {
    id: number;
    freelancer: number;
    action: AuditLogAction;
    action_display: string;
    field_name: string;
    /** Already masked/sanitized server-side when the field is sensitive. */
    old_value: string;
    new_value: string;
    performed_by_name: string;
    created_at: string;
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

export interface InviteFreelancerPayload {
    full_name: string;
    email: string;
}

export interface FreelancerListFilters {
    status?: string;
    search?: string;
    archived?: string;
    location?: string;
    availability?: string;
}

export interface FreelancerDocument {
    id: number;
    freelancer: number;
    file: string;
    file_name: string;
    file_size: number;
    file_type: string;
    category: 'resume' | 'pan' | 'other';
    uploaded_by: number | null;
    uploaded_at: string;
}

export interface FreelancerChoices {
    availabilities: { value: string; label: string }[];
    currencies: { value: string; label: string }[];
    statuses: { value: string; label: string }[];
    pricing_models: { value: string; label: string }[];
    contract_types: { value: string; label: string }[];
    contract_statuses: { value: string; label: string }[];
    assignment_statuses: { value: string; label: string }[];
    task_assignment_statuses: { value: string; label: string }[];
    time_entry_statuses: { value: string; label: string }[];
    bank_payment_methods: { value: string; label: string }[];
    bank_payment_statuses: { value: string; label: string }[];
    pan_verification_statuses: { value: string; label: string }[];
    equipment_ownerships: { value: string; label: string }[];
    equipment_conditions: { value: string; label: string }[];
}

export type FreelancerPublicChoices = Omit<
    FreelancerChoices,
    | 'statuses' | 'pricing_models' | 'contract_types' | 'contract_statuses' | 'assignment_statuses'
    | 'task_assignment_statuses' | 'time_entry_statuses' | 'bank_payment_methods' | 'bank_payment_statuses'
    | 'pan_verification_statuses'
>;
