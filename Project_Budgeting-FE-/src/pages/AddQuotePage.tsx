/**
 * Add Quote Page
 * Full page for creating and editing quotes/opportunities in the pipeline
 */

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, GripVertical, ChevronDown, PackagePlus, ListPlus } from 'lucide-react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { AddClientModal } from '../components/AddClientModal';
import { AddPOCModal } from '../components/AddPOCModal';
import ProductServiceDrawer from '../components/ProductServiceDrawer';
import { SearchableSelect, type SearchableSelectOption } from '../components/SearchableSelect';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoaderIcon } from '../components/Icons';
import { getCatalogItems, getCatalogPermissions, kindOf, type CatalogItem, type CatalogKind, type CatalogPermissions } from '../services/catalog';
import type { Quote, QuoteFormData, PipelineStage } from '../types/pipeline.types';
import type { FormErrors } from '../types';
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
  street_address: string;
  city: string;
  postal_code: string;
  state: string;
  country: string;
  tags: any[];
  created_at: string;
  updated_at: string;
  pocs: POC[];
}

interface Service {
  id: string;
  /** Line "Group": a service or a product (catalog type). */
  kind: CatalogKind;
  product_service_name: string;
  description: string;
  sales_price: number;
  uom_code: string | null;
  sales_tax_rate: number | null;
}

/** A sellable catalog item as a quotation line option (Administration > Products & Services). */
const toQuoteService = (r: CatalogItem): Service => ({
  id: String(r.id),
  kind: kindOf(r),
  product_service_name: r.product_service_name,
  description: r.description,
  sales_price: Number(r.sales_price) || 0,
  uom_code: r.uom_code ?? null,
  sales_tax_rate: r.sales_tax_rate != null ? Number(r.sales_tax_rate) : null,
});

// The API error keys each header field shows under it (and clears once edited).
const DETAIL_ERROR_KEYS: Record<string, string[]> = {
  dateOfIssue: ['date_of_issue', 'start_date'],
  dueDate: ['due_date', 'end_date'],
  client: ['client', 'poc'],
  poc: ['poc'],
  quoteName: ['quote_name', 'project_name'],
  status: ['status'],
};

// Dense ERP form styles: 13px labels, 40px fields (36px inside the line-items table).
const LABEL = 'block text-[13px] font-medium text-gray-700 mb-1.5 dark:text-gray-300';
const FIELD_BASE = 'w-full rounded-md border bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:disabled:bg-gray-800/50';
const fieldClass = (invalid: boolean, size = 'h-10 px-3') =>
  `${FIELD_BASE} ${size} ${invalid
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500'
    : 'border-gray-300 focus:border-teal-600 focus:ring-teal-600 dark:border-gray-700 dark:focus:ring-violet-500'}`;
const ICON_BUTTON = 'flex shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-teal-700 hover:bg-teal-50 hover:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-violet-300 dark:hover:bg-gray-700';
const SECTION = 'rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900';
const SECTION_TITLE = 'text-base font-semibold text-gray-900 dark:text-white';

