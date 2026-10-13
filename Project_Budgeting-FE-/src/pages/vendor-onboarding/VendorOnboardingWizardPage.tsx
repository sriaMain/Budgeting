import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useVendorWizard } from './components/useVendorWizard';
import { VendorWizardBody, VendorWizardFooter } from './components/VendorWizardView';
import { VendorStatusHeader } from './components/VendorStatusHeader';
import { VENDOR_WIZARD_STEPS, wizardStepForServerStep, type VendorWizardStepKey } from './components/vendorSteps';

/** Full-page variant of the onboarding wizard (/vendors/add, /vendors/:id/edit) - same steps,
 * state and rules as the drawer. Optional ?step=<step> opens a given step. */
const VendorOnboardingWizardPage: React.FC = () => {
  const { vendorId: vendorIdParam } = useParams<{ vendorId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager') || 'admin';

  const requested = searchParams.get('step') || '';
  const initialStep: VendorWizardStepKey | undefined = VENDOR_WIZARD_STEPS.some((s) => s.key === requested)
    ? (requested as VendorWizardStepKey)
    : requested ? wizardStepForServerStep(requested) : undefined;

  return (
    <Layout userRole={userRole} currentPage="vendors" onNavigate={() => {}}>
      <WizardPageContent
        key={vendorIdParam ?? 'new'}
        vendorId={vendorIdParam ? Number(vendorIdParam) : null}
        initialStep={initialStep}
        onCreated={(id) => navigate(`/vendors/${id}/edit`, { replace: true })}
        onBack={() => navigate(vendorIdParam ? `/vendors/${vendorIdParam}` : '/vendors')}
      />
    </Layout>
  );
};

const WizardPageContent: React.FC<{
  vendorId: number | null;
  initialStep?: VendorWizardStepKey;
  onCreated: (id: number) => void;
  onBack: () => void;
}> = ({ vendorId, initialStep, onCreated, onBack }) => {
  const wiz = useVendorWizard({ mode: 'admin', vendorId, initialStep, onCreated });
  const vendor = wiz.adminRecord;
  return (
    <div className="space-y-5 animate-fade-in-down">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={onBack} className="font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400">Vendors</button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 dark:text-gray-300">{vendor ? vendor.name || 'Vendor' : 'Add vendor'}</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{vendor ? `Edit ${vendor.name || 'vendor'}` : 'Add vendor'}</h1>
      {vendor && <VendorStatusHeader vendor={vendor} />}
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:bg-gray-900 dark:border-gray-800">
        <VendorWizardBody wiz={wiz} />
      </div>
      <div className="sticky bottom-0 z-10 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:bg-gray-900 dark:border-gray-800">
        <VendorWizardFooter wiz={wiz} onCancel={onBack} />
      </div>
    </div>
  );
};

export default VendorOnboardingWizardPage;
