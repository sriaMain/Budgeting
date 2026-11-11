/**
 * One badge tone and label per status, for every Project Details tab. Milestone progress,
 * invoice status, payment status and expense payment status are separate processes - each has
 * its own map here so they're never mixed up.
 */
export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export const invoiceStatusVariant = (status: string): BadgeVariant => {
    switch (status) {
        case 'Paid': return 'success';
        case 'Issued': return 'info';
        case 'Partially Paid': return 'warning';
        case 'Overdue': return 'danger';
        default: return 'neutral'; // Draft, Cancelled
    }
};

/** Payment status of an invoice or milestone (Not Sent / Sent / Partially Paid / Paid / Overdue). */
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
    not_sent: 'Not Sent', sent: 'Sent', partially_paid: 'Partially Paid', paid: 'Paid', overdue: 'Overdue',
};
export const paymentStatusTone = (s: string): BadgeVariant =>
    s === 'paid' ? 'success' : s === 'overdue' ? 'danger' : s === 'partially_paid' ? 'warning' : s === 'sent' ? 'info' : 'neutral';

/** An expense's / bill's payment status. */
export const EXPENSE_STATUS_LABEL: Record<string, string> = { unpaid: 'Unpaid', partially_paid: 'Partially Paid', paid: 'Paid' };
export const expenseStatusTone = (s: string): BadgeVariant =>
    s === 'paid' ? 'success' : s === 'partially_paid' ? 'warning' : 'neutral';

/** A milestone's own progress (separate from its billing and payment). */
export const MILESTONE_STATUS_LABEL: Record<string, string> = {
    not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed', on_hold: 'On Hold', cancelled: 'Cancelled',
};
export const milestoneStatusTone = (s: string): BadgeVariant =>
    s === 'completed' ? 'success' : s === 'in_progress' ? 'info' : s === 'on_hold' ? 'warning' : 'neutral';
