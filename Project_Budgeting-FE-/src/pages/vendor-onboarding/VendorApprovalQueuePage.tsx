import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { ApprovalActionBar } from '../../components/ApprovalActionBar';
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/vendorOnboarding';
import type { VendorOnboardingDetail, VendorOnboardingChoices, RequestChangesPayload } from '../../types/vendorOnboarding.types';

const VendorApprovalQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager') || 'admin';
  const [vendors, setVendors] = useState<VendorOnboardingDetail[]>([]);
  const [choices, setChoices] = useState<VendorOnboardingChoices | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listApprovalQueue();
      setVendors(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load approval queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.getChoices().then(setChoices).catch(() => {});
  }, []);

  const handleApprove = async (vendorId: number, comments: string) => {
    await api.approveVendor(vendorId, comments);
    toast.success('Vendor approved');
    await load();
  };

  const handleRequestChanges = async (vendorId: number, payload: RequestChangesPayload) => {
    await api.requestVendorChanges(vendorId, payload);
    toast.success('Request sent to the vendor');
    await load();
  };

  return (
    <Layout userRole={userRole} currentPage="vendors" onNavigate={() => {}}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Queue</h1>
          <p className="text-sm text-gray-600 mt-1">Vendor onboarding requests currently awaiting your approval</p>
        </div>

        {loading ? (
          <div className="text-center p-12 text-gray-500">Loading...</div>
        ) : vendors.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center shadow-sm">
            <p className="text-gray-600">There are no vendor requests awaiting your approval right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 cursor-pointer" onClick={() => navigate(`/vendors/${vendor.id}`)}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-gray-900 hover:text-blue-600">{vendor.name}</h3>
                      <StatusBadge status={vendor.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {vendor.vendor_reference_no} &middot; {vendor.vendor_type_display}
                      {vendor.current_approval_stage && ` · Stage: ${vendor.current_approval_stage.level_name}`}
                    </p>
                  </div>
                  <ApprovalActionBar
                    canAct
                    onApprove={(comments) => handleApprove(vendor.id, comments)}
                    onRequestChanges={(payload) => handleRequestChanges(vendor.id, payload)}
                    sectionOptions={choices?.change_request_sections || []}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default VendorApprovalQueuePage;
