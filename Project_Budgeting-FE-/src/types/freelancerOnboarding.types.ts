export type FreelancerStatus = 'draft' | 'invited' | 'onboarding' | 'completed' | 'active' | 'inactive' | 'blocked';
export type FreelancerAvailability = 'available' | 'partially_available' | 'not_available' | '';

export interface Freelancer {
    id: number;
    full_name: string;
    email: string;
    phone: string;
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
    status: FreelancerStatus;
    last_saved_step: number;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
}

export interface FreelancerManualPayload {
    full_name: string;
    email: string;
    phone?: string;
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
    rate_card: number | null;
    role: string;
    start_date: string;
    end_date: string | null;
    estimated_hours: string | number | null;
    allocated_hours: string | number;
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
    status?: AssignmentStatus;
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

export interface FreelancerBankDetail {
    id: number;
    freelancer: number;
    payment_method: BankPaymentMethod | '';
    payment_terms: string;
    payment_status: BankPaymentStatus;
    tax_type: string;
    tax_number: string;
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
    account_holder_name?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
}

export interface FreelancerBankDetailUnmasked extends FreelancerBankDetailPayload {
    id: number;
    freelancer: number;
    account_number: string;
}

export interface InviteFreelancerPayload {
    full_name: string;
    email: string;
}

export interface FreelancerListFilters {
    status?: string;
    search?: string;
    archived?: string;
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
}

export type FreelancerPublicChoices = Omit<
    FreelancerChoices,
    | 'statuses' | 'pricing_models' | 'contract_types' | 'contract_statuses' | 'assignment_statuses'
    | 'task_assignment_statuses' | 'time_entry_statuses' | 'bank_payment_methods' | 'bank_payment_statuses'
>;
