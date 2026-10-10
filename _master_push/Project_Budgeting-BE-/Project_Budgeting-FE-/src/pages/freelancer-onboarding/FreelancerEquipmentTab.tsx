import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../components/Button';
import { InputField } from '../../components/InputField';
import { SelectField } from '../../components/SelectField';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { FreelancerEquipmentPayload } from '../../types/freelancerOnboarding.types';

interface Props {
    freelancerId: number;
    ownerships: { value: string; label: string }[];
    conditions: { value: string; label: string }[];
}

const EMPTY: FreelancerEquipmentPayload = {
    ownership: '',
    brand: '',
    model: '',
    serial_number: '',
    processor: '',
    ram: '',
    storage: '',
    operating_system: '',
    asset_id: '',
    issue_date: '',
    return_date: '',
    condition: '',
    remarks: '',
};

export const FreelancerEquipmentTab: React.FC<Props> = ({ freelancerId, ownerships, conditions }) => {
    const [values, setValues] = useState<FreelancerEquipmentPayload>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const equipment = await api.getEquipment(freelancerId);
            if (equipment) {
                setValues({
                    ownership: equipment.ownership, brand: equipment.brand, model: equipment.model,
                    serial_number: equipment.serial_number, processor: equipment.processor,
                    ram: equipment.ram, storage: equipment.storage, operating_system: equipment.operating_system,
                    asset_id: equipment.asset_id, issue_date: equipment.issue_date || '',
                    return_date: equipment.return_date || '', condition: equipment.condition,
                    remarks: equipment.remarks,
                });
            } else {
                setValues(EMPTY);
            }
        } catch {
            toast.error('Failed to load equipment details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [freelancerId]);

    const set = <K extends keyof FreelancerEquipmentPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setValues((v) => ({ ...v, [field]: e.target.value as never }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await api.updateEquipment(freelancerId, values);
            toast.success('Equipment details saved');
            load();
        } catch (err) {
            toast.error(parseApiErrors(err).general || 'Failed to save equipment details');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="text-center p-8 text-gray-500 dark:text-gray-400">Loading equipment details...</div>;
    }

    // Only company/client-provided equipment needs the asset/issue/return
    // fields - a freelancer bringing their own gear just needs "Freelancer
    // Owned" recorded, per Section 5's "don't force it" requirement.
    const showProvidedFields = values.ownership === 'company_provided' || values.ownership === 'client_provided';

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-semibold text-gray-900 mb-3 dark:text-white">Laptop / Equipment</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <SelectField label="Ownership / Provider" placeholder="Select ownership" options={ownerships} value={values.ownership ?? ''} onChange={set('ownership')} />
                    {values.ownership && (
                        <SelectField label="Condition" placeholder="Select condition" options={conditions} value={values.condition ?? ''} onChange={set('condition')} />
                    )}
                </div>
            </div>

            {values.ownership && (
                <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-3 dark:text-white">Device Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <InputField label="Brand" value={values.brand} onChange={set('brand')} />
                        <InputField label="Model" value={values.model} onChange={set('model')} />
                        <InputField label="Serial Number" value={values.serial_number} onChange={set('serial_number')} />
                        <InputField label="Processor" value={values.processor} onChange={set('processor')} />
                        <InputField label="RAM" value={values.ram} onChange={set('ram')} />
                        <InputField label="Storage" value={values.storage} onChange={set('storage')} />
                        <InputField label="Operating System" value={values.operating_system} onChange={set('operating_system')} />
                        {showProvidedFields && (
                            <>
                                <InputField label="Asset ID" value={values.asset_id} onChange={set('asset_id')} />
                                <InputField label="Issue Date" type="date" value={values.issue_date || ''} onChange={set('issue_date')} />
                                <InputField label="Return Date" type="date" value={values.return_date || ''} onChange={set('return_date')} />
                            </>
                        )}
                    </div>
                    <InputField label="Remarks" value={values.remarks} onChange={set('remarks')} />
                </div>
            )}

            <div className="flex justify-end">
                <Button className="!w-auto px-8" onClick={handleSave} isLoading={isSaving}>Save Equipment Details</Button>
            </div>
        </div>
    );
};
