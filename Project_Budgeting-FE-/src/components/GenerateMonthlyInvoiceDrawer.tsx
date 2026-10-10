/**
 * GenerateMonthlyInvoiceDrawer
 * Time & Material billing from the Invoices tab: pick a month of the project
 * (its start date to end date, from GET /projects/<id>/periods/) and raise
 * that month's invoice, pre-filled with the month's billing amount
 * (POST /projects/<id>/generate-tm-invoice/).
 *
 * Months that already have an invoice, or haven't started yet, are listed
 * but can't be picked - the backend enforces the same rules.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { Drawer } from './Drawer';
import { drawerInputClass, drawerLabelClass, FieldHint, DrawerSection, DrawerFormFooter } from './drawerForm';
import type { TMPeriodRow, TMPeriodsResponse } from '../types/financials.types';

interface GenerateMonthlyInvoiceDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    currency?: string;
    /** Called after the invoice is created, so the invoice list can refresh. */
    onCreated?: () => void;
}

const n = (v: number | string | undefined | null) => Number(v) || 0;
const money = (v: number | string | undefined | null) =>
    n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** Why a month can't be invoiced, or null when it can. */
const blockedReason = (p: TMPeriodRow): string | null => {
    if (p.invoice) return `invoiced (${p.invoice.invoice_no})`;
    if (p.timing === 'future') return 'not started yet';
    if (n(p.billing_amount) <= 0) return 'no billing amount';
    if (!p.can_generate_invoice) return 'not billable';
    return null;
};

