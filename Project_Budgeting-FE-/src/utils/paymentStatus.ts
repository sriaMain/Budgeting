/**
 * Badge tone for an invoice payment's confirmation status. Only Completed
 * payments count towards the invoice's paid amount.
 */
export type PaymentStatusVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export const paymentStatusVariant = (status?: string): PaymentStatusVariant => {
    switch (status) {
        case 'Completed': return 'success';
        case 'Pending': return 'warning';
        case 'Processing': return 'info';
        case 'Failed': return 'danger';
        default: return 'neutral';
    }
};
