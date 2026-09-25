import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Plus, Users, Mail, Archive, ArchiveRestore } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/freelancerOnboarding';
import type { Freelancer, FreelancerChoices } from '../../types/freelancerOnboarding.types';
import { InviteFreelancerModal } from './InviteFreelancerModal';

/**
 * The actual list/search UI, with no Layout wrapper of its own - shared
 * between the standalone /freelancers route (wrapped in Layout below) and
 * the Business Partners screen's Freelancers tab, the same way
 * VendorListContent is embedded.
 */
export function FreelancerListContent() {
    const navigate = useNavigate();

    const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
    const [choices, setChoices] = useState<FreelancerChoices | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [resendingId, setResendingId] = useState<number | null>(null);

    useEffect(() => {
        api.getChoices().then(setChoices).catch(() => { });
    }, []);

    const fetchFreelancers = async () => {
        setLoading(true);
        try {
            const data = await api.listFreelancers({
                search: searchTerm || undefined,
                status: statusFilter || undefined,
                archived: showArchived ? 'true' : undefined,
            });
            setFreelancers(data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load freelancers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => fetchFreelancers(), 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, statusFilter, showArchived]);

    const handleResendInvite = async (freelancer: Freelancer) => {
        setResendingId(freelancer.id);
        try {
            await api.resendInvite(freelancer.id);
            toast.success(`Invitation resent to ${freelancer.email}`);
        } catch {
            toast.error('Failed to resend invitation');
        } finally {
            setResendingId(null);
        }
    };

    const handleArchive = async (freelancer: Freelancer) => {
        try {
            await api.archiveFreelancer(freelancer.id);
            toast.success('Freelancer archived');
            fetchFreelancers();
        } catch {
            toast.error('Failed to archive freelancer');
        }
    };

    const handleUnarchive = async (freelancer: Freelancer) => {
        try {
            await api.unarchiveFreelancer(freelancer.id);
            toast.success('Freelancer restored');
            fetchFreelancers();
        } catch {
            toast.error('Failed to restore freelancer');
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6 animate-fade-in-down">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Freelancers</h2>

                <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto flex-wrap">
                    <div className="relative flex-1 sm:flex-initial">
                        <input
                            type="text"
                            placeholder="Search freelancers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64 text-sm sm:text-base dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 dark:text-gray-500" />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:text-base dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                    >
                        <option value="">All Statuses</option>
                        {(choices?.statuses || []).map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => setShowArchived((s) => !s)}
                        className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap text-sm sm:text-base dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                        {showArchived ? <ArchiveRestore size={18} className="sm:w-5 sm:h-5" /> : <Archive size={18} className="sm:w-5 sm:h-5" />}
                        <span className="hidden sm:inline">{showArchived ? 'Show Active' : 'Show Archived'}</span>
                    </button>

                    <button
                        onClick={() => navigate('/freelancers/add')}
                        className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap text-sm sm:text-base dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                        <Plus size={18} className="sm:w-5 sm:h-5" />
                        <span className="hidden sm:inline">Add Manually</span>
                    </button>

                    <button
                        onClick={() => setIsInviteModalOpen(true)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap shadow-md hover:shadow-lg text-sm sm:text-base"
                    >
                        <UserPlus size={18} className="sm:w-5 sm:h-5" />
                        <span className="hidden sm:inline">Invite Freelancer</span>
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center p-12 text-gray-500 dark:text-gray-400">Loading freelancers...</div>
            ) : freelancers.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center shadow-sm dark:bg-gray-900 dark:border-gray-800">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-gray-800">
                        <Users className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-white">No freelancers found</h3>
                    <p className="text-gray-600 dark:text-gray-300">Invite a freelancer to get started</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto dark:bg-gray-900 dark:border-gray-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide dark:border-gray-700 dark:text-gray-400">
                                <th className="px-4 py-3">Freelancer ID</th>
                                <th className="px-4 py-3">Freelancer</th>
                                <th className="px-4 py-3">Role</th>
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">Phone</th>
                                <th className="px-4 py-3">Pay Rate</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Projects</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {freelancers.map((freelancer) => (
                                <tr key={freelancer.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">
                                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{freelancer.freelancer_code || '-'}</td>
                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{freelancer.full_name || 'Untitled'}</td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{freelancer.professional_title || '-'}</td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{freelancer.email || '-'}</td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{freelancer.phone || '-'}</td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                                        {freelancer.rate ? `${freelancer.currency} ${freelancer.rate}` : '-'}
                                    </td>
                                    <td className="px-4 py-3"><StatusBadge status={freelancer.status} /></td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{freelancer.assigned_projects_count}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <button
                                                onClick={() => navigate(`/freelancers/${freelancer.id}`)}
                                                className="text-blue-600 hover:text-blue-800 font-medium text-xs dark:text-blue-400 dark:hover:text-blue-300"
                                            >
                                                View
                                            </button>
                                            <button
                                                onClick={() => navigate(`/freelancers/${freelancer.id}?edit=1`)}
                                                className="text-blue-600 hover:text-blue-800 font-medium text-xs dark:text-blue-400 dark:hover:text-blue-300"
                                            >
                                                Edit
                                            </button>
                                            {freelancer.status === 'invited' && (
                                                <button
                                                    onClick={() => handleResendInvite(freelancer)}
                                                    disabled={resendingId === freelancer.id}
                                                    className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium text-xs disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
                                                >
                                                    <Mail className="w-3.5 h-3.5" />
                                                    {resendingId === freelancer.id ? 'Sending...' : 'Resend Invitation'}
                                                </button>
                                            )}
                                            {freelancer.is_archived ? (
                                                <button
                                                    onClick={() => handleUnarchive(freelancer)}
                                                    className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium text-xs dark:text-gray-400 dark:hover:text-gray-100"
                                                >
                                                    <ArchiveRestore className="w-3.5 h-3.5" />
                                                    Restore
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleArchive(freelancer)}
                                                    className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium text-xs dark:text-gray-400 dark:hover:text-gray-100"
                                                >
                                                    <Archive className="w-3.5 h-3.5" />
                                                    Archive
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <InviteFreelancerModal
                isOpen={isInviteModalOpen}
                onClose={() => setIsInviteModalOpen(false)}
                // Stay on the list screen after sending the invite - just
                // refresh it so the newly invited freelancer shows up.
                onInvited={() => fetchFreelancers()}
            />
        </div>
    );
}

const FreelancerListPage: React.FC = () => {
    const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager') || 'admin';

    return (
        <Layout userRole={userRole} currentPage="freelancers" onNavigate={() => { }}>
            <FreelancerListContent />
        </Layout>
    );
};

export default FreelancerListPage;
