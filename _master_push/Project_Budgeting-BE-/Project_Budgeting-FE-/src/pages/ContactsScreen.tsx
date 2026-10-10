import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { Client, POC } from "../pages/ClientListPage";
import { ClientListPage } from "../pages/ClientListPage";
import { AddClientPage } from "../pages/AddClientPage";
import { ClientDetailsPage } from "../pages/ClientDetailsPage";
import { Layout } from "../components/Layout";
import axiosInstance from "../utils/axiosInstance";
import { VendorListContent } from "./vendor-onboarding/VendorListPage";
import { FreelancerListContent } from "./freelancer-onboarding/FreelancerListPage";

export default function ContactsScreen() {
  // ?clientId=<id> (from the header's global search) deep-links straight to
  // that client's details view instead of always landing on the list.
  const [searchParams] = useSearchParams();
  const deepLinkedClientId = searchParams.get("clientId");

  const [activeTab, setActiveTab] = useState<'clients' | 'vendors' | 'freelancers'>('clients');
  const [currentView, setCurrentView] = useState<'list' | 'add' | 'details' | 'edit'>(
    deepLinkedClientId ? 'details' : 'list'
  );
  const [selectedClientId, setSelectedClientId] = useState<number | null>(
    deepLinkedClientId ? Number(deepLinkedClientId) : null
  );

  // Application State - Clients
  const [clients, setClients] = useState<Client[]>([]);

  // Application State - POCs (populated from API)
  const [pocs, setPocs] = useState<POC[]>([]);

  const fetchClients = async () => {
    try {
      const response = await axiosInstance.get("/client/pocs/");
      if (response.status === 200) {
        const clientsData = response.data;
        setClients(clientsData);

        // Extract and flatten all POCs from all clients
        type RawPoc = { id: number; salutation: string; first_name: string; middle_name?: string; last_name: string; poc_name: string; designation: string; poc_mobile: string; poc_email: string };
        const allPocs: POC[] = [];
        clientsData.forEach((client: Client & { pocs?: RawPoc[] }) => {
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
      }
      console.log("Fetched clients:", response.data);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  };

  useEffect(() => {
    fetchClients();
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

  const handleNavigateToClientDetails = (clientId: number) => {
    setSelectedClientId(clientId);
    setCurrentView('details');
  };

  const handleClientCreated = (newClient: Client) => {
    setClients(prev => [...prev, newClient]);
    handleNavigateToClientDetails(newClient.id);
  };

  const handleClientUpdated = (updatedClient: Client) => {
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    handleNavigateToClientDetails(updatedClient.id);
  };

  const handleEditClient = (clientId: number) => {
    setSelectedClientId(clientId);
    setCurrentView('edit');
  };

  const handlePOCCreated = (newPOC: POC) => {
    setPocs(prev => [...prev, newPOC]);
  };

  const getClientById = (id: number) => clients.find(c => c.id === id);
  const getPocsByClientId = (id: number) => pocs.filter(p => p.company === id);

  return (
    <Layout userRole="admin" currentPage="contacts" onNavigate={() => { }}>
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
                  onAddClient={() => setCurrentView('add')}
                  onSelectClient={handleNavigateToClientDetails}
                />
              )}

              {currentView === 'add' && (
                <AddClientPage
                  onSave={handleClientCreated}
                  onCancel={() => setCurrentView('list')}
                />
              )}

              {currentView === 'edit' && selectedClientId && (
                <AddClientPage
                  client={getClientById(selectedClientId)}
                  onSave={handleClientUpdated}
                  onCancel={() => setCurrentView('details')}
                />
              )}

              {currentView === 'details' && selectedClientId && (
                getClientById(selectedClientId) ? (
                  <ClientDetailsPage
                    client={getClientById(selectedClientId)!}
                    pocs={getPocsByClientId(selectedClientId)}
                    onAddPOC={handlePOCCreated}
                    onEdit={() => handleEditClient(selectedClientId)}
                    onBack={() => setCurrentView('list')}
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
    </Layout>
  );
}
