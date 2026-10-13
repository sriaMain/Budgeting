import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { InputField } from '../../components/InputField';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { Freelancer, InviteFreelancerPayload } from '../../types/freelancerOnboarding.types';
import type { FormErrors } from '../../types';

interface InviteFreelancerModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called with the newly-created freelancer once the invite is sent, so
     * the caller can navigate straight to their profile - the same screen
     * View/Edit land on - instead of just refreshing the list. */
    onInvited: (freelancer: Freelancer) => void;
}

const EMPTY: InviteFreelancerPayload = { first_name: '', middle_name: '', last_name: '', email: '' };

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
            onInvited(result);
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
                <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">
                    Send the freelancer a secure link to complete their own profile. You only need to provide their
                    name and email - they fill in everything else.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3">
                    <InputField
                        label="First Name *"
                        placeholder="First name"
                        value={values.first_name}
                        onChange={set('first_name')}
                        error={errors.first_name}
                    />
                    <InputField
                        label="Middle Name"
                        placeholder="Middle name"
                        value={values.middle_name}
                        onChange={set('middle_name')}
                    />
                    <InputField
                        label="Last Name"
                        placeholder="Last name"
                        value={values.last_name}
                        onChange={set('last_name')}
                    />
                </div>
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
