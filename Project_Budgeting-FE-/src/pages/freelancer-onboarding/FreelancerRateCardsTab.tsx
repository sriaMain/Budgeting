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
import type { FreelancerRateCard, FreelancerRateCardPayload, PricingModel } from '../../types/freelancerOnboarding.types';

interface Props {
    freelancerId: number;
    pricingModels: { value: string; label: string }[];
    currencies: { value: string; label: string }[];
}

const EMPTY: FreelancerRateCardPayload = {
    pricing_model: 'hourly' as PricingModel,
    cost_rate: '',
    billing_rate: '',
    currency: 'INR',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    minimum_billable_hours: '',
    overtime_rate: '',
    weekend_rate: '',
    is_active: true,
};

export const FreelancerRateCardsTab: React.FC<Props> = ({ freelancerId, pricingModels, currencies }) => {
    const [cards, setCards] = useState<FreelancerRateCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<FreelancerRateCard | null>(null);
    const [values, setValues] = useState<FreelancerRateCardPayload>(EMPTY);
    const [isSaving, setIsSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            setCards(await api.listRateCards(freelancerId));
        } catch {
            toast.error('Failed to load rate cards');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [freelancerId]);

    const openAdd = () => { setEditing(null); setValues(EMPTY); setIsModalOpen(true); };
    const openEdit = (card: FreelancerRateCard) => {
        setEditing(card);
        setValues({
            pricing_model: card.pricing_model, cost_rate: card.cost_rate, billing_rate: card.billing_rate,
            currency: card.currency, effective_from: card.effective_from, effective_to: card.effective_to || '',
            minimum_billable_hours: card.minimum_billable_hours ?? '', overtime_rate: card.overtime_rate ?? '',
            weekend_rate: card.weekend_rate ?? '', is_active: card.is_active,
        });
        setIsModalOpen(true);
    };

    const set = <K extends keyof FreelancerRateCardPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setValues((v) => ({ ...v, [field]: value as never }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // DRF rejects "" for optional date/number fields (it's not
            // treated as "omitted" the way it is for CharFields).
            const payload: FreelancerRateCardPayload = { ...values };
            (['effective_to', 'minimum_billable_hours', 'overtime_rate', 'weekend_rate'] as const).forEach((key) => {
                if (payload[key] === '') delete payload[key];
            });

            if (editing) {
                await api.updateRateCard(freelancerId, editing.id, payload);
                toast.success('Rate card updated');
            } else {
                await api.createRateCard(freelancerId, payload);
                toast.success('Rate card added');
            }
            setIsModalOpen(false);
            load();
        } catch (err) {
            const errors = parseApiErrors(err);
            toast.error(errors.general || 'Failed to save rate card');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (card: FreelancerRateCard) => {
        if (!window.confirm(`Delete this ${card.pricing_model} rate card?`)) return;
        try {
            await api.deleteRateCard(freelancerId, card.id);
            toast.success('Rate card deleted');
            load();
        } catch {
            toast.error('Failed to delete rate card');
        }
    };

    const columns: Column<FreelancerRateCard>[] = [
        { header: 'Pricing Model', accessor: (c) => pricingModels.find((p) => p.value === c.pricing_model)?.label || c.pricing_model },
        { header: 'Cost Rate', accessor: (c) => `${c.currency} ${c.cost_rate}` },
        { header: 'Billing Rate', accessor: (c) => `${c.currency} ${c.billing_rate}` },
        { header: 'Margin', accessor: (c) => `${c.currency} ${c.margin}` },
        { header: 'Effective', accessor: (c) => `${c.effective_from} - ${c.effective_to || 'ongoing'}` },
        {
            header: 'Status',
            accessor: (c) => (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.is_current ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.is_active ? (c.is_current ? 'Active' : 'Scheduled/Expired') : 'Inactive'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button className="!w-auto px-6" onClick={openAdd}>Add Rate Card</Button>
            </div>
            <ReusableTable
                data={cards}
                columns={columns}
                keyField="id"
                isLoading={loading}
                onEdit={openEdit}
                onDelete={handleDelete}
                emptyMessage="No rate cards yet."
            />

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editing ? 'Edit Rate Card' : 'Add Rate Card'}
                size="lg"
                footer={(
                    <>
                        <Button variant="secondary" className="!w-auto px-6" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button className="!w-auto px-6" onClick={handleSave} isLoading={isSaving}>Save</Button>
                    </>
                )}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <SelectField label="Pricing Model" options={pricingModels} value={values.pricing_model} onChange={set('pricing_model')} />
                    <SelectField label="Currency" options={currencies} value={values.currency} onChange={set('currency')} />
                    <InputField label="Cost Rate" type="number" min={0} value={values.cost_rate} onChange={set('cost_rate')} />
                    <InputField label="Billing Rate" type="number" min={0} value={values.billing_rate} onChange={set('billing_rate')} />
                    <InputField label="Effective From" type="date" value={values.effective_from} onChange={set('effective_from')} />
                    <InputField label="Effective To" type="date" value={values.effective_to ?? ''} onChange={set('effective_to')} />
                    <InputField label="Minimum Billable Hours" type="number" min={0} value={values.minimum_billable_hours ?? ''} onChange={set('minimum_billable_hours')} />
                    <InputField label="Overtime Rate" type="number" min={0} value={values.overtime_rate ?? ''} onChange={set('overtime_rate')} />
                    <InputField label="Weekend Rate" type="number" min={0} value={values.weekend_rate ?? ''} onChange={set('weekend_rate')} />
                </div>
                <Checkbox label="Active" checked={!!values.is_active} onChange={set('is_active')} />
            </Modal>
        </div>
    );
};
