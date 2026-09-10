import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../components/Button';
import { InputField } from '../../components/InputField';
import { SelectField } from '../../components/SelectField';
import { Checkbox } from '../../components/Checkbox';
import { Modal } from '../../components/Modal';
import { ReusableTable, type Column } from '../../components/ReusableTable';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { FreelancerContract, FreelancerContractPayload, ContractType } from '../../types/freelancerOnboarding.types';

interface Props {
    freelancerId: number;
    contractTypes: { value: string; label: string }[];
    contractStatuses: { value: string; label: string }[];
}

const EMPTY: FreelancerContractPayload = {
    contract_type: 'freelancer' as ContractType,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    status: 'draft',
    payment_terms: '',
    notice_period_days: '',
    nda_signed: false,
    agreement_signed: false,
    notes: '',
};

export const FreelancerContractsTab: React.FC<Props> = ({ freelancerId, contractTypes, contractStatuses }) => {
    const [contracts, setContracts] = useState<FreelancerContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<FreelancerContract | null>(null);
    const [values, setValues] = useState<FreelancerContractPayload>(EMPTY);
    const [file, setFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            setContracts(await api.listContracts(freelancerId));
        } catch {
            toast.error('Failed to load contracts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [freelancerId]);

    const openAdd = () => { setEditing(null); setValues(EMPTY); setFile(null); setIsModalOpen(true); };
    const openEdit = (contract: FreelancerContract) => {
        setEditing(contract);
        setValues({
            contract_type: contract.contract_type, start_date: contract.start_date, end_date: contract.end_date || '',
            status: contract.status, payment_terms: contract.payment_terms,
            notice_period_days: contract.notice_period_days ?? '', nda_signed: contract.nda_signed,
            agreement_signed: contract.agreement_signed, notes: contract.notes,
        });
        setFile(null);
        setIsModalOpen(true);
    };

    const set = <K extends keyof FreelancerContractPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setValues((v) => ({ ...v, [field]: value as never }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // DRF rejects "" for optional date/number fields (it's not
            // treated as "omitted" the way it is for CharFields).
            const cleaned: FreelancerContractPayload = { ...values };
            (['end_date', 'notice_period_days'] as const).forEach((key) => {
                if (cleaned[key] === '') delete cleaned[key];
            });
            const payload = { ...cleaned, ...(file ? { document: file } : {}) };

            if (editing) {
                await api.updateContract(freelancerId, editing.id, cleaned);
                toast.success('Contract updated');
            } else {
                await api.createContract(freelancerId, payload);
                toast.success('Contract added');
            }
            setIsModalOpen(false);
            load();
        } catch (err) {
            const errors = parseApiErrors(err);
            toast.error(errors.general || 'Failed to save contract');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (contract: FreelancerContract) => {
        if (!window.confirm('Delete this contract?')) return;
        try {
            await api.deleteContract(freelancerId, contract.id);
            toast.success('Contract deleted');
            load();
        } catch {
            toast.error('Failed to delete contract');
        }
    };

    const columns: Column<FreelancerContract>[] = [
        { header: 'Type', accessor: (c) => contractTypes.find((t) => t.value === c.contract_type)?.label || c.contract_type },
        { header: 'Start Date', accessor: 'start_date' },
        { header: 'End Date', accessor: (c) => c.end_date || 'Ongoing' },
        { header: 'Status', accessor: (c) => contractStatuses.find((s) => s.value === c.status)?.label || c.status },
        { header: 'NDA', accessor: (c) => (c.nda_signed ? 'Signed' : 'Not signed') },
        { header: 'Agreement', accessor: (c) => (c.agreement_signed ? 'Signed' : 'Not signed') },
    ];

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button className="!w-auto px-6" onClick={openAdd}>Add Contract</Button>
            </div>
            <ReusableTable
                data={contracts}
                columns={columns}
                keyField="id"
                isLoading={loading}
                onEdit={openEdit}
                onDelete={handleDelete}
                emptyMessage="No contracts yet."
            />

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editing ? 'Edit Contract' : 'Add Contract'}
                size="lg"
                footer={(
                    <>
                        <Button variant="secondary" className="!w-auto px-6" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button className="!w-auto px-6" onClick={handleSave} isLoading={isSaving}>Save</Button>
                    </>
                )}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <SelectField label="Contract Type" options={contractTypes} value={values.contract_type} onChange={set('contract_type')} />
                    <SelectField label="Status" options={contractStatuses} value={values.status} onChange={set('status')} />
                    <InputField label="Start Date" type="date" value={values.start_date} onChange={set('start_date')} />
                    <InputField label="End Date" type="date" value={values.end_date ?? ''} onChange={set('end_date')} />
                    <InputField label="Payment Terms" placeholder="e.g. Net 30" value={values.payment_terms} onChange={set('payment_terms')} />
                    <InputField label="Notice Period (days)" type="number" min={0} value={values.notice_period_days ?? ''} onChange={set('notice_period_days')} />
                </div>
                <div className="flex items-center gap-6 mb-5">
                    <Checkbox label="NDA Signed" checked={!!values.nda_signed} onChange={set('nda_signed')} />
                    <Checkbox label="Agreement Signed" checked={!!values.agreement_signed} onChange={set('agreement_signed')} />
                </div>
                <div className="mb-5">
                    <label className="block text-base font-medium text-gray-900 mb-2">Contract Document</label>
                    <input
                        type="file"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-input-bg file:text-gray-900 file:font-medium"
                    />
                </div>
                <div>
                    <label className="block text-base font-medium text-gray-900 mb-2">Notes</label>
                    <textarea
                        value={values.notes}
                        onChange={set('notes')}
                        rows={3}
                        className="w-full px-4 py-3 bg-input-bg rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white transition-all"
                    />
                </div>
            </Modal>
        </div>
    );
};
