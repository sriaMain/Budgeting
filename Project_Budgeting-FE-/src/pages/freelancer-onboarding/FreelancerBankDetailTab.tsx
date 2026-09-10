import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/Button';
import { InputField } from '../../components/InputField';
import { SelectField } from '../../components/SelectField';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { FreelancerBankDetailPayload } from '../../types/freelancerOnboarding.types';

interface Props {
    freelancerId: number;
    paymentMethods: { value: string; label: string }[];
}

const EMPTY: FreelancerBankDetailPayload = {
    payment_method: '',
    payment_terms: '',
    tax_number: '',
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
};

export const FreelancerBankDetailTab: React.FC<Props> = ({ freelancerId, paymentMethods }) => {
    const [values, setValues] = useState<FreelancerBankDetailPayload>(EMPTY);
    const [accountNumberMasked, setAccountNumberMasked] = useState<string | null>(null);
    const [revealedAccountNumber, setRevealedAccountNumber] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isRevealing, setIsRevealing] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const detail = await api.getBankDetail(freelancerId);
            if (detail) {
                setValues({
                    payment_method: detail.payment_method, payment_terms: detail.payment_terms,
                    tax_number: detail.tax_number, account_holder_name: detail.account_holder_name,
                    bank_name: detail.bank_name, account_number: '', ifsc_code: detail.ifsc_code,
                });
                setAccountNumberMasked(detail.account_number_masked || null);
            } else {
                setValues(EMPTY);
                setAccountNumberMasked(null);
            }
            setRevealedAccountNumber(null);
        } catch {
            toast.error('Failed to load bank details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [freelancerId]);

    const set = <K extends keyof FreelancerBankDetailPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setValues((v) => ({ ...v, [field]: e.target.value as never }));
    };

    const handleSave = async () => {
        setErrors({});
        const nextErrors: Record<string, string> = {};
        if (!values.tax_number) nextErrors.tax_number = 'PAN is required';
        if (!values.account_holder_name) nextErrors.account_holder_name = 'Account holder name is required';
        if (!values.bank_name) nextErrors.bank_name = 'Bank name is required';
        if (!values.ifsc_code) nextErrors.ifsc_code = 'IFSC code is required';
        // Account number is only re-required when there's nothing on file yet -
        // once saved, leaving it blank means "keep the existing number" (it's
        // write-only, so it always reloads blank on an existing record).
        if (!values.account_number && !accountNumberMasked) nextErrors.account_number = 'Account number is required';

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            toast.error('Please fill in all mandatory fields');
            return;
        }

        setIsSaving(true);
        try {
            const payload = { ...values };
            if (!payload.account_number) delete payload.account_number;
            await api.updateBankDetail(freelancerId, payload);
            toast.success('Bank details saved');
            load();
        } catch (err) {
            toast.error(parseApiErrors(err).general || 'Failed to save bank details');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleReveal = async () => {
        if (revealedAccountNumber) { setRevealedAccountNumber(null); return; }
        setIsRevealing(true);
        try {
            const unmasked = await api.getBankDetailUnmasked(freelancerId);
            setRevealedAccountNumber(unmasked.account_number || '(not set)');
        } catch (err) {
            toast.error(parseApiErrors(err).general || 'You are not authorized to view the full account number');
        } finally {
            setIsRevealing(false);
        }
    };

    if (loading) {
        return <div className="text-center p-8 text-gray-500">Loading bank details...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Payment &amp; Tax (KYC)</h3>
                <p className="text-xs text-gray-500 mb-3">
                    Banking information is sensitive - the account number is masked everywhere except to explicitly authorized users.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
                    <SelectField label="Payment Method" placeholder="Select method" options={paymentMethods} value={values.payment_method ?? ''} onChange={set('payment_method')} />
                    <InputField label="Payment Terms" placeholder="e.g. Net 15" value={values.payment_terms} onChange={set('payment_terms')} />
                    <InputField label="PAN *" placeholder="e.g. ABCDE1234F" value={values.tax_number} onChange={set('tax_number')} error={errors.tax_number} />
                </div>
            </div>

            <div>
                <h3 className="text-base font-semibold text-gray-900 mb-3">Bank Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <InputField label="Account Holder Name *" value={values.account_holder_name} onChange={set('account_holder_name')} error={errors.account_holder_name} />
                    <InputField label="Bank Name *" value={values.bank_name} onChange={set('bank_name')} error={errors.bank_name} />
                    <div>
                        <InputField
                            label={accountNumberMasked ? `Account Number * (on file: ${accountNumberMasked})` : 'Account Number *'}
                            placeholder="Leave blank to keep the number on file"
                            value={values.account_number}
                            onChange={set('account_number')}
                            error={errors.account_number}
                        />
                        {accountNumberMasked && (
                            <button
                                type="button"
                                onClick={handleToggleReveal}
                                disabled={isRevealing}
                                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 -mt-3 mb-3"
                            >
                                {revealedAccountNumber ? <EyeOff size={14} /> : <Eye size={14} />}
                                {revealedAccountNumber ? `Hide (${revealedAccountNumber})` : 'Reveal full number'}
                            </button>
                        )}
                    </div>
                    <InputField label="IFSC Code *" value={values.ifsc_code} onChange={set('ifsc_code')} error={errors.ifsc_code} />
                </div>
            </div>

            <div className="flex justify-end">
                <Button className="!w-auto px-8" onClick={handleSave} isLoading={isSaving}>Save Bank Details</Button>
            </div>
        </div>
    );
};
