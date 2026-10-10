/**
 * InvoiceDrawer
 * An invoice's details in a side drawer, opened from the project page instead
 * of navigating to /invoices/<id>: header, line items, totals and payments,
 * with the same actions as the full screen (record payment, edit dates,
 * PDF, send, delete). Record Payment opens on top as its own drawer.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Send, Trash2, Pencil } from 'lucide-react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { Drawer } from './Drawer';
import { RecordPaymentModal } from './RecordPaymentModal';
import { drawerInputClass, drawerLabelClass } from './drawerForm';

interface InvoiceDrawerProps {
    /** Invoice to show; null keeps the drawer closed. */
    invoiceId: number | string | null;
    onClose: () => void;
    /** Called after anything changes the invoice (payment, edit, delete). */
    onChanged?: () => void;
}

const n = (v: number | string | undefined | null) => Number(v) || 0;
const money = (v: number | string | undefined | null) =>
    `₹${n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const statusClass = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('partially')) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
    if (s.includes('paid')) return 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300';
    if (s.includes('overdue')) return 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300';
    if (s.includes('issued') || s.includes('sent')) return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="min-w-0">
        <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white truncate">{children}</dd>
    </div>
);

const TotalRow: React.FC<{ label: string; value: string; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
    <div className={`flex justify-between py-1 text-sm ${strong ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
        <span>{label}</span>
        <span className={`tabular-nums ${tone || ''}`}>{value}</span>
    </div>
);

const actionBtn = 'flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50';

