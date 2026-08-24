import React from 'react';
import { Lock } from 'lucide-react';
import type { EmployeePublicDetail } from '../../../types/employeeOnboardingPublic.types';

interface Props {
  detail: EmployeePublicDetail;
}

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-sm text-gray-900 font-medium">{value || '-'}</p>
  </div>
);

export const Step3EmploymentDetails: React.FC<Props> = ({ detail }) => (
  <div className="space-y-4">
    <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
      <Lock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-gray-500">
        These details were entered by HR when your onboarding was set up and cannot be changed here. If any of
        this looks incorrect, please contact HR directly.
      </p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Field label="Employee ID" value={detail.employee_code} />
      <Field label="Department" value={detail.department} />
      <Field label="Designation / Position" value={detail.designation} />
      <Field label="Reporting Manager" value={detail.reporting_manager_name} />
      <Field label="Joining Date" value={detail.joining_date} />
      <Field label="Employment Type" value={detail.employment_type_display} />
      <Field label="Work Location" value={detail.work_location} />
    </div>
  </div>
);
