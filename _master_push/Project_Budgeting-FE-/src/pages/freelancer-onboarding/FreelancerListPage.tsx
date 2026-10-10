import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, Users, Mail, Archive, Clock, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { StatCard } from '../../components/StatCard';
import { Tabs, type TabItem } from '../../components/Tabs';
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/freelancerOnboarding';
import type { Freelancer, FreelancerChoices } from '../../types/freelancerOnboarding.types';
import { InviteFreelancerModal } from './InviteFreelancerModal';
import { FreelancerOnboardDrawer } from './FreelancerOnboardDrawer';
import { FreelancerOnboardingPanel } from './components/FreelancerOnboardingPanel';
import { FreelancerCard } from './components/FreelancerCard';
import type { FreelancerStepKey } from './components/freelancerDisplay';

// Status groups behind the tabs and summary cards (statuses themselves are unchanged).
const ONBOARDING_STATUSES = ['draft', 'invited', 'onboarding'];
const ACTIVE_STATUSES = ['completed', 'active', 'available', 'assigned'];
// Archived is a visibility flag, not a status - fetched separately.
const ARCHIVED_TAB = '__archived__';
type TabKey = '' | 'onboarding' | 'active' | typeof ARCHIVED_TAB;

const STATUS_TABS: TabItem[] = [
    { key: '', label: 'All' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'active', label: 'Active' },
    { key: ARCHIVED_TAB, label: 'Archived' },
];

/**
 * The actual list/search UI, with no Layout wrapper of its own - shared
 * between the standalone /freelancers route (wrapped in Layout below) and
 * the Business Partners screen's Freelancers tab, the same way
 * VendorListContent is embedded. Laid out like the vendor screen: summary
 * cards, status tabs, the onboarding-process panel and a card grid.
 */
