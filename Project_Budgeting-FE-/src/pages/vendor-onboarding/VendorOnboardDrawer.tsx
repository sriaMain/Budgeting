import React, { useState } from 'react';
import { Drawer } from '../../components/Drawer';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { VendorOnboardingDetail, VendorOnboardingStepKey } from '../../types/vendorOnboarding.types';
import { useVendorWizard } from './components/useVendorWizard';
import { VendorWizardBody, VendorWizardFooter } from './components/VendorWizardView';
import { VendorStatusHeader } from './components/VendorStatusHeader';
import { wizardStepForServerStep } from './components/vendorSteps';

interface VendorOnboardDrawerProps {
  isOpen: boolean;
  /** Existing vendor to open; null/undefined = onboard a new vendor. */
  vendorId?: number | null;
  /** Step to open at (e.g. from a step card on the list page). */
  initialSection?: VendorOnboardingStepKey;
  onClose: () => void;
  /** Called with the fresh vendor after every save / review / submit / approval. */
  onSaved: (vendor: VendorOnboardingDetail) => void;
}

/** "Create / edit vendor" drawer - the onboarding wizard with its footer in the drawer's footer.
 * The content only mounts while open, so every open starts from fresh server data. */
export const VendorOnboardDrawer: React.FC<VendorOnboardDrawerProps> = (props) =>
  props.isOpen ? <VendorOnboardDrawerContent {...props} /> : null;

const VendorOnboardDrawerContent: React.FC<VendorOnboardDrawerProps> = ({ vendorId, initialSection, onClose, onSaved }) => {
  const [confirmClose, setConfirmClose] = useState(false);
  const wiz = useVendorWizard({
    mode: 'admin',
    vendorId: vendorId ?? null,
    initialStep: initialSection ? wizardStepForServerStep(initialSection) : undefined,
    onSaved,
  });
  const requestClose = () => {
    if (wiz.busy) return;
    if (wiz.editable && wiz.isDirty) setConfirmClose(true);
    else onClose();
  };
  const vendor = wiz.adminRecord;

  return (
    <>
      <Drawer
        isOpen
        onClose={requestClose}
        title={vendor ? vendor.name || 'Vendor' : 'Create Vendor'}
        subtitle={vendor ? [vendor.vendor_reference_no, vendor.vendor_type_display].filter(Boolean).join(' · ') : 'Identity, KYC, banking and commercial setup'}
        size="xl"
        footer={<VendorWizardFooter wiz={wiz} onCancel={requestClose} />}
      >
        <div className="space-y-5">
          {vendor && <VendorStatusHeader vendor={vendor} />}
          {vendor?.status === 'action_required' && vendor.change_requests.find((c) => c.status === 'open') && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <span className="font-semibold">Changes requested: </span>
              {vendor.change_requests.find((c) => c.status === 'open')!.required_changes}
            </div>
          )}
          <VendorWizardBody wiz={wiz} />
        </div>
      </Drawer>
      <ConfirmDialog
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
        title="Discard unsaved changes?"
        message="You have changes that aren't saved. Close without saving them?"
        confirmLabel="Discard changes"
      />
    </>
  );
};
