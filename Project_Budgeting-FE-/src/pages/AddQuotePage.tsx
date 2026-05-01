/**
 * Add Quote Page
 * Full page for creating and editing quotes/opportunities in the pipeline
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, GripVertical, ChevronDown } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Layout } from '../components/Layout';
import { AddClientModal } from '../components/AddClientModal';
import { AddPOCModal } from '../components/AddPOCModal';
import ModulesTab from '../components/ModulesTab';
import type { Quote, QuoteFormData, PipelineStage } from '../types/pipeline.types';
import axiosInstance from '../utils/axiosInstance';
import { parseApiErrors } from '../utils/parseApiErrors';
import { toast } from 'react-hot-toast';

interface ProductRow {
  id: string;
  group: string;
  product: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  backendId?: number;
  serviceId?: number;
}

interface POC {
  id: number;
  company_name: string;
  poc_name: string;
  designation: string;
  poc_mobile: string;
  poc_email: string;
}

interface Client {
  id: number;
  company_name: string;
  mobile_number: string;
  email: string;
  gstin: string;
  street_address: string;
  city: string;
  postal_code: string;
  municipality: string;
  state: string;
  country: string;
  tags: any[];
  created_at: string;
  updated_at: string;
  pocs: POC[];
}

interface Module {
  module_id: number;
  module_name: string;
  description: string;
  is_active: boolean;
}

interface ProductGroup {
  group_id: number;
  group_name: string;
  description: string;
  modules: Module[];
}

interface Service {
  id: string;
  product_service_name: string;
  description: string;
  product_group: string;
}

interface StatusChoice {
  value: string;
  label: string;
}

interface UnitChoice {
  value: string;
  label: string;
}

export default function AddQuotePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { quoteId, projectId } = useParams<{ quoteId?: string; projectId?: string }>();
  const username = useSelector((state: any) => state.auth.username);
  const isEditMode = !!quoteId || !!projectId;

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const [clients, setClients] = useState<Client[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [statusChoices, setStatusChoices] = useState<StatusChoice[]>([]);
  const [unitChoices, setUnitChoices] = useState<UnitChoice[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ general?: string }>({});
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [isAddPOCModalOpen, setIsAddPOCModalOpen] = useState(false);
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [originalStatus, setOriginalStatus] = useState<string>(''); // Track original status for edit mode
  const [isConfirmedQuote, setIsConfirmedQuote] = useState(false); // Track if editing a confirmed quote

  const [quoteDetails, setQuoteDetails] = useState({
    author: username || '',
    dateOfIssue: getTodayDate(),
    dueDate: getTodayDate(),
    client: '',
    poc: '',
    status: '',
    quoteName: ''
  });

  const [items, setItems] = useState<ProductRow[]>([
    {
      id: crypto.randomUUID(),
      group: '',
      product: '',
      description: '',
      quantity: 0,
      unit: '',
      unit_price: 0,
      amount: 0,
      backendId: undefined
    }
  ]);
  const [taxPercentage, setTaxPercentage] = useState(0);

  // Fetch all required data on component mount, then fetch existing data if in edit mode
  useEffect(() => {
    initializeData();
  }, []);

  // Fetch existing data if in edit mode
  useEffect(() => {
    if (isEditMode) {
      fetchExistingData();
    }
  }, [isEditMode, quoteId, projectId]);

  // Handle pre-filled client from navigation state
  useEffect(() => {
    if (location.state?.clientName && !isEditMode) {
      setQuoteDetails(prev => ({
        ...prev,
        client: location.state.clientName
      }));
    }
  }, [location.state, isEditMode]);

  const fetchExistingData = async () => {
    setIsLoadingData(true);
    try {
      const endpoint = projectId ? `/projects/${projectId}/` : `/quotes/${quoteId}/`;
      const response = await axiosInstance.get(endpoint);

      if (response.status === 200) {
        const data = response.data;

        if (projectId) {
          // Map project data
          setQuoteDetails({
            author: data.created_by?.username || username || '',
            dateOfIssue: data.start_date || getTodayDate(),
            dueDate: data.end_date || getTodayDate(),
            client: data.client_details?.company_name || data.client?.company_name || data.client_details?.name || data.client_name || '',
            poc: '', // Projects might not have POC in the same way
            status: data.status || '',
            quoteName: data.project_name || ''
          });
        } else {
          // Check if quote is confirmed - set flag but allow editing
          if (data.status?.toLowerCase() === 'confirmed') {
            setIsConfirmedQuote(true);
          }

          // Map quote data
          setQuoteDetails({
            author: data.created_by?.username || username || '',
            dateOfIssue: data.date_of_issue || getTodayDate(),
            dueDate: data.due_date || getTodayDate(),
            client: data.client_details?.company_name || data.client?.company_name || data.client_name || '',
            poc: data.poc_details?.poc_name || '',
            status: data.status || '',
            quoteName: data.quote_name || ''
          });

          // Store original status to compare later
          setOriginalStatus(data.status || '');

          if (data.items && data.items.length > 0) {
            const mappedItems = data.items.map((item: any) => ({
              id: crypto.randomUUID(),
              group: item.product_service_details?.product_group || item.product_group || '',
              product: item.product_service_details?.product_service_name || item.product_name || '',
              description: item.description || '',
              quantity: typeof item.quantity === 'number' ? item.quantity : (parseFloat(item.quantity) || 0),
              unit: item.unit || '',
              unit_price: typeof item.price_per_unit === 'number' ? item.price_per_unit : (parseFloat(item.price_per_unit) || 0),
              backendId: item.id,
              serviceId: item.product_service,
              amount: (typeof item.quantity === 'number' ? item.quantity : (parseFloat(item.quantity) || 0)) *
                (typeof item.price_per_unit === 'number' ? item.price_per_unit : (parseFloat(item.price_per_unit) || 0))
            }));
            setItems(mappedItems);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch existing data:', error);
      setErrors({ general: 'Failed to load existing data' });
    } finally {
      setIsLoadingData(false);
    }
  };

  // Update author when username loads from Redux
  useEffect(() => {
    if (username) {
      setQuoteDetails(prev => ({
        ...prev,
        author: username
      }));
    }
  }, [username]);

  const initializeData = async () => {
    setIsLoadingData(true);
    try {
      await Promise.allSettled([
        fetchClients(),
        fetchProductGroupsWithModules(),
        fetchStatusChoices(),
        fetchUnitChoices()
      ]);
    } catch (error) {
      console.error('Error initializing data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await axiosInstance.get('/client/pocs/');
      if (response.status === 200) {
        setClients(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch clients:', err);
      throw err;
    }
  };

  const fetchProductGroupsWithModules = async () => {
    try {
      const response = await axiosInstance.get('/product-groups-with-modules/');
      if (response.status === 200) {
        const data: ProductGroup[] = response.data;
        setProductGroups(data);

        const allServices: Service[] = [];
        data.forEach(group => {
          group.modules.forEach(module => {
            if (module.is_active) {
              allServices.push({
                id: module.module_id.toString(),
                product_service_name: module.module_name,
                description: module.description,
                product_group: group.group_name
              });
            }
          });
        });
        setServices(allServices);
      }
    } catch (err) {
      console.error('Failed to fetch product groups with modules:', err);
      throw err;
    }
  };

  const fetchStatusChoices = async () => {
    try {
      const response = await axiosInstance.get('/quote-status-choices/');
      if (response.status === 200) {
        setStatusChoices(response.data);
        if (response.data.length > 0 && !quoteDetails.status) {
          setQuoteDetails(prev => ({
            ...prev,
            status: response.data[0].value
          }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch status choices:', err);
      throw err;
    }
  };

  const fetchUnitChoices = async () => {
    try {
      const response = await axiosInstance.get('/quote-item-unit-choices/');
      if (response.status === 200) {
        setUnitChoices(response.data);
        if (response.data.length > 0) {
          setItems(prev => prev.map(item =>
            item.unit === '' ? { ...item, unit: response.data[0].value } : item
          ));
        }
      }
    } catch (err) {
      console.error('Failed to fetch unit choices:', err);
      throw err;
    }
  };

  const handleDetailChange = (field: string, value: string) => {
    setQuoteDetails(prev => {
      let processedValue = value;

      // Validate Quote Name - only alphabetic characters and spaces, max 25 chars
      if (field === 'quoteName') {
        // Remove any non-alphabetic characters (except spaces)
        processedValue = value.replace(/[^a-zA-Z\s]/g, '');
        // Limit to 25 characters
        processedValue = processedValue.slice(0, 25);
      }

      const updated = { ...prev, [field]: processedValue };
      if (field === 'client') {
        updated.poc = '';
      }
      return updated;
    });
    setErrors({});
  };

  // Effect to populate product names from service IDs once services are loaded
  useEffect(() => {
    if (services.length > 0 && items.some(item => item.serviceId && !item.product)) {
      setItems(prev => prev.map(item => {
        if (item.serviceId && !item.product) {
          const service = services.find(s => s.id === item.serviceId?.toString());
          if (service) {
            return {
              ...item,
              product: service.product_service_name,
              group: service.product_group
            };
          }
        }
        return item;
      }));
    }
  }, [services, items.length]); // Depend on services and items count, not deep items to avoid infinite loop

  const handleItemChange = (id: string, field: keyof ProductRow, value: string | number) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'group') {
          updated.product = '';
        }
        if (field === 'quantity' || field === 'unit_price') {
          updated.amount = updated.quantity * updated.unit_price;
        }
        return updated;
      }
      return item;
    }));
  };

  const addNewRow = () => {
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      group: '',
      product: '',
      description: '',
      quantity: 0,
      unit: unitChoices.length > 0 ? unitChoices[0].value : '',
      unit_price: 0,
      amount: 0,
      backendId: undefined
    }]);
  };

  const removeRow = (id: string) => {
    if (items.length > 1) {
      setItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const calculateRowTotal = (item: ProductRow) => {
    return item.quantity * item.unit_price;
  };

  const subTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = (subTotal * taxPercentage) / 100;
  const total = subTotal + taxAmount;
  const totalCost = total * 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrors({});

    try {
      const selectedClient = clients.find(c => c.company_name === quoteDetails.client);

      let pocId: number | null = null;
      if (selectedClient && quoteDetails.poc) {
        const selectedPoc = selectedClient.pocs.find(p => p.poc_name === quoteDetails.poc);
        pocId = selectedPoc ? selectedPoc.id : null;
      }

      const quoteItems = items
        .filter(item => item.product) // Filter out empty rows
        .map(item => {
          const service = services.find(s => s.product_service_name === item.product);
          return {
            ...(item.backendId ? { id: item.backendId } : {}), // Include ID if it exists (for updates)
            product_service: service ? parseInt(service.id) : null,
            description: item.description || '',
            quantity: item.quantity,
            unit: item.unit,
            price_per_unit: item.unit_price.toFixed(2)
          };
        });

      console.log('Submitting payload items:', quoteItems);

      // Build payload - only include status if it changed (for edit mode)
      const basePayload = projectId ? {
        project_name: quoteDetails.quoteName?.trim() || '',
        start_date: quoteDetails.dateOfIssue,
        end_date: quoteDetails.dueDate,
        client: selectedClient?.id || null,
      } : {
        quote_name: quoteDetails.quoteName?.trim() || '',
        date_of_issue: quoteDetails.dateOfIssue,
        due_date: quoteDetails.dueDate,
        client: selectedClient?.id || null,
        ...(pocId && { poc: pocId }),
        tax_percentage: taxPercentage,
        items: quoteItems
      };

      // Only add status if it's a new quote OR if status has changed in edit mode
      const payload = {
        ...basePayload,
        ...(!isEditMode || quoteDetails.status !== originalStatus ? { status: quoteDetails.status } : {})
      };

      let response;
      if (isEditMode) {
        const endpoint = projectId ? `/projects/${projectId}/` : `/quotes/${quoteId}/`;
        response = await axiosInstance.put(endpoint, payload);
      } else {
        response = await axiosInstance.post('/quotes/', payload);
      }

      if (response.status >= 200 && response.status < 300) {
        toast.success(`${projectId ? 'Project' : 'Quote'} ${isEditMode ? 'updated' : 'created'} successfully`);
        navigate(projectId ? `/projects/${projectId}` : '/pipeline');
      }
    } catch (error: any) {
      console.error('Failed to save:', error);
      const apiErrors = parseApiErrors(error);
      setErrors(apiErrors);

      // Prioritize general error, otherwise show the first field error
      const errorMessage = apiErrors.general || Object.values(apiErrors)[0];

      if (typeof errorMessage === 'string') {
        toast.error(errorMessage);
      } else {
        toast.error(`Failed to ${isEditMode ? 'update' : 'create'} ${projectId ? 'project' : 'quote'}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleClientAdded = (newClient: any) => {
    const clientWithPocs: Client = {
      ...newClient,
      pocs: newClient.pocs || []
    };
    setClients(prev => [...prev, clientWithPocs]);
    setQuoteDetails(prev => ({ ...prev, client: clientWithPocs.company_name, poc: '' }));
  };

  const handleServiceAdded = (newService: any) => {
    const formattedService: Service = {
      id: newService.id,
      product_service_name: newService.product_service_name,
      description: newService.description,
      product_group: newService.product_group
    };
    setServices(prev => [...prev, formattedService]);
    fetchProductGroupsWithModules();
  };

  const handlePOCAdded = (newPOC: POC) => {
    // Refresh clients to get the new POC in the list
    fetchClients().then(() => {
      // Auto-select the new POC
      setQuoteDetails(prev => ({ ...prev, poc: newPOC.poc_name }));
    });
  };

  return (
    <Layout userRole="admin" currentPage="pipeline" onNavigate={() => { }}>
      <div className="px-2 sm:px-4 md:px-6 lg:px-8">
        <div className="max-w-[1600px] mx-auto py-4 sm:py-6 md:py-8">
          <div className="flex items-center gap-2 text-xs sm:text-sm mb-4 sm:mb-6">
            <button
              onClick={() => navigate('/pipeline')}
              className="text-blue-600 hover:text-blue-800 font-semibold transition-colors flex items-center gap-1"
            >
              <ArrowLeft size={16} className="hidden sm:block" />
              <ArrowLeft size={14} className="sm:hidden" />
              {projectId ? 'Project Details' : 'Pipeline'}
            </button>
            <span className="text-gray-400">/</span>
            <span className="text-gray-700 font-medium">{isEditMode ? 'Edit' : 'Add'} {projectId ? 'Project' : 'Quote'} Details</span>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative">
            {isLoadingData && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600 mb-4"></div>
                  <p className="text-gray-600 font-medium">Loading {projectId ? 'project' : 'quote'} data...</p>
                </div>
              </div>
            )}

            <div className="p-4 sm:p-6 md:p-8 border-b border-gray-100">
              <h1 className="text-lg sm:text-xl font-bold text-gray-800 mb-6 sm:mb-8">{isEditMode ? 'Edit' : 'Add'} {projectId ? 'Project' : 'Quote'} Details</h1>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 lg:gap-x-24 gap-y-4 sm:gap-y-6">
                <div className="space-y-4 sm:space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start sm:items-center gap-2 sm:gap-6">
                    <label className="text-sm sm:text-base font-medium text-gray-700">Date of Issue</label>
                    <input
                      type="date"
                      value={quoteDetails.dateOfIssue}
                      onChange={(e) => handleDetailChange('dateOfIssue', e.target.value)}
                      disabled={isConfirmedQuote}
                      className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded text-sm sm:text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start sm:items-center gap-2 sm:gap-6">
                    <label className="text-sm sm:text-base font-medium text-gray-700">Client</label>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <select
                          value={quoteDetails.client}
                          onChange={(e) => handleDetailChange('client', e.target.value)}
                          className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded text-sm sm:text-base appearance-none bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          disabled={isLoadingData || isConfirmedQuote}
                        >
                          <option value="">
                            {isLoadingData ? 'Loading clients...' : 'Enter Client Name'}
                          </option>
                          {clients.map(client => (
                            <option key={client.id} value={client.company_name}>
                              {client.company_name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAddClientModalOpen(true)}
                        disabled={isConfirmedQuote}
                        className="flex-shrink-0 flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                        title="Add New Client"
                      >
                        <Plus size={20} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start sm:items-center gap-2 sm:gap-6">
                    <label className="text-sm sm:text-base font-medium text-gray-700">POC</label>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <select
                          value={quoteDetails.poc}
                          onChange={(e) => handleDetailChange('poc', e.target.value)}
                          className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded text-sm sm:text-base appearance-none bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          disabled={!quoteDetails.client || isLoadingData || isConfirmedQuote}
                        >
                          <option value="">
                            {!quoteDetails.client ? 'Select client first' : 'Select POC'}
                          </option>
                          {quoteDetails.client && clients
                            .find(c => c.company_name === quoteDetails.client)
                            ?.pocs.map(poc => (
                              <option key={poc.id} value={poc.poc_name}>
                                {poc.poc_name} - {poc.designation}
                              </option>
                            ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAddPOCModalOpen(true)}
                        disabled={!quoteDetails.client || isConfirmedQuote}
                        className="flex-shrink-0 flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Add New POC"
                      >
                        <Plus size={20} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start sm:items-center gap-2 sm:gap-6">
                    <label className="text-sm sm:text-base font-medium text-gray-700">{projectId ? 'Project' : 'Quote'} Name</label>
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder={`Enter ${projectId ? 'Project' : 'Quote'} Name`}
                        value={quoteDetails.quoteName}
                        onChange={(e) => handleDetailChange('quoteName', e.target.value)}
                        maxLength={25}
                        disabled={isConfirmedQuote}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded text-sm sm:text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1">{quoteDetails.quoteName.length}/25 characters (alphabets only)</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start sm:items-center gap-2 sm:gap-6">
                    <label className="text-sm sm:text-base font-medium text-gray-700">Author</label>
                    <input
                      type="text"
                      value={quoteDetails.author}
                      className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded text-sm sm:text-base bg-gray-50 focus:outline-none"
                      readOnly
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start sm:items-center gap-2 sm:gap-6">
                    <label className="text-sm sm:text-base font-medium text-gray-700">Due Date</label>
                    <input
                      type="date"
                      value={quoteDetails.dueDate}
                      onChange={(e) => handleDetailChange('dueDate', e.target.value)}
                      disabled={isConfirmedQuote}
                      className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded text-sm sm:text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start sm:items-center gap-2 sm:gap-6">
                    <label className="text-sm sm:text-base font-medium text-gray-700">Status</label>
                    <div className="relative">
                      <select
                        value={quoteDetails.status}
                        onChange={(e) => handleDetailChange('status', e.target.value)}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded text-sm sm:text-base appearance-none bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                        disabled={isLoadingData || statusChoices.length === 0}
                      >
                        <option value="" disabled>Select Status</option>
                        {statusChoices.map(choice => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 md:p-8 pb-0">
              <div className="hidden lg:block">
                <div className="grid grid-cols-[50px_140px_2fr_200px_140px_140px_50px] gap-4 mb-2 text-sm font-semibold text-gray-700 px-2">
                  <div></div>
                  <div>Group</div>
                  <div>Product | Description</div>
                  <div>Quantity | Unit</div>
                  <div className="text-right">Unit Price</div>
                  <div className="text-right">Amount</div>
                  <div></div>
                </div>

                <div className="border-t border-gray-200">
                  {items.map((item) => (
                    <div key={item.id} className="group border-b border-gray-100 py-4 hover:bg-gray-50 transition-colors">
                      <div className="grid grid-cols-[50px_140px_2fr_200px_140px_140px_50px] gap-4 items-start px-2">
                        <div className="flex justify-center pt-2.5 cursor-move text-gray-400 hover:text-gray-600">
                          <GripVertical size={18} />
                        </div>
                        <div>
                          <div className="relative">
                            <select
                              value={item.group}
                              onChange={(e) => handleItemChange(item.id, 'group', e.target.value)}
                              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm appearance-none bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">Product Group</option>
                              {productGroups.map(group => (
                                <option key={group.group_id} value={group.group_name}>
                                  {group.group_name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-2 items-center">
                            <div className="relative flex-1">
                              <select
                                value={item.product}
                                onChange={(e) => handleItemChange(item.id, 'product', e.target.value)}
                                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm appearance-none bg-white font-medium focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                disabled={!item.group}
                              >
                                <option value="">
                                  {!item.group ? 'Select group first' : 'Select product'}
                                </option>
                                {item.group && services
                                  .filter(service => service.product_group === item.group)
                                  .map(service => (
                                    <option key={service.id} value={service.product_service_name}>
                                      {service.product_service_name}
                                    </option>
                                  ))}
                              </select>
                              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsAddServiceModalOpen(true)}
                              className="flex-shrink-0 flex items-center justify-center w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-sm"
                            >
                              <Plus size={16} strokeWidth={2.5} />
                            </button>
                          </div>
                          <textarea
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                            placeholder="Product or service description"
                            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm text-gray-600 h-20 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex space-x-2">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="relative w-24 shrink-0">
                            <select
                              value={item.unit}
                              onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                              className="w-full px-2 py-2.5 border border-gray-300 rounded text-sm appearance-none bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              disabled={isLoadingData || unitChoices.length === 0}
                            >
                              {unitChoices.map(choice => (
                                <option key={choice.value} value={choice.value}>
                                  {choice.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-1 top-3 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <input
                            type="number"
                            placeholder="Price"
                            value={item.unit_price || ''}
                            onChange={(e) => handleItemChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-400"
                          />
                        </div>
                        <div className="pt-2.5 text-right text-sm font-bold text-gray-800">
                          {calculateRowTotal(item).toFixed(2)}
                        </div>
                        <button
                          onClick={() => removeRow(item.id)}
                          className="flex justify-center pt-2.5 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:hidden space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <GripVertical size={16} className="text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700">Item #{index + 1}</span>
                      </div>
                      <button
                        onClick={() => removeRow(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Product Group</label>
                      <div className="relative">
                        <select
                          value={item.group}
                          onChange={(e) => handleItemChange(item.id, 'group', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm appearance-none bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Select Group</option>
                          {productGroups.map(group => (
                            <option key={group.group_id} value={group.group_name}>
                              {group.group_name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Product/Service</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <select
                            value={item.product}
                            onChange={(e) => handleItemChange(item.id, 'product', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm appearance-none bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            disabled={!item.group}
                          >
                            <option value="">
                              {!item.group ? 'Select group first' : 'Select product'}
                            </option>
                            {item.group && services
                              .filter(service => service.product_group === item.group)
                              .map(service => (
                                <option key={service.id} value={service.product_service_name}>
                                  {service.product_service_name}
                                </option>
                              ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsAddServiceModalOpen(true)}
                          className="flex-shrink-0 flex items-center justify-center w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                          <Plus size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        placeholder="Product or service description"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 h-16 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-right focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                        <div className="relative">
                          <select
                            value={item.unit}
                            onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                            className="w-full px-2 py-2 border border-gray-300 rounded text-sm appearance-none bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            disabled={isLoadingData || unitChoices.length === 0}
                          >
                            {unitChoices.map(choice => (
                              <option key={choice.value} value={choice.value}>
                                {choice.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Unit Price</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={item.unit_price || ''}
                          onChange={(e) => handleItemChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-right focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                        <div className="px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-right font-bold text-gray-800">
                          {calculateRowTotal(item).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-6 mb-6 sm:mb-8">
                <button
                  onClick={addNewRow}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Add New Row
                </button>
              </div>
            </div>

            <div className="bg-white px-4 sm:px-6 md:px-8 py-4 sm:py-6 mb-8 sm:mb-12">
              <div className="flex flex-col lg:flex-row justify-end items-start gap-8 lg:gap-12">
                <div className="w-full lg:w-80 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-gray-800">Sub Total</span>
                    <span className="text-gray-700">{subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-gray-800">Tax</span>
                    <div className="flex items-center gap-3">
                      <div className="relative w-20">
                        <select
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm appearance-none bg-white pr-6 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          value={taxPercentage}
                          onChange={(e) => setTaxPercentage(parseFloat(e.target.value))}
                        >
                          <option value="0">0 %</option>
                          <option value="5">5 %</option>
                          <option value="10">10 %</option>
                          <option value="18">18 %</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-1 top-2 text-gray-500 pointer-events-none" />
                      </div>
                      <span className="text-gray-700 w-20 text-right">{taxAmount.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-3 border-t border-gray-200">
                    <span className="font-bold text-gray-800">Total</span>
                    <span className="text-gray-800 font-bold">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="w-full lg:w-64 space-y-4 lg:border-l border-gray-200 lg:pl-8">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-gray-800">Total Cost</span>
                    <div className="text-right">
                      <div className="font-bold text-gray-800">{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-white border-t border-gray-200 flex justify-center sticky bottom-0 z-10">
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-8 sm:px-12 rounded shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : (isEditMode ? 'Update' : 'Save')} {projectId ? 'Project' : 'Quote'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <AddClientModal
        isOpen={isAddClientModalOpen}
        onClose={() => setIsAddClientModalOpen(false)}
        onClientAdded={handleClientAdded}
      />

      {isAddPOCModalOpen && quoteDetails.client && (() => {
        const selectedClient = clients.find(c => c.company_name === quoteDetails.client);
        return selectedClient ? (
          <AddPOCModal
            companyId={selectedClient.id}
            companyName={selectedClient.company_name}
            onSave={handlePOCAdded}
            onClose={() => setIsAddPOCModalOpen(false)}
          />
        ) : null;
      })()}

      {isAddServiceModalOpen && (
        <ModulesTab
          isModalMode={true}
          onModalClose={() => setIsAddServiceModalOpen(false)}
          onServiceAdded={handleServiceAdded}
        />
      )}
    </Layout>
  );
}