export function FreelancerListContent() {
    const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
    const [archivedCount, setArchivedCount] = useState<number | null>(null);
    const [choices, setChoices] = useState<FreelancerChoices | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [tab, setTab] = useState<TabKey>('');
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [resendingId, setResendingId] = useState<number | null>(null);
    // Card last clicked - drives the onboarding panel.
    const [activeId, setActiveId] = useState<number | null>(null);
    // Onboarding drawer: id null = onboard a new freelancer; step = section to scroll to.
    const [drawer, setDrawer] = useState<{ open: boolean; id: number | null; step?: FreelancerStepKey }>({ open: false, id: null });
    const panelRef = useRef<HTMLDivElement>(null);

    const showArchived = tab === ARCHIVED_TAB;

    useEffect(() => {
        api.getChoices().then(setChoices).catch(() => { });
    }, []);

    const statusLabel = (status: string) => choices?.statuses.find((s) => s.value === status)?.label || status;
    const availabilityLabel = (value: string) => choices?.availabilities.find((a) => a.value === value)?.label || value;

    const fetchFreelancers = async () => {
        setLoading(true);
        try {
            const [data, archived] = await Promise.all([
                api.listFreelancers({ search: searchTerm || undefined, archived: showArchived ? 'true' : undefined }),
                showArchived ? Promise.resolve(null) : api.listFreelancers({ archived: 'true' }).catch(() => null),
            ]);
            setFreelancers(data);
            if (showArchived) setArchivedCount(data.length);
            else if (archived) setArchivedCount(archived.length);
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
    }, [searchTerm, showArchived]);

    const counts = useMemo(() => {
        const inGroup = (group: string[]) => freelancers.filter((f) => group.includes(f.status)).length;
        return { total: freelancers.length, onboarding: inGroup(ONBOARDING_STATUSES), active: inGroup(ACTIVE_STATUSES) };
    }, [freelancers]);

    const visible = useMemo(() => {
        if (tab === 'onboarding') return freelancers.filter((f) => ONBOARDING_STATUSES.includes(f.status));
        if (tab === 'active') return freelancers.filter((f) => ACTIVE_STATUSES.includes(f.status));
        return freelancers;
    }, [freelancers, tab]);

    const activeFreelancer = freelancers.find((f) => f.id === activeId) || null;

    /** Card click only selects the freelancer - the panel above shows where its onboarding is. */
    const selectFreelancer = (freelancer: Freelancer) => {
        setActiveId(freelancer.id);
        panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const openDrawer = (freelancer: Freelancer, step?: FreelancerStepKey) => {
        setActiveId(freelancer.id);
        setDrawer({ open: true, id: freelancer.id, step });
    };

    const upsert = (saved: Freelancer) =>
        setFreelancers((prev) => (prev.some((f) => f.id === saved.id) ? prev.map((f) => (f.id === saved.id ? saved : f)) : [saved, ...prev]));

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

    const statValue = (n: number | null) => (n === null || loading ? '-' : String(n));

    return (
        <div className="space-y-4 sm:space-y-6 animate-fade-in-down">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Freelancers</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Independent professionals and contractors</p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto flex-wrap">
                    <button
                        onClick={() => setIsInviteModalOpen(true)}
                        className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap text-sm sm:text-base dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        title="Email the freelancer a secure link to fill in their own details"
                    >
                        <Mail size={18} className="sm:w-5 sm:h-5" />
                        <span>Invite Freelancer</span>
                    </button>
                    <button
                        onClick={() => setDrawer({ open: true, id: null })}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap shadow-md hover:shadow-lg text-sm sm:text-base"
                        title="Fill in the freelancer's details yourself"
                    >
                        <UserPlus size={18} className="sm:w-5 sm:h-5" />
                        <span>Onboard Freelancer</span>
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <StatCard label="Total Freelancers" value={showArchived ? '-' : statValue(counts.total)} icon={<Users className="w-4 h-4" />} loading={loading} onClick={() => setTab('')} />
                <StatCard label="Onboarding" value={showArchived ? '-' : statValue(counts.onboarding)} icon={<Clock className="w-4 h-4" />} loading={loading} onClick={() => setTab('onboarding')} />
                <StatCard label="Active" value={showArchived ? '-' : statValue(counts.active)} icon={<CheckCircle2 className="w-4 h-4" />} loading={loading} onClick={() => setTab('active')} />
                <StatCard label="Archived" value={statValue(archivedCount)} icon={<Archive className="w-4 h-4" />} loading={archivedCount === null} onClick={() => setTab(ARCHIVED_TAB)} />
            </div>

            <div ref={panelRef} className="scroll-mt-4">
                <FreelancerOnboardingPanel
                    freelancer={activeFreelancer}
                    statusLabel={statusLabel}
                    onStepClick={(f, step) => openDrawer(f, step)}
                />
            </div>

            <Tabs tabs={STATUS_TABS} active={tab} onChange={(key) => setTab(key as TabKey)} />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Registered freelancers &middot; {loading ? '…' : visible.length}
                </h3>
                <div className="relative w-full sm:w-72">
                    <input
                        type="text"
                        placeholder="Search freelancers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full text-sm sm:text-base dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 dark:text-gray-500" />
                </div>
            </div>

            {loading ? (
                <div className="text-center p-12 text-gray-500 dark:text-gray-400">Loading freelancers...</div>
            ) : visible.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center shadow-sm dark:bg-gray-900 dark:border-gray-800">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-gray-800">
                        <Users className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-white">No freelancers found</h3>
                    <p className="text-gray-600 dark:text-gray-300">Click "Onboard Freelancer" or invite one to get started</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {visible.map((freelancer) => (
                        <FreelancerCard
                            key={freelancer.id}
                            freelancer={freelancer}
                            selected={freelancer.id === activeId}
                            statusLabel={statusLabel}
                            availabilityLabel={availabilityLabel}
                            onSelect={() => selectFreelancer(freelancer)}
                            onEdit={() => openDrawer(freelancer)}
                            onResendInvite={() => handleResendInvite(freelancer)}
                            isResending={resendingId === freelancer.id}
                            onArchive={() => handleArchive(freelancer)}
                            onUnarchive={() => handleUnarchive(freelancer)}
                        />
                    ))}
                </div>
            )}

            <FreelancerOnboardDrawer
                isOpen={drawer.open}
                freelancerId={drawer.id}
                initialStep={drawer.step}
                choices={choices}
                statusLabel={statusLabel}
                onClose={() => setDrawer({ open: false, id: null })}
                onSaved={(saved) => {
                    upsert(saved);
                    setActiveId(saved.id);
                }}
            />

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
