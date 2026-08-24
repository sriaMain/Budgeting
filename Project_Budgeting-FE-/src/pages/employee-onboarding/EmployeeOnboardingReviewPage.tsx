import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { EmployeeApprovalTimeline } from '../../components/EmployeeApprovalTimeline';
import { EmployeeApprovalActionBar } from '../../components/EmployeeApprovalActionBar';
import { Tabs } from '../../components/Tabs';
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/employeeOnboarding';
import type {
  EmployeeOnboardingDetail, EmployeeOnboardingHistoryEvent, EmployeeOnboardingChoices,
  EmployeeRequestChangesPayload,
} from '../../types/employeeOnboarding.types';

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-sm text-gray-900 font-medium">{value || '-'}</p>
  </div>
);

const SECTION_TABS = [
  { key: 'personal_details', label: 'Personal Details' },
  { key: 'address', label: 'Address' },
  { key: 'employment_details', label: 'Employment Details' },
  { key: 'statutory_details', label: 'Statutory Details' },
  { key: 'bank_details', label: 'Bank Details' },
  { key: 'emergency_contact', label: 'Emergency Contact' },
  { key: 'documents', label: 'Documents' },
  { key: 'history', label: 'History' },
];

interface EmployeeOnboardingReviewContentProps {
  accountId: number;
  onBack: () => void;
  backLabel?: string;
}

