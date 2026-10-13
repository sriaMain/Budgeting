import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { Client, POC, OnboardingStep, WizardStepKey } from "./client-onboarding/clientTypes";
import { wizardStepForOnboardingStep } from "./client-onboarding/clientTypes";
import { ClientListPage } from "../pages/ClientListPage";
import { ClientDetailsPage } from "../pages/ClientDetailsPage";
import { Layout } from "../components/Layout";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ClientKycDrawer } from "../components/ClientKycDrawerContent";
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
  // Wizard step to open on (set when opened from an onboarding step card).
  const [editingStep, setEditingStep] = useState<WizardStepKey | undefined>(undefined);

  // Delete confirmation state
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadClients = (search?: string) => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    return axiosInstance
      .get<Client[]>("/client/", { params })
      .then((response) => {
        setClients(response.data);
        setClientsError(null);
      })
      .catch((error) => {
        console.error("Failed to fetch clients", error?.response?.status);
        setClientsError("Failed to load clients.");
      })
      .finally(() => setIsLoadingClients(false));
  };

  const fetchClients = (search?: string) => {
    setIsLoadingClients(true);
    setClientsError(null);
    return loadClients(search);
  };

  const fetchPocs = () =>
    axiosInstance
      .get("/client/pocs/")
      .then((response) => {
        // Extract and flatten all POCs from all clients
        type RawPoc = { id: number; salutation: string; first_name: string; middle_name?: string; last_name: string; poc_name: string; designation: string; poc_mobile: string; poc_email: string };
        const allPocs: POC[] = [];
        response.data.forEach((client: { id: number; company_name: string; pocs?: RawPoc[] }) => {
          (client.pocs ?? []).forEach((poc: RawPoc) => {
            allPocs.push({ ...poc, company: client.id, company_name: client.company_name });
          });
        });
        setPocs(allPocs);
      })
      .catch((error) => console.error("Failed to fetch POCs", error?.response?.status));

  useEffect(() => {
    // Initial load (isLoadingClients starts true); setState happens in the promise callbacks.
    loadClients();
    fetchPocs();
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
    setEditingStep(undefined);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (client: Client, section?: OnboardingStep) => {
    setEditingClient(client);
    setEditingStep(section ? wizardStepForOnboardingStep(section) : undefined);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => setIsDrawerOpen(false);

  // Every save inside the onboarding drawer (create, draft, submit, approval, review) and the
  // details page's actions: upsert the client into the list - the drawer shows its own toasts.
  const handleClientChanged = (saved: Client) => {
    setClients((prev) => (prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved]));
  };

  const handlePOCCreated = (newPOC: POC) => {
    // Upsert: the POC modal is also used to edit an existing contact.
    setPocs((prev) => (prev.some((p) => p.id === newPOC.id) ? prev.map((p) => (p.id === newPOC.id ? { ...p, ...newPOC } : p)) : [...prev, newPOC]));
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
                  onOpenStep={openEditDrawer}
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
                    onClientUpdated={handleClientChanged}
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

      <ClientKycDrawer
        isOpen={isDrawerOpen}
        client={editingClient}
        userRole={userRole}
        initialStep={editingStep}
        onClose={closeDrawer}
        onClientChanged={handleClientChanged}
      />

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
