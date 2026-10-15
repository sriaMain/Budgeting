import { formatDateTime as toDMYTime } from '../../../utils/date';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Lock } from 'lucide-react';
import { WizardFooter, WizardProgress } from '../../../components/onboarding/OnboardingWizard';
import * as api from '../../../services/freelancerOnboardingPublic';
import { parseApiErrors } from '../../../utils/parseApiErrors';
import type {
  FreelancerBankDetail, FreelancerDocument, FreelancerPortalClosed, FreelancerPublic, FreelancerPublicChoices,
} from '../../../types/freelancerOnboarding.types';
import { useFreelancerWizard, type FreelancerWizardAdapter } from '../wizard/useFreelancerWizard';
import { FreelancerWizardBody, WizardStatusLine } from '../wizard/FreelancerWizardSteps';
import { STEP_TITLES, type FreelancerRecord, type WizardStepKey } from '../wizard/freelancerWizardModel';

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'closed'; status: FreelancerPortalClosed['portal_status'] }
  | { kind: 'ready'; record: FreelancerPublic; bank: FreelancerBankDetail | null; documents: FreelancerDocument[]; choices: FreelancerPublicChoices | null };

const isClosed = (data: FreelancerPublic | FreelancerPortalClosed): data is FreelancerPortalClosed => 'link_active' in data;

const CARD = 'bg-white rounded-xl border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800';

const Centered: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="max-w-xl mx-auto py-16 px-4">
    <div className={`${CARD} p-8 text-center`}>
      <div className="flex justify-center mb-3">{icon}</div>
      <h1 className="text-lg font-bold text-gray-900 mb-1 dark:text-white">{title}</h1>
      <div className="text-sm text-gray-600 dark:text-gray-300">{children}</div>
    </div>
  </div>
);

