import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { Client, POC } from "../pages/ClientListPage";
import { ClientListPage, kycStatusLabel } from "../pages/ClientListPage";
import { ClientDetailsPage } from "../pages/ClientDetailsPage";
import { Layout } from "../components/Layout";
import { Drawer } from "../components/Drawer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ClientKycDrawerContent } from "../components/ClientKycDrawerContent";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";
import { useAppSelector } from "../hooks/useAppSelector";
import { VendorListContent } from "./vendor-onboarding/VendorListPage";
import { FreelancerListContent } from "./freelancer-onboarding/FreelancerListPage";

export default function ContactsScreen() {
  // ?clientId=<id> (from the header's global search) deep-links straight to
  // that client's details view instead of always landing on the list.
  const [searchParams] = useSearchParams();
  const deepLinkedClientId = searchParams.get("clientId");

  // Real logged-in role from Redux, same pattern as AdministrationScreen/VendorListPage.
  // Falls back to the least-privileged role (not "admin") if it's ever unset.
  const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager' | null) || 'user';

  const [activeTab, setActiveTab] = useState<'clients' | 'vendors' | 'freelancers'>('clients');
  const [currentView, setCurrentView] = useState<'list' | 'details'>(
    deepLinkedClientId ? 'details' : 'list'
  );
  const [selectedClientId, setSelectedClientId] = useState<number | null>(
    deepLinkedClientId ? Number(deepLinkedClientId) : null
  );

  // Application State - Clients (now the KYC-rich `/client/` list, server-filtered by search)
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Application State - POCs (still populated from the bulk /client/pocs/ endpoint, kept
  // around purely for POC flattening - the primary contact column and ClientDetailsPage's
  // POC picker - since that data has no other source).
  const [pocs, setPocs] = useState<POC[]>([]);

  // Create/edit drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);

  // Delete confirmation state
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchClients = async (search?: string) => {
    setIsLoadingClients(true);
    setClientsError(null);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const response = await axiosInstance.get("/client/", { params });
      setClients(response.data);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
      setClientsError("Failed to load clients.");
    } finally {
      setIsLoadingClients(false);
    }
  };

  const fetchPocs = async () => {
    try {
      const response = await axiosInstance.get("/client/pocs/");
      const clientsData = response.data;

      // Extract and flatten all POCs from all clients
      type RawPoc = { id: number; salutation: string; first_name: string; middle_name?: string; last_name: string; poc_name: string; designation: string; poc_mobile: string; poc_email: string };
      const allPocs: POC[] = [];
      clientsData.forEach((client: { id: number; company_name: string; pocs?: RawPoc[] }) => {
        if (client.pocs && Array.isArray(client.pocs)) {
          client.pocs.forEach((poc: RawPoc) => {
            allPocs.push({
              id: poc.id,
              company: client.id,
              company_name: client.company_name,
              salutation: poc.salutation,
              first_name: poc.first_name,
              middle_name: poc.middle_name,
              last_name: poc.last_name,
              poc_name: poc.poc_name,
              designation: poc.designation,
              poc_mobile: poc.poc_mobile,
              poc_email: poc.poc_email
            });
          });
        }
      });
      setPocs(allPocs);
    } catch (error) {
      console.error("Failed to fetch POCs:", error);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchPocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset view when switching tabs — skipped on the very first render so a
  // ?clientId= deep link (which seeds currentView/selectedClientId above)
  // isn't immediately wiped out before the user sees it.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setCurrentView('list');
    setSelectedClientId(null);
  }, [activeTab]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    fetchClients(query);
  };

  const handleNavigateToClientDetails = (clientId: number) => {
    setSelectedClientId(clientId);
    setCurrentView('details');
  };

  const openCreateDrawer = () => {
    setEditingClient(undefined);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (client: Client) => {
    setEditingClient(client);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => setIsDrawerOpen(false);

  const handleClientSaved = (saved: Client, meta: { kycAutoChanged: boolean; keepOpen?: boolean }) => {
    const wasCreate = !editingClient;
    setClients((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved];
    });
    toast.success(wasCreate ? 'Client onboarded successfully' : 'Client updated successfully');
    if (meta.kycAutoChanged) {
      toast(
        `KYC status was automatically set to ${kycStatusLabel(saved.kyc_status)} because this is a high-risk / undocumented overseas client.`,
        { duration: 7000, icon: '⚠️' }
      );
    }
    if (meta.keepOpen) {
      // Just-created client: keep the drawer open, switched into edit mode for the new
      // record, so KYC documents (which need a real client id to attach to) can be
      // uploaded right away instead of forcing the user to close and reopen it.
      setEditingClient(saved);
      toast('You can now upload KYC documents for this client below.', { duration: 6000, icon: '📎' });
    } else {
      setIsDrawerOpen(false);
    }
  };

  const handlePOCCreated = (newPOC: POC) => {
    setPocs(prev => [...prev, newPOC]);
  };

  const confirmDeleteClient = async () => {
    if (!deletingClient) return;
    setIsDeleting(true);
    try {
      await axiosInstance.delete(`/client/${deletingClient.id}/`);
      setClients((prev) => prev.filter((c) => c.id !== deletingClient.id));
      toast.success('Client deleted');
      if (selectedClientId === deletingClient.id) {
        setCurrentView('list');
        setSelectedClientId(null);
      }
    } catch (error) {
      const apiErrors = parseApiErrors(error);
      toast.error(apiErrors.general || 'Failed to delete client');
    } finally {
      setIsDeleting(false);
      setDeletingClient(null);
    }
  };

  const getClientById = (id: number) => clients.find(c => c.id === id);
  const getPocsByClientId = (id: number) => pocs.filter(p => p.company === id);
  const getPrimaryContact = (clientId: number) => getPocsByClientId(clientId)[0]?.poc_name;

  const selectedClient = selectedClientId ? getClientById(selectedClientId) : undefined;

  return (
    <Layout userRole={userRole} currentPage="contacts" onNavigate={() => { }}>
      <div className="bg-gray-50 font-sans min-h-screen dark:bg-gray-950">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          {/* Tabs */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6 dark:bg-gray-900 dark:border-gray-800">
            <div className="border-b border-gray-200 dark:border-gray-800">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('clients')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'clients'
                      ? 'border-blue-600 text-blue-600 dark:border-violet-500 dark:text-violet-400'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:border-gray-700'
                  }`}
                >
                  Clients
                </button>
                <button
                  onClick={() => setActiveTab('vendors')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'vendors'
                      ? 'border-blue-600 text-blue-600 dark:border-violet-500 dark:text-violet-400'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:border-gray-700'
                  }`}
                >
                  Vendors
                </button>
                <button
                  onClick={() => setActiveTab('freelancers')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'freelancers'
                      ? 'border-blue-600 text-blue-600 dark:border-violet-500 dark:text-violet-400'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:border-gray-700'
                  }`}
                >
                  Freelancers
                </button>
              </div>
            </div>
          </div>

          {/* Clients Tab Content */}
          {activeTab === 'clients' && (
            <>
              {currentView === 'list' && (
                <ClientListPage
                  clients={clients}
                  isLoading={isLoadingClients}
                  error={clientsError}
                  onRetry={() => fetchClients(searchQuery)}
                  userRole={userRole}
                  onAddClient={openCreateDrawer}
                  onEditClient={openEditDrawer}
                  onDeleteClient={setDeletingClient}
                  onViewClient={handleNavigateToClientDetails}
                  onSearch={handleSearch}
                  getPrimaryContact={getPrimaryContact}
                />
              )}

              {currentView === 'details' && selectedClientId && (
                selectedClient ? (
                  <ClientDetailsPage
                    client={selectedClient}
                    pocs={getPocsByClientId(selectedClientId)}
                    userRole={userRole}
                    onAddPOC={handlePOCCreated}
                    onEdit={() => openEditDrawer(selectedClient)}
                    onBack={() => setCurrentView('list')}
                    onClientUpdated={(updated) => handleClientSaved(updated, { kycAutoChanged: false })}
                  />
                ) : (
                  <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading client…</p>
                )
              )}
            </>
          )}

          {/* Vendors Tab Content */}
          {activeTab === 'vendors' && <VendorListContent />}

          {/* Freelancers Tab Content */}
          {activeTab === 'freelancers' && <FreelancerListContent />}
        </div>
      </div>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        title={editingClient ? `Edit ${editingClient.company_name}` : 'Onboard Client'}
        size="xl"
      >
        <ClientKycDrawerContent
          client={editingClient}
          userRole={userRole}
          onSaved={handleClientSaved}
          onCancel={closeDrawer}
        />
      </Drawer>

      <ConfirmDialog
        isOpen={!!deletingClient}
        onClose={() => (isDeleting ? undefined : setDeletingClient(null))}
        onConfirm={confirmDeleteClient}
        title="Delete client"
        message={
          <>
            Are you sure you want to delete <strong>{deletingClient?.company_name}</strong>? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
      />
    </Layout>
  );
}
