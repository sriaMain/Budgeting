import { useState, useEffect } from "react";
import type { Client, POC } from "../pages/ClientListPage";
import { ClientListPage } from "../pages/ClientListPage";
import { AddClientPage } from "../pages/AddClientPage";
import { ClientDetailsPage } from "../pages/ClientDetailsPage";
import { VendorListPage } from "../pages/VendorListPage";
import { AddVendorPage } from "../pages/AddVendorPage";
import { VendorDetailsPage } from "../pages/VendorDetailsPage";
import { Layout } from "../components/Layout";
import axiosInstance from "../utils/axiosInstance";

export interface Vendor {
  id: number;
  name: string;
  vendor_type: string;
  email: string;
  phone: string;
  created_at?: string;
  updated_at?: string;
}

export default function ContactsScreen() {
  const [activeTab, setActiveTab] = useState<'clients' | 'vendors'>('clients');
  const [currentView, setCurrentView] = useState<'list' | 'add' | 'details' | 'edit'>('list');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);

  // Application State - Clients
  const [clients, setClients] = useState<Client[]>([]);
  
  // Application State - Vendors
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Application State - POCs (populated from API)
  const [pocs, setPocs] = useState<POC[]>([]);

  const fetchClients = async () => {
    try {
      const response = await axiosInstance.get("/client/pocs/");
      if (response.status === 200) {
        const clientsData = response.data;
        setClients(clientsData);

        // Extract and flatten all POCs from all clients
        const allPocs: POC[] = [];
        clientsData.forEach((client: any) => {
          if (client.pocs && Array.isArray(client.pocs)) {
            client.pocs.forEach((poc: any) => {
              allPocs.push({
                id: poc.id,
                company: client.id,
                company_name: client.company_name,
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

  const fetchVendors = async () => {
    try {
      const response = await axiosInstance.get("/accounts/vendors/");
      if (response.status === 200) {
        setVendors(response.data);
      }
      console.log("Fetched vendors:", response.data);
    } catch (error) {
      console.error("Failed to fetch vendors:", error);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchVendors();
  }, []);

  // Reset view when switching tabs
  useEffect(() => {
    setCurrentView('list');
    setSelectedClientId(null);
    setSelectedVendorId(null);
  }, [activeTab]);

  const handleNavigateToClientDetails = (clientId: number) => {
    setSelectedClientId(clientId);
    setCurrentView('details');
  };

  const handleNavigateToVendorDetails = (vendorId: number) => {
    setSelectedVendorId(vendorId);
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

  const handleVendorCreated = (newVendor: Vendor) => {
    setVendors(prev => [...prev, newVendor]);
    handleNavigateToVendorDetails(newVendor.id);
  };

  const handleVendorUpdated = (updatedVendor: Vendor) => {
    setVendors(prev => prev.map(v => v.id === updatedVendor.id ? updatedVendor : v));
    handleNavigateToVendorDetails(updatedVendor.id);
  };

  const handleEditClient = (clientId: number) => {
    setSelectedClientId(clientId);
    setCurrentView('edit');
  };

  const handleEditVendor = (vendorId: number) => {
    setSelectedVendorId(vendorId);
    setCurrentView('edit');
  };

  const handlePOCCreated = (newPOC: POC) => {
    setPocs(prev => [...prev, newPOC]);
  };

  const getClientById = (id: number) => clients.find(c => c.id === id);
  const getPocsByClientId = (id: number) => pocs.filter(p => p.company === id);
  const getVendorById = (id: number) => vendors.find(v => v.id === id);

  return (
    <Layout userRole="admin" currentPage="contacts" onNavigate={() => { }}>
      <div className="bg-gray-50 font-sans min-h-screen">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          {/* Tabs */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6">
            <div className="border-b border-gray-200">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('clients')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'clients'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  Clients
                </button>
                <button
                  onClick={() => setActiveTab('vendors')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'vendors'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  Vendors
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
                <ClientDetailsPage
                  client={getClientById(selectedClientId)!}
                  pocs={getPocsByClientId(selectedClientId)}
                  onAddPOC={handlePOCCreated}
                  onEdit={() => handleEditClient(selectedClientId)}
                  onBack={() => setCurrentView('list')}
                />
              )}
            </>
          )}

          {/* Vendors Tab Content */}
          {activeTab === 'vendors' && (
            <>
              {currentView === 'list' && (
                <VendorListPage
                  vendors={vendors}
                  onAddVendor={() => setCurrentView('add')}
                  onSelectVendor={handleNavigateToVendorDetails}
                />
              )}

              {currentView === 'add' && (
                <AddVendorPage
                  onSave={handleVendorCreated}
                  onCancel={() => setCurrentView('list')}
                />
              )}

              {currentView === 'edit' && selectedVendorId && (
                <AddVendorPage
                  vendor={getVendorById(selectedVendorId)}
                  onSave={handleVendorUpdated}
                  onCancel={() => setCurrentView('details')}
                />
              )}

              {currentView === 'details' && selectedVendorId && (
                <VendorDetailsPage
                  vendor={getVendorById(selectedVendorId)!}
                  onEdit={() => handleEditVendor(selectedVendorId)}
                  onBack={() => setCurrentView('list')}
                />
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}