/** Secure-link freelancer onboarding: the 7-step wizard, editable until submission. */
const FreelancerOnboardingPortalPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        const data = await api.getFreelancerByToken(token);
        if (isClosed(data)) {
          if (alive) setState({ kind: 'closed', status: data.portal_status });
          return;
        }
        const [bank, documents, choices] = await Promise.all([
          api.getBankDetailByToken(token).catch(() => null),
          api.listDocumentsByToken(token).catch(() => [] as FreelancerDocument[]),
          api.getPublicChoices().catch(() => null),
        ]);
        if (alive) setState({ kind: 'ready', record: data, bank, documents, choices });
      } catch (err) {
        if (alive) setState({ kind: 'error', message: parseApiErrors(err).general || 'Invalid or unavailable freelancer onboarding link.' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (!token || state.kind === 'error') {
    return (
      <Centered icon={<Lock className="w-10 h-10 text-gray-400" />} title="Link not available">
        {state.kind === 'error' ? state.message : 'Invalid onboarding link.'}
      </Centered>
    );
  }
  if (state.kind === 'loading') {
    return <p className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading your onboarding…</p>;
  }
  if (state.kind === 'closed') {
    return state.status === 'approved' ? (
      <Centered icon={<CheckCircle2 className="w-10 h-10 text-green-500" />} title="You're all set!">
        Your freelancer onboarding has been approved. We'll be in touch about next steps.
      </Centered>
    ) : (
      <Centered icon={<Lock className="w-10 h-10 text-gray-400" />} title="Onboarding closed">
        This onboarding is no longer open. Please contact the person or team who invited you.
      </Centered>
    );
  }
  return <PortalWizard token={token} initial={state} />;
};

const PortalWizard: React.FC<{ token: string; initial: Extract<PageState, { kind: 'ready' }> }> = ({ token, initial }) => {
  const [current, setCurrent] = useState<FreelancerPublic>(initial.record);

  const reload = async () => {
    const [data, documents] = await Promise.all([api.getFreelancerByToken(token), api.listDocumentsByToken(token)]);
    if (isClosed(data)) throw new Error('This onboarding link is no longer active.');
    return { record: data as FreelancerRecord, documents };
  };

  const adapter: FreelancerWizardAdapter = {
    saveProfile: (payload) => api.updateByToken(token, payload),
    saveBank: (payload) => api.updateBankDetailByToken(token, payload),
    submit: () => api.submitByToken(token),
    reload,
    uploadDocument: (_record, category, file, opts) =>
      api.uploadDocumentByToken(token, category, file, { replaces: opts.replaces, expiryDate: opts.expiryDate, onProgress: opts.onProgress }),
    deleteDocument: (_record, docId) => api.deleteDocumentByToken(token, docId),
    downloadDocument: async (_record, docId) => {
      const { download_url } = await api.downloadDocumentByToken(token, docId);
      window.open(download_url, '_blank', 'noopener');
    },
    uploadPhoto: (_record, file) => api.uploadProfilePhotoByToken(token, file),
    removePhoto: () => api.removeProfilePhotoByToken(token),
  };

  const w = useFreelancerWizard({
    mode: 'portal',
    adapter,
    initialRecord: initial.record,
    initialBank: initial.bank,
    initialDocuments: initial.documents,
    readOnly: !current.can_edit,
    bankEditable: current.can_edit,
    canSubmit: current.can_edit,
    submitLabel: 'Submit onboarding',
    onRecordChange: (record) => setCurrent(record as FreelancerPublic),
    onSubmitted: () => {
      toast.success('Thank you! Your onboarding has been submitted for review.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onNavigate: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  });

  const sections = (current.changes_requested_sections || []) as WizardStepKey[];

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-8 px-4 space-y-5">
      <div className={`${CARD} p-5 sm:p-6`}>
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1 dark:text-blue-400">Freelancer Onboarding</p>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white break-words">{current.full_name || 'Complete your profile'}</h1>
        {current.freelancer_code && <p className="text-xs font-mono text-gray-500 mt-1 dark:text-gray-400">Reference {current.freelancer_code}</p>}
      </div>

      {current.portal_status === 'submitted' && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 sm:p-5 dark:border-green-500/30 dark:bg-green-500/10">
          <p className="flex items-center gap-2 font-semibold text-green-800 dark:text-green-300"><CheckCircle2 className="w-5 h-5" /> Thank you - your onboarding has been submitted</p>
          <p className="mt-1 text-sm text-green-800/90 dark:text-green-300/90 flex items-center gap-1.5">
            <Clock className="w-4 h-4" /> It is being reviewed{current.submitted_at ? ` (submitted ${toDMYTime(current.submitted_at)})` : ''}. You can look through what you sent below; contact us if something needs correcting.
          </p>
        </div>
      )}

      {current.portal_status === 'changes_requested' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300"><AlertTriangle className="w-5 h-5" /> Changes requested</p>
          {current.review_remarks && <p className="mt-1 text-sm text-amber-900 whitespace-pre-line dark:text-amber-200">{current.review_remarks}</p>}
          {sections.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {sections.map((key) => (
                <button key={key} type="button" onClick={() => w.goTo(key)} className="px-2.5 py-1 text-xs font-semibold rounded-full border border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/20">
                  {STEP_TITLES[key] || key}
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-300/80">Update the details, then submit again from Review &amp; Submit.</p>
        </div>
      )}

      <div className={`${CARD} p-4 sm:p-5`}>
        <WizardProgress steps={w.steps} currentKey={w.step} onStepChange={(key) => w.goTo(key as WizardStepKey)} statusText={<WizardStatusLine w={w} />} />
      </div>

      <div className={`${CARD} p-4 sm:p-6`}>
        <FreelancerWizardBody w={w} choices={initial.choices} />
      </div>

      <div className={`${CARD} sticky bottom-2 z-20 p-3 sm:p-4`}>
        <WizardFooter {...w.footer} />
      </div>
    </div>
  );
};

export default FreelancerOnboardingPortalPage;
