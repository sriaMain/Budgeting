import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { InputField } from '../../components/InputField';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { InviteFreelancerPayload } from '../../types/freelancerOnboarding.types';
import type { FormErrors } from '../../types';

interface InviteFreelancerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInvited: () => void;
}

const EMPTY: InviteFreelancerPayload = { full_name: '', email: '' };

export const InviteFreelancerModal: React.FC<InviteFreelancerModalProps> = ({ isOpen, onClose, onInvited }) => {
    const [values, setValues] = useState<InviteFreelancerPayload>(EMPTY);
    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const set = (field: keyof InviteFreelancerPayload) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setValues((v) => ({ ...v, [field]: e.target.value }));
    };

    const handleClose = () => {
        setValues(EMPTY);
        setErrors({});
        onClose();
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setErrors({});
        try {
            const result = await api.inviteFreelancer(values);
            toast.success(`Invitation sent successfully to ${result.email}`);
            handleClose();
            onInvited();
        } catch (err) {
            const parsed = parseApiErrors(err);
            setErrors(parsed);
            toast.error(parsed.general || 'Failed to send invitation');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Invite Freelancer"
            size="md"
            footer={
                <>
                    <Button variant="secondary" className="!w-auto px-6" onClick={handleClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button className="!w-auto px-6" onClick={handleSubmit} isLoading={isSubmitting}>
                        Send Invitation
                    </Button>
                </>
            }
        >
            <div className="space-y-1">
                <p className="text-sm text-gray-500 mb-4">
                    Send the freelancer a secure link to complete their own profile. You only need to provide their
                    name and email - they fill in everything else.
                </p>
                <InputField
                    label="Freelancer Name *"
                    placeholder="Enter freelancer name"
                    value={values.full_name}
                    onChange={set('full_name')}
                    error={errors.full_name}
                />
                <InputField
                    label="Email Address *"
                    type="email"
                    placeholder="Enter email address"
                    value={values.email}
                    onChange={set('email')}
                    error={errors.email}
                />
            </div>
        </Modal>
    );
};