const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? <p id={id} className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p> : null;

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
  const [searchParams] = useSearchParams();
  // Present when creating a follow-up/phase quote for an existing project
  // from that project's Finances tab (distinct from the `projectId` route
  // param above, which puts this page into "edit project" mode).
  const forProjectId = searchParams.get('forProject');
  const isEditMode = !!quoteId || !!projectId;

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const [clients, setClients] = useState<Client[]>([]);
  const [catalogPermissions, setCatalogPermissions] = useState<CatalogPermissions>({ can_manage: false, can_view_accounting: false });
  const [services, setServices] = useState<Service[]>([]);
  const [statusChoices, setStatusChoices] = useState<StatusChoice[]>([]);
  const [unitChoices, setUnitChoices] = useState<UnitChoice[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // Keyed like the API's fields (quote_name, client, items, ...) so server and local
  // validation messages land under the same field; row fields use `item:<row id>:<field>`.
  const [errors, setErrors] = useState<FormErrors>({});
  // Unsaved edits: the browser warns on refresh/close, and Back/Cancel ask before leaving.
  const [isDirty, setIsDirty] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  // Set synchronously, so a double click can't send the quote twice before isSaving renders.
  const submittingRef = useRef(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Quote currency as saved (edit mode); a new quote takes the backend default.
  const [currency, setCurrency] = useState('');
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [isAddPOCModalOpen, setIsAddPOCModalOpen] = useState(false);
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  // What the "+" next to a line creates: follows that line's Group (service by default).
  const [quickAddKind, setQuickAddKind] = useState<CatalogKind>('service');
  const [originalStatus, setOriginalStatus] = useState<string>(''); // Track original status for edit mode
  // Header fields lock once a project has been created from the quote (every
  // quote is Confirmed from creation, so Confirmed alone no longer locks it).
  const [isConfirmedQuote, setIsConfirmedQuote] = useState(false);
  // Existing budget/hours summary of the project this phase quote is being added to
  const [projectSummary, setProjectSummary] = useState<any>(null);
  const [isLoadingProjectSummary, setIsLoadingProjectSummary] = useState(false);

  const [quoteDetails, setQuoteDetails] = useState({
    dateOfIssue: getTodayDate(),
    dueDate: getTodayDate(),
    client: '',
    poc: '',
    // New quotes are saved as Confirmed by the backend - there is no status to
    // pick on create. Edit mode fills in the saved status.
    status: '',
    quoteName: '',
  });

  const [items, setItems] = useState<ProductRow[]>([
    {
      id: crypto.randomUUID(),
      group: '',
      product: '',
      description: '',
      quantity: 1,
      unit: '',
      unit_price: 0,
      amount: 0,
      backendId: undefined
    }
  ]);
  const [taxPercentage, setTaxPercentage] = useState(0);
  // Whole-quote discount %, taken off the Sub Total before tax (like invoices).
  const [discountPercentage, setDiscountPercentage] = useState(0);

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

  // When adding a phase/follow-up quote to an existing project, fetch that
  // project's current budget so the user can see amounts already used/remaining
  useEffect(() => {
    if (!forProjectId) {
      setProjectSummary(null);
      return;
    }
    const fetchProjectSummary = async () => {
      setIsLoadingProjectSummary(true);
      try {
        const response = await axiosInstance.get(`/projects/${forProjectId}/`);
        setProjectSummary(response.data);
      } catch (error) {
        console.error('Failed to fetch project summary:', error);
        setProjectSummary(null);
      } finally {
        setIsLoadingProjectSummary(false);
      }
    };
    fetchProjectSummary();
  }, [forProjectId]);

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
            dateOfIssue: data.start_date || getTodayDate(),
            dueDate: data.end_date || getTodayDate(),
            client: data.client_details?.company_name || data.client?.company_name || data.client_details?.name || data.client_name || '',
            poc: '', // Projects might not have POC in the same way
            status: data.status || '',
            quoteName: data.project_name || '',
          });
        } else {
          // Lock the header once a project exists for this quote
          if (data.has_project) {
            setIsConfirmedQuote(true);
          }

          // Map quote data
          setQuoteDetails({
            dateOfIssue: data.date_of_issue || getTodayDate(),
            dueDate: data.due_date || getTodayDate(),
            client: data.client_details?.company_name || data.client?.company_name || data.client_name || '',
            poc: data.poc_details?.poc_name || '',
            status: data.status || '',
            quoteName: data.quote_name || '',
          });

          // Store original status to compare later
          setOriginalStatus(data.status || '');

          // Populate the saved tax percentage — this was previously left at
          // its default of 0 when opening a quote for editing.
          setTaxPercentage(data.tax_percentage != null ? Number(data.tax_percentage) : 0);
          setDiscountPercentage(data.discount_percentage != null ? Number(data.discount_percentage) : 0);
          setCurrency(data.currency || '');

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

  const initializeData = async () => {
    setIsLoadingData(true);
    try {
      await Promise.allSettled([
        fetchClients(),
        fetchCatalogItems(),
        getCatalogPermissions().then(setCatalogPermissions),
        // Status is only chosen when editing an existing quote
        ...(isEditMode ? [fetchStatusChoices()] : []),
        fetchUnitChoices(),
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

  const fetchCatalogItems = async () => {
    try {
      const rows = await getCatalogItems();
      setServices(rows.filter(r => r.is_active && r.can_be_sold).map(toQuoteService));
    } catch (err) {
      console.error('Failed to fetch products & services:', err);
      throw err;
    }
  };

  const fetchStatusChoices = async () => {
    try {
      const response = await axiosInstance.get('/quote-status-choices/');
      if (response.status === 200) {
        const choices: StatusChoice[] = response.data;
        setStatusChoices(choices);
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
    setIsDirty(true);
    clearErrors(...(DETAIL_ERROR_KEYS[field] ?? [field]));
  };

  const clearErrors = (...keys: string[]) => {
    setErrors(prev => {
      if (!keys.some(k => prev[k]) && !prev.general) return prev;
      const next = { ...prev };
      keys.forEach(k => delete next[k]);
      delete next.general;
      return next;
    });
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
            };
          }
        }
        return item;
      }));
    }
  }, [services, items.length]); // Depend on services and items count, not deep items to avoid infinite loop

  const handleItemChange = (id: string, field: keyof ProductRow, value: string | number) => {
    setIsDirty(true);
    clearErrors('items', `item:${id}:${field}`);
    // A quotation has one tax % for the whole document: the first product picked sets it from
    // the catalog's sales tax, but never overrides a tax the user already chose.
    if (field === 'product' && value && taxPercentage === 0) {
      const service = services.find(s => s.product_service_name === value);
      if (service?.sales_tax_rate && [5, 10, 18].includes(service.sales_tax_rate)) {
        setTaxPercentage(service.sales_tax_rate);
      }
    }
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'group') {
          const current = services.find(s => s.product_service_name === item.product);
          if (current && current.kind !== value) {
            updated.product = '';
            updated.serviceId = undefined;
          }
        }
        if (field === 'product' && value) {
          // Pre-fill from the catalog: Unit Price = the product's sales price (still editable per
          // quotation), its unit when set, and its description if the line has none yet.
          const service = services.find(s => s.product_service_name === value);
          if (service) {
            updated.serviceId = Number(service.id);
            updated.unit_price = service.sales_price;
            if (service.uom_code && unitChoices.some(u => u.value === service.uom_code)) {
              updated.unit = service.uom_code;
            }
            if (!String(updated.description || '').trim() && service.description) {
              updated.description = service.description;
            }
          }
        }
        if (field === 'unit' && value === 'fixed') {
          updated.quantity = 1; // a fixed price is one lot
        }
        if (field === 'quantity' || field === 'unit_price' || field === 'product' || field === 'unit') {
          updated.amount = updated.quantity * updated.unit_price;
        }
        return updated;
      }
      return item;
    }));
  };

  const addNewRow = () => {
    setIsDirty(true);
    clearErrors('items');
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      group: '',
      product: '',
      description: '',
      quantity: 1,
      unit: unitChoices.length > 0 ? unitChoices[0].value : '',
      unit_price: 0,
      amount: 0,
      backendId: undefined
    }]);
  };

  // The last row can go too - the table then shows its empty state and Save asks for a line.
  const removeRow = (id: string) => {
    setIsDirty(true);
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // Line order is kept on save (the backend re-creates lines in the order sent).
  const moveRow = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    setIsDirty(true);
    setItems(prev => {
      const next = [...prev];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  };

  const calculateRowTotal = (item: ProductRow) => {
    return item.quantity * item.unit_price;
  };

  // A line's Group: what the user picked, else the type of the product already on it (saved quotes).
  const rowKind = (item: ProductRow): CatalogKind | '' =>
    item.group === 'service' || item.group === 'product'
      ? item.group
      : services.find(s => s.product_service_name === item.product)?.kind ?? '';

  const groupOptions = (
    <>
      <option value="">Select group</option>
      <option value="service">Service</option>
      <option value="product">Product</option>
    </>
  );

  // Searchable pickers: values stay the names the form already stores (client / POC / product).
  const productChoices = (kind: CatalogKind | '') =>
    kind ? services.filter(service => service.kind === kind).map(service => ({ id: service.id, label: service.product_service_name })) : [];
  const productValue = (current: string): SearchableSelectOption | null => {
    if (!current) return null;
    const service = services.find(s => s.product_service_name === current);
    return service ? { id: service.id, label: current } : { id: `archived:${current}`, label: `${current} (archived)` };
  };

  const selectedClient = clients.find(c => c.company_name === quoteDetails.client);
  const clientChoices = clients.map(c => ({ id: c.id, label: c.company_name }));
  const pocChoices = (selectedClient?.pocs ?? []).map(p => ({ id: p.id, label: p.poc_name, sublabel: p.designation || undefined }));
  const clientValue = quoteDetails.client
    ? { id: selectedClient?.id ?? quoteDetails.client, label: quoteDetails.client }
    : null;
  const selectedPoc = selectedClient?.pocs.find(p => p.poc_name === quoteDetails.poc);
  const pocValue = quoteDetails.poc
    ? { id: selectedPoc?.id ?? quoteDetails.poc, label: quoteDetails.poc, sublabel: selectedPoc?.designation || undefined }
    : null;

  // Derived from each line's quantity x unit price, so every edit re-totals at once.
  const subTotal = items.reduce((sum, item) => sum + calculateRowTotal(item), 0);
  // Same as the backend (Quote.calculate_totals): the discount is that % of the Sub Total
  // (to the paisa), and tax is on the amount after the discount.
  const discountAmount = Math.round(subTotal * discountPercentage) / 100;
  const taxableAmount = subTotal - discountAmount;
  const taxAmount = (taxableAmount * taxPercentage) / 100;
  const total = taxableAmount + taxAmount;

  // Every amount on the page: the viewer's number grouping, always 2 decimals.
  const money = (value: number) =>
    value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // What the API requires, checked first so each problem shows under its own field.
  const validate = (): FormErrors => {
    const found: FormErrors = {};
    const kind = projectId ? 'project' : 'quote';
    if (!quoteDetails.quoteName.trim()) found[`${kind}_name`] = `Enter a ${kind} name.`;
    if (!quoteDetails.dateOfIssue) found[projectId ? 'start_date' : 'date_of_issue'] = 'Choose the date of issue.';
    if (!quoteDetails.dueDate) found[projectId ? 'end_date' : 'due_date'] = 'Choose the end date.';
    if (projectId) return found; // a project edit saves only these header fields
    if (!quoteDetails.client) found.client = 'Select a client.';
    const lines = items.filter(item => item.product);
    if (lines.length === 0) found.items = 'Add at least one product or service.';
    lines.forEach(item => {
      if (!(item.quantity >= 1)) found[`item:${item.id}:quantity`] = 'Must be at least 1';
      if (item.unit_price < 0) found[`item:${item.id}:unit_price`] = "Can't be negative";
    });
    return found;
  };

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (submittingRef.current) return;
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      toast.error('Please fix the highlighted fields.');
      return;
    }
    submittingRef.current = true;
    setIsSaving(true);
    setErrors({});

    try {
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
            product_service: service ? parseInt(service.id) : (item.serviceId ?? null),
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
        discount_percentage: discountPercentage,
        items: quoteItems,
        // Link this quote back to the project it's being raised for
        // (e.g. a Phase 2 quote), if created from that project's page
        ...(forProjectId && { project: parseInt(forProjectId, 10) })
      };

      // A new quote never sends a status (the backend saves it as Confirmed);
      // in edit mode only send it when it was changed.
      const payload = {
        ...basePayload,
        ...(isEditMode && quoteDetails.status && quoteDetails.status !== originalStatus ? { status: quoteDetails.status } : {})
      };

      let response;
      if (isEditMode) {
        const endpoint = projectId ? `/projects/${projectId}/` : `/quotes/${quoteId}/`;
        response = await axiosInstance.put(endpoint, payload);
      } else {
        response = await axiosInstance.post('/quotes/', payload);
      }

      if (response.status >= 200 && response.status < 300) {
        setIsDirty(false);
        toast.success(`${projectId ? 'Project' : 'Quote'} ${isEditMode ? 'updated' : 'created'} successfully`);
        if (projectId) {
          navigate(`/projects/${projectId}`);
        } else if (forProjectId) {
          navigate(`/projects/${forProjectId}?tab=Finances`);
        } else {
          navigate('/pipeline');
        }
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
      submittingRef.current = false;
      setIsSaving(false);
    }
  };

  // Browser refresh / tab close with unsaved edits gets the browser's own "leave site?" prompt.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const backPath = projectId ? `/projects/${projectId}` : forProjectId ? `/projects/${forProjectId}?tab=Finances` : '/pipeline';
  const backLabel = projectId || forProjectId ? 'Project Details' : 'Pipeline';
  // Back / Cancel: confirm first when there are unsaved edits.
  const requestLeave = () => {
    if (isDirty) {
      setIsLeaveConfirmOpen(true);
    } else {
      navigate(backPath);
    }
  };

  const handleClientAdded = (newClient: any) => {
    const clientWithPocs: Client = {
      ...newClient,
      pocs: newClient.pocs || []
    };
    setClients(prev => [...prev, clientWithPocs]);
    setQuoteDetails(prev => ({ ...prev, client: clientWithPocs.company_name, poc: '' }));
    setIsDirty(true);
    clearErrors('client', 'poc');
  };

  const handleServiceAdded = (newService: CatalogItem) => {
    if (newService.is_active && newService.can_be_sold) {
      setServices(prev => [...prev.filter(sv => sv.id !== String(newService.id)), toQuoteService(newService)]);
    }
    setIsAddServiceModalOpen(false);
  };

  // Duration strings from the budget API look like "HH:MM:SS"
  const parseHmsToHours = (hms?: string | null): number => {
    if (!hms) return 0;
    const parts = hms.split(':').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
    const [h, m, s] = parts;
    return h + m / 60 + s / 3600;
  };

  const projectBudget = projectSummary?.budget;
  const projectCurrency = projectBudget?.currency || 'INR';
  const projectTotalBudget = Number(projectBudget?.total_budget) || 0;
  const projectUsedBudget = Number(projectBudget?.used_budget) || 0;
  const projectRemainingBudget = projectBudget?.remaining_budget != null
    ? Number(projectBudget.remaining_budget)
    : Math.max(0, projectTotalBudget - projectUsedBudget);
  const projectTotalHours = Number(projectBudget?.billable_hours) || 0;
  const projectRemainingHours = parseHmsToHours(projectBudget?.remaining_billable_hours);

  const handlePOCAdded = (newPOC: POC) => {
    // Refresh clients to get the new POC in the list
    fetchClients().then(() => {
      // Auto-select the new POC
      setQuoteDetails(prev => ({ ...prev, poc: newPOC.poc_name }));
      setIsDirty(true);
    });
  };

  const pageTitle = projectId ? 'Edit Project' : quoteId ? 'Edit Quotation' : 'Create Quotation';
  const subtitle = projectId
    ? 'Update the project name, dates and client.'
    : forProjectId
      ? `A follow-up quotation for ${projectSummary?.project_name || 'this project'}; it adds to the project's budget.`
      : quoteId
        ? `Quotation #${quoteId}${isConfirmedQuote ? ' · a project exists, so its client and dates are locked' : ''}`
        : 'Add the client, line items and pricing. New quotations are saved as Confirmed.';
  const saveLabel = projectId ? 'Save Project' : quoteId ? 'Update Quotation' : 'Save Quotation';
  const pricedLines = items.filter(item => item.product).length;
  const nameError = errors.quote_name || errors.project_name;
  const issueError = errors.date_of_issue || errors.start_date;
  const dueError = errors.due_date || errors.end_date;
  const pricingError = errors.discount_percentage || errors.tax_percentage;

  return (
    <Layout userRole="admin" currentPage="pipeline" onNavigate={() => { }}>
      <div className="mx-auto w-full max-w-[1360px]">
        <header className="mb-6">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={requestLeave}
              aria-label={`Back to ${backLabel}`}
              title={`Back to ${backLabel}`}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{pageTitle}</h1>
              <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
          </div>
        </header>

        <div className="relative space-y-6">
          {isLoadingData && (
            <div role="status" className="absolute inset-0 z-20 flex items-start justify-center rounded-lg bg-white/70 pt-24 backdrop-blur-sm dark:bg-gray-950/70">
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <LoaderIcon className="h-5 w-5 animate-spin text-teal-700 dark:text-violet-300" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Loading {projectId ? 'project' : 'quotation'}…</span>
              </div>
            </div>
          )}

          {forProjectId && (
            <section aria-labelledby="project-budget-heading" className={SECTION}>
              <h2 id="project-budget-heading" className={SECTION_TITLE}>
                Current budget · {projectSummary?.project_name || 'this project'}
              </h2>
              {isLoadingProjectSummary ? (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading project budget…</p>
              ) : projectSummary ? (
                <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                  {[
                    ['Total budget', `${money(projectTotalBudget)} ${projectCurrency}`],
                    ['Used budget', `${money(projectUsedBudget)} ${projectCurrency}`],
                    ['Remaining budget', `${money(projectRemainingBudget)} ${projectCurrency}`],
                    ['Total hours', `${projectTotalHours}h`],
                    ['Remaining hours', `${projectRemainingHours.toFixed(2)}h`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No budget set for this project yet.</p>
              )}
            </section>
          )}

          <section aria-labelledby="quote-details-heading" className={SECTION}>
            <h2 id="quote-details-heading" className={SECTION_TITLE}>{projectId ? 'Project Details' : 'Quotation Details'}</h2>
            {/* min-[768px] rather than md: Tailwind orders arbitrary min-[] variants only among
                themselves, so md:grid-cols-2 would override the 1200px three-column rule. */}
            <div className="mt-4 grid grid-cols-1 gap-4 min-[768px]:grid-cols-2 min-[1200px]:grid-cols-3">
              <div>
                <label htmlFor="quote-date-of-issue" className={LABEL}>
                  Date of Issue <span className="text-red-600" aria-hidden="true">*</span>
                </label>
                <input
                  id="quote-date-of-issue"
                  type="date"
                  value={quoteDetails.dateOfIssue}
                  onChange={(e) => handleDetailChange('dateOfIssue', e.target.value)}
                  disabled={isConfirmedQuote}
                  aria-required="true"
                  aria-invalid={!!issueError}
                  aria-describedby={issueError ? 'quote-date-of-issue-error' : undefined}
                  className={fieldClass(!!issueError)}
                />
                <FieldError id="quote-date-of-issue-error" message={issueError} />
              </div>
              <div>
                <label htmlFor="quote-due-date" className={LABEL}>
                  End Date <span className="text-red-600" aria-hidden="true">*</span>
                </label>
                <input
                  id="quote-due-date"
                  type="date"
                  value={quoteDetails.dueDate}
                  onChange={(e) => handleDetailChange('dueDate', e.target.value)}
                  disabled={isConfirmedQuote}
                  aria-required="true"
                  aria-invalid={!!dueError}
                  aria-describedby={dueError ? 'quote-due-date-error' : undefined}
                  className={fieldClass(!!dueError)}
                />
                <FieldError id="quote-due-date-error" message={dueError} />
              </div>
              <div className="min-[768px]:col-span-2 min-[1200px]:col-span-1">
                <label htmlFor="quote-name" className={LABEL}>
                  {projectId ? 'Project' : 'Quote'} Name <span className="text-red-600" aria-hidden="true">*</span>
                </label>
                <input
                  id="quote-name"
                  type="text"
                  placeholder={`Enter ${projectId ? 'project' : 'quote'} name`}
                  value={quoteDetails.quoteName}
                  onChange={(e) => handleDetailChange('quoteName', e.target.value)}
                  maxLength={25}
                  disabled={isConfirmedQuote}
                  aria-required="true"
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? 'quote-name-error' : 'quote-name-hint'}
                  className={fieldClass(!!nameError)}
                />
                {nameError ? (
                  <FieldError id="quote-name-error" message={nameError} />
                ) : (
                  <p id="quote-name-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {quoteDetails.quoteName.length}/25 characters, letters and spaces only
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="quote-client" className={LABEL}>
                  Client {!projectId && <span className="text-red-600" aria-hidden="true">*</span>}
                </label>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <SearchableSelect
                      id="quote-client"
                      size="md"
                      options={clientChoices}
                      value={clientValue}
                      onChange={(option) => handleDetailChange('client', option?.label ?? '')}
                      placeholder={isLoadingData ? 'Loading clients…' : 'Search clients'}
                      emptyMessage="No clients match"
                      disabled={isLoadingData || isConfirmedQuote}
                      invalid={!!errors.client}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddClientModalOpen(true)}
                    disabled={isConfirmedQuote}
                    aria-label="Add new client"
                    title="Add new client"
                    className={`${ICON_BUTTON} h-10 w-10`}
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <FieldError id="quote-client-error" message={errors.client} />
              </div>
              <div>
                <label htmlFor="quote-poc" className={LABEL}>POC</label>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <SearchableSelect
                      id="quote-poc"
                      size="md"
                      options={pocChoices}
                      value={pocValue}
                      onChange={(option) => handleDetailChange('poc', option?.label ?? '')}
                      placeholder={!quoteDetails.client ? 'Select a client first' : pocChoices.length ? 'Search contacts' : 'No contacts yet, add one'}
                      emptyMessage="No contacts match"
                      disabled={!quoteDetails.client || isLoadingData || isConfirmedQuote}
                      invalid={!!errors.poc}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddPOCModalOpen(true)}
                    disabled={!quoteDetails.client || isConfirmedQuote}
                    aria-label="Add new contact"
                    title={quoteDetails.client ? 'Add new contact' : 'Select a client first'}
                    className={`${ICON_BUTTON} h-10 w-10`}
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <FieldError id="quote-poc-error" message={errors.poc} />
              </div>
              {/* No status on create - a new quote is saved as Confirmed */}
              {isEditMode && (
                <div>
                  <label htmlFor="quote-status" className={LABEL}>Status</label>
                  <div className="relative">
                    <select
                      id="quote-status"
                      value={quoteDetails.status}
                      onChange={(e) => handleDetailChange('status', e.target.value)}
                      disabled={isLoadingData || statusChoices.length === 0}
                      aria-invalid={!!errors.status}
                      className={`${fieldClass(!!errors.status, 'h-10 pl-3 pr-9')} appearance-none`}
                    >
                      <option value="" disabled>Select status</option>
                      {statusChoices.map(choice => (
                        <option key={choice.value} value={choice.value}>{choice.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  </div>
                  <FieldError id="quote-status-error" message={errors.status} />
                </div>
              )}
            </div>
          </section>

          {/* A project edit saves only the details above - lines and pricing belong to its quotes. */}
          {!projectId && (
            <section aria-labelledby="quote-items-heading" className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-5 pb-4">
                <h2 id="quote-items-heading" className={SECTION_TITLE}>Line Items</h2>
                <p className="text-[13px] text-gray-500 dark:text-gray-400">
                  {items.length} {items.length === 1 ? 'line' : 'lines'}{items.length > 1 ? ' · drag the handle to reorder' : ''}
                </p>
              </div>

              {items.length === 0 ? (
                <div className="mx-5 flex flex-col items-center rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
                  <ListPlus size={28} aria-hidden="true" className="text-gray-400 dark:text-gray-500" />
                  <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No line items yet</p>
                  <p className="mt-1 max-w-sm text-[13px] text-gray-500 dark:text-gray-400">
                    Add a line, then pick its group and product or service. The description, unit and price fill in from the catalog.
                  </p>
                  <button
                    type="button"
                    onClick={addNewRow}
                    className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-teal-700 px-3.5 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                  >
                    <Plus size={16} aria-hidden="true" /> Add first line
                  </button>
                </div>
              ) : (
                // relative: the sr-only header text is absolutely positioned and would otherwise
                // escape this scroll box and widen the whole page.
                <div className="relative overflow-x-auto border-y border-gray-200 dark:border-gray-800">
                  <table className="w-full min-w-[1080px] table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-10" />
                      <col className="w-[136px]" />
                      <col className="w-[220px]" />
                      <col />
                      <col className="w-[88px]" />
                      <col className="w-[116px]" />
                      <col className="w-[124px]" />
                      <col className="w-[124px]" />
                      <col className="w-12" />
                    </colgroup>
                    <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                      <tr>
                        <th scope="col" className="px-2 py-2.5"><span className="sr-only">Reorder</span></th>
                        <th scope="col" className="px-2 py-2.5 text-left">Group</th>
                        <th scope="col" className="px-2 py-2.5 text-left">Product / Service</th>
                        <th scope="col" className="px-2 py-2.5 text-left">Description</th>
                        <th scope="col" className="px-2 py-2.5 text-right">Quantity</th>
                        <th scope="col" className="px-2 py-2.5 text-left">Unit</th>
                        <th scope="col" className="px-2 py-2.5 text-right">Unit Price</th>
                        <th scope="col" className="px-2 py-2.5 text-right">Amount</th>
                        <th scope="col" className="px-2 py-2.5"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {items.map((item, index) => {
                        const kind = rowKind(item);
                        const line = `line ${index + 1}`;
                        const quantityError = errors[`item:${item.id}:quantity`];
                        const priceError = errors[`item:${item.id}:unit_price`];
                        return (
                          <tr
                            key={item.id}
                            onDragOver={(e) => { if (dragIndex !== null) e.preventDefault(); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragIndex !== null) moveRow(dragIndex, index);
                              setDragIndex(null);
                            }}
                            className={`align-top transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/40 ${dragIndex === index ? 'opacity-50' : ''}`}
                          >
                            <td className="px-2 py-2">
                              <button
                                id={`quote-line-handle-${item.id}`}
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  setDragIndex(index);
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', String(index));
                                }}
                                onDragEnd={() => setDragIndex(null)}
                                onKeyDown={(e) => {
                                  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                                  e.preventDefault();
                                  moveRow(index, e.key === 'ArrowUp' ? index - 1 : index + 1);
                                  // Moving the row re-inserts it; keep focus on its handle.
                                  requestAnimationFrame(() => document.getElementById(`quote-line-handle-${item.id}`)?.focus());
                                }}
                                aria-label={`Reorder ${line}: drag, or press the up and down arrow keys`}
                                title="Drag to reorder (or focus and use the arrow keys)"
                                className="flex h-9 w-6 cursor-grab items-center justify-center rounded text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-600 active:cursor-grabbing dark:text-gray-500 dark:hover:text-gray-300"
                              >
                                <GripVertical size={16} aria-hidden="true" />
                              </button>
                            </td>
                            <td className="px-2 py-2">
                              <div className="relative">
                                <select
                                  value={kind}
                                  onChange={(e) => handleItemChange(item.id, 'group', e.target.value)}
                                  aria-label={`Group, ${line}`}
                                  className={`${fieldClass(false, 'h-9 pl-2.5 pr-7')} appearance-none`}
                                >
                                  {groupOptions}
                                </select>
                                <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex gap-1.5">
                                <div className="min-w-0 flex-1">
                                  <SearchableSelect
                                    size="sm"
                                    portal
                                    options={productChoices(kind)}
                                    value={productValue(item.product)}
                                    onChange={(option) => option && handleItemChange(item.id, 'product', option.label)}
                                    placeholder={!kind ? 'Select group first' : kind === 'service' ? 'Search services' : 'Search products'}
                                    emptyMessage={`No ${kind === 'product' ? 'products' : 'services'} match`}
                                    disabled={!kind && !item.product}
                                    ariaLabel={`Product or service, ${line}`}
                                  />
                                </div>
                                {catalogPermissions.can_manage && (
                                  <button
                                    type="button"
                                    onClick={() => { setQuickAddKind(kind || 'service'); setIsAddServiceModalOpen(true); }}
                                    aria-label={`Add a new ${kind === 'product' ? 'product' : 'service'} to the catalog`}
                                    title={`Add a new ${kind === 'product' ? 'product' : 'service'} to the catalog`}
                                    className={`${ICON_BUTTON} h-9 w-9`}
                                  >
                                    <PackagePlus size={16} aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <textarea
                                rows={1}
                                value={item.description}
                                onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                                placeholder="Description"
                                aria-label={`Description, ${line}`}
                                className={`${fieldClass(false, 'min-h-9 px-2.5 py-[7px]')} block max-h-32 resize-y leading-5 field-sizing-content`}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={1}
                                step="any"
                                placeholder="Qty"
                                value={item.quantity || ''}
                                onChange={(e) => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                aria-label={`Quantity, ${line}`}
                                aria-invalid={!!quantityError}
                                className={`${fieldClass(!!quantityError, 'h-9 px-2.5')} text-right tabular-nums`}
                              />
                              {quantityError && <p className="mt-1 text-right text-[11px] leading-4 text-red-600 dark:text-red-400">{quantityError}</p>}
                            </td>
                            <td className="px-2 py-2">
                              <div className="relative">
                                <select
                                  value={item.unit}
                                  onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                                  disabled={isLoadingData || unitChoices.length === 0}
                                  aria-label={`Unit, ${line}`}
                                  className={`${fieldClass(false, 'h-9 pl-2.5 pr-7')} appearance-none`}
                                >
                                  {unitChoices.map(choice => (
                                    <option key={choice.value} value={choice.value}>{choice.label}</option>
                                  ))}
                                </select>
                                <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                placeholder="0.00"
                                value={item.unit_price || ''}
                                onChange={(e) => handleItemChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                aria-label={`Unit price, ${line}`}
                                aria-invalid={!!priceError}
                                className={`${fieldClass(!!priceError, 'h-9 px-2.5')} text-right tabular-nums`}
                              />
                              {priceError && <p className="mt-1 text-right text-[11px] leading-4 text-red-600 dark:text-red-400">{priceError}</p>}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span className="inline-flex h-9 items-center font-semibold tabular-nums text-gray-900 dark:text-white">
                                {money(calculateRowTotal(item))}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => removeRow(item.id)}
                                aria-label={`Delete ${line}`}
                                title="Delete line"
                                className="flex h-9 w-9 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col gap-6 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={addNewRow}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-teal-700 hover:border-teal-600 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:border-gray-700 dark:bg-gray-800 dark:text-violet-300 dark:hover:bg-gray-700"
                    >
                      <Plus size={16} aria-hidden="true" /> Add row
                    </button>
                  )}
                  <FieldError id="quote-items-error" message={errors.items} />
                </div>

                <div role="group" aria-labelledby="quote-pricing-heading" className="w-full lg:max-w-sm">
                  <h3 id="quote-pricing-heading" className="sr-only">Pricing summary</h3>
                  {/* Discount comes off the Subtotal first; tax is on the amount after it. */}
                  <div className="grid grid-cols-[1fr_auto_8.5rem] items-center gap-x-3 gap-y-2.5 text-sm">
                    <span className="col-span-2 text-gray-600 dark:text-gray-400">Subtotal</span>
                    <span className="text-right tabular-nums text-gray-900 dark:text-gray-100">{money(subTotal)}</span>

                    <label htmlFor="quote-discount" className="text-gray-600 dark:text-gray-400">Discount</label>
                    <div className="relative w-20">
                      <input
                        id="quote-discount"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.01"
                        placeholder="0"
                        value={discountPercentage || ''}
                        onChange={(e) => {
                          setDiscountPercentage(Math.min(Math.max(parseFloat(e.target.value) || 0, 0), 100));
                          setIsDirty(true);
                          clearErrors('discount_percentage');
                        }}
                        className={`${fieldClass(!!errors.discount_percentage, 'h-9 pl-2 pr-6')} text-right tabular-nums`}
                      />
                      <span aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">%</span>
                    </div>
                    <span className="text-right tabular-nums text-gray-900 dark:text-gray-100">{discountAmount > 0 ? '−' : ''}{money(discountAmount)}</span>

                    <span className="col-span-2 font-medium text-gray-900 dark:text-gray-100">Amount After Discount</span>
                    <span className="text-right font-medium tabular-nums text-gray-900 dark:text-gray-100">{money(taxableAmount)}</span>

                    <label htmlFor="quote-tax" className="text-gray-600 dark:text-gray-400">Tax</label>
                    <div className="relative w-20">
                      <select
                        id="quote-tax"
                        value={taxPercentage}
                        onChange={(e) => {
                          setTaxPercentage(parseFloat(e.target.value));
                          setIsDirty(true);
                          clearErrors('tax_percentage');
                        }}
                        className={`${fieldClass(!!errors.tax_percentage, 'h-9 pl-2 pr-6')} appearance-none`}
                      >
                        <option value="0">0 %</option>
                        <option value="5">5 %</option>
                        <option value="10">10 %</option>
                        <option value="18">18 %</option>
                      </select>
                      <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                    </div>
                    <span className="text-right tabular-nums text-gray-900 dark:text-gray-100">{money(taxAmount)}</span>

                    {pricingError && (
                      <p className="col-span-3 text-xs text-red-600 dark:text-red-400">{pricingError}</p>
                    )}

                    <div className="col-span-3 -mx-3 mt-1 flex items-baseline justify-between gap-3 rounded-md bg-teal-50 px-3 py-2.5 dark:bg-violet-500/10">
                      <span className="font-semibold text-gray-900 dark:text-white">Total Quotation Amount</span>
                      <span className="text-lg font-bold tabular-nums text-teal-800 dark:text-violet-200">
                        {currency && <span className="mr-1 text-xs font-semibold text-gray-500 dark:text-gray-400">{currency}</span>}
                        {money(total)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="sticky bottom-4 z-10 rounded-lg border border-gray-200 bg-white/95 px-5 py-3 shadow-[0_-4px_16px_-8px_rgba(15,23,42,0.18)] backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 [@media(max-height:649px)]:static">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] text-gray-500 dark:text-gray-400">
                {!projectId && (
                  <>
                    Total{' '}
                    <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{currency ? `${currency} ` : ''}{money(total)}</span>
                    {' · '}{pricedLines} {pricedLines === 1 ? 'line' : 'lines'}
                  </>
                )}
                {isDirty && <span className="font-medium text-amber-700 dark:text-amber-400">{projectId ? '' : ' · '}Unsaved changes</span>}
              </p>
              <div className="flex gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={requestLeave}
                  disabled={isSaving}
                  className="h-10 flex-1 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSaving || isLoadingData}
                  aria-busy={isSaving}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none dark:focus:ring-offset-gray-900"
                >
                  {isSaving && <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {isSaving ? 'Saving…' : saveLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AddClientModal
        isOpen={isAddClientModalOpen}
        onClose={() => setIsAddClientModalOpen(false)}
        onClientAdded={handleClientAdded}
      />

      {isAddPOCModalOpen && selectedClient && (
        <AddPOCModal
          companyId={selectedClient.id}
          companyName={selectedClient.company_name}
          onSave={handlePOCAdded}
          onClose={() => setIsAddPOCModalOpen(false)}
        />
      )}

      <ProductServiceDrawer
        isOpen={isAddServiceModalOpen}
        item={null}
        kind={quickAddKind}
        permissions={catalogPermissions}
        onClose={() => setIsAddServiceModalOpen(false)}
        onSaved={handleServiceAdded}
      />

      <ConfirmDialog
        isOpen={isLeaveConfirmOpen}
        onClose={() => setIsLeaveConfirmOpen(false)}
        onConfirm={() => {
          setIsLeaveConfirmOpen(false);
          setIsDirty(false);
          navigate(backPath);
        }}
        title="Discard unsaved changes?"
        message="You have changes on this quotation that haven't been saved. If you leave now, they'll be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
      />
    </Layout>
  );
}