export const InvoiceDrawer: React.FC<InvoiceDrawerProps> = ({ invoiceId, onClose, onChanged }) => {
    const [invoice, setInvoice] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [issueDate, setIssueDate] = useState('');
    const [dueDate, setDueDate] = useState('');

    const fetchInvoice = useCallback(async () => {
        if (invoiceId == null) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get(`invoices/${invoiceId}/`);
            setInvoice(res.data);
        } catch (error) {
            console.error('Error fetching invoice:', error);
            toast.error('Failed to load invoice');
        } finally {
            setIsLoading(false);
        }
    }, [invoiceId]);

    useEffect(() => {
        setInvoice(null);
        setIsEditing(false);
        setIsPaymentOpen(false);
        fetchInvoice();
    }, [fetchInvoice]);

    const afterChange = async () => {
        await fetchInvoice();
        onChanged?.();
    };

    const startEdit = () => {
        setIssueDate(invoice.issue_date || '');
        setDueDate(invoice.due_date || '');
        setIsEditing(true);
    };

    // Same PUT payload as the full invoice screen, with the edited dates
    const saveDates = async () => {
        if (dueDate && issueDate && dueDate < issueDate) {
            toast.error('Due date cannot be before the issue date');
            return;
        }
        setIsBusy(true);
        try {
            await axiosInstance.put(`/invoices/${invoiceId}/`, {
                status: invoice.status,
                client: invoice.client,
                quote: invoice.quote,
                issue_date: issueDate,
                due_date: dueDate,
                sub_total: invoice.sub_total,
                tax_percentage: invoice.tax_percentage,
                tax_amount: invoice.tax_amount,
                discount_amount: invoice.discount_amount,
                total_amount: invoice.total_amount,
                notes: invoice.notes || '',
                terms_conditions: invoice.terms_conditions || '',
                items: (invoice.items || []).map((item: any) => ({
                    product_service: item.product_service_id || item.id,
                    description: item.description || '',
                    quantity: String(item.quantity),
                    unit: item.unit,
                    price_per_unit: item.price_per_unit,
                    discount_percentage: item.discount_percentage || '0.00',
                    amount: item.amount,
                })),
            });
            toast.success('Invoice updated');
            setIsEditing(false);
            await afterChange();
        } catch (error) {
            console.error('Error updating invoice:', error);
            toast.error('Failed to update invoice');
        } finally {
            setIsBusy(false);
        }
    };

    const sendEmail = async () => {
        setIsBusy(true);
        try {
            await axiosInstance.post(`/invoices/${invoiceId}/send-email/`);
            toast.success('Invoice sent via email');
            await afterChange();
        } catch (error) {
            console.error('Error sending invoice email:', error);
            toast.error('Failed to send invoice email');
        } finally {
            setIsBusy(false);
        }
    };

    const downloadPdf = async () => {
        setIsBusy(true);
        try {
            const res = await axiosInstance.get(`/invoices/${invoiceId}/download/`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Invoice_${invoice.invoice_no}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading PDF:', error);
            toast.error('Failed to download PDF');
        } finally {
            setIsBusy(false);
        }
    };

    const deleteInvoice = async () => {
        if (!window.confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) return;
        setIsBusy(true);
        try {
            await axiosInstance.delete(`/invoices/${invoiceId}/`);
            toast.success('Invoice deleted');
            onChanged?.();
            onClose();
        } catch (error: any) {
            console.error('Error deleting invoice:', error);
            toast.error(error?.response?.data?.error || 'Failed to delete invoice');
        } finally {
            setIsBusy(false);
        }
    };

    const status: string = invoice?.status_display || invoice?.status || '';
    const balance = n(invoice?.balance_amount);
    // A paid invoice is final - it can't be edited
    const isPaid = invoice?.status === 'Paid' || (n(invoice?.total_amount) > 0 && balance <= 0);
    const payments: any[] = Array.isArray(invoice?.payments) ? invoice.payments : [];
    const items: any[] = Array.isArray(invoice?.items) ? invoice.items : [];

    return (
        <>
            <Drawer
                isOpen={invoiceId != null}
                onClose={onClose}
                title={invoice ? `Invoice ${invoice.invoice_no}` : 'Invoice'}
                subtitle={invoice?.client_name || undefined}
                size="lg"
                footer={invoice ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={downloadPdf} disabled={isBusy} className={actionBtn}><Download className="w-4 h-4" />PDF</button>
                            <button type="button" onClick={sendEmail} disabled={isBusy} className={actionBtn}><Send className="w-4 h-4" />Send</button>
                            <button type="button" onClick={deleteInvoice} disabled={isBusy} className={`${actionBtn} text-red-600 dark:text-red-400`}><Trash2 className="w-4 h-4" />Delete</button>
                        </div>
                        {balance > 0 && (
                            <button
                                type="button"
                                onClick={() => setIsPaymentOpen(true)}
                                disabled={isBusy}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                Record Payment
                            </button>
                        )}
                    </div>
                ) : undefined}
            >
                {isLoading && !invoice ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading invoice...</p>
                ) : !invoice ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Invoice not found.</p>
                ) : (
                    <div className="space-y-6">
                        <section>
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(status)}`}>{status}</span>
                                {!isEditing && !isPaid && (
                                    <button type="button" onClick={startEdit} className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                                        <Pencil className="w-3.5 h-3.5" />Edit dates
                                    </button>
                                )}
                            </div>
                            {isEditing && !isPaid ? (
                                <fieldset disabled={isBusy} className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                                    <div>
                                        <label className={drawerLabelClass}>Issue Date</label>
                                        <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={drawerInputClass} />
                                    </div>
                                    <div>
                                        <label className={drawerLabelClass}>Due Date</label>
                                        <input type="date" value={dueDate} min={issueDate || undefined} onChange={(e) => setDueDate(e.target.value)} className={drawerInputClass} />
                                    </div>
                                    <div className="sm:col-span-2 flex justify-end gap-2">
                                        <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancel</button>
                                        <button type="button" onClick={saveDates} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                            {isBusy ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                </fieldset>
                            ) : (
                                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                                    <Field label="Issue Date">{fmtDate(invoice.issue_date)}</Field>
                                    <Field label="Due Date">{fmtDate(invoice.due_date)}</Field>
                                    <Field label="Client">{invoice.client_name || '-'}</Field>
                                    <Field label="Billing Period">
                                        {invoice.billing_period_start ? `${fmtDate(invoice.billing_period_start)} to ${fmtDate(invoice.billing_period_end)}` : '-'}
                                    </Field>
                                    <Field label="Quote No">{invoice.quote_no || '-'}</Field>
                                    <Field label="Created By">{invoice.created_by_name || '-'}</Field>
                                </dl>
                            )}
                        </section>

                        <section>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">Items</h4>
                            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs text-gray-500 dark:text-gray-400">
                                        <tr>
                                            <th className="px-3 py-2 font-semibold">Item</th>
                                            <th className="px-3 py-2 font-semibold text-right">Qty</th>
                                            <th className="px-3 py-2 font-semibold text-right">Unit Price</th>
                                            <th className="px-3 py-2 font-semibold text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {items.length === 0 && (
                                            <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">No items</td></tr>
                                        )}
                                        {items.map((item) => (
                                            <tr key={item.id}>
                                                <td className="px-3 py-2 text-gray-900 dark:text-white">
                                                    {item.product_service || item.description || 'Item'}
                                                    {item.description && item.description !== item.product_service && (
                                                        <span className="block text-xs text-gray-500 dark:text-gray-400">{item.description}</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{n(item.quantity)} {item.unit || ''}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{money(item.price_per_unit)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-white">{money(item.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-3 ml-auto max-w-xs">
                                <TotalRow label="Sub total" value={money(invoice.sub_total)} />
                                <TotalRow label={`Tax (${n(invoice.tax_percentage)}%)`} value={money(invoice.tax_amount)} />
                                {n(invoice.discount_amount) > 0 && <TotalRow label="Discount" value={`- ${money(invoice.discount_amount)}`} />}
                                <div className="border-t border-gray-200 dark:border-gray-800 my-1" />
                                <TotalRow label="Total" value={money(invoice.total_amount)} strong />
                                <TotalRow label="Paid" value={money(invoice.paid_amount)} tone="text-green-600 dark:text-green-400" />
                                <TotalRow label="Balance due" value={money(balance)} strong tone={balance > 0 ? 'text-amber-600 dark:text-amber-400' : ''} />
                            </div>
                        </section>

                        <section>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                                Payments <span className="font-normal normal-case tracking-normal text-gray-500">({payments.length})</span>
                            </h4>
                            {payments.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No payments recorded yet.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800">
                                    {payments.map((p) => (
                                        <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                                            <div className="min-w-0">
                                                <p className="text-gray-900 dark:text-white">{fmtDate(p.payment_date)} · {p.payment_method_display || p.payment_method || '-'}</p>
                                                {(p.reference_no || p.notes) && (
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{[p.reference_no, p.notes].filter(Boolean).join(' · ')}</p>
                                                )}
                                            </div>
                                            <span className="tabular-nums font-medium text-green-600 dark:text-green-400">{money(p.amount)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </Drawer>

            {invoice && (
                <RecordPaymentModal
                    isOpen={isPaymentOpen}
                    onClose={() => setIsPaymentOpen(false)}
                    invoiceId={String(invoice.id)}
                    invoiceData={{ invoice_no: invoice.invoice_no, amount: String(balance) }}
                    onPaymentRecorded={afterChange}
                />
            )}
        </>
    );
};

export default InvoiceDrawer;
