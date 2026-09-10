export type FreelancerStatus = 'draft' | 'invited' | 'onboarding' | 'completed' | 'active';
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
    payment_method: string;
    currency: string;
    rate: string | number | null;
    status: FreelancerStatus;
    last_saved_step: number;
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
    payment_method?: string;
    currency?: string;
    rate?: string | number | null;
}

export interface InviteFreelancerPayload {
    full_name: string;
    email: string;
}

export interface FreelancerListFilters {
    status?: string;
    search?: string;
}

export interface FreelancerDocument {
    id: number;
    freelancer: number;
    file: string;
    file_name: string;
    file_size: number;
    file_type: string;
    category: 'resume' | 'other';
    uploaded_by: number | null;
    uploaded_at: string;
}

export interface FreelancerChoices {
    availabilities: { value: string; label: string }[];
    currencies: { value: string; label: string }[];
    statuses: { value: string; label: string }[];
}

export type FreelancerPublicChoices = Omit<FreelancerChoices, 'statuses'>;
