import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter } from 'lucide-react';
import type { DropResult } from '@hello-pangea/dnd';
import axiosInstance from '../utils/axiosInstance';
import { ReusableTable, type Column } from '../components/ReusableTable';
import { StatusBadge } from '../components/StatusBadge';
import { AddTaskModal } from '../components/AddTaskModal';
import { AssignTaskModal } from '../components/AssignTaskModal';
import { AddExpenseModal } from '../components/AddExpenseModal';
import { BudgetLinesPanel } from '../components/BudgetLinesPanel';
import { MilestonesPanel } from '../components/MilestonesPanel';
import { ResourcesPanel } from '../components/ResourcesPanel';
import { FinancialSummaryPanel } from '../components/FinancialSummaryPanel';
import { FreelancerAssignmentsPanel } from '../components/FreelancerAssignmentsPanel';
import { TaskBoardView } from '../components/TaskBoardView';
import { TaskCalendarView } from '../components/TaskCalendarView';
import { TaskGanttView } from '../components/TaskGanttView';
import { ProjectTimeTrackingView } from '../components/ProjectTimeTrackingView';
import { toast } from 'react-hot-toast';
import { parseApiErrors } from '../utils/parseApiErrors';
import store from '../store/store';

const fmtCurrency = (value: number | string | null | undefined, currency?: string) =>
    `${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || 'INR'}`;

interface Task {
    id: string;
    assignee: string;
    assigneeAvatar: string;
    title: string;
    status: 'Planned' | 'In Progress' | 'Completed' | 'Needs Attention';
    activityType: string;
    allocatedHours: string;
    consumedHours: string;
    dueDate: string;
    dueDateRaw: string | null;
    remaining: string;
    // Clean numeric hours (decimal), used by the Time/Budget views instead of
    // the inconsistently-formatted display strings above.
    allocatedHoursNum: number;
    consumedHoursNum: number;
    remainingHoursNum: number;
}

const TASK_STATUS_TO_API: Record<Task['status'], string> = {
    'Planned': 'planned',
    'In Progress': 'in_progress',
    'Completed': 'completed',
    'Needs Attention': 'needs_attention',
};

interface Payment {
    id: number;
    date: string;
    type: 'Incoming' | 'Outgoing';
    amount: number;
    clientVendor: string;
    reference: string;
    paymentMethod: string;
}

interface ProjectDetailsPageProps {
    userRole: 'admin' | 'user' | 'manager';
    currentPage: string;
    onNavigate: (page: string) => void;
}