export function EmployeeOnboardingReviewContent({ accountId, onBack, backLabel = 'Manage Users' }: EmployeeOnboardingReviewContentProps) {
  const [record, setRecord] = useState<EmployeeOnboardingDetail | null>(null);
  const [history, setHistory] = useState<EmployeeOnboardingHistoryEvent[]>([]);
  const [choices, setChoices] = useState<EmployeeOnboardingChoices | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('personal_details');

  const load = async () => {
    setLoading(true);
    try {
      const [r, h] = await Promise.all([
        api.getEmployeeOnboarding(accountId),
        api.getApprovalHistory(accountId),
      ]);
      setRecord(r);
      setHistory(h);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load employee onboarding request');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.getChoices().then(setChoices).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const handleApprove = async (comments: string) => {
    await api.approveEmployee(accountId, comments);
    toast.success('Employee onboarding approved');
    await load();
  };

  const handleRequestChanges = async (payload: EmployeeRequestChangesPayload) => {
    await api.requestEmployeeChanges(accountId, payload);
    toast.success('Request sent to the employee');
    await load();
  };

  if (loading || !record) {
    return <div className="text-center p-12 text-gray-500">Loading...</div>;
  }

  const openChangeRequest = record.change_requests.find((c) => c.status === 'open');
  const isUnderReview = record.status === 'submitted' || record.status === 'resubmitted';
  const p = record.personal_detail;
  const a = record.address_detail;
  const s = record.statutory_detail;
  const b = record.bank_detail;
  const ec = record.emergency_contact;

  return (
    <div className="space-y-6 animate-fade-in-down">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-blue-600 hover:text-blue-800 font-semibold transition-colors">
          {backLabel}
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-medium">{record.account.display_name}</span>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold text-gray-900">{record.account.display_name}</h2>
          <StatusBadge status={record.status} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-500">
            {record.employee_code} &middot; {record.designation || record.department}
            {isUnderReview && ` · ${record.current_stage}`}
          </p>
          {isUnderReview && (
            <EmployeeApprovalActionBar
              canAct
              onApprove={handleApprove}
              onRequestChanges={handleRequestChanges}
              sectionOptions={choices?.change_request_sections || []}
            />
          )}
        </div>
      </div>

      {record.status === 'action_required' && openChangeRequest && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-orange-800">
            Action Required — {openChangeRequest.section_display}{openChangeRequest.field_name ? ` (${openChangeRequest.field_name})` : ''}
          </p>
          <p className="text-sm text-orange-700 mt-1">
            Requested by {openChangeRequest.requested_by_name || 'HR'}: {openChangeRequest.reason}
          </p>
          {openChangeRequest.comments && <p className="text-sm text-orange-600 mt-1">{openChangeRequest.comments}</p>}
        </div>
      )}

      {record.status === 'approved' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-green-800">
            This employee's onboarding has been fully approved.
          </p>
        </div>
      )}

      <Tabs tabs={SECTION_TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'personal_details' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="First Name" value={record.account.first_name} />
          <Field label="Last Name" value={record.account.last_name} />
          <Field label="Middle Name" value={p?.middle_name} />
          <Field label="Personal Email" value={p?.personal_email} />
          <Field label="Alternate Email" value={p?.alternate_email} />
          <Field label="Mobile Number" value={p?.mobile_number} />
          <Field label="Alternate Mobile" value={p?.alternate_mobile} />
          <Field label="Date of Birth" value={p?.date_of_birth} />
          <Field label="Gender" value={p?.gender} />
          <Field label="Marital Status" value={p?.marital_status} />
          <Field label="Blood Group" value={p?.blood_group} />
          <Field label="Nationality" value={p?.nationality} />
        </div>
      )}

      {activeTab === 'address' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="Current Address" value={a?.current_address} />
          <Field label="City" value={a?.city} />
          <Field label="State" value={a?.state} />
          <Field label="Country" value={a?.country} />
          <Field label="PIN Code" value={a?.pin_code} />
        </div>
      )}

      {activeTab === 'employment_details' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="Employee ID" value={record.employee_code} />
          <Field label="Department" value={record.department} />
          <Field label="Designation" value={record.designation} />
          <Field label="Reporting Manager" value={record.reporting_manager?.display_name} />
          <Field label="Joining Date" value={record.joining_date} />
          <Field label="Employment Type" value={record.employment_type_display} />
          <Field label="Work Location" value={record.work_location} />
          <Field label="PF Applicable" value={record.pf_applicable ? 'Yes' : 'No'} />
        </div>
      )}

      {activeTab === 'statutory_details' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="PAN" value={s?.pan} />
          <Field label="Aadhaar Number" value={s?.aadhaar_number} />
          <Field label="UAN Number" value={s?.uan_number} />
          <Field label="TAN" value={s?.tan} />
          <Field label="ESIC Number" value={s?.esic_number} />
        </div>
      )}

      {activeTab === 'bank_details' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="Bank Name" value={b?.bank_name} />
          <Field label="Account Holder" value={b?.account_holder_name} />
          <Field label="Account Number" value={b?.account_number_masked} />
          <Field label="IFSC Code" value={b?.ifsc_code} />
        </div>
      )}

      {activeTab === 'emergency_contact' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="Name" value={ec?.contact_name} />
          <Field label="Number" value={ec?.contact_number} />
          <Field label="Relationship" value={ec?.relationship} />
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {record.documents.length === 0 ? (
            <p className="text-sm text-gray-500">No documents uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {record.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{d.file_name}</p>
                      <p className="text-xs text-gray-500">{d.category.replace(/_/g, ' ')} &middot; Uploaded by {d.uploaded_by_role}</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const { download_url } = await api.downloadDocument(accountId, d.id);
                      window.open(download_url, '_blank');
                    }}
                    className="text-gray-400 hover:text-blue-600 flex-shrink-0"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 text-sm mb-4">Timeline</h3>
          <EmployeeApprovalTimeline events={history} />
        </div>
      )}
    </div>
  );
}

const EmployeeOnboardingReviewPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager') || 'admin';

  if (!accountId) return null;

  return (
    <Layout userRole={userRole} currentPage="administration" onNavigate={() => {}}>
      <EmployeeOnboardingReviewContent
        accountId={Number(accountId)}
        onBack={() => navigate('/administration')}
      />
    </Layout>
  );
};

export default EmployeeOnboardingReviewPage;