export const GenerateMonthlyInvoiceDrawer: React.FC<GenerateMonthlyInvoiceDrawerProps> = ({ isOpen, onClose, projectId, currency = 'INR', onCreated }) => {
    const [data, setData] = useState<TMPeriodsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [periodId, setPeriodId] = useState<number | null>(null);
    const [invoiceAmount, setInvoiceAmount] = useState('');
    const [taxPercent, setTaxPercent] = useState('');
    const [dueDays, setDueDays] = useState('30');
    const [isGenerating, setIsGenerating] = useState(false);

    // Reload the months every time the drawer opens, so invoiced months are current
    useEffect(() => {
        if (!isOpen || !projectId) return;
        let cancelled = false;
        setIsLoading(true);
        axiosInstance.get<TMPeriodsResponse>(`/projects/${projectId}/periods/`)
            .then(res => {
                if (cancelled) return;
                setData(res.data);
                const first = res.data.periods.find(p => p.is_active && !blockedReason(p));
                setPeriodId(first?.id ?? null);
                setInvoiceAmount(first ? String(n(first.billing_amount)) : '');
                setTaxPercent(String(n(res.data.tax_percentage)));
                setDueDays('30');
            })
            .catch((error: any) => {
                console.error('Failed to fetch project months:', error);
                toast.error(error?.response?.data?.error || 'Failed to load project months');
            })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, projectId]);

    // Only the months within the project dates (start date to end date)
    const months = useMemo(() => (data?.periods ?? []).filter(p => p.is_active), [data]);
    const period = months.find(p => p.id === periodId) ?? null;
    const hasEligible = months.some(p => !blockedReason(p));

    const selectMonth = (id: number) => {
        const p = months.find(m => m.id === id);
        setPeriodId(id);
        setInvoiceAmount(p ? String(n(p.billing_amount)) : '');
    };

    // Amount is pre-tax, tax goes on top
    const subTotal = n(invoiceAmount);
    const tax = Math.round(subTotal * n(taxPercent)) / 100;
    const total = subTotal + tax;

    const generateInvoice = async () => {
        if (!period) {
            toast.error('Select a month to invoice');
            return;
        }
        const amount = parseFloat(invoiceAmount);
        if (Number.isNaN(amount) || amount <= 0) {
            toast.error('Invoice amount must be greater than 0');
            return;
        }
        const taxValue = taxPercent === '' ? 0 : parseFloat(taxPercent);
        if (Number.isNaN(taxValue) || taxValue < 0 || taxValue > 100) {
            toast.error('Tax must be between 0 and 100%');
            return;
        }
        setIsGenerating(true);
        try {
            await axiosInstance.post(`/projects/${projectId}/generate-tm-invoice/`, {
                period: period.id,
                amount,
                tax_percentage: taxValue,
                due_days: parseInt(dueDays, 10) || 30,
            });
            toast.success(`Invoice created for ${period.label} (Draft)`);
            onClose();
            onCreated?.();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'Failed to create invoice');
        } finally {
            setIsGenerating(false);
        }
    };

    const projectRange = months.length
        ? `${fmtDate(months[0].period_start)} to ${fmtDate(months[months.length - 1].period_end)}`
        : undefined;

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Generate Invoice"
            subtitle={projectRange ? `Project ${projectRange}` : undefined}
            size="md"
            footer={(
                <DrawerFormFooter
                    summary={<>Invoice total: <span className="font-semibold text-gray-800 dark:text-gray-200">{money(total)} {currency}</span></>}
                    onCancel={onClose}
                    onSubmit={generateInvoice}
                    submitLabel="Create Invoice"
                    busyLabel="Creating..."
                    isBusy={isGenerating}
                />
            )}
        >
            {isLoading && !data ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading project months...</p>
            ) : months.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">This project has no months to bill - set its start and end dates first.</p>
            ) : (
                <fieldset disabled={isGenerating} className="space-y-4">
                    <DrawerSection>
                        <div>
                            <label className={drawerLabelClass}>Billing Month *</label>
                            <select
                                value={periodId ?? ''}
                                onChange={(e) => selectMonth(Number(e.target.value))}
                                className={drawerInputClass}
                            >
                                {!hasEligible && <option value="">No month available to invoice</option>}
                                {months.map(p => {
                                    const reason = blockedReason(p);
                                    return (
                                        <option key={p.id} value={p.id} disabled={!!reason}>
                                            {p.label} - {money(p.billing_amount)} {currency}{reason ? ` (${reason})` : ''}
                                        </option>
                                    );
                                })}
                            </select>
                            <FieldHint>
                                {period
                                    ? `Billing period ${fmtDate(period.period_start)} to ${fmtDate(period.period_end)}.`
                                    : 'Every month of the project is already invoiced or hasn\'t started yet.'}
                            </FieldHint>
                        </div>
                        <div>
                            <label className={drawerLabelClass}>Invoice Amount (before tax) *</label>
                            <input
                                type="number" min={0} step="0.01"
                                value={invoiceAmount}
                                onChange={(e) => setInvoiceAmount(e.target.value)}
                                disabled={!period}
                                className={`${drawerInputClass} text-right tabular-nums`}
                            />
                            <FieldHint>Pre-filled with the month's billing amount.</FieldHint>
                        </div>
                    </DrawerSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={drawerLabelClass}>Tax (%)</label>
                            <input
                                type="number" min={0} max={100} step="0.01"
                                value={taxPercent}
                                onChange={(e) => setTaxPercent(e.target.value)}
                                className={`${drawerInputClass} text-right tabular-nums`}
                            />
                        </div>
                        <div>
                            <label className={drawerLabelClass}>Due in (days)</label>
                            <input type="number" min={0} value={dueDays} onChange={(e) => setDueDays(e.target.value)} className={`${drawerInputClass} text-right tabular-nums`} />
                        </div>
                    </div>
                    <FieldHint>
                        {data?.quotation
                            ? `Tax pre-filled from quotation #${data.quotation.quote_no} (${data.quotation.quote_name}).`
                            : 'This project has no quotation - enter the tax % to apply.'}
                    </FieldHint>
                    <dl className="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm">
                        <div className="flex justify-between py-0.5"><dt className="text-gray-600 dark:text-gray-400">Sub total</dt><dd className="tabular-nums">{money(subTotal)}</dd></div>
                        <div className="flex justify-between py-0.5"><dt className="text-gray-600 dark:text-gray-400">Tax ({n(taxPercent)}%)</dt><dd className="tabular-nums">{money(tax)}</dd></div>
                        <div className="flex justify-between py-0.5 border-t border-gray-200 dark:border-gray-800 mt-1 pt-1 font-semibold text-gray-900 dark:text-white"><dt>Total</dt><dd className="tabular-nums">{money(total)} {currency}</dd></div>
                    </dl>
                    <FieldHint>The invoice is created as a Draft and linked to the selected month. A month can have only one open invoice.</FieldHint>
                </fieldset>
            )}
        </Drawer>
    );
};

export default GenerateMonthlyInvoiceDrawer;