const ProjectDetailsPage: React.FC<ProjectDetailsPageProps> = ({ userRole, currentPage, onNavigate }) => {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<string>('Tasks');
    const [activeSubTab, setActiveSubTab] = useState<string>('Task list');
    const [budgetSubTab, setBudgetSubTab] = useState<string>('Budget health');
    const [budgetViewMode, setBudgetViewMode] = useState<string>('Budget');
    const [paymentSearch, setPaymentSearch] = useState<string>('');
    const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>('All');
    const [showPaymentFilter, setShowPaymentFilter] = useState<boolean>(false);
    const [expenseSearch, setExpenseSearch] = useState<string>('');
    const [invoiceSearch, setInvoiceSearch] = useState<string>('');
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
    const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<any | null>(null);
    const [isAssignTaskModalOpen, setIsAssignTaskModalOpen] = useState(false);
    const [selectedTaskForAssignment, setSelectedTaskForAssignment] = useState<Task | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = useState(true);
    const [firstQuoteId, setFirstQuoteId] = useState<number | null>(null);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const [projectQuotes, setProjectQuotes] = useState<any[]>([]);
    const [isLoadingQuotation, setIsLoadingQuotation] = useState(false);
    const [payments, setPayments] = useState<any[]>([]);
    const [isLoadingPayments, setIsLoadingPayments] = useState(false);
    const [paymentSummary, setPaymentSummary] = useState<any>(null);
    const [outgoingPayments, setOutgoingPayments] = useState<any[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
    const [isLoadingPOs, setIsLoadingPOs] = useState(false);
    const [bills, setBills] = useState<any[]>([]);
    const [isLoadingBills, setIsLoadingBills] = useState(false);
    const [billsSummary, setBillsSummary] = useState<any>(null);
    const [attachments, setAttachments] = useState<any[]>([]);
    const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
    const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
    // GL Account id -> "CODE - Name" display label, for the Expenses tab table.
    // The expense list endpoint only returns the gl_account id, so this is
    // fetched from the same endpoint AddExpenseModal already uses.
    const [glAccountsById, setGlAccountsById] = useState<Record<number, string>>({});

    // Handle tab query parameter
    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam) {
            setActiveTab(tabParam);
        }
    }, [searchParams]);

    // Helper function to map API task data to component Task interface
    const mapApiTaskToTask = (task: any): Task => {
        // Normalize status: capitalize first letter
        let normalizedStatus = task.status || 'planned';
        if (normalizedStatus === 'planned') normalizedStatus = 'Planned';
        else if (normalizedStatus === 'in_progress' || normalizedStatus === 'in progress') normalizedStatus = 'In Progress';
        else if (normalizedStatus === 'completed') normalizedStatus = 'Completed';
        else if (normalizedStatus === 'needs_attention' || normalizedStatus === 'needs attention') normalizedStatus = 'Needs Attention';

        const allocatedHoursNum = Number(task.allocated_hours) || 0;
        const consumedHoursNum = Number(task.consumed_hours) || 0;
        const remainingHoursNum = task.remaining_hours != null ? Number(task.remaining_hours) : Math.max(0, allocatedHoursNum - consumedHoursNum);

        return {
            id: task.id?.toString() || '',
            assignee: task.assigned_to?.username || 'Unassigned',
            assigneeAvatar: task.assigned_to?.username?.substring(0, 2).toUpperCase() || '○',
            title: task.title || 'Untitled Task',
            status: normalizedStatus as Task['status'],
            activityType: task.activity_type || 'Development',
            allocatedHours: task.allocated_formatted || (task.allocated_hours ? `${task.allocated_hours}h` : '0h'),
            consumedHours: task.consumed_formatted || (task.consumed_hours ? `${task.consumed_hours}h` : '0h'),
            dueDate: task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'TBD',
            dueDateRaw: task.due_date || null,
            remaining: task.remaining_formatted_hms || (task.remaining_hours ? `${task.remaining_hours}h` : task.allocated_hours ? `${task.allocated_hours}h` : '0h'),
            allocatedHoursNum,
            consumedHoursNum,
            remainingHoursNum,
        };
    };


    useEffect(() => {
        const fetchProjectDetails = async () => {
            if (!projectId) return;
            try {
                const response = await axiosInstance.get(`/projects/${projectId}/`);
                const projectData = response.data;
                setProject(projectData);

                // Log contacts data for debugging
                console.log('Project data from API:', projectData);
                if (projectData.contacts && Array.isArray(projectData.contacts)) {
                    console.log('Project contacts from API:', projectData.contacts);
                }

                // Log budget data for debugging
                console.log('Budget fields:', {
                    budget: projectData.budget,
                    total_budget: projectData.total_budget,
                    project_budget: projectData.project_budget,
                    allocated_budget: projectData.allocated_budget,
                    budgets: projectData.budgets
                });

                // Extract invoices from project data
                if (projectData.invoices && Array.isArray(projectData.invoices)) {
                    console.log('Project invoices from API:', projectData.invoices);
                    setInvoices(projectData.invoices);
                }
            } catch (error) {
                console.error('Error fetching project details:', error);
            } finally {
                setLoading(false);
            }
        };

        const fetchProjectTasks = async () => {
            if (!projectId) return;
            setIsLoadingTasks(true);
            try {
                // Fetch tasks from api/tasks/{projectId}/tasks/
                const response = await axiosInstance.get(`/tasks/${projectId}/tasks/`);
                console.log('Tasks API response:', response.data);

                // Response is an array, get the first element which contains Tasks
                if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                    const projectTasksData = response.data[0];
                    if (projectTasksData.Tasks && Array.isArray(projectTasksData.Tasks)) {
                        console.log('Project tasks from API:', projectTasksData.Tasks);
                        const mappedTasks: Task[] = projectTasksData.Tasks.map(mapApiTaskToTask);
                        setTasks(mappedTasks);
                    }
                }
            } catch (error) {
                console.error('Error fetching project tasks:', error);
            } finally {
                setIsLoadingTasks(false);
            }
        };

        fetchProjectDetails();
        fetchProjectTasks();
        fetchFirstQuote();
        fetchAttachments();
    }, [projectId]);

    // Invoices are only ever populated from this one project-detail fetch,
    // which the mount effect above runs once. Anything that creates an
    // invoice elsewhere on this page (Milestones tab billing, T&M period
    // billing in Financial Summary) has no way to tell that effect to
    // re-run, so the Finances tab kept showing stale ("No invoices") data
    // until a full page reload. Refetching whenever the Finances tab is
    // opened keeps it current without needing every child component to
    // know about the parent's state.
    const refreshInvoices = useCallback(async () => {
        if (!projectId) return;
        setIsLoadingInvoices(true);
        try {
            const response = await axiosInstance.get(`/projects/${projectId}/`);
            const projectData = response.data;
            setProject(projectData);
            if (projectData.invoices && Array.isArray(projectData.invoices)) {
                setInvoices(projectData.invoices);
            }
        } catch (error) {
            console.error('Error refreshing invoices:', error);
        } finally {
            setIsLoadingInvoices(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (activeTab === 'Invoices') {
            refreshInvoices();
        }
    }, [activeTab, refreshInvoices]);

    // Fetch first available quote for invoice generation
    const fetchFirstQuote = async () => {
        try {
            const response = await axiosInstance.get('/pipeline-data/');
            if (response.data && response.data.stages) {
                // Find first quote from any stage
                for (const stage of response.data.stages) {
                    if (stage.quotes && stage.quotes.length > 0) {
                        setFirstQuoteId(stage.quotes[0].quote_no);
                        return;
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching quotes:', error);
        }
    };

    // Fetch payments for all project invoices
    const fetchProjectPayments = async () => {
        if (!projectId) {
            setPayments([]);
            setOutgoingPayments([]);
            setPaymentSummary(null);
            return;
        }

        try {
            setIsLoadingPayments(true);
            // Fetch payments using the project payments list endpoint
            const response = await axiosInstance.get(`/projects/${projectId}/payments-list/`);

            console.log('Project payments response:', response.data);

            // Extract payments from the new API structure
            if (response.data) {
                const { incoming, outgoing, summary } = response.data;

                // Set incoming payments
                setPayments(incoming?.payments || []);

                // Set outgoing payments
                setOutgoingPayments(outgoing?.payments || []);

                // Set payment summary
                setPaymentSummary({
                    total_invoiced: incoming?.total_received || 0,
                    invoice_count: incoming?.invoice_count || 0,
                    total_payments: incoming?.total_received || 0,
                    payment_count: incoming?.payment_count || 0,
                    outgoing_total_payments: outgoing?.total_paid || 0,
                    outgoing_payment_count: (outgoing?.purchase_order_payment_count || 0) + (outgoing?.expense_payment_count || 0),
                    net_balance: summary?.net_balance || 0
                });
            } else {
                setPayments([]);
                setOutgoingPayments([]);
                setPaymentSummary(null);
            }
        } catch (error) {
            console.error('Error fetching payments:', error);
            setPayments([]);
            setOutgoingPayments([]);
            setPaymentSummary(null);
        } finally {
            setIsLoadingPayments(false);
        }
    };

    // Fetch every quote linked to this project (the original quote it was
    // created from, plus any follow-up/phase quotes added afterwards)
    const fetchProjectQuotes = async () => {
        if (!projectId) return;
        try {
            setIsLoadingQuotation(true);
            const response = await axiosInstance.get(`/quotes/?project=${projectId}`);
            const quotesForProject: any[] = response.data || [];

            // The quote a project was originally created from is linked via
            // Project.created_from_quotation, not Quote.project, so fetch it
            // separately and merge it in if it isn't already in the list.
            if (project?.created_from_quotation &&
                !quotesForProject.some((q) => q.quote_no === project.created_from_quotation)) {
                try {
                    const originalQuote = await axiosInstance.get(`/quotes/${project.created_from_quotation}/`);
                    quotesForProject.push(originalQuote.data);
                } catch (err) {
                    console.error('Error fetching originating quote:', err);
                }
            }

            setProjectQuotes(quotesForProject);
        } catch (error) {
            console.error('Error fetching project quotes:', error);
            setProjectQuotes([]);
        } finally {
            setIsLoadingQuotation(false);
        }
    };

    // Fetch purchase orders for the project
    const fetchPurchaseOrders = async () => {
        if (!projectId) return;

        try {
            setIsLoadingPOs(true);
            const response = await axiosInstance.get(`/projects/${projectId}/purchase-orders/`);
            if (response.status === 200 && response.data.purchase_orders) {
                setPurchaseOrders(response.data.purchase_orders);
                console.log('Fetched purchase orders:', response.data.purchase_orders);
            }
        } catch (error) {
            console.error('Error fetching purchase orders:', error);
        } finally {
            setIsLoadingPOs(false);
        }
    };

    // Fetch bills (outgoing payments) for the project
    const fetchBills = async () => {
        if (!projectId) return;

        try {
            setIsLoadingBills(true);
            const response = await axiosInstance.get(`/projects/${projectId}/outgoing-payments/`);
            if (response.status === 200) {
                // Use vendor_bills from the response
                setBills(response.data.vendor_bills || []);
                setBillsSummary({
                    total_paid: response.data.total_paid,
                    project_name: response.data.project_name,
                    project_no: response.data.project_no,
                    payment_count: response.data.debug?.payment_count || 0,
                    vendor_bill_count: response.data.debug?.vendor_bill_count || 0
                });
                console.log('Fetched bills:', response.data);
            }
        } catch (error) {
            console.error('Error fetching bills:', error);
        } finally {
            setIsLoadingBills(false);
        }
    };

    // Fetch attachments for the project
    const fetchAttachments = async () => {
        if (!projectId) return;

        try {
            setIsLoadingAttachments(true);
            const response = await axiosInstance.get(`/projects/${projectId}/attachments/`);
            setAttachments(response.data || []);
            console.log('Fetched attachments:', response.data);
        } catch (error) {
            console.error('Error fetching attachments:', error);
            toast.error('Failed to load attachments');
        } finally {
            setIsLoadingAttachments(false);
        }
    };

    // Handle file selection and upload
    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !projectId) return;

        setIsUploading(true);

        // Create FormData with only file and category
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'other');

        try {
            // Don't set Content-Type - let browser handle it automatically
            await axiosInstance.post(`/projects/${projectId}/attachments/`, formData);
            toast.success('File uploaded successfully');
            fetchAttachments();
        } catch (error) {
            console.error('Error uploading file:', error);
            toast.error('Failed to upload file');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Handle file download
    const handleFileDownload = async (attachment: any) => {
        try {
            const response = await axiosInstance.get(`/attachments/${attachment.id}/download/`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', attachment.file_name);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error downloading file:', error);
            toast.error('Failed to download file');
        }
    };

    // Get file icon based on file type
    const getFileIcon = (fileType: string) => {
        if (fileType.includes('pdf')) return '📄';
        if (fileType.includes('image')) return '🖼️';
        if (fileType.includes('spreadsheet') || fileType.includes('excel')) return '📊';
        if (fileType.includes('word') || fileType.includes('document')) return '📝';
        if (fileType.includes('zip') || fileType.includes('compressed')) return '📦';
        return '📎';
    };

    // Format file size
    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    // Fetch expenses for the project
    const fetchExpenses = async () => {
        if (!projectId) return;

        try {
            setIsLoadingExpenses(true);
            const response = await axiosInstance.get(`/expenses/?project=${projectId}`);
            setExpenses(response.data || []);
            console.log('Fetched expenses:', response.data);
        } catch (error) {
            console.error('Error fetching expenses:', error);
            toast.error('Failed to load expenses');
        } finally {
            setIsLoadingExpenses(false);
        }
    };

    // Handle expense added
    const handleExpenseAdded = async () => {
        console.log('Expense added, refreshing list...');
        await fetchExpenses();
    };

    // Fetch GL Accounts (id -> "CODE - Name") for the Expenses tab's GL Account
    // column - the expense list endpoint only returns the gl_account id.
    // Reuses the same endpoint AddExpenseModal already calls for its GL
    // Account picker.
    const fetchGlAccountsForExpenses = async () => {
        try {
            const response = await axiosInstance.get<{ id: number; code: string; name: string }[]>(
                '/gl-accounts/?active_only=true'
            );
            const map: Record<number, string> = {};
            (response.data || []).forEach((acc) => {
                map[acc.id] = `${acc.code} - ${acc.name}`;
            });
            setGlAccountsById(map);
        } catch (error) {
            console.error('Error fetching GL accounts for expenses table:', error);
        }
    };



    // Fetch quotes when Finances tab is active
    useEffect(() => {
        if (activeTab === 'Finances') {
            // Fetch every quote linked to this project (original + phase quotes)
            fetchProjectQuotes();
            // Fetch purchase orders
            fetchPurchaseOrders();
            // Fetch bills (outgoing payments)
            fetchBills();
        }
        if (activeTab === 'Expenses') {
            fetchExpenses();
        }
        if (activeTab === 'Expenses') {
            fetchGlAccountsForExpenses();
        }
    }, [activeTab, projectId, project]);


    // Fetch payments when the Payments tab, or the Budget tab's Revenue/Profit
    // sub-tabs (which reuse the same invoiced/received figures), are active.
    useEffect(() => {
        if (activeTab === 'Payments' || activeTab === 'Budget') {
            fetchProjectPayments();
        }
    }, [activeTab, projectId]);

    const handleTaskAdded = async (newTask: any) => {
        console.log('Task created for project:', newTask);

        // Refetch tasks to get updated list
        try {
            const response = await axiosInstance.get(`/tasks/${projectId}/tasks/`);
            if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                const projectTasksData = response.data[0];
                if (projectTasksData.Tasks && Array.isArray(projectTasksData.Tasks)) {
                    const mappedTasks: Task[] = projectTasksData.Tasks.map(mapApiTaskToTask);
                    setTasks(mappedTasks);
                }
            }
        } catch (error) {
            console.error('Error refetching tasks:', error);
        }

        // toast.success('Task added successfully!');
    };

    const handleUpdateTask = async (taskId: string, updates: any) => {
        try {
            const response = await axiosInstance.patch(`tasks/${taskId}/`, updates);
            if (response.status === 200 || response.status === 204) {
                toast.success('Task updated');
                const updatedApiTask = response.data?.task || response.data;
                setTasks(prev => prev.map(t => t.id === taskId ? mapApiTaskToTask(updatedApiTask) : t));
            }
        } catch (error) {
            console.error('Failed to update task:', error);
            toast.error('Failed to update task');
        }
    };

    // Re-fetches a single task (e.g. after starting/pausing its timer, which
    // flips status server-side) and merges it back into the tasks list.
    const refreshTaskById = async (taskId: string) => {
        try {
            const resp = await axiosInstance.get(`tasks/${taskId}/`);
            setTasks(prev => prev.map(t => t.id === taskId ? mapApiTaskToTask(resp.data) : t));
        } catch (err) {
            console.error('Failed to refresh task after timer change', err);
        }
    };

    // Opens a task in the edit modal — shared by the Task list, Task Board, Calendar and Gantt views.
    const openTaskForEdit = async (taskId: string) => {
        try {
            const resp = await axiosInstance.get(`tasks/${taskId}/`);
            setSelectedTaskForEdit(resp.data);
            setIsAddTaskModalOpen(true);
        } catch (err) {
            console.error('Failed to fetch task details', err);
            toast.error('Failed to load task for editing');
        }
    };

    // Drag-and-drop handler for the Task Board (Kanban) view — moves a task between
    // status columns, optimistically updating the UI and reverting on failure
    // (mirrors the pattern used by the Pipeline board's drag-and-drop).
    const handleTaskDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result;
        if (!destination || destination.droppableId === source.droppableId) return;

        const newStatus = destination.droppableId as Task['status'];
        const taskId = draggableId;
        const previousTasks = tasks;

        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

        try {
            await axiosInstance.patch(`tasks/${taskId}/`, { status: TASK_STATUS_TO_API[newStatus] });
            toast.success(`Task moved to ${newStatus}`);
        } catch (error) {
            console.error('Failed to update task status:', error);
            const apiErrors = parseApiErrors(error);
            toast.error(apiErrors.general || 'Failed to update task status');
            setTasks(previousTasks);
        }
    };

    const handleAssignmentSuccess = async (taskId: string, userId: number) => {
        console.log('Task assigned:', taskId, 'to user:', userId);

        // Refetch tasks to get updated assignee information
        try {
            const response = await axiosInstance.get(`/tasks/${projectId}/tasks/`);
            if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                const projectTasksData = response.data[0];
                if (projectTasksData.Tasks && Array.isArray(projectTasksData.Tasks)) {
                    const mappedTasks: Task[] = projectTasksData.Tasks.map(mapApiTaskToTask);
                    setTasks(mappedTasks);
                }
            }
        } catch (error) {
            console.error('Error refetching tasks:', error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Planned':
                return 'bg-purple-500 text-white';
            case 'In Progress':
                return 'bg-green-500 text-white';
            case 'Completed':
                return 'bg-blue-500 text-white';
            case 'Needs Attention':
                return 'bg-red-500 text-white';
            default:
                return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300';
        }
    };

    // Converts a backend "HH:MM:SS" string (e.g. remaining_billable_hours) to decimal hours.
    const parseHmsToHours = (hms?: string | null): number => {
        if (!hms) return 0;
        const parts = hms.split(':').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
        const [h, m, s] = parts;
        return h + m / 60 + s / 3600;
    };

    const formatHoursHM = (hours: number): string => {
        const totalMinutes = Math.max(0, Math.round(hours * 60));
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h}:${String(m).padStart(2, '0')}`;
    };

    // Real budget/hours figures for the KPI cards, sourced from project.budget
    // (backend ProjectBudgetSerializer — includes any timer running right now).
    const budgetTotalHours = Number(project?.budget?.billable_hours) || 0;
    const budgetRemainingHours = parseHmsToHours(project?.budget?.remaining_billable_hours);
    const budgetConsumedHours = Math.max(0, budgetTotalHours - budgetRemainingHours);
    const consumedHoursPercent = budgetTotalHours > 0 ? Math.round((budgetConsumedHours / budgetTotalHours) * 100) : 0;
    const remainingHoursPercent = budgetTotalHours > 0 ? Math.round((budgetRemainingHours / budgetTotalHours) * 100) : 0;

    // cost_budget excludes tax and profit margin (in_house + outsourced cost
    // only), unlike total_budget which mirrors the client-facing quote total
    // (sub_total + tax) - this is the figure "budget used/remaining" should
    // be measured against.
    const totalBudgetAmount = Number(project?.budget?.cost_budget) || 0;
    const usedBudgetAmount = Number(project?.budget?.used_budget) || 0;
    const budgetUsedPercent = totalBudgetAmount > 0 ? Math.round((usedBudgetAmount / totalBudgetAmount) * 100) : 0;
    const remainingBudgetAmount = project?.budget?.remaining_budget != null
        ? Number(project.budget.remaining_budget)
        : Math.max(0, totalBudgetAmount - usedBudgetAmount);
    const budgetCurrency = project?.budget?.currency || 'INR';

    // Project Types and Project Financial Management: only show the tab
    // relevant to this project's engagement model (Fixed -> Milestones,
    // T&M -> Resources); Financial Summary is common to both.
    const engagementType: 'fixed' | 'time_and_material' = project?.engagement_type || 'fixed';
    const mainTabs = [
        'Tasks', 'Time', 'Budget', 'Expenses', 'Invoices',
        ...(engagementType === 'fixed' ? ['Milestones'] : ['Resources']),
        'Financials',
        'Details', 'Payments', 'Finances',
    ];

    const budgetHealth = totalBudgetAmount <= 0
        ? { label: 'No budget set', className: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300', bar: 'bg-gray-400' }
        : budgetUsedPercent >= 100
            ? { label: 'Over budget', className: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300', bar: 'bg-red-500' }
            : budgetUsedPercent >= 80
                ? { label: 'At risk', className: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' }
                : { label: 'On track', className: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-300', bar: 'bg-green-500' };

    // Revenue: quoted amount (contracted value, shown for reference only) vs.
    // what's actually been invoiced and received. Invoiced/received come from
    // the same payments summary the Payment tab already fetches.
    const quotedRevenueAmount = project?.budget?.quoted_amount != null ? Number(project.budget.quoted_amount) : null;
    const totalInvoicedAmount = Number(paymentSummary?.total_invoiced) || 0;
    const totalReceivedAmount = Number(paymentSummary?.total_payments) || 0;
    const outstandingRevenueAmount = Math.max(0, totalInvoicedAmount - totalReceivedAmount);
    const revenueReceivedPercent = totalInvoicedAmount > 0 ? Math.round((totalReceivedAmount / totalInvoicedAmount) * 100) : 0;

    // Profit: actual invoiced revenue minus actual cost (labor + expenses) —
    // NOT the quoted/contracted value, so profit only appears once revenue has
    // actually been invoiced. Used consistently by both Budget health and the
    // Profit tab so the two never disagree.
    const profitOrLoss = totalInvoicedAmount > 0 ? totalInvoicedAmount - usedBudgetAmount : null;
    const profitMarginPercent = profitOrLoss !== null && totalInvoicedAmount > 0
        ? Math.round((profitOrLoss / totalInvoicedAmount) * 100)
        : null;

    // Forecasted Profit: budget - bills & expenses, straight from the backend's
    // ProjectBudget.forecasted_profit (same figure used in Reports > Project
    // Reports). Shown only pre-invoice, as a clearly-labeled estimate — it is
    // never used for the Healthy/Loss-making badge above, which stays tied to
    // realized (invoiced) profit only.
    const forecastedProfitAmount = project?.budget?.forecasted_profit != null
        ? Number(project.budget.forecasted_profit)
        : null;

    const currentUsername = store.getState().auth.username;

    const overdueTasksCount = tasks.filter(t => {
        if (!t.dueDateRaw || t.status === 'Completed') return false;
        return new Date(t.dueDateRaw) < new Date(new Date().toDateString());
    }).length;

    if (loading) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="flex items-center justify-center h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </Layout>
        );
    }

    if (!project) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="flex items-center justify-center h-screen">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Project Not Found</h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">The project you are looking for does not exist or you don't have permission to view it.</p>
                        <button
                            onClick={() => navigate('/projects')}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Back to Projects
                        </button>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header Section */}
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                    {/* Top Row: Project # + Status Badge + Action Buttons */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">#{project.project_no || projectId}</span>
                            <span className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold ${getStatusColor(project.status || 'In Progress')}`}>
                                {project.status || 'In Progress'}
                            </span>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setActiveTab('Budget')}
                                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors duration-200"
                            >
                                Monthly Budget
                            </button>
                        </div>
                    </div>

                    {/* Project Title */}
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{project.project_name}</h1>
                </div>

                {/* Stats Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Billable hours</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{formatHoursHM(budgetTotalHours)}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">h</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{formatHoursHM(budgetConsumedHours)}h consumed ({consumedHoursPercent}%)</p>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Remaining Billable hours</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{formatHoursHM(budgetRemainingHours)}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">h</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{remainingHoursPercent}% of total</p>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">User budget</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{totalBudgetAmount.toLocaleString()} {project?.budget?.currency || 'INR'}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                            Used: {usedBudgetAmount.toLocaleString()} {project?.budget?.currency || 'INR'} ({budgetUsedPercent}%)
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Overdue tasks</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{overdueTasksCount}</p>
                    </div>
                </div>

                {/* Tabs Section */}
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
                    {/* Main Tabs */}
                    <div className="border-b border-gray-200 dark:border-gray-800 px-6">
                        <div className="flex gap-8 overflow-x-auto">
                            {mainTabs.map((tab) => (
                                <button
                                    type="button"
                                    key={tab}
                                    onClick={() => {
                                        setActiveTab(tab);
                                        if (tab === 'Tasks') {
                                            setActiveSubTab('Task list');
                                        }
                                    }}
                                    className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab
                                        ? 'text-gray-900 dark:text-white border-blue-600'
                                        : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sub Tabs - Only for Tasks */}
                    {activeTab === 'Tasks' && (
                        <div className="border-b border-gray-200 dark:border-gray-800 px-6 bg-gray-50 dark:bg-gray-800">
                            <div className="flex gap-6 overflow-x-auto">
                                {['Task list', 'Gantt', 'Task Board', 'Calendar'].map((subTab) => (
                                    <button
                                        key={subTab}
                                        onClick={() => setActiveSubTab(subTab)}
                                        className={`py-3 px-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${activeSubTab === subTab
                                            ? 'text-gray-900 dark:text-white border-gray-900'
                                            : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-white'
                                            }`}
                                    >
                                        {subTab}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tab Content */}
                    <div className="p-6">
                        {activeTab === 'Tasks' && (
                            <>
                                {activeSubTab === 'Task list' && (
                                    <>
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="border-b border-gray-200 dark:border-gray-800">
                                                        <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 py-3 px-3">Assignee</th>
                                                        <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 py-3 px-3">Task title</th>
                                                        <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 py-3 px-3">Status</th>
                                                        <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 py-3 px-3">Activity type</th>
                                                        <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 py-3 px-3">Allocated hours</th>
                                                        <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 py-3 px-3">Consumed hours</th>
                                                        <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 py-3 px-3">Due date</th>
                                                        <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 py-3 px-3">Remaining</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {isLoadingTasks ? (
                                                        <tr>
                                                            <td colSpan={8} className="py-12 text-center">
                                                                <div className="flex flex-col items-center justify-center">
                                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                                                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading tasks...</p>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : tasks.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={8} className="py-12 text-center">
                                                                <p className="text-sm text-gray-500 dark:text-gray-400">No tasks found for this project. Click "Add task" to create one.</p>
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        tasks.map((task) => (
                                                            <tr key={task.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                                                                <td className="py-4 px-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${task.assignee !== 'Unassigned'
                                                                            ? 'bg-blue-600 text-white'
                                                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-700'
                                                                            }`}
                                                                            title={task.assignee}
                                                                        >
                                                                            {task.assigneeAvatar}
                                                                        </div>
                                                                        <span className="text-sm text-gray-900 dark:text-white">&gt;</span>
                                                                        <button
                                                                            onClick={() => {
                                                                                setSelectedTaskForAssignment(task);
                                                                                setIsAssignTaskModalOpen(true);
                                                                            }}
                                                                            className="w-6 h-6 rounded-full border-2 border-dotted border-gray-400 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/15 transition-all cursor-pointer flex items-center justify-center"
                                                                            title={task.assignee !== 'Unassigned' ? 'Reassign task' : 'Assign task'}
                                                                        >
                                                                            <Plus className="w-3 h-3 text-gray-400 dark:text-gray-500 hover:text-blue-500" />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                                <td
                                                                    onClick={() => openTaskForEdit(task.id)}
                                                                    className="py-4 px-3 text-sm text-gray-900 dark:text-white cursor-pointer"
                                                                >{task.title}</td>
                                                                <td className="py-4 px-3">
                                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                                                                        {task.status}
                                                                    </span>
                                                                </td>
                                                                <td className="py-4 px-3 text-sm text-gray-600 dark:text-gray-400">{task.activityType}</td>
                                                                <td className="py-4 px-3 text-sm text-gray-900 dark:text-white">{task.allocatedHours}</td>
                                                                <td className="py-4 px-3 text-sm text-gray-900 dark:text-white">{task.consumedHours}</td>
                                                                <td className="py-4 px-3 text-sm text-gray-600 dark:text-gray-400">{task.dueDate}</td>
                                                                <td className="py-4 px-3 text-sm text-gray-600 dark:text-gray-400">{task.remaining}</td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="mt-6">
                                            <button
                                                onClick={() => setIsAddTaskModalOpen(true)}
                                                className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Add task
                                            </button>
                                        </div>
                                    </>
                                )}

                                {activeSubTab === 'Gantt' && (
                                    <TaskGanttView
                                        tasks={tasks}
                                        projectStartDate={project?.start_date}
                                        projectEndDate={project?.end_date}
                                        onTaskClick={(task) => openTaskForEdit(task.id)}
                                    />
                                )}

                                {activeSubTab === 'Task Board' && (
                                    <TaskBoardView
                                        tasks={tasks}
                                        onDragEnd={handleTaskDragEnd}
                                        onTaskClick={(task) => openTaskForEdit(task.id)}
                                    />
                                )}

                                {activeSubTab === 'Calendar' && (
                                    <TaskCalendarView
                                        tasks={tasks}
                                        onTaskClick={(task) => openTaskForEdit(task.id)}
                                    />
                                )}
                            </>
                        )}

                        {activeTab === 'Time' && (
                            <ProjectTimeTrackingView
                                tasks={tasks}
                                currentUsername={currentUsername}
                                onTimerChange={refreshTaskById}
                            />
                        )}

                        {activeTab === 'Budget' && (
                            <div className="space-y-6">
                                {/* Budget Sub Tabs: Budget health, Revenue, Profit */}
                                <div className="border-b border-gray-200 dark:border-gray-800">
                                    <div className="flex gap-6">
                                        {['Budget health', 'Revenue', 'Profit', 'GL Accounts'].map((subTab) => (
                                            <button
                                                key={subTab}
                                                type="button"
                                                className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${budgetSubTab === subTab
                                                    ? 'text-gray-900 dark:text-white border-blue-600'
                                                    : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-white'
                                                    }`}
                                                onClick={() => setBudgetSubTab(subTab)}
                                            >
                                                {subTab}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Budget Health Content */}
                                {budgetSubTab === 'Budget health' && (
                                    <div className="space-y-4">
                                        {/* Budget/Time Toggle */}
                                        <div className="flex justify-end mb-4">
                                            <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                                                {['Budget', 'Time'].map((mode) => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => setBudgetViewMode(mode)}
                                                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${budgetViewMode === mode
                                                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                                            }`}
                                                    >
                                                        {mode}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                                <div className={`rounded-lg border p-4 ${budgetHealth.className}`}>
                                                    <p className="text-sm font-semibold">{budgetHealth.label}</p>
                                                    <p className="text-xs mt-0.5 opacity-80">
                                                        {totalBudgetAmount > 0
                                                            ? `${budgetUsedPercent}% of budget used so far`
                                                            : 'Set a budget on this project to track spend against it.'}
                                                    </p>
                                                </div>

                                                {budgetViewMode === 'Budget' ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Budget</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{totalBudgetAmount.toLocaleString()} {budgetCurrency}</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Used Budget</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{usedBudgetAmount.toLocaleString()} {budgetCurrency}</p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{budgetUsedPercent}% of total</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Remaining Budget</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{remainingBudgetAmount.toLocaleString()} {budgetCurrency}</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Billable Hours</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{formatHoursHM(budgetTotalHours)}</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Consumed Hours</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{formatHoursHM(budgetConsumedHours)}</p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{consumedHoursPercent}% of total</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Remaining Hours</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{formatHoursHM(budgetRemainingHours)}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                <div>
                                                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        <span>Budget used</span>
                                                        <span>{budgetUsedPercent}%</span>
                                                    </div>
                                                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full ${budgetHealth.bar} transition-all`}
                                                            style={{ width: `${Math.min(100, budgetUsedPercent)}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                {profitOrLoss !== null ? (
                                                    <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                                                        <span className="text-sm text-gray-600 dark:text-gray-400">Profit / Loss (invoiced revenue − actual spend)</span>
                                                        <span className={`text-lg font-bold ${profitOrLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {profitOrLoss.toLocaleString()} {budgetCurrency}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-gray-400 dark:text-gray-500">No invoices raised yet — profit will show once this project has been invoiced.</p>
                                                )}
                                    </div>
                                )}

                                {/* Revenue Content */}
                                {budgetSubTab === 'Revenue' && (() => {
                                    const revenueStatus = totalInvoicedAmount <= 0
                                        ? { label: 'Not yet invoiced', className: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300', bar: 'bg-gray-400' }
                                        : revenueReceivedPercent >= 100
                                            ? { label: 'Fully collected', className: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-300', bar: 'bg-green-500' }
                                            : revenueReceivedPercent > 0
                                                ? { label: 'Partially collected', className: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' }
                                                : { label: 'Awaiting payment', className: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300', bar: 'bg-red-500' };

                                    return (
                                        <div className="space-y-4">
                                            <div className={`rounded-lg border p-4 ${revenueStatus.className}`}>
                                                <p className="text-sm font-semibold">{revenueStatus.label}</p>
                                                <p className="text-xs mt-0.5 opacity-80">
                                                    {totalInvoicedAmount > 0
                                                        ? `${revenueReceivedPercent}% of invoiced revenue received`
                                                        : 'Create an invoice for this project to start tracking revenue.'}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Quoted Revenue</p>
                                                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                                                        {quotedRevenueAmount != null ? `${quotedRevenueAmount.toLocaleString()} ${budgetCurrency}` : 'Not linked to a quote'}
                                                    </p>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Invoiced</p>
                                                    <p className="text-xl font-bold text-gray-900 dark:text-white">{totalInvoicedAmount.toLocaleString()} {budgetCurrency}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{paymentSummary?.invoice_count || 0} invoices</p>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Received</p>
                                                    <p className="text-xl font-bold text-green-600 dark:text-green-400">{totalReceivedAmount.toLocaleString()} {budgetCurrency}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{revenueReceivedPercent}% of invoiced</p>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                    <span>Received of invoiced</span>
                                                    <span>{revenueReceivedPercent}%</span>
                                                </div>
                                                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                    <div className={`h-full ${revenueStatus.bar} transition-all`} style={{ width: `${Math.min(100, revenueReceivedPercent)}%` }} />
                                                </div>
                                            </div>

                                            {outstandingRevenueAmount > 0 && (
                                                <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">Outstanding (invoiced but not yet received)</span>
                                                    <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{outstandingRevenueAmount.toLocaleString()} {budgetCurrency}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Profit Content */}
                                {budgetSubTab === 'Profit' && (
                                    profitOrLoss === null ? (
                                        <div className="space-y-4">
                                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-800 p-4 text-center">
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    No invoices have been raised for this project yet, so realized profit can't be calculated.
                                                    Shown below is a forecast instead, based on the project's budget - it will be replaced by real invoiced profit once an invoice is created.
                                                </p>
                                            </div>
                                            {forecastedProfitAmount !== null && (
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Budget</p>
                                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{(Number(project?.budget?.cost_budget) || 0).toLocaleString()} {budgetCurrency}</p>
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Bills & Expenses</p>
                                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{(Number(project?.budget?.actual_expenses) || 0).toLocaleString()} {budgetCurrency}</p>
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Forecasted Profit</p>
                                                        <p className={`text-xl font-bold ${forecastedProfitAmount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {forecastedProfitAmount.toLocaleString()} {budgetCurrency}
                                                        </p>
                                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Estimate - Budget − Bills & Expenses</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (() => {
                                        const profitStatus = profitOrLoss < 0
                                            ? { label: 'Loss-making', className: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300' }
                                            : (profitMarginPercent ?? 0) < 20
                                                ? { label: 'Low margin', className: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300' }
                                                : { label: 'Healthy margin', className: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-300' };
                                        const costPercentOfRevenue = totalInvoicedAmount > 0
                                            ? Math.min(100, Math.round((usedBudgetAmount / totalInvoicedAmount) * 100))
                                            : 0;

                                        return (
                                            <div className="space-y-4">
                                                <div className={`rounded-lg border p-4 ${profitStatus.className}`}>
                                                    <p className="text-sm font-semibold">{profitStatus.label}</p>
                                                    <p className="text-xs mt-0.5 opacity-80">
                                                        {profitMarginPercent != null ? `${profitMarginPercent}% profit margin` : ''}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Invoiced Revenue</p>
                                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{totalInvoicedAmount.toLocaleString()} {budgetCurrency}</p>
                                                        {quotedRevenueAmount != null && (
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Quoted: {quotedRevenueAmount.toLocaleString()} {budgetCurrency}</p>
                                                        )}
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Actual Cost</p>
                                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{usedBudgetAmount.toLocaleString()} {budgetCurrency}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Labor + expenses</p>
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Profit / Loss</p>
                                                        <p className={`text-xl font-bold ${profitOrLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {profitOrLoss.toLocaleString()} {budgetCurrency}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        <span>Cost as % of invoiced revenue</span>
                                                        <span>{costPercentOfRevenue}%</span>
                                                    </div>
                                                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                        <div className={`h-full ${profitOrLoss >= 0 ? 'bg-red-400' : 'bg-red-600'} transition-all`} style={{ width: `${costPercentOfRevenue}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                )}

                                {/* GL Accounts Content — Budget Lines per GL Account */}
                                {budgetSubTab === 'GL Accounts' && projectId && (
                                    <BudgetLinesPanel projectId={projectId} currency={budgetCurrency} />
                                )}
                            </div>
                        )}

                        {/* Expenses — dedicated tab. The Finances tab below keeps its own
                            Expenses accordion section too (not removed); this is additive. */}
                        {activeTab === 'Expenses' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Expenses</h3>
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-64">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            <input
                                                type="text"
                                                placeholder="Search expenses..."
                                                value={expenseSearch}
                                                onChange={(e) => setExpenseSearch(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-gray-100"
                                            />
                                        </div>
                                        <button
                                            onClick={() => setIsAddExpenseModalOpen(true)}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Add Expense
                                        </button>
                                    </div>
                                </div>

                                {isLoadingExpenses ? (
                                    <div className="text-center py-12">
                                        <div className="inline-flex flex-col items-center">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading expenses...</p>
                                        </div>
                                    </div>
                                ) : (() => {
                                    const searchLower = expenseSearch.toLowerCase();
                                    const filteredExpenses = expenses.filter((expense: any) => {
                                        if (!searchLower) return true;
                                        return (
                                            expense.expense_no?.toLowerCase().includes(searchLower) ||
                                            expense.category?.toLowerCase().includes(searchLower) ||
                                            expense.description?.toLowerCase().includes(searchLower) ||
                                            expense.freelancer_name?.toLowerCase().includes(searchLower) ||
                                            expense.employee_name?.toLowerCase().includes(searchLower)
                                        );
                                    });

                                    const expenseColumns: Column<any>[] = [
                                        {
                                            header: 'Expense No',
                                            accessor: (expense) => (
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {expense.expense_no}
                                                </span>
                                            ),
                                        },
                                        {
                                            header: 'Date',
                                            accessor: (expense) => expense.expense_date
                                                ? new Date(expense.expense_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                                : '-',
                                        },
                                        {
                                            header: 'Category',
                                            accessor: (expense) => expense.category
                                                ? (expense.category.charAt(0).toUpperCase() + expense.category.slice(1)).replace(/_/g, ' ')
                                                : '-',
                                        },
                                        {
                                            header: 'Description',
                                            accessor: (expense) => (
                                                <span className="text-sm text-gray-600 dark:text-gray-300">{expense.description || '-'}</span>
                                            ),
                                        },
                                        {
                                            header: 'Amount',
                                            accessor: (expense) => (
                                                <span className="font-semibold text-gray-900 dark:text-white">
                                                    ₹{parseFloat(expense.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            ),
                                        },
                                        {
                                            header: 'Status',
                                            accessor: (expense) => {
                                                const isPaid = expense.is_fully_paid;
                                                const isPartial = !isPaid && Number(expense.total_paid) > 0;
                                                const status = isPaid ? 'paid' : isPartial ? 'partially_paid' : 'unpaid';
                                                const variant: 'success' | 'warning' | 'neutral' = isPaid ? 'success' : isPartial ? 'warning' : 'neutral';
                                                const label = isPaid ? 'Paid' : isPartial ? 'Partially Paid' : 'Unpaid';
                                                return <StatusBadge status={status} variant={variant} label={label} />;
                                            },
                                        },
                                        {
                                            header: 'GL Account',
                                            accessor: (expense) => expense.gl_account
                                                ? (glAccountsById[expense.gl_account] || `#${expense.gl_account}`)
                                                : '-',
                                        },
                                        {
                                            header: 'Employee / Freelancer / Vendor',
                                            accessor: (expense) => expense.freelancer_name || expense.employee_name || expense.vendor_name || '-',
                                        },
                                    ];

                                    return (
                                        <ReusableTable<any>
                                            data={filteredExpenses}
                                            columns={expenseColumns}
                                            keyField="id"
                                            onRowClick={(expense) => navigate(`/expenses/${expense.id}`)}
                                            emptyMessage="No expenses found for this project"
                                        />
                                    );
                                })()}
                            </div>
                        )}

                        {/* Invoices — dedicated tab. The Finances tab below keeps its own
                            Invoices accordion section too (not removed); this is additive. */}
                        {activeTab === 'Invoices' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Invoices</h3>
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-64">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            <input
                                                type="text"
                                                placeholder="Search invoices..."
                                                value={invoiceSearch}
                                                onChange={(e) => setInvoiceSearch(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-gray-100"
                                            />
                                        </div>
                                        <button
                                            onClick={() => {
                                                const quotationId = project?.created_from_quotation;
                                                if (quotationId) {
                                                    navigate(`/generate-invoice/${quotationId}`);
                                                } else {
                                                    toast.error('No quotation associated with this project.');
                                                }
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Generate Invoice
                                        </button>
                                    </div>
                                </div>

                                {isLoadingInvoices ? (
                                    <div className="text-center py-12">
                                        <div className="inline-flex flex-col items-center">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading invoices...</p>
                                        </div>
                                    </div>
                                ) : (() => {
                                    const searchLower = invoiceSearch.toLowerCase();
                                    const filteredInvoices = invoices.filter((invoice: any) => {
                                        if (!searchLower) return true;
                                        return (
                                            invoice.invoice_no?.toLowerCase().includes(searchLower) ||
                                            invoice.status?.toLowerCase().includes(searchLower) ||
                                            invoice.status_display?.toLowerCase().includes(searchLower)
                                        );
                                    });

                                    const invoiceStatusVariant = (status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' => {
                                        switch (status) {
                                            case 'Paid': return 'success';
                                            case 'Issued': return 'info';
                                            case 'Partially Paid': return 'warning';
                                            case 'Overdue': return 'danger';
                                            case 'Draft':
                                            case 'Cancelled':
                                            default: return 'neutral';
                                        }
                                    };

                                    const invoiceColumns: Column<any>[] = [
                                        {
                                            header: 'Invoice No',
                                            accessor: (invoice) => (
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {invoice.invoice_no || `Invoice #${invoice.id}`}
                                                </span>
                                            ),
                                        },
                                        {
                                            header: 'Issue Date',
                                            accessor: (invoice) => invoice.issue_date
                                                ? new Date(invoice.issue_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                                : '-',
                                        },
                                        {
                                            header: 'Due Date',
                                            accessor: (invoice) => invoice.due_date
                                                ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                                : '-',
                                        },
                                        {
                                            header: 'Amount',
                                            accessor: (invoice) => (
                                                <span className="font-semibold text-gray-900 dark:text-white">
                                                    ₹{parseFloat(invoice.total_amount ?? invoice.total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            ),
                                        },
                                        {
                                            header: 'Paid',
                                            accessor: (invoice) => `₹${parseFloat(invoice.paid_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                        },
                                        {
                                            header: 'Outstanding',
                                            accessor: (invoice) => `₹${parseFloat(invoice.balance_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                        },
                                        {
                                            header: 'Status',
                                            accessor: (invoice) => {
                                                const status = invoice.status || 'Draft';
                                                return (
                                                    <StatusBadge
                                                        status={status}
                                                        variant={invoiceStatusVariant(status)}
                                                        label={invoice.status_display || status}
                                                    />
                                                );
                                            },
                                        },
                                    ];

                                    return (
                                        <ReusableTable<any>
                                            data={filteredInvoices}
                                            columns={invoiceColumns}
                                            keyField="id"
                                            onRowClick={(invoice) => navigate(`/invoices/${invoice.id}`)}
                                            emptyMessage="No invoices found for this project"
                                        />
                                    );
                                })()}
                            </div>
                        )}

                        {/* Milestones — Fixed Budget / Milestone-Based projects only */}
                        {activeTab === 'Milestones' && projectId && (
                            <MilestonesPanel projectId={projectId} currency={budgetCurrency} />
                        )}

                        {/* Resources — Time & Material projects only */}
                        {activeTab === 'Resources' && projectId && (
                            <ResourcesPanel projectId={projectId} currency={budgetCurrency} />
                        )}

                        {/* Financial Summary — common to both engagement types */}
                        {activeTab === 'Financials' && projectId && (
                            <>
                                <FreelancerAssignmentsPanel projectId={projectId} />
                                <FinancialSummaryPanel projectId={projectId} engagementType={engagementType} currency={budgetCurrency} />
                            </>
                        )}

                        {activeTab === 'Finances' && (
                            <div className="space-y-4">
                                {/* Quotes Section */}
                                <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                                    <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between transition-colors">
                                        <h3 className="font-semibold text-blue-600 dark:text-blue-400 text-sm">Quotes</h3>
                                        <button
                                            onClick={() => navigate(
                                                `/pipeline/add-quote?forProject=${projectId}`,
                                                { state: { clientName: project?.company_name } }
                                            )}
                                            className="text-black-800 dark:text-gray-300 text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400"
                                        >
                                            New Quote
                                        </button>
                                    </div>
                                    <div className="px-6 py-4 bg-white dark:bg-gray-900">
                                        {isLoadingQuotation ? (
                                            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading quotes...</p>
                                        ) : projectQuotes.length > 0 ? (
                                            <div className="space-y-2">
                                                {projectQuotes.map((quote) => (
                                                    <div
                                                        key={quote.quote_no}
                                                        onClick={() => navigate(`/pipeline/quote/${quote.quote_no}`)}
                                                        className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors border border-gray-100 dark:border-gray-800"
                                                    >
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-3">
                                                                <span className="font-medium text-gray-900 dark:text-white">
                                                                    Quote #{quote.quote_no}
                                                                </span>
                                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${quote.status === 'Confirmed'
                                                                    ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300'
                                                                    : quote.status === 'Sent'
                                                                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                                                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                                    }`}>
                                                                    {quote.status || 'Draft'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                                <span>{quote.quote_name || 'Untitled Quote'}</span>
                                                                <span>Amount: ₹{quote.total_amount || '0'}</span>
                                                                {quote.date_of_issue && (
                                                                    <span>Date: {new Date(quote.date_of_issue).toLocaleDateString()}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 dark:text-gray-400 text-sm">No quotes to display</p>
                                        )}
                                    </div>
                                </div>

                                {/* Purchase Orders Section */}
                                <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                                    <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between transition-colors">
                                        <h3 className="font-semibold text-blue-600 dark:text-blue-400 text-sm">Purchase orders</h3>
                                        <button
                                            onClick={() => {
                                                const quotationId = project?.created_from_quotation;
                                                if (quotationId) {
                                                    navigate(`/create-purchase-order/${quotationId}`);
                                                } else {
                                                    toast.error('No quotation associated with this project.');
                                                }
                                            }}
                                            className="text-black-800 dark:text-gray-300 text-sm font-medium hover:text-blue-700 dark:hover:text-blue-300"
                                        >
                                            New Purchase Order
                                        </button>
                                    </div>
                                    <div className="px-6 py-4 bg-white dark:bg-gray-900">
                                        {isLoadingPOs ? (
                                            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading purchase orders...</p>
                                        ) : purchaseOrders.length === 0 ? (
                                            <p className="text-gray-500 dark:text-gray-400 text-sm">No purchase orders to display</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {purchaseOrders.map((po: any) => (
                                                    <div
                                                        key={po.po_id}
                                                        onClick={() => navigate(`/purchase-orders/${po.po_id}`)}
                                                        className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors border border-gray-100 dark:border-gray-800"
                                                    >
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-3">
                                                                <span className="font-medium text-gray-900 dark:text-white">
                                                                    {po.po_no}
                                                                </span>
                                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${po.status === 'confirmed' || po.status === 'completed'
                                                                    ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300'
                                                                    : po.status === 'sent'
                                                                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                                                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                                    }`}>
                                                                    {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                                <span>Vendor: {po.vendor_name}</span>
                                                                <span>Amount: ₹{parseFloat(po.total_amount).toLocaleString('en-IN')}</span>
                                                                <span>Items: {po.items_count}</span>
                                                                {po.issue_date && (
                                                                    <span>Date: {new Date(po.issue_date).toLocaleDateString()}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Bills Section */}
                                <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                                    <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between transition-colors">
                                        <div>
                                            <h3 className="font-semibold text-blue-600 dark:text-blue-400 text-sm">Bills</h3>
                                            {billsSummary && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    Total Paid: ₹{parseFloat(billsSummary.total_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="px-6 py-4 bg-white dark:bg-gray-900">
                                        {isLoadingBills ? (
                                            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading bills...</p>
                                        ) : bills.length === 0 ? (
                                            <p className="text-gray-500 dark:text-gray-400 text-sm">No bills to display</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {bills.map((bill: any) => {
                                                    // Get status badge color
                                                    const getStatusBadge = (status: string) => {
                                                        switch (status?.toLowerCase()) {
                                                            case 'paid':
                                                                return 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300';
                                                            case 'partially_paid':
                                                                return 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300';
                                                            case 'unpaid':
                                                                return 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300';
                                                            default:
                                                                return 'bg-gray-100 dark:bg-gray-800 text-gray-800';
                                                        }
                                                    };

                                                    // Format status text
                                                    const formatStatus = (status: string) => {
                                                        return status?.replace('_', ' ').split(' ').map(word =>
                                                            word.charAt(0).toUpperCase() + word.slice(1)
                                                        ).join(' ') || 'Unknown';
                                                    };

                                                    return (
                                                        <div
                                                            key={bill.id}
                                                            onClick={() => {
                                                                // Navigate to bill details page using the bill id
                                                                navigate(`/bills/${bill.id}`);
                                                            }}
                                                            className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors border border-gray-100 dark:border-gray-800"
                                                        >
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                                        {bill.bill_no}
                                                                    </span>
                                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                        PO: {bill.po_no}
                                                                    </span>
                                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(bill.status)}`}>
                                                                        {formatStatus(bill.status)}
                                                                    </span>
                                                                    {bill.payment_count > 0 && (
                                                                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium">
                                                                            {bill.payment_count} {bill.payment_count === 1 ? 'Payment' : 'Payments'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                                    <span>Vendor: {bill.vendor}</span>
                                                                    <span>Total: ₹{parseFloat(bill.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                    <span>Paid: ₹{parseFloat(bill.paid_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                    <span>Balance: ₹{parseFloat(bill.balance_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                </div>
                                                            </div>
                                                            <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                            </svg>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        )}

                        {activeTab === 'Details' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Left Column */}
                                <div className="space-y-6">
                                    {/* Project Info Section */}
                                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">

                                        <div className="px-6 py-6 bg-white dark:bg-gray-900">
                                            {project ? (
                                                <div className="space-y-4">
                                                    {/* Project Name */}
                                                    {project.project_name && (
                                                        <div>
                                                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Project Name</label>
                                                            <p className="text-sm text-gray-900 dark:text-white mt-1">{project.project_name}</p>
                                                        </div>
                                                    )}

                                                    {/* Budget */}
                                                    <div>
                                                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Budget</label>
                                                        <p className="text-sm text-gray-900 dark:text-white mt-1">
                                                            ₹{(() => {
                                                                // Handle nested budget object structure as per user's API response
                                                                const val = project.budget?.total_budget ||
                                                                    project.budget ||
                                                                    project.total_budget ||
                                                                    project.project_budget ||
                                                                    project.cost ||
                                                                    project.value ||
                                                                    '0';
                                                                const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
                                                                return (isNaN(num) ? 0 : num).toLocaleString('en-IN', {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2
                                                                });
                                                            })()}
                                                        </p>
                                                    </div>

                                                    {/* Start Date */}
                                                    {project.start_date && (
                                                        <div>
                                                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Start Date</label>
                                                            <p className="text-sm text-gray-900 dark:text-white mt-1">
                                                                {new Date(project.start_date).toLocaleDateString('en-GB', {
                                                                    day: '2-digit',
                                                                    month: 'short',
                                                                    year: 'numeric'
                                                                })}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* End Date */}
                                                    {project.end_date && (
                                                        <div>
                                                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">End Date</label>
                                                            <p className="text-sm text-gray-900 dark:text-white mt-1">
                                                                {new Date(project.end_date).toLocaleDateString('en-GB', {
                                                                    day: '2-digit',
                                                                    month: 'short',
                                                                    year: 'numeric'
                                                                })}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Project Type */}
                                                    {project.project_type && (
                                                        <div>
                                                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Project Type</label>
                                                            <p className="text-sm text-gray-900 dark:text-white mt-1 capitalize">{project.project_type}</p>
                                                        </div>
                                                    )}

                                                    {/* Call Center */}
                                                    {project.call_center_name && (
                                                        <div>
                                                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Call Center</label>
                                                            <p className="text-sm text-gray-900 dark:text-white mt-1">{project.call_center_name}</p>
                                                        </div>
                                                    )}

                                                    {/* Profit Center */}
                                                    {project.profit_center_name && (
                                                        <div>
                                                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Profit Center</label>
                                                            <p className="text-sm text-gray-900 dark:text-white mt-1">{project.profit_center_name}</p>
                                                        </div>
                                                    )}

                                                    {/* GL Account */}
                                                    {project.gl_account_name && (
                                                        <div>
                                                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">GL Account</label>
                                                            <p className="text-sm text-gray-900 dark:text-white mt-1">
                                                                {project.gl_account_code ? `${project.gl_account_code} - ` : ''}{project.gl_account_name}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-gray-500 dark:text-gray-400 text-sm">No project info to display</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Project Contract Section (Fixed Budget only) */}
                                    {project && project.engagement_type === 'fixed' && project.contract_value != null && (
                                        <div className="border border-gray-200 rounded-lg overflow-hidden dark:border-gray-800">
                                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800">
                                                <h3 className="font-semibold text-gray-900 text-sm dark:text-white">Project Contract</h3>
                                            </div>
                                            <div className="px-6 py-6 bg-white dark:bg-gray-900">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Contract Value</label>
                                                        <p className="text-sm font-semibold text-gray-900 mt-1 dark:text-white">
                                                            {fmtCurrency(project.contract_value, project.budget?.currency || project.currency)}
                                                        </p>
                                                        {project.created_from_quotation && (
                                                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Excluding GST</p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Project %</label>
                                                        <p className="text-sm font-semibold text-gray-900 mt-1 dark:text-white">
                                                            {project.project_percentage != null ? `${project.project_percentage}%` : '—'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Profit Margin</label>
                                                        <p className="text-sm font-semibold text-gray-900 mt-1 dark:text-white">
                                                            {project.project_amount != null
                                                                ? fmtCurrency(project.project_amount, project.budget?.currency || project.currency)
                                                                : '—'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Remaining Amount</label>
                                                        <p className="text-sm font-semibold text-gray-900 mt-1 dark:text-white">
                                                            {project.remaining_amount != null
                                                                ? fmtCurrency(project.remaining_amount, project.budget?.currency || project.currency)
                                                                : '—'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Files Section */}
                                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                                        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                                            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Files</h3>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                onChange={handleFileSelect}
                                                className="hidden"
                                            />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isUploading}
                                                className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <span>{isUploading ? '⌛' : '📎'}</span> {isUploading ? 'Uploading...' : 'Add Files'}
                                            </button>
                                        </div>
                                        <div className="px-6 py-6 bg-white dark:bg-gray-900">
                                            {isLoadingAttachments ? (
                                                <p className="text-gray-500 dark:text-gray-400 text-sm">Loading files...</p>
                                            ) : attachments.length > 0 ? (
                                                <div className="space-y-3">
                                                    {attachments.map((attachment: any) => (
                                                        <div
                                                            key={attachment.id}
                                                            className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                                        >
                                                            <div className="flex items-center gap-3 flex-1">
                                                                <span className="text-2xl">{getFileIcon(attachment.file_type)}</span>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                                            {attachment.file_name}
                                                                        </p>
                                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${attachment.category === 'contract' ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300' :
                                                                            attachment.category === 'invoice' ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300' :
                                                                                attachment.category === 'report' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' :
                                                                                    attachment.category === 'proposal' ? 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-300' :
                                                                                        'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                                            }`}>
                                                                            {attachment.category}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                                        <span>{formatFileSize(attachment.file_size)}</span>
                                                                        <span>•</span>
                                                                        <span>{attachment.uploaded_by_name}</span>
                                                                        <span>•</span>
                                                                        <span>{new Date(attachment.uploaded_at).toLocaleDateString('en-GB', {
                                                                            day: '2-digit',
                                                                            month: 'short',
                                                                            year: 'numeric'
                                                                        })}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleFileDownload(attachment)}
                                                                className="ml-3 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/15 rounded-md transition-colors"
                                                            >
                                                                Download
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-gray-500 dark:text-gray-400 text-sm">No Files to display</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column */}
                                <div className="space-y-6">
                                    {/* Related Contacts Section */}
                                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                                        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                                            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Related Contacts</h3>

                                        </div>
                                        <div className="px-6 py-6 bg-white dark:bg-gray-900">
                                            {project?.contacts && project.contacts.length > 0 ? (
                                                <div className="space-y-3">
                                                    {project.contacts.map((contact: any) => (
                                                        <div
                                                            key={contact.id}
                                                            className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                                        >
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                                                                        {contact.poc_name}
                                                                    </h4>
                                                                    {contact.designation && (
                                                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                                            {contact.designation}
                                                                        </p>
                                                                    )}
                                                                    {contact.company_name && (
                                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                                            {contact.company_name}
                                                                        </p>
                                                                    )}
                                                                    <div className="mt-2 space-y-1">
                                                                        {contact.poc_email && (
                                                                            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                                                </svg>
                                                                                <a
                                                                                    href={`mailto:${contact.poc_email}`}
                                                                                    className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                                                                                >
                                                                                    {contact.poc_email}
                                                                                </a>
                                                                            </div>
                                                                        )}
                                                                        {contact.poc_mobile && (
                                                                            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                                                </svg>
                                                                                <a
                                                                                    href={`tel:${contact.poc_mobile}`}
                                                                                    className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                                                                                >
                                                                                    {contact.poc_mobile}
                                                                                </a>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-gray-500 dark:text-gray-400 text-sm">No Contacts to display</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Payments' && (
                            <div className="space-y-6">
                                {/* Payment Summary Cards */}
                                {!isLoadingPayments && paymentSummary && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Total Invoiced</p>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">₹{parseFloat(paymentSummary.total_invoiced || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{paymentSummary.invoice_count || 0} invoices</p>
                                        </div>
                                        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Incoming Payments</p>
                                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">+₹{parseFloat(paymentSummary.total_payments || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{paymentSummary.payment_count || 0} payments</p>
                                        </div>
                                        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Outgoing Payments</p>
                                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">-₹{parseFloat(paymentSummary.outgoing_total_payments || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{paymentSummary.outgoing_payment_count || 0} payments</p>
                                        </div>
                                        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Net Balance</p>
                                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                                ₹{parseFloat(paymentSummary.net_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Incoming - Outgoing</p>
                                        </div>
                                    </div>
                                )}

                                {/* Filter and Search Bar */}
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Payment History</h3>
                                    <div className="flex items-center gap-3">
                                        {/* Payment Type Filter */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowPaymentFilter(!showPaymentFilter)}
                                                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                            >
                                                <Filter className="w-4 h-4" />
                                                {paymentTypeFilter}
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            {showPaymentFilter && (
                                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-10">
                                                    {['All', 'Incoming', 'Outgoing'].map((type) => (
                                                        <button
                                                            key={type}
                                                            onClick={() => {
                                                                setPaymentTypeFilter(type);
                                                                setShowPaymentFilter(false);
                                                            }}
                                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${paymentTypeFilter === type ? 'bg-gray-100 dark:bg-gray-800 font-medium' : ''
                                                                }`}
                                                        >
                                                            {type}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Search */}
                                        <div className="relative w-64">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            <input
                                                type="text"
                                                placeholder="Search payments..."
                                                value={paymentSearch}
                                                onChange={(e) => setPaymentSearch(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Unified Payments Table */}
                                {isLoadingPayments ? (
                                    <div className="text-center py-12">
                                        <div className="inline-flex flex-col items-center">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading payments...</p>
                                        </div>
                                    </div>
                                ) : (() => {
                                    // Combine and filter payments
                                    const allPayments = [
                                        ...payments.map(p => ({ ...p, type: 'Incoming' })),
                                        ...outgoingPayments.map(p => ({ ...p, type: 'Outgoing', payment_type: p.type }))
                                    ];

                                    const filteredPayments = allPayments.filter(payment => {
                                        // Type filter
                                        if (paymentTypeFilter !== 'All' && payment.type !== paymentTypeFilter) {
                                            return false;
                                        }

                                        // Search filter
                                        const searchLower = paymentSearch.toLowerCase();
                                        const searchMatch = paymentSearch === '' ||
                                            payment.invoice_no?.toLowerCase().includes(searchLower) ||
                                            payment.bill_no?.toLowerCase().includes(searchLower) ||
                                            payment.po_no?.toLowerCase().includes(searchLower) ||
                                            payment.expense_no?.toLowerCase().includes(searchLower) ||
                                            payment.vendor?.toLowerCase().includes(searchLower) ||
                                            payment.reference_no?.toLowerCase().includes(searchLower) ||
                                            payment.payment_method?.toLowerCase().includes(searchLower) ||
                                            payment.created_by?.toLowerCase().includes(searchLower) ||
                                            payment.created_by_name?.toLowerCase().includes(searchLower) ||
                                            payment.category?.toLowerCase().includes(searchLower);

                                        return searchMatch;
                                    });

                                    return (
                                        <ReusableTable<any>
                                            data={filteredPayments}
                                            columns={[
                                                {
                                                    header: 'TYPE',
                                                    accessor: (payment) => (
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${payment.type === 'Incoming'
                                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                            }`}>
                                                            {payment.type}
                                                        </span>
                                                    ),
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'REFERENCE',
                                                    accessor: (payment) => {
                                                        if (payment.type === 'Incoming') {
                                                            return (
                                                                <span
                                                                    onClick={() => navigate(`/invoices/${payment.invoice_id}`)}
                                                                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                                                                >
                                                                    {payment.invoice_no}
                                                                </span>
                                                            );
                                                        } else {
                                                            // Outgoing payment - check if it's purchase_order or expense
                                                            if (payment.payment_type === 'purchase_order') {
                                                                return (
                                                                    <div className="flex flex-col gap-1">
                                                                        <span
                                                                            onClick={() => navigate(`/bills/${payment.id}`)}
                                                                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                                                                        >
                                                                            {payment.bill_no}
                                                                        </span>
                                                                        {payment.po_no && (
                                                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                                PO: {payment.po_no}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            } else if (payment.payment_type === 'expense') {
                                                                return (
                                                                    <div className="flex flex-col gap-1">
                                                                        <span
                                                                            onClick={() => navigate(`/expenses/${payment.id}`)}
                                                                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                                                                        >
                                                                            {payment.expense_no}
                                                                        </span>
                                                                        {payment.category && (
                                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300">
                                                                                {payment.category.charAt(0).toUpperCase() + payment.category.slice(1)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            }
                                                        }
                                                        return '-';
                                                    },
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'PARTY',
                                                    accessor: (payment) => {
                                                        let party = '-';
                                                        if (payment.type === 'Incoming') {
                                                            party = payment.created_by || payment.created_by_name || '-';
                                                        } else {
                                                            // For outgoing, show vendor for PO payments, or category for expenses
                                                            if (payment.payment_type === 'purchase_order') {
                                                                party = payment.vendor || '-';
                                                            } else if (payment.payment_type === 'expense') {
                                                                party = payment.vendor || 'Internal';
                                                            }
                                                        }
                                                        return <span className="text-sm text-gray-900 dark:text-white">{party}</span>;
                                                    },
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'PAYMENT DATE',
                                                    accessor: (payment) => new Date(payment.payment_date).toLocaleDateString('en-GB', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    }),
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'AMOUNT',
                                                    accessor: (payment) => (
                                                        <span className="font-semibold text-gray-900 dark:text-white">
                                                            {payment.type === 'Incoming' ? '+' : '-'}₹{parseFloat(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    ),
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'PAYMENT METHOD',
                                                    accessor: (payment) => (
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                                            {payment.payment_method || '-'}
                                                        </span>
                                                    ),
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'REFERENCE NO',
                                                    accessor: (payment) => payment.reference_no || '-',
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'CREATED',
                                                    accessor: (payment) => (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {new Date(payment.created_at).toLocaleDateString('en-GB', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric'
                                                            })}
                                                        </span>
                                                    ),
                                                    className: 'uppercase text-xs'
                                                }
                                            ]}
                                            keyField="id"
                                            emptyMessage="No payments found for this project"
                                        />
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Task Modal */}
            {
                isAddTaskModalOpen && project && (
                    <AddTaskModal
                        isOpen={isAddTaskModalOpen}
                        onClose={() => { setIsAddTaskModalOpen(false); setSelectedTaskForEdit(null); }}
                        onTaskAdded={handleTaskAdded}
                        prefilledProjectId={project.id || parseInt(projectId || '0')}
                        prefilledProjectName={project.project_name || `Project #${projectId}`}
                        editingTask={selectedTaskForEdit}
                        onTaskUpdated={async (updatedApiTask: any) => {
                            if (updatedApiTask && updatedApiTask.id) {
                                const taskId = updatedApiTask.id.toString();
                                setTasks(prev => prev.map(t => t.id === taskId ? mapApiTaskToTask(updatedApiTask) : t));
                            } else {
                                // fallback to refetch if no data returned
                                try {
                                    const response = await axiosInstance.get(`/tasks/${projectId}/tasks/`);
                                    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                                        const projectTasksData = response.data[0];
                                        if (projectTasksData.Tasks && Array.isArray(projectTasksData.Tasks)) {
                                            const mappedTasks: Task[] = projectTasksData.Tasks.map(mapApiTaskToTask);
                                            setTasks(mappedTasks);
                                        }
                                    }
                                } catch (error) {
                                    console.error('Error refetching tasks after update:', error);
                                }
                            }
                        }}
                    />
                )
            }

            {/* Assign Task Modal */}
            {
                isAssignTaskModalOpen && selectedTaskForAssignment && (
                    <AssignTaskModal
                        isOpen={isAssignTaskModalOpen}
                        onClose={() => {
                            setIsAssignTaskModalOpen(false);
                            setSelectedTaskForAssignment(null);
                        }}
                        onAssignmentSuccess={handleAssignmentSuccess}
                        task={selectedTaskForAssignment}
                    />
                )
            }

            {/* Add Expense Modal */}
            {
                isAddExpenseModalOpen && projectId && (
                    <AddExpenseModal
                        isOpen={isAddExpenseModalOpen}
                        onClose={() => setIsAddExpenseModalOpen(false)}
                        projectId={projectId}
                        onExpenseAdded={handleExpenseAdded}
                    />
                )
            }
        </Layout >
    );
};

export default ProjectDetailsPage;