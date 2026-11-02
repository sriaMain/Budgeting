import { formatDate as toDMY, formatDateTime as toDMYTime, toDate } from '../utils/date';
import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Play, Pause, Square,
  ChevronLeft, ChevronRight, Calendar, ArrowLeft, X, Edit2,
  AlertTriangle, ArrowUpDown, Check, ChevronDown, ChevronUp, FolderKanban, ListChecks, RefreshCw, UserX
} from 'lucide-react';
import { Layout } from '../components/Layout';
import axiosInstance from '../utils/axiosInstance';
import { buildWebSocketUrl } from '../utils/apiConfig';
import { toast } from 'react-hot-toast';
import { AddTaskModal } from '../components/AddTaskModal';
import { RequestExtraHoursModal } from '../components/RequestExtraHoursModal';
import { useAppSelector } from '../hooks/useAppSelector';
import { AssignTaskModal } from '../components/AssignTaskModal';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SearchableSelect } from '../components/SearchableSelect';
import { MetricCard } from '../components/StatCard';
import { StatusBadge as Badge } from '../components/StatusBadge';

// Type Definitions
interface Task {
  id: number;
  title: string;
  status: string;
  allocated_hours: string;
  allocated_formatted?: string;
  consumed_hours: number;
  consumed_formatted?: string;
  remaining_hours: number;
  remaining_formatted_hms?: string;
  exceeded_formatted?: string;
  assigned_to: {
    id: number;
    username: string;
  } | null;
  // Freelancer assignee (Task.assigned_to stays employee-only on the backend).
  assigned_freelancer?: { id?: number; name: string } | null;
  milestone_name?: string | null;
  project: number | null;
  project_name: string | null;
  start_date: string | null;
  due_date: string | null;
  created_by: string | null;
  modified_by: string | null;
  needs_extra_hours?: boolean;
  total_seconds: number;
  running: boolean;
  started_at: string | null;
  is_stopped?: boolean;
  stop_reason?: 'AUTO' | 'COMPLETED' | null;
  task_id?: number;
  has_extra_hours_request?: boolean;
}

// Timesheet Types
interface TimesheetRecord {
  id: string;
  employeeName: string;
  employeeHandle: string;
  totalHours: string;
  status: 'Submitted' | 'Draft' | 'Not Started';
  lastUpdated: string;
}

interface TimesheetEntry {
  task: string;
  type: string;
  project?: string;
  mon: string;
  tue: string;
  wed: string;
  thu: string;
  fri: string;
  sat: string;
  sun: string;
  total: string;
}

// Props for TaskManagement component
interface TaskManagementProps {
  userRole: "admin" | "user" | "manager";
  currentPage: string;
  onNavigate: (page: string) => void;
}

// Status Badge Component - the shared badge's tones (same as Project Details)
const TASK_STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  needs_attention: 'Needs Attention',
};
const TASK_STATUS_TONES: Record<string, 'neutral' | 'info' | 'success' | 'danger'> = {
  planned: 'neutral',
  in_progress: 'info',
  completed: 'success',
  needs_attention: 'danger',
};
const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Badge
    status={status}
    label={TASK_STATUS_LABELS[status] || status}
    variant={TASK_STATUS_TONES[status] ?? 'neutral'}
    className="!px-2 !py-0.5 whitespace-nowrap"
  />
);

// Timesheet Status Dot Component
const TimesheetStatusBadge: React.FC<{ status: TimesheetRecord['status'] }> = ({ status }) => {
  const styles = {
    'Submitted': 'bg-green-500',
    'Draft': 'bg-orange-500',
    'Not Started': 'bg-gray-400'
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${styles[status]}`} />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{status}</span>
    </div>
  );
};

// Helper function to format seconds to HH:MM:SS
const formatElapsedTime = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// ---- Task List helpers ----
type TaskSortKey = 'task' | 'assignee' | 'status' | 'allocated' | 'due';
const TASK_STATUS_ORDER: Record<string, number> = { planned: 0, in_progress: 1, needs_attention: 2, completed: 3 };
// Rows (project headers + tasks) per page of the Task List.
const LIST_PAGE_SIZE = 50;

const hoursOf = (value: string | number | null | undefined) => Number(value) || 0;

// Decimal hours -> "HH:MM" (never negative), the one time format the Task List uses.
const formatHM = (hours: number) => {
  const total = Math.max(0, Math.round(hours * 60));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const assigneeName = (task: Task) => task.assigned_to?.username || task.assigned_freelancer?.name || '';

// "priya.sharma" / "Priya Sharma" -> "PS"; a single word -> its first two letters.
const initialsOf = (name: string) => {
  const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
};

// Overdue = due before today (not counting today) and not completed.
const isTaskOverdue = (task: Task) => {
  const due = toDate(task.due_date);
  if (!due || task.status === 'completed') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
};

// Main TaskManagement Component
export const TaskManagement: React.FC<TaskManagementProps> = ({ userRole, currentPage, onNavigate }) => {
  const currentUsername = useAppSelector((state) => state.auth.username);
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const [activeTab, setActiveTab] = React.useState<'list' | 'board' | 'timesheet' | 'requests'>('list');
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = React.useState(false);
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingConsumedTaskId, setEditingConsumedTaskId] = useState<number | null>(null);
  const [consumedInput, setConsumedInput] = useState<string>('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');
  const [statusChoices, setStatusChoices] = useState<{ value: string, label: string }[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [projectStats, setProjectStats] = useState({
    totalActiveProjects: 0,
    overdueTasks: 0,
    unassignedTasks: 0
  });
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [elapsedTimes, setElapsedTimes] = useState<Record<number, number>>({});
  const [exceededTaskId, setExceededTaskId] = useState<number | null>(null);
  const tasksRef = React.useRef<Task[]>([]);

  // Additional Time Requests State
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<any | null>(null);
  const [isLoadingTaskDetails, setIsLoadingTaskDetails] = useState(false);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const [requestHistory, setRequestHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'approved' | 'rejected'>('all');
  const [requestsView, setRequestsView] = useState<'pending' | 'history'>('pending');

  // Timesheet State
  const [timesheetData, setTimesheetData] = useState<any>(null);
  const [isLoadingTimesheet, setIsLoadingTimesheet] = useState(false);
  const [timesheetError, setTimesheetError] = useState<string | null>(null);
  const [timesheetStep, setTimesheetStep] = useState<'summary' | 'detail'>('summary');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<string>('John Doe');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [timesheetSearch, setTimesheetSearch] = useState('');
  const [timesheetDate, setTimesheetDate] = useState(new Date());

  // Admin Timesheet State
  const [weeklySummary, setWeeklySummary] = useState<any>(null);
  const [isLoadingWeeklySummary, setIsLoadingWeeklySummary] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [showEmployeeWeekPicker, setShowEmployeeWeekPicker] = useState(false);
  const [showUserWeekPicker, setShowUserWeekPicker] = useState(false);
  const [adminSelectedYear, setAdminSelectedYear] = useState<number | null>(null);
  const [employeeSelectedYear, setEmployeeSelectedYear] = useState<number | null>(null);
  const [userSelectedYear, setUserSelectedYear] = useState<number | null>(null);

  // Helper for week range display (Sunday to Saturday)
  const getWeekRange = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // Sunday start (day 0)
    const start = new Date(d.setDate(diff));
    const end = new Date(d.setDate(start.getDate() + 6));

    const year = start.getFullYear();

    // Get ISO week number
    const startOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (start.getTime() - startOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);

    return `${toDMY(start)} - ${toDMY(end)} (Week ${weekNum})`;
  };

  const shiftWeek = (direction: number) => {
    const newDate = new Date(timesheetDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setTimesheetDate(newDate);

    // Calculate Sunday of the new week for the API parameter
    const day = newDate.getDay();
    const diff = newDate.getDate() - day; // Sunday is day 0
    const sunday = new Date(newDate);
    sunday.setDate(diff);
    const weekStart = sunday.toISOString().split('T')[0];

    // Fetch timesheet for the new week
    fetchTimesheet(weekStart);
  };

  // Board view state - API data
  const [groupedTasks, setGroupedTasks] = React.useState<any>({
    planned: { count: 0, tasks: [] },
    in_progress: { count: 0, tasks: [] },
    completed: { count: 0, tasks: [] },
    needs_attention: { count: 0, tasks: [] }
  });
  const [isLoadingBoard, setIsLoadingBoard] = React.useState(false);
  // WebSocket connection for real-time timer updates
  React.useEffect(() => {
    if (!accessToken) return;

    const wsUrl = buildWebSocketUrl('/ws/timer/', accessToken);


    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);

        if (data.task_id) {
          // Update task state based on WebSocket event with comprehensive data
          setTasks(prevTasks =>
            prevTasks.map(task => {
              if (task.id === data.task_id) {
                // Use all data from WebSocket for accurate state
                const updatedTask = {
                  ...task,
                  running: data.running,
                  started_at: data.started_at,
                  total_seconds: data.total_seconds || task.total_seconds || 0,
                };

                // Update consumed_hours if provided
                if (data.consumed_hours !== undefined) {
                  updatedTask.consumed_hours = data.consumed_hours;
                }
                if (data.remaining_hours !== undefined) {
                  updatedTask.remaining_hours = data.remaining_hours;
                }

                return updatedTask;
              }
              return task;
            })
          );

          // Update elapsed times with total_seconds from WebSocket
          setElapsedTimes(prev => ({
            ...prev,
            [data.task_id]: data.total_seconds || 0
          }));

          // Show toast notification
          if (data.event === 'TIMER_STARTED') {
            toast.success(`Timer started - ${data.formatted_time?.formatted || ''}`);
          } else if (data.event === 'TIMER_PAUSED') {
            toast.success(`Timer paused - ${data.formatted_time?.formatted || ''}`);
          } else if (data.event === 'TIMER_STOPPED') {
            toast.success('Timer stopped');
          } else if (data.event === 'TASK_AUTO_STOPPED') {
            toast.error(
              `Timer auto-stopped for "${data.task_title || 'task'}": allocated hours exceeded. Please request additional time to continue.`,
              { duration: 6000 }
            );
            fetchTasks();
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
    };

    setWs(websocket);

    return () => {
      if (
        websocket.readyState === WebSocket.OPEN ||
        websocket.readyState === WebSocket.CONNECTING
      ) {
        websocket.close();
      }
    };
  }, [accessToken]);

  // Keep ref in sync so the interval always sees the latest tasks without restarting
  React.useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Single stable interval — never clears/restarts when tasks change
  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTimes(prev => {
        const updated = { ...prev };
        tasksRef.current.forEach(task => {
          if (task.running) {
            updated[task.id] = (prev[task.id] ?? task.total_seconds ?? 0) + 1;
          }
        });
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fetch users and status choices on mount
  React.useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axiosInstance.get('accounts/users/', { params: { employees: 'hrms' } });
        if (response.status === 200) {
          setUsers(Array.isArray(response.data) ? response.data : []);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    };

    const fetchStatusChoices = async () => {
      try {
        const response = await axiosInstance.get('task-status-choices/');
        if (response.status === 200) {
          if (response.data && response.data.status_choices) {
            const formattedChoices = response.data.status_choices.map((s: string) => ({
              value: s,
              label: s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            }));
            setStatusChoices(formattedChoices);
          } else if (Array.isArray(response.data)) {
            setStatusChoices(response.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch status choices:', error);
      }
    };

    fetchUsers();
    fetchStatusChoices();
  }, []);

  // Fetch tasks for list view
  React.useEffect(() => {
    if (activeTab === 'list') {
      fetchTasks();
      fetchProjectStats();
    } else if (activeTab === 'board') {
      fetchGroupedTasks();
    }
  }, [activeTab, selectedAssigneeId, selectedStatus]);

  const fetchTasks = async () => {
    setIsLoadingTasks(true);
    try {
      const params: any = {};
      if (selectedAssigneeId) params.assigned_to = selectedAssigneeId;
      if (selectedStatus) params.status = selectedStatus;

      const response = await axiosInstance.get('tasks/', { params });
      if (response.status === 200 && response.data) {
        // Map the nested API response structure to flat task array
        const allTasks: Task[] = [];
        response.data.forEach((projectGroup: any) => {
          if (projectGroup.Tasks && Array.isArray(projectGroup.Tasks)) {
            projectGroup.Tasks.forEach((task: any) => {
              allTasks.push({
                id: task.id || task.task_id,
                title: task.title,
                status: task.status,
                allocated_hours: task.allocated_hours,
                allocated_formatted: task.allocated_formatted,
                consumed_hours: task.consumed_hours,
                consumed_formatted: task.consumed_formatted,
                remaining_hours: task.remaining_hours,
                remaining_formatted_hms: task.remaining_formatted_hms,
                exceeded_formatted: task.exceeded_formatted,
                assigned_to: task.assigned_to,
                assigned_freelancer: task.assigned_freelancer || null,
                milestone_name: task.milestone_name || null,
                project: task.project || task.project_no,
                project_name: task.project_name || projectGroup.project_name,
                start_date: task.start_date || null,
                due_date: task.due_date,
                created_by: task.created_by,
                modified_by: task.modified_by,
                needs_extra_hours: task.needs_extra_hours,
                total_seconds: task.total_seconds || 0,
                running: task.running || false,
                started_at: task.started_at,
                is_stopped: task.is_stopped || false,
                stop_reason: task.stop_reason || null,
                task_id: task.task_id || task.id,
                has_extra_hours_request: task.has_extra_hours_request || false
              });
            });
          }
        });
        setTasks(allTasks);

        // Initialize elapsed times — total_seconds from the API already includes the
        // current session's elapsed time when running, so use it directly.
        const initialElapsedTimes: Record<number, number> = {};
        allTasks.forEach(task => {
          initialElapsedTimes[task.id] = task.total_seconds || 0;
        });
        setElapsedTimes(initialElapsedTimes);

        // Calculate stats from tasks
        // A freelancer assignee counts as assigned; a task due today isn't overdue yet.
        const unassigned = allTasks.filter(t => !t.assigned_to && !t.assigned_freelancer).length;
        const overdue = allTasks.filter(isTaskOverdue).length;

        setProjectStats(prev => ({ ...prev, overdueTasks: overdue, unassignedTasks: unassigned }));
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const fetchProjectStats = async () => {
    try {
      const response = await axiosInstance.get('projects/');
      if (response.status === 200 && response.data && response.data.Projects) {
        // Count total active projects across all companies
        let totalProjects = 0;
        response.data.Projects.forEach((company: any) => {
          if (company.project_details && Array.isArray(company.project_details)) {
            // Count projects that are not completed - a finished project's status is
            // 'deployed' (there is no 'completed' project status), as on the Projects page.
            const activeProjects = company.project_details.filter(
              (p: any) => p.status !== 'deployed'
            );
            totalProjects += activeProjects.length;
          }
        });

        setProjectStats(prev => ({ ...prev, totalActiveProjects: totalProjects }));
      }
    } catch (error) {
      console.error('Failed to fetch project stats:', error);
      // Don't show error toast for stats as it's not critical
    }
  };

  const fetchGroupedTasks = async () => {
    setIsLoadingBoard(true);
    try {
      const params: any = {};
      if (selectedAssigneeId) params.assigned_to = selectedAssigneeId;
      if (selectedStatus) params.status = selectedStatus;

      const response = await axiosInstance.get('tasks/grouped-by-status/', { params });
      if (response.status === 200 && response.data) {
        setGroupedTasks(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch grouped tasks:', error);
      toast.error('Failed to load board tasks');
    } finally {
      setIsLoadingBoard(false);
    }
  };

  const updateTaskStatus = async (taskId: number, newStatus: string) => {
    try {
      const response = await axiosInstance.patch(`tasks/${taskId}/`, { status: newStatus });
      if (response.status === 200) {
        toast.success('Task status updated');
        // Refresh both list and board data
        fetchTasks();
        fetchGroupedTasks();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      // Show the backend's reason (e.g. "Stop the timer before changing status back to planned").
      const data = (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
      toast.error(data?.message || data?.error || 'Failed to update status');
    }
  };

  const fetchPendingRequests = async () => {
    setIsLoadingRequests(true);
    try {
      const response = await axiosInstance.get('tasks/extra-hours/pending/');
      if (response.status === 200 && Array.isArray(response.data)) {
        setPendingRequests(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch pending requests:', error);
      toast.error('Failed to load pending requests');
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const handleApproveRequest = async (requestId: number) => {
    try {
      const response = await axiosInstance.post(`tasks/extra-hours/${requestId}/review/`, {
        action: 'approve'
      });

      if (response.status === 200 || response.status === 201) {
        toast.success('Request approved successfully');
        // Refresh the pending requests list
        fetchPendingRequests();
        // Refresh history if on history view
        if (requestsView === 'history') {
          fetchRequestHistory(historyFilter !== 'all' ? historyFilter as any : undefined);
        }
        // Refresh tasks to update has_extra_hours_request status
        if (activeTab === 'list') {
          // Trigger task refresh if needed
        }
      }
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to approve request';
      toast.error(errorMessage);
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    try {
      const response = await axiosInstance.post(`tasks/extra-hours/${requestId}/review/`, {
        action: 'reject'
      });

      if (response.status === 200 || response.status === 201) {
        toast.success('Request rejected successfully');
        // Refresh the pending requests list
        fetchPendingRequests();
        // Refresh history if on history view
        if (requestsView === 'history') {
          fetchRequestHistory(historyFilter !== 'all' ? historyFilter as any : undefined);
        }
        // Refresh tasks to update has_extra_hours_request status
        if (activeTab === 'list') {
          // Trigger task refresh if needed
        }
      }
    } catch (error: any) {
      console.error('Failed to reject request:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to reject request';
      toast.error(errorMessage);
    }
  };

  const fetchTaskDetails = async (taskId: number) => {
    setIsLoadingTaskDetails(true);
    try {
      const response = await axiosInstance.get(`tasks/${taskId}/`);
      if (response.status === 200) {
        setSelectedTaskDetails(response.data);
        setShowTaskDetailsModal(true);
      }
    } catch (error) {
      console.error('Failed to fetch task details:', error);
      toast.error('Failed to load task details');
    } finally {
      setIsLoadingTaskDetails(false);
    }
  };

  const fetchTimesheet = async (weekStart?: string) => {
    setIsLoadingTimesheet(true);
    setTimesheetError(null);
    try {
      const params = weekStart ? { week_start: weekStart } : {};
      const response = await axiosInstance.get('timesheet/', { params });
      if (response.status === 200) {
        setTimesheetData(response.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch timesheet:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to load timesheet';
      setTimesheetError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoadingTimesheet(false);
    }
  };

  const fetchWeeklySummary = async (weekStart?: string) => {
    setIsLoadingWeeklySummary(true);
    try {
      const params = weekStart ? { week_start: weekStart } : {};
      const response = await axiosInstance.get('timesheet/weekly-summary/', { params });
      if (response.status === 200) {
        setWeeklySummary(response.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch weekly summary:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to load weekly summary';
      toast.error(errorMessage);
    } finally {
      setIsLoadingWeeklySummary(false);
    }
  };

  const fetchEmployeeTimesheet = async (employeeId: number, weekStart?: string) => {
    setIsLoadingTimesheet(true);
    setTimesheetError(null);
    try {
      const params = weekStart ? { week_start: weekStart } : {};
      const response = await axiosInstance.get(`timesheet/employee/${employeeId}/`, { params });
      if (response.status === 200) {
        setTimesheetData(response.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch employee timesheet:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to load employee timesheet';
      setTimesheetError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoadingTimesheet(false);
    }
  };

  const fetchRequestHistory = async (status?: 'approved' | 'rejected') => {
    setIsLoadingHistory(true);
    try {
      const params = status ? { status } : {};
      const response = await axiosInstance.get('tasks/extra-hours/history/', { params });
      if (response.status === 200) {
        setRequestHistory(response.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch request history:', error);
      toast.error('Failed to load request history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleUpdateTask = async (taskId: number, updates: any) => {
    try {
      const response = await axiosInstance.patch(`tasks/${taskId}/`, updates);
      if (response.status === 200 || response.status === 204) {
        toast.success('Task updated');
        const updatedTask = response.data;
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updatedTask } : t));
        if (activeTab === 'board') fetchGroupedTasks();
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      toast.error('Failed to update task');
    }
  };

  const startEditingConsumed = (task: Task) => {
    const totalMinutes = Math.round((task.consumed_hours || 0) * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    setConsumedInput(`${hh}:${mm}`);
    setEditingConsumedTaskId(task.id);
  };

  // Admin / manager correction of consumed hours (input as HH:MM)
  const saveConsumedHours = async (taskId: number) => {
    const match = consumedInput.trim().match(/^(\d{1,4}):([0-5]\d)$/);
    if (!match) {
      toast.error('Enter consumed time as HH:MM');
      return;
    }
    const hours = parseInt(match[1], 10) + parseInt(match[2], 10) / 60;
    try {
      const response = await axiosInstance.post(`tasks/${taskId}/consumed-hours/`, { consumed_hours: hours });
      if (response.status === 200) {
        toast.success('Consumed hours updated');
        setEditingConsumedTaskId(null);
        fetchTasks();
        if (activeTab === 'board') fetchGroupedTasks();
      }
    } catch (error: any) {
      console.error('Failed to update consumed hours:', error);
      toast.error(error?.response?.data?.error || 'Failed to update consumed hours');
    }
  };

  // Timesheet Mock Data
  const timesheetSummaryData: TimesheetRecord[] = [
    { id: '1', employeeName: 'John Doe', employeeHandle: 'j-doe-1234', totalHours: '40.00', status: 'Submitted', lastUpdated: 'Nov 3, 9:35 AM' },
    { id: '2', employeeName: 'John Doe', employeeHandle: 'j-doe-1234', totalHours: '40.00', status: 'Draft', lastUpdated: 'Nov 3, 9:35 AM' },
    { id: '3', employeeName: 'John Doe', employeeHandle: 'j-doe-1234', totalHours: '40.00', status: 'Not Started', lastUpdated: 'Nov 3, 9:35 AM' },
  ];

  const employeeDetailData: TimesheetEntry[] = [
    { task: 'Calendar Events', type: 'General', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '', total: '2.00' },
    { task: 'Internal Meetings', type: 'General', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '', total: '3.00' },
    { task: 'Systems Architect', type: 'Detailed Project (IT Consulting)', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '', total: '40.00' },
    { task: 'Implementation and Monitoring', type: 'Detailed Project (IT Consulting)', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '', total: '2.00' },
    { task: 'Cybersecurity Support - period 4', type: 'Retainer Project (Internal)', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '', total: '3.00' },
    { task: 'IT Infrastructure', type: 'Time and Material Project (External)', mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '', total: '2.00' },
  ];

  const filteredTimesheets = timesheetSummaryData.filter(record =>
    record.employeeName.toLowerCase().includes(timesheetSearch.toLowerCase()) ||
    record.employeeHandle.toLowerCase().includes(timesheetSearch.toLowerCase())
  );

  const handleTaskAdded = () => {
    fetchTasks();
    setIsAddTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleTaskUpdated = (updatedTask: any) => {
    if (updatedTask && updatedTask.id) {
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
    } else {
      fetchTasks();
    }
    if (activeTab === 'board') fetchGroupedTasks();
    setIsAddTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleCloseModal = () => {
    setIsAddTaskModalOpen(false);
    setEditingTask(null);
  };

  // Timer control functions
  const handleStartTimer = async (taskId: number) => {
    try {
      const response = await axiosInstance.post(`tasks/${taskId}/timer/start/`);
      if (response.status === 200 || response.status === 201) {
        console.log('Timer started successfully:', response.data);
        // Update task with data from response
        if (response.data) {
          setTasks(prevTasks =>
            prevTasks.map(task => {
              if (task.id === taskId) {
                return {
                  ...task,
                  running: response.data.running,
                  total_seconds: response.data.total_seconds || task.total_seconds,
                  started_at: new Date().toISOString(),
                  is_stopped: false
                };
              }
              return task;
            })
          );
          // Update elapsed times
          setElapsedTimes(prev => ({
            ...prev,
            [taskId]: response.data.total_seconds || 0
          }));
        }
      }
    } catch (error) {
      console.error('Failed to start timer:', error);
      toast.error('Failed to start timer');
    }
  };

  const handlePauseTimer = async (taskId: number) => {
    try {
      const response = await axiosInstance.post(`tasks/${taskId}/timer/pause/`);
      if (response.status === 200 || response.status === 201) {
        console.log('Timer paused successfully:', response.data);
        // Update task with consumed hours from response
        if (response.data) {
          setTasks(prevTasks =>
            prevTasks.map(task => {
              if (task.id === taskId) {
                return {
                  ...task,
                  running: response.data.running || false,
                  consumed_hours: response.data.consumed_hours || task.consumed_hours,
                  remaining_hours: response.data.remaining_hours || task.remaining_hours,
                  total_seconds: response.data.total_seconds || task.total_seconds
                };
              }
              return task;
            })
          );
          // Update elapsed times with accurate total from backend
          setElapsedTimes(prev => ({
            ...prev,
            [taskId]: response.data.total_seconds || 0
          }));
        }
      }
    } catch (error) {
      console.error('Failed to pause timer:', error);
      toast.error('Failed to pause timer');
    }
  };

  const handleStopTimer = async (taskId: number) => {
    try {
      const response = await axiosInstance.post(`tasks/${taskId}/timer/stop/`);
      if (response.status === 200 || response.status === 201) {
        // Update task with consumed hours from response
        if (response.data) {
          setTasks(prevTasks =>
            prevTasks.map(task => {
              if (task.id === taskId) {
                return {
                  ...task,
                  consumed_hours: response.data.consumed_hours || task.consumed_hours,
                  remaining_hours: response.data.remaining_hours || task.remaining_hours,
                  total_seconds: 0, // Reset on stop
                  running: false
                };
              }
              return task;
            })
          );
        }
        console.log('Timer stopped successfully');
        fetchTasks(); // Refresh to ensure all data is synced
      }
    } catch (error) {
      console.error('Failed to stop timer:', error);
      toast.error('Failed to stop timer');
    }
  };

  const handleTimerToggle = async (taskId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const task = tasks.find(t => t.id === taskId);

    if (!task) return;

    try {
      if (task.running) {
        await handlePauseTimer(taskId);
      } else {
        await handleStartTimer(taskId);
      }
      fetchTasks();
    } catch (error) {
      console.error('Timer action failed:', error);
      toast.error('Timer action failed');
    }
  };

  // ---- Task List: project / search filters, sorting, collapsible project groups and paging.
  // All of it works on the tasks already loaded (assignee + status still filter on the server).
  const [projectFilter, setProjectFilter] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [sortKey, setSortKey] = useState<TaskSortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [listPage, setListPage] = useState(1);
  const [assigningTask, setAssigningTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const isStaff = userRole === 'admin' || userRole === 'manager';
  // The employee's name from the HRMS employee list (same names as the Assignee filter);
  // the task payload itself only carries the login username.
  const userNames = new Map<number, string>(users.map(u => [u.id, u.username || u.first_name || u.email]));
  const displayAssignee = (t: Task) => (t.assigned_to && userNames.get(t.assigned_to.id)) || assigneeName(t);
  const searchLower = taskSearch.trim().toLowerCase();
  const projectNames = Array.from(new Set(tasks.map(t => t.project_name || 'Unspecified'))).sort((a, b) => a.localeCompare(b));
  const visibleTasks = tasks.filter(t =>
    (!projectFilter || (t.project_name || 'Unspecified') === projectFilter) &&
    (!searchLower
      || t.title.toLowerCase().includes(searchLower)
      || displayAssignee(t).toLowerCase().includes(searchLower)
      || (t.project_name || '').toLowerCase().includes(searchLower)));

  const sortValue = (t: Task, key: TaskSortKey): string | number => {
    if (key === 'task') return t.title.toLowerCase();
    if (key === 'assignee') return displayAssignee(t).toLowerCase() || '￿'; // unassigned last
    if (key === 'status') return TASK_STATUS_ORDER[t.status] ?? 9;
    if (key === 'allocated') return hoursOf(t.allocated_hours);
    return t.due_date || '9999-12-31'; // no due date last
  };
  const sortTasks = (list: Task[]) => {
    if (!sortKey) return list;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = sortValue(a, sortKey), y = sortValue(b, sortKey);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  };
  const toggleSort = (key: TaskSortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setListPage(1);
  };

  // One flat row list (group headers + their tasks) so every group shares the table's columns;
  // a page that starts mid-group repeats that group's header.
  type ListRow = { kind: 'group'; project: string; count: number; continued?: boolean } | { kind: 'task'; project: string; task: Task };
  const listRows: ListRow[] = [];
  const byProject = new Map<string, Task[]>();
  visibleTasks.forEach(t => {
    const key = t.project_name || 'Unspecified';
    byProject.set(key, [...(byProject.get(key) || []), t]);
  });
  byProject.forEach((groupTasks, project) => {
    listRows.push({ kind: 'group', project, count: groupTasks.length });
    if (!collapsedProjects.has(project)) sortTasks(groupTasks).forEach(task => listRows.push({ kind: 'task', project, task }));
  });
  const listPageCount = Math.max(1, Math.ceil(listRows.length / LIST_PAGE_SIZE));
  const currentListPage = Math.min(listPage, listPageCount);
  const pageRows = listRows.slice((currentListPage - 1) * LIST_PAGE_SIZE, currentListPage * LIST_PAGE_SIZE);
  if (pageRows[0]?.kind === 'task') {
    const project = pageRows[0].project;
    pageRows.unshift({ kind: 'group', project, count: byProject.get(project)?.length ?? 0, continued: true });
  }
  const toggleProject = (project: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project); else next.add(project);
      return next;
    });
  };

  const hasListFilters = !!(selectedAssigneeId || selectedStatus || projectFilter || taskSearch);
  const clearListFilters = () => {
    setSelectedAssigneeId('');
    setSelectedStatus('');
    setProjectFilter('');
    setTaskSearch('');
    setListPage(1);
  };

  const assigneeOptions = [
    { id: '', label: 'All assignees' },
    ...users.map(u => ({ id: String(u.id), label: u.username || u.first_name || u.email })),
  ];
  const assigneeValue = selectedAssigneeId ? assigneeOptions.find(o => o.id === selectedAssigneeId) ?? null : null;
  const projectOptions = [{ id: '', label: 'All projects' }, ...projectNames.map(name => ({ id: name, label: name }))];
  const projectValue = projectFilter ? { id: projectFilter, label: projectFilter } : null;

  // Same permissions as before: admins edit, admins/managers assign and correct time,
  // admins and the assignee (employee) change status; only admins delete.
  const taskMenuItems = (task: Task): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [{ label: 'View task', onSelect: () => fetchTaskDetails(task.id) }];
    if (userRole === 'admin') items.push({ label: 'Edit task', onSelect: () => { setEditingTask(task); setIsAddTaskModalOpen(true); } });
    if (isStaff) items.push({ label: displayAssignee(task) ? 'Reassign employee' : 'Assign employee', onSelect: () => setAssigningTask(task) });
    if (userRole === 'admin' || userRole === 'user') {
      // The backend only lets an In Progress task go back to Planned once its hours are used up
      // (and never while its timer runs) - don't offer what it would refuse.
      const canReturnToPlanned = task.status !== 'in_progress' || (!task.running && hoursOf(task.consumed_hours) > hoursOf(task.allocated_hours));
      Object.entries(TASK_STATUS_LABELS)
        .filter(([value]) => value !== task.status && (value !== 'planned' || canReturnToPlanned))
        .forEach(([value, label], i) =>
        items.push({ label: `Mark as ${label}`, onSelect: () => updateTaskStatus(task.id, value), separatorBefore: i === 0 }));
    }
    if (userRole === 'admin') items.push({ label: 'Delete task', danger: true, separatorBefore: true, onSelect: () => setTaskToDelete(task) });
    return items;
  };

  const deleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await axiosInstance.delete(`tasks/${taskToDelete.id}/`);
      toast.success(`"${taskToDelete.title}" deleted`);
      setTaskToDelete(null);
      fetchTasks();
    } catch (error) {
      console.error('Failed to delete task:', error);
      toast.error('Failed to delete task');
    }
  };

  const selectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'timesheet') {
      if (userRole === 'admin' || userRole === 'manager') {
        fetchWeeklySummary();
        setTimesheetStep('summary');
      } else {
        fetchTimesheet();
      }
    }
    if (tab === 'requests') {
      fetchPendingRequests();
      fetchRequestHistory();
    }
  };
  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: 'list', label: 'Task List' },
    { id: 'board', label: 'Task Board' },
    { id: 'timesheet', label: 'Timesheet' },
    // Additional Time Requests - only for admin and manager
    ...(isStaff ? [{ id: 'requests' as const, label: 'Additional Time Requests' }] : []),
  ];

  const sortHeader = (key: TaskSortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th
      scope="col"
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-800 focus:outline-none focus-visible:underline dark:hover:text-gray-200 ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        {sortKey === key
          ? (sortDir === 'asc' ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />)
          : <ArrowUpDown size={12} aria-hidden="true" className="opacity-40" />}
      </button>
    </th>
  );

  const CONTROL = 'h-10 rounded-md border border-gray-300 bg-white text-sm text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200';

  return (
    <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Task Management</h1>
            <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">Manage project tasks, assignments, and working hours.</p>
          </div>
          {/* New Task - admin only, as before */}
          {userRole === 'admin' && (
            <button
              type="button"
              onClick={() => setIsAddTaskModalOpen(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
            >
              <Plus size={16} aria-hidden="true" />
              New Task
            </button>
          )}
        </header>

        {/* KPIs - from the loaded tasks and the projects list */}
        <section aria-label="Task overview" className="grid grid-cols-1 gap-3 sm:gap-4 min-[360px]:grid-cols-2 min-[768px]:grid-cols-3">
          <MetricCard compact label="Total Active Projects" value={projectStats.totalActiveProjects.toLocaleString('en-IN')} icon={<FolderKanban size={16} />} iconTone="blue" />
          <MetricCard compact label="Overdue Tasks" value={projectStats.overdueTasks.toLocaleString('en-IN')} icon={<AlertTriangle size={16} />} iconTone="risk" />
          <MetricCard compact className="min-[360px]:max-[767px]:col-span-2" label="Unassigned Tasks" value={projectStats.unassignedTasks.toLocaleString('en-IN')} icon={<UserX size={16} />} iconTone="amber" />
        </section>

        <div
          role="tablist"
          aria-label="Task views"
          className="flex overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-gray-800"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const at = tabs.findIndex(t => t.id === activeTab);
            const next = tabs[(at + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].id;
            selectTab(next);
            requestAnimationFrame(() => document.getElementById(`task-tab-${next}`)?.focus());
          }}
        >
          {tabs.map(tab => (
            <button
              key={tab.id}
              id={`task-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              className={`-mb-px h-12 shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-gray-800 ${activeTab === tab.id
                ? 'border-teal-600 text-gray-900 dark:border-violet-400 dark:text-white'
                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Toolbar - assignee / status filter the list and the board; project + search are list-only */}
        {(activeTab === 'list' || activeTab === 'board') && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full min-[480px]:w-48">
              <SearchableSelect
                size="md"
                options={assigneeOptions}
                value={assigneeValue}
                onChange={(option) => { setSelectedAssigneeId(option ? String(option.id) : ''); setListPage(1); }}
                placeholder="All assignees"
                ariaLabel="Filter by assignee"
                emptyMessage="No employees match"
              />
            </div>
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => { setSelectedStatus(e.target.value); setListPage(1); }}
                aria-label="Filter by status"
                className={`${CONTROL} appearance-none pl-3 pr-9 cursor-pointer`}
              >
                <option value="">All statuses</option>
                {statusChoices.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            {activeTab === 'list' && (
              <div className="w-full min-[480px]:w-52">
                <SearchableSelect
                  size="md"
                  options={projectOptions}
                  value={projectValue}
                  onChange={(option) => { setProjectFilter(option ? String(option.id) : ''); setListPage(1); }}
                  placeholder="All projects"
                  ariaLabel="Filter by project"
                  emptyMessage="No projects match"
                />
              </div>
            )}
            <div className="ml-auto flex w-full items-center gap-2 min-[768px]:w-auto">
              {activeTab === 'list' && (
                <div className="relative min-w-0 flex-1 min-[768px]:w-64 min-[768px]:flex-none">
                  <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={taskSearch}
                    onChange={(e) => { setTaskSearch(e.target.value); setListPage(1); }}
                    placeholder="Search tasks…"
                    aria-label="Search tasks"
                    className={`${CONTROL} w-full pl-9 pr-3 placeholder:text-gray-400`}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'list') { fetchTasks(); fetchProjectStats(); } else { fetchGroupedTasks(); }
                }}
                aria-label="Refresh tasks"
                title="Refresh"
                className={`${CONTROL} flex w-10 shrink-0 items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800`}
              >
                <RefreshCw size={16} aria-hidden="true" className={(isLoadingTasks || isLoadingBoard) ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        )}

        {/* List View - one table, tasks grouped by project */}
        {activeTab === 'list' && (
          <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            {!isLoadingTasks && visibleTasks.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <ListChecks size={28} aria-hidden="true" className="text-gray-400 dark:text-gray-500" />
                <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">
                  {hasListFilters ? 'No tasks match these filters' : userRole === 'admin' ? 'No tasks yet' : 'No tasks assigned to you yet'}
                </p>
                <p className="mt-1 max-w-sm text-[13px] text-gray-500 dark:text-gray-400">
                  {hasListFilters ? 'Try another assignee, status or project, or clear the filters.' : userRole === 'admin' ? 'Create a task to start planning and tracking project hours.' : 'Tasks your manager assigns to you will appear here.'}
                </p>
                {hasListFilters ? (
                  <button type="button" onClick={clearListFilters} className={`${CONTROL} mt-4 px-4 font-medium hover:bg-gray-50 dark:hover:bg-gray-800`}>Clear filters</button>
                ) : userRole === 'admin' && (
                  <button type="button" onClick={() => setIsAddTaskModalOpen(true)} className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-md bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800">
                    <Plus size={16} aria-hidden="true" /> New Task
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* relative: keeps sr-only header text inside this scroll box */}
                <div className="relative overflow-x-auto">
                  <table className={`w-full table-fixed text-sm ${isStaff ? 'min-w-[1040px]' : 'min-w-[1200px]'}`}>
                    <colgroup>
                      <col />
                      <col className="w-[180px]" />
                      <col className="w-[152px]" />
                      <col className="w-[104px]" />
                      <col className="w-[112px]" />
                      <col className="w-[120px]" />
                      <col className="w-[112px]" />
                      <col className={isStaff ? 'w-[64px]' : 'w-[320px]'} />
                    </colgroup>
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                      <tr className="h-11 border-b border-gray-200 dark:border-gray-800">
                        {sortHeader('task', 'Task')}
                        {sortHeader('assignee', 'Assignee')}
                        {sortHeader('status', 'Status')}
                        {sortHeader('allocated', 'Allocated', 'right')}
                        <th scope="col" className="px-4 text-right uppercase tracking-wide">Consumed</th>
                        <th scope="col" className="px-4 text-right uppercase tracking-wide">Remaining</th>
                        {sortHeader('due', 'Due Date')}
                        <th scope="col" className={`px-4 uppercase tracking-wide ${isStaff ? '' : 'text-left'}`}>
                          {isStaff ? <span className="sr-only">Actions</span> : 'Timer & actions'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingTasks ? (
                        [0, 1, 2, 3].map(i => (
                          <tr key={i} className="h-14 border-b border-gray-100 dark:border-gray-800">
                            <td colSpan={8} className="px-4"><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" /></td>
                          </tr>
                        ))
                      ) : pageRows.map(row => {
                        if (row.kind === 'group') {
                          const collapsed = collapsedProjects.has(row.project);
                          return (
                            <tr key={`group-${row.project}${row.continued ? '-cont' : ''}`} className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-800/40">
                              <td colSpan={8} className="px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() => toggleProject(row.project)}
                                  aria-expanded={!collapsed}
                                  className="flex max-w-full items-center gap-2 text-left text-sm font-semibold text-gray-900 focus:outline-none focus-visible:underline dark:text-white"
                                >
                                  <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                                  <span className="truncate" title={row.project}>{row.project}</span>
                                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">
                                    {row.count} {row.count === 1 ? 'task' : 'tasks'}
                                  </span>
                                  {row.continued && <span className="shrink-0 text-xs font-normal text-gray-500 dark:text-gray-400">(continued)</span>}
                                </button>
                              </td>
                            </tr>
                          );
                        }
                        const task = row.task;
                        const allocated = hoursOf(task.allocated_hours);
                        const consumed = hoursOf(task.consumed_hours);
                        const overBy = Math.max(0, consumed - allocated);
                        const overdue = isTaskOverdue(task);
                        const who = displayAssignee(task);
                        return (
                          <tr
                            key={task.id}
                            onClick={() => fetchTaskDetails(task.id)}
                            className="group h-[58px] cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40"
                          >
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); fetchTaskDetails(task.id); }}
                                title={task.title}
                                className="block max-w-full truncate text-left font-medium text-gray-900 hover:text-teal-700 focus:outline-none focus-visible:underline dark:text-white dark:hover:text-violet-300"
                              >
                                {task.title}
                              </button>
                              {task.milestone_name && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" title={task.milestone_name}>Milestone: {task.milestone_name}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex min-w-0 items-center gap-2" title={who || 'Unassigned'}>
                                <span
                                  aria-hidden="true"
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${who
                                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20'
                                    : 'border border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}`}
                                >
                                  {who ? initialsOf(who) : '?'}
                                </span>
                                <span className={`truncate ${who ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{who || 'Unassigned'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={task.status} />
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white">{formatHM(allocated)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white">
                              {editingConsumedTaskId === task.id ? (
                                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={consumedInput}
                                    onChange={(e) => setConsumedInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveConsumedHours(task.id);
                                      if (e.key === 'Escape') setEditingConsumedTaskId(null);
                                    }}
                                    placeholder="HH:MM"
                                    aria-label={`Consumed time for ${task.title} (HH:MM)`}
                                    autoFocus
                                    className="h-8 w-16 rounded border border-gray-300 px-1.5 text-right font-mono text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                  />
                                  <button type="button" onClick={() => saveConsumedHours(task.id)} aria-label="Save consumed time" title="Save" className="flex h-8 w-8 items-center justify-center rounded bg-navy-900 text-white hover:bg-navy-800">
                                    <Check size={14} />
                                  </button>
                                  <button type="button" onClick={() => setEditingConsumedTaskId(null)} aria-label="Cancel" title="Cancel" className="flex h-8 w-6 items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500">
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  {isStaff && !task.running && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); startEditingConsumed(task); }}
                                      aria-label={`Edit consumed time for ${task.title}`}
                                      title="Edit consumed time"
                                      className="p-1 text-gray-400 opacity-0 transition-opacity hover:text-teal-700 focus:opacity-100 group-hover:opacity-100 dark:text-gray-500"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                  )}
                                  <span>{formatHM(consumed)}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {overBy > 0 ? (
                                <>
                                  <span className="font-medium text-risk-600 dark:text-red-400">00:00</span>
                                  <div className="text-[11px] font-medium text-risk-600 dark:text-red-400">+{formatHM(overBy)} over</div>
                                </>
                              ) : (
                                <span className="font-medium text-green-700 dark:text-green-400">{formatHM(allocated - consumed)}</span>
                              )}
                            </td>
                            <td className={`px-4 py-3 tabular-nums ${overdue ? 'font-medium text-risk-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                              {toDMY(task.due_date, '—')}
                              {overdue && <span className="sr-only"> (overdue)</span>}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className={`flex items-center gap-2 ${isStaff ? 'justify-end' : ''}`}>
                                {/* Employees: the existing timer controls, unchanged */}
                                {!isStaff && !task.needs_extra_hours && !task.has_extra_hours_request && (
                                  <>
                                    <div className="flex items-center rounded-md border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800">
                                      <button
                                        type="button"
                                        onClick={() => { if (!task.running) handleStartTimer(task.id); }}
                                        disabled={task.running}
                                        aria-label={`Start timer for ${task.title}`}
                                        title="Start"
                                        className={`rounded p-1.5 transition-colors ${task.running ? 'cursor-not-allowed text-gray-300 dark:text-gray-600' : 'text-green-600 hover:bg-white dark:text-green-400 dark:hover:bg-gray-700'}`}
                                      >
                                        <Play size={14} fill={!task.running ? 'currentColor' : 'none'} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { if (task.running) handlePauseTimer(task.id); }}
                                        disabled={!task.running}
                                        aria-label={`Pause timer for ${task.title}`}
                                        title="Pause"
                                        className={`rounded p-1.5 transition-colors ${!task.running ? 'cursor-not-allowed text-gray-300 dark:text-gray-600' : 'text-orange-600 hover:bg-white dark:text-orange-400 dark:hover:bg-gray-700'}`}
                                      >
                                        <Pause size={14} fill={task.running ? 'currentColor' : 'none'} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { if (task.running) handleStopTimer(task.id); }}
                                        disabled={!task.running}
                                        aria-label={`Stop timer for ${task.title}`}
                                        title="Stop"
                                        className={`rounded p-1.5 transition-colors ${!task.running ? 'cursor-not-allowed text-gray-300 dark:text-gray-600' : 'text-red-600 hover:bg-white dark:text-red-400 dark:hover:bg-gray-700'}`}
                                      >
                                        <Square size={14} fill={task.running ? 'currentColor' : 'none'} />
                                      </button>
                                    </div>
                                    <span className={`min-w-[72px] rounded-md border px-2 py-1 text-center font-mono text-xs ${task.is_stopped
                                      ? 'border-red-200 bg-red-50 font-semibold text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'
                                      : task.running
                                        ? 'border-green-200 bg-green-50 font-semibold text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
                                        : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                                      {formatElapsedTime(elapsedTimes[task.id] || task.total_seconds || 0)}
                                    </span>
                                  </>
                                )}
                                {!isStaff && (
                                  // Request additional time once the allocation is used up (or the timer auto-stopped)
                                  ((!task.is_stopped && task.consumed_hours > parseFloat(task.allocated_hours)) || (task.is_stopped && task.stop_reason === 'AUTO')) && (
                                    task.has_extra_hours_request ? (
                                      <span className="whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                                        Pending approval
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setExceededTaskId(task.id)}
                                        title="Request additional time for this task"
                                        className="whitespace-nowrap rounded-md bg-orange-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                                      >
                                        Request more time
                                      </button>
                                    )
                                  )
                                )}
                                <ActionMenu label={`Actions for ${task.title}`} items={taskMenuItems(task)} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!isLoadingTasks && listRows.length > LIST_PAGE_SIZE && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 text-[13px] text-gray-600 dark:border-gray-800 dark:text-gray-400">
                    <span>
                      {visibleTasks.length} tasks in {byProject.size} {byProject.size === 1 ? 'project' : 'projects'} · page {currentListPage} of {listPageCount}
                    </span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setListPage(p => Math.max(1, p - 1))} disabled={currentListPage === 1} className={`${CONTROL} inline-flex h-9 items-center gap-1 px-3 disabled:opacity-50`}>
                        <ChevronLeft size={16} aria-hidden="true" /> Previous
                      </button>
                      <button type="button" onClick={() => setListPage(p => Math.min(listPageCount, p + 1))} disabled={currentListPage === listPageCount} className={`${CONTROL} inline-flex h-9 items-center gap-1 px-3 disabled:opacity-50`}>
                        Next <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Board View */}
        {activeTab === 'board' && (
          <div className="overflow-x-auto pb-6">
            {isLoadingBoard ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Planned Column */}
                <div className="flex flex-col">
                  <div className="bg-purple-600 text-white p-4 rounded-t-lg">
                    <h3 className="text-lg font-bold">Planned</h3>
                    <p className="text-sm opacity-90">{groupedTasks.planned.count} tasks</p>
                  </div>
                  <div className="bg-gray-50 p-3 space-y-3 max-h-[600px] overflow-y-auto rounded-b-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-800">
                    {groupedTasks.planned.tasks.map((task: any) => (
                      <div key={task.id} className="bg-white rounded-lg p-3 shadow-sm border-l-4 border-purple-600 dark:bg-gray-900">
                        <h4 className="text-sm font-medium text-gray-900 mb-2 dark:text-gray-100">{task.title}</h4>
                        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex justify-between">
                            <span>Allocated:</span>
                            <span className="font-semibold font-mono">{task.allocated_formatted || task.allocated_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consumed:</span>
                            <span className="font-semibold text-orange-600 font-mono dark:text-orange-400">{task.consumed_formatted || task.consumed_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Remaining:</span>
                            <span className="font-semibold text-green-600 font-mono dark:text-green-400">{task.remaining_formatted_hms || task.remaining_hours + 'h'}</span>
                          </div>
                          {task.assigned_to && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center dark:bg-blue-500/15">
                                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                                  {task.assigned_to.username.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-700 dark:text-gray-300">{task.assigned_to.username}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* In Progress Column */}
                <div className="flex flex-col">
                  <div className="bg-green-600 text-white p-4 rounded-t-lg">
                    <h3 className="text-lg font-bold">In Progress</h3>
                    <p className="text-sm opacity-90">{groupedTasks.in_progress.count} tasks</p>
                  </div>
                  <div className="bg-gray-50 p-3 space-y-3 max-h-[600px] overflow-y-auto rounded-b-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-800">
                    {groupedTasks.in_progress.tasks.map((task: any) => (
                      <div key={task.id} className="bg-white rounded-lg p-3 shadow-sm border-l-4 border-green-600 dark:bg-gray-900">
                        <h4 className="text-sm font-medium text-gray-900 mb-2 dark:text-gray-100">{task.title}</h4>
                        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex justify-between">
                            <span>Allocated:</span>
                            <span className="font-semibold font-mono">{task.allocated_formatted || task.allocated_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consumed:</span>
                            <span className="font-semibold text-orange-600 font-mono dark:text-orange-400">{task.consumed_formatted || task.consumed_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Remaining:</span>
                            <span className="font-semibold text-green-600 font-mono dark:text-green-400">{task.remaining_formatted_hms || task.remaining_hours + 'h'}</span>
                          </div>
                          {task.assigned_to && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center dark:bg-blue-500/15">
                                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                                  {task.assigned_to.username.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-700 dark:text-gray-300">{task.assigned_to.username}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Completed Column */}
                <div className="flex flex-col">
                  <div className="bg-blue-600 text-white p-4 rounded-t-lg">
                    <h3 className="text-lg font-bold">Completed</h3>
                    <p className="text-sm opacity-90">{groupedTasks.completed.count} tasks</p>
                  </div>
                  <div className="bg-gray-50 p-3 space-y-3 max-h-[600px] overflow-y-auto rounded-b-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-800">
                    {groupedTasks.completed.tasks.map((task: any) => (
                      <div key={task.id} className="bg-white rounded-lg p-3 shadow-sm border-l-4 border-blue-600 dark:bg-gray-900">
                        <h4 className="text-sm font-medium text-gray-900 mb-2 dark:text-gray-100">{task.title}</h4>
                        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex justify-between">
                            <span>Allocated:</span>
                            <span className="font-semibold font-mono">{task.allocated_formatted || task.allocated_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consumed:</span>
                            <span className="font-semibold text-orange-600 font-mono dark:text-orange-400">{task.consumed_formatted || task.consumed_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Remaining:</span>
                            <span className="font-semibold text-green-600 font-mono dark:text-green-400">{task.remaining_formatted_hms || task.remaining_hours + 'h'}</span>
                          </div>
                          {task.assigned_to && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center dark:bg-blue-500/15">
                                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                                  {task.assigned_to.username.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-700 dark:text-gray-300">{task.assigned_to.username}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Needs Attention Column */}
                <div className="flex flex-col">
                  <div className="bg-red-600 text-white p-4 rounded-t-lg">
                    <h3 className="text-lg font-bold">Needs Attention</h3>
                    <p className="text-sm opacity-90">{groupedTasks.needs_attention.count} tasks</p>
                  </div>
                  <div className="bg-gray-50 p-3 space-y-3 max-h-[600px] overflow-y-auto rounded-b-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-800">
                    {groupedTasks.needs_attention.tasks.map((task: any) => (
                      <div key={task.id} className="bg-white rounded-lg p-3 shadow-sm border-l-4 border-red-600 dark:bg-gray-900">
                        <h4 className="text-sm font-medium text-gray-900 mb-2 dark:text-gray-100">{task.title}</h4>
                        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex justify-between">
                            <span>Allocated:</span>
                            <span className="font-semibold font-mono">{task.allocated_formatted || task.allocated_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consumed:</span>
                            <span className="font-semibold text-orange-600 font-mono dark:text-orange-400">{task.consumed_formatted || task.consumed_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Remaining:</span>
                            <span className="font-semibold text-green-600 font-mono dark:text-green-400">{task.remaining_formatted_hms || task.remaining_hours + 'h'}</span>
                          </div>
                          {task.assigned_to && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center dark:bg-blue-500/15">
                                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                                  {task.assigned_to.username.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-700 dark:text-gray-300">{task.assigned_to.username}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timesheet Tab */}
        {activeTab === 'timesheet' && (
          <>
            {/* Admin/Manager View - Summary and Detail */}
            {(userRole === 'admin' || userRole === 'manager') && (
              <>
                {/* Timesheet Summary View (admin/manager) */}
                {timesheetStep === 'summary' && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible animate-in fade-in duration-500 dark:bg-gray-900 dark:border-gray-800">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 dark:border-gray-800 dark:from-blue-500/10 dark:to-indigo-500/10">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Weekly Timesheet Summary</h2>
                          <p className="text-sm text-gray-600 dark:text-gray-400">View and manage employee timesheets</p>
                        </div>
                        <div className="relative flex items-center bg-white border border-gray-200 rounded-lg p-1.5 shadow-sm dark:bg-gray-800 dark:border-gray-700">
                          <button
                            onClick={() => {
                              const newDate = new Date(timesheetDate);
                              newDate.setDate(newDate.getDate() - 7);
                              setTimesheetDate(newDate);
                              const sunday = new Date(newDate);
                              sunday.setDate(newDate.getDate() - newDate.getDay());
                              fetchWeeklySummary(sunday.toISOString().split('T')[0]);
                            }}
                            className="p-1.5 hover:bg-gray-50 rounded-md transition-all text-gray-600 dark:hover:bg-gray-700 dark:text-gray-400"
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <button
                            onClick={() => {
                              if (!showWeekPicker) setAdminSelectedYear(timesheetDate.getFullYear());
                              setShowWeekPicker(!showWeekPicker);
                            }}
                            className="px-4 flex items-center gap-2 min-w-[300px] justify-center hover:bg-gray-50 rounded-md transition-all dark:hover:bg-gray-700"
                          >
                            <Calendar size={18} className="text-blue-600" />
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-bold text-gray-900 dark:text-white">
                                {weeklySummary?.week?.label || getWeekRange(timesheetDate)}
                              </span>
                              <span className="text-[10px] text-gray-500 font-medium mt-0.5 dark:text-gray-400">
                                {timesheetDate.toDateString() === new Date().toDateString() ? 'Current Week' : 'Selected Week'} • Click to select
                              </span>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              const newDate = new Date(timesheetDate);
                              newDate.setDate(newDate.getDate() + 7);
                              setTimesheetDate(newDate);
                              const sunday = new Date(newDate);
                              sunday.setDate(newDate.getDate() - newDate.getDay());
                              fetchWeeklySummary(sunday.toISOString().split('T')[0]);
                            }}
                            className="p-1.5 hover:bg-gray-50 rounded-md transition-all text-gray-600 dark:hover:bg-gray-700 dark:text-gray-400"
                          >
                            <ChevronRight size={18} />
                          </button>

                          {/* Week Picker Dropdown */}
                          {showWeekPicker && (
                            <>
                              {/* Backdrop */}
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setShowWeekPicker(false)}
                              />
                              {/* Dropdown Content */}
                              <div className="absolute top-full mt-2 right-0 bg-white border border-gray-300 rounded-lg shadow-xl z-20 w-80 max-h-96 overflow-y-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-black/40">
                                <div className="p-3 border-b border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700">
                                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Select Week</h3>
                                  <p className="text-xs text-gray-600 mt-0.5 dark:text-gray-400">Choose year then week</p>
                                </div>
                                <div className="py-1">
                                  {(() => {
                                    if (adminSelectedYear === null) {
                                      // Show year selection
                                      const currentYear = new Date().getFullYear();
                                      const years = [];
                                      for (let y = currentYear; y >= currentYear - 5; y--) {
                                        years.push(y);
                                      }

                                      return (
                                        <div>
                                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Select Year</p>
                                          </div>
                                          {years.map((year) => (
                                            <button
                                              key={year}
                                              onClick={() => setAdminSelectedYear(year)}
                                              className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0 dark:hover:bg-gray-700 dark:border-gray-700"
                                            >
                                              <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{year}</span>
                                                {year === currentYear && (
                                                  <span className="text-xs text-gray-500 dark:text-gray-400">(Current)</span>
                                                )}
                                              </div>
                                            </button>
                                          ))}
                                        </div>
                                      );
                                    } else {
                                      // Show weeks for selected year
                                      const weeks = [];
                                      const yearStart = new Date(adminSelectedYear, 0, 1);
                                      const day = yearStart.getDay();
                                      const diff = yearStart.getDate() - day;
                                      const firstSunday = new Date(yearStart);
                                      firstSunday.setDate(diff);

                                      let currentWeekStart = new Date(firstSunday);
                                      const yearEnd = new Date(adminSelectedYear, 11, 31);

                                      while (currentWeekStart.getFullYear() <= adminSelectedYear) {
                                        const weekEnd = new Date(currentWeekStart);
                                        weekEnd.setDate(currentWeekStart.getDate() + 6);

                                        if (currentWeekStart.getFullYear() === adminSelectedYear || weekEnd.getFullYear() === adminSelectedYear) {
                                          const isSelected =
                                            timesheetDate.toISOString().split('T')[0] >= currentWeekStart.toISOString().split('T')[0] &&
                                            timesheetDate.toISOString().split('T')[0] <= weekEnd.toISOString().split('T')[0];

                                          const isCurrent =
                                            new Date().toISOString().split('T')[0] >= currentWeekStart.toISOString().split('T')[0] &&
                                            new Date().toISOString().split('T')[0] <= weekEnd.toISOString().split('T')[0];

                                          weeks.push({
                                            sunday: new Date(currentWeekStart),
                                            label: getWeekRange(currentWeekStart),
                                            isSelected,
                                            isCurrent
                                          });
                                        }

                                        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
                                        if (weeks.length > 60) break; // Safety limit
                                      }

                                      return (
                                        <div>
                                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
                                            <button
                                              onClick={() => setAdminSelectedYear(null)}
                                              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                            >
                                              <span>←</span>
                                              <span>Back to Years</span>
                                            </button>
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{adminSelectedYear}</p>
                                          </div>
                                          <div className="">
                                            {weeks.map((week, idx) => (
                                              <button
                                                key={idx}
                                                autoFocus={week.isSelected}
                                                onClick={() => {
                                                  setTimesheetDate(week.sunday);
                                                  fetchWeeklySummary(week.sunday.toISOString().split('T')[0]);
                                                  setShowWeekPicker(false);
                                                  setAdminSelectedYear(null);
                                                }}
                                                className={`w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0 dark:hover:bg-gray-700 dark:border-gray-700 ${week.isSelected ? 'bg-gray-100 dark:bg-gray-700' : ''
                                                  }`}
                                              >
                                                <div className="text-sm text-gray-900 dark:text-gray-100">
                                                  {week.label}
                                                  {week.isCurrent && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Current)</span>}
                                                  {week.isSelected && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">✓</span>}
                                                </div>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    }
                                  })()}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Summary Stats & Search Bar */}
                    <div className="px-6 py-5 bg-white border-b border-gray-100 dark:bg-gray-900 dark:border-gray-800">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        {/* Summary Stats */}
                        {weeklySummary?.summary && (
                          <div className="flex gap-4">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg px-4 py-3 border border-blue-200 dark:from-blue-500/10 dark:to-blue-500/15 dark:border-blue-500/30">
                              <div className="flex items-center gap-3">
                                <div className="bg-blue-600 rounded-lg p-2">
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-blue-700 uppercase tracking-wide dark:text-blue-400">Total Employees</p>
                                  <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">{weeklySummary.summary.total_employees}</p>
                                </div>
                              </div>
                            </div>
                            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg px-4 py-3 border border-green-200 dark:from-green-500/10 dark:to-green-500/15 dark:border-green-500/30">
                              <div className="flex items-center gap-3">
                                <div className="bg-green-600 rounded-lg p-2">
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-green-700 uppercase tracking-wide dark:text-green-400">Total Time</p>
                                  <p className="text-2xl font-bold text-green-900 font-mono dark:text-green-300">{weeklySummary.summary.total_formatted || '00:00:00'}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Search */}
                        <div className="relative w-full md:w-80">
                          <input
                            type="text"
                            placeholder="Search employees..."
                            value={timesheetSearch}
                            onChange={(e) => setTimesheetSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:bg-gray-800"
                          />
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
                        </div>
                      </div>
                    </div>

                    {/* Summary Table */}
                    {isLoadingWeeklySummary ? (
                      <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : !weeklySummary || weeklySummary.data.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
                        <p>No timesheet data available for this week.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50/50 border-y border-gray-100 dark:bg-gray-800/80 dark:border-gray-800">
                            <tr>
                              <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">Employee</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center dark:text-gray-400">Total Time</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">Status</th>
                              <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right dark:text-gray-400">Last Updated</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {weeklySummary.data
                              .filter((record: any) =>
                                !timesheetSearch ||
                                record.employee.name.toLowerCase().includes(timesheetSearch.toLowerCase()) ||
                                record.employee.username.toLowerCase().includes(timesheetSearch.toLowerCase())
                              )
                              .map((record: any) => (
                                <tr
                                  key={record.employee.id}
                                  onClick={() => {
                                    setSelectedEmployeeId(record.employee.id);
                                    setSelectedEmployeeName(record.employee.name);
                                    setTimesheetStep('detail');
                                    const sunday = new Date(timesheetDate);
                                    sunday.setDate(timesheetDate.getDate() - timesheetDate.getDay());
                                    fetchEmployeeTimesheet(record.employee.id, weeklySummary.week.start);
                                  }}
                                  className="hover:bg-gray-50/80 cursor-pointer transition-colors group dark:hover:bg-gray-800/80"
                                >
                                  <td className="px-8 py-5">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors dark:text-white dark:group-hover:text-blue-400">{record.employee.name}</span>
                                      <span className="text-xs text-gray-400 font-medium dark:text-gray-500">{record.employee.username}</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-5 text-center">
                                    <span className="text-sm font-bold text-gray-900 font-mono dark:text-gray-100">{record.total_formatted || '00:00:00'}</span>
                                  </td>
                                  <td className="px-6 py-5">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${record.status === 'approved'
                                        ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'
                                        : record.status === 'submitted'
                                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300'
                                          : 'bg-yellow-100 text-yellow-800 dark:bg-amber-500/15 dark:text-amber-300'
                                      }`}>
                                      {record.status}
                                    </span>
                                  </td>
                                  <td className="px-8 py-5 text-right">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                      {toDMYTime(record.last_updated)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Employee Detail View (admin/manager) */}
                {timesheetStep === 'detail' && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 animate-in slide-in-from-right-4 duration-500 dark:bg-gray-900 dark:border-gray-800">
                    {/* Header */}
                    <div className="mb-8 flex justify-between items-center">
                      <button
                        onClick={() => setTimesheetStep('summary')}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 hover:shadow-sm transition-all dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <ArrowLeft size={16} />
                        Back to Summary
                      </button>

                      <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 dark:bg-gray-800 dark:border-gray-700">
                        <button
                          onClick={() => {
                            const newDate = new Date(timesheetDate);
                            newDate.setDate(newDate.getDate() - 7);
                            setTimesheetDate(newDate);
                            const sunday = new Date(newDate);
                            sunday.setDate(newDate.getDate() - newDate.getDay());
                            if (selectedEmployeeId) {
                              fetchEmployeeTimesheet(selectedEmployeeId, sunday.toISOString().split('T')[0]);
                            }
                          }}
                          className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500 dark:hover:bg-gray-700 dark:text-gray-400"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (!showEmployeeWeekPicker) setEmployeeSelectedYear(timesheetDate.getFullYear());
                            setShowEmployeeWeekPicker(!showEmployeeWeekPicker);
                          }}
                          className="px-3 flex items-center gap-2 text-sm font-semibold text-gray-700 min-w-[280px] justify-center text-center hover:bg-white rounded-md transition-all dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          <Calendar size={16} />
                          <div className="flex flex-col">
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider dark:text-gray-400">{getWeekRange(timesheetDate).split(',')[0]}</span>
                            <span className="leading-none text-xs">{timesheetDate.toDateString() === new Date().toDateString() ? 'Current' : 'Selected'} • Click</span>
                          </div>
                        </button>
                        <button
                          onClick={() => {
                            const newDate = new Date(timesheetDate);
                            newDate.setDate(newDate.getDate() + 7);
                            setTimesheetDate(newDate);
                            const sunday = new Date(newDate);
                            sunday.setDate(newDate.getDate() - newDate.getDay());
                            if (selectedEmployeeId) {
                              fetchEmployeeTimesheet(selectedEmployeeId, sunday.toISOString().split('T')[0]);
                            }
                          }}
                          className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500 dark:hover:bg-gray-700 dark:text-gray-400"
                        >
                          <ChevronRight size={18} />
                        </button>

                        {/* Week Picker Dropdown */}
                        {showEmployeeWeekPicker && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowEmployeeWeekPicker(false)} />
                            <div className="absolute top-full mt-2 right-0 bg-white border border-gray-300 rounded-lg shadow-xl z-20 w-80 max-h-96 overflow-y-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-black/40">
                              <div className="p-3 border-b border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Select Week</h3>
                                <p className="text-xs text-gray-600 mt-0.5 dark:text-gray-400">Choose year then week</p>
                              </div>
                              <div className="py-1">
                                {(() => {
                                  if (employeeSelectedYear === null) {
                                    // Show year selection
                                    const currentYear = new Date().getFullYear();
                                    const years = [];
                                    for (let y = currentYear; y >= currentYear - 5; y--) {
                                      years.push(y);
                                    }

                                    return (
                                      <div>
                                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Select Year</p>
                                        </div>
                                        {years.map((year) => (
                                          <button
                                            key={year}
                                            onClick={() => setEmployeeSelectedYear(year)}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0 dark:hover:bg-gray-700 dark:border-gray-700"
                                          >
                                            <div className="flex items-center justify-between">
                                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{year}</span>
                                              {year === currentYear && (
                                                <span className="text-xs text-gray-500 dark:text-gray-400">(Current)</span>
                                              )}
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  } else {
                                    // Show weeks for selected year
                                    const weeks = [];
                                    const yearStart = new Date(employeeSelectedYear, 0, 1);
                                    const day = yearStart.getDay();
                                    const diff = yearStart.getDate() - day;
                                    const firstSunday = new Date(yearStart);
                                    firstSunday.setDate(diff);

                                    let currentWeekStart = new Date(firstSunday);

                                    while (currentWeekStart.getFullYear() <= employeeSelectedYear) {
                                      const weekEnd = new Date(currentWeekStart);
                                      weekEnd.setDate(currentWeekStart.getDate() + 6);

                                      if (currentWeekStart.getFullYear() === employeeSelectedYear || weekEnd.getFullYear() === employeeSelectedYear) {
                                        const isSelected =
                                          timesheetDate.toISOString().split('T')[0] >= currentWeekStart.toISOString().split('T')[0] &&
                                          timesheetDate.toISOString().split('T')[0] <= weekEnd.toISOString().split('T')[0];

                                        const isCurrent =
                                          new Date().toISOString().split('T')[0] >= currentWeekStart.toISOString().split('T')[0] &&
                                          new Date().toISOString().split('T')[0] <= weekEnd.toISOString().split('T')[0];

                                        weeks.push({
                                          sunday: new Date(currentWeekStart),
                                          label: getWeekRange(currentWeekStart),
                                          isSelected,
                                          isCurrent
                                        });
                                      }

                                      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
                                      if (weeks.length > 60) break;
                                    }

                                    return (
                                      <div>
                                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
                                          <button
                                            onClick={() => setEmployeeSelectedYear(null)}
                                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                          >
                                            <span>←</span>
                                            <span>Back to Years</span>
                                          </button>
                                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{employeeSelectedYear}</p>
                                        </div>
                                        <div className="">
                                          {weeks.map((week, idx) => (
                                            <button
                                              key={idx}
                                              autoFocus={week.isSelected}
                                              onClick={() => {
                                                setTimesheetDate(week.sunday);
                                                if (selectedEmployeeId) {
                                                  fetchEmployeeTimesheet(selectedEmployeeId, week.sunday.toISOString().split('T')[0]);
                                                }
                                                setShowEmployeeWeekPicker(false);
                                                setEmployeeSelectedYear(null);
                                              }}
                                              className={`w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0 dark:hover:bg-gray-700 dark:border-gray-700 ${week.isSelected ? 'bg-gray-100 dark:bg-gray-700' : ''
                                                }`}
                                            >
                                              <div className="text-sm text-gray-900 dark:text-gray-100">
                                                {week.label}
                                                {week.isCurrent && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Current)</span>}
                                                {week.isSelected && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">✓</span>}
                                              </div>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  }
                                })()}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 mb-8 dark:text-white">{selectedEmployeeName}'s Timesheet</h2>

                    {/* Render the same timesheet grid as employee view */}
                    {isLoadingTimesheet ? (
                      <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : !timesheetData ? (
                      <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
                        <p>{timesheetError || 'No timesheet data available.'}</p>
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm dark:border-gray-800">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-200 dark:bg-gray-800/80 dark:border-gray-800">
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase w-1/3 dark:text-gray-400">Task</th>
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                                const start = new Date(timesheetData.timesheet.week_start);
                                const current = new Date(start);
                                current.setDate(start.getDate() + i);
                                return (
                                  <th key={day} className="px-2 py-4 text-xs font-bold text-gray-500 uppercase text-center w-[8%] dark:text-gray-400">
                                    <div className="flex flex-col items-center">
                                      <span>{day}</span>
                                      <span className="text-[10px] opacity-60 font-medium mt-0.5">{current.getDate()}</span>
                                    </div>
                                  </th>
                                );
                              })}
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right w-24 dark:text-gray-400">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {(() => {
                              const rows: Record<number, any> = {};
                              const hoursFormatted: Record<number, Record<string, string>> = {};

                              timesheetData.timesheet.entries.forEach((entry: any) => {
                                if (!rows[entry.task]) {
                                  const t = timesheetData.tasks?.find((task: any) => task.id === entry.task);
                                  rows[entry.task] = {
                                    id: entry.task,
                                    title: t ? t.title : `Task #${entry.task}`,
                                    hours: {},
                                    total: 0
                                  };
                                  hoursFormatted[entry.task] = {};
                                }
                                const h = parseFloat(entry.hours);
                                rows[entry.task].hours[entry.date] = h;
                                rows[entry.task].total += h;
                                hoursFormatted[entry.task][entry.date] = entry.hours_formatted || '00:00:00';
                              });

                              if (Object.keys(rows).length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500 bg-white dark:text-gray-400 dark:bg-gray-900">
                                      No time logged for this week yet.
                                    </td>
                                  </tr>
                                );
                              }

                              // Helper to format seconds to HH:MM:SS
                              const formatSeconds = (totalHours: number) => {
                                const totalSeconds = Math.round(totalHours * 3600);
                                const hours = Math.floor(totalSeconds / 3600);
                                const minutes = Math.floor((totalSeconds % 3600) / 60);
                                const seconds = totalSeconds % 60;
                                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                              };

                              return Object.values(rows).map((row: any) => (
                                <tr key={row.id} className="hover:bg-gray-50/50 transition-colors bg-white dark:bg-gray-900 dark:hover:bg-gray-800/50">
                                  <td className="px-6 py-5">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-bold text-gray-900 dark:text-white">{row.title}</span>
                                    </div>
                                  </td>
                                  {Array.from({ length: 7 }).map((_, i) => {
                                    const start = new Date(timesheetData.timesheet.week_start);
                                    const current = new Date(start);
                                    current.setDate(start.getDate() + i);
                                    const dateStr = current.toISOString().split('T')[0];
                                    const hours = row.hours[dateStr] || 0;
                                    const formatted = hoursFormatted[row.id][dateStr] || '-';

                                    return (
                                      <td key={i} className="px-2 py-5 text-center">
                                        <div className={`text-sm font-medium font-mono ${hours > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>
                                          {hours > 0 ? formatted : '-'}
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="px-6 py-5 text-right bg-gray-50/30 dark:bg-gray-800/30">
                                    <span className="text-sm font-bold text-blue-600 font-mono dark:text-blue-400">{formatSeconds(row.total)}</span>
                                  </td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                          <tfoot className="bg-gray-50/80 border-t border-gray-200 dark:bg-gray-800/80 dark:border-gray-800">
                            <tr>
                              <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase dark:text-gray-400">Total</td>
                              {Array.from({ length: 7 }).map((_, i) => {
                                const start = new Date(timesheetData.timesheet.week_start);
                                const current = new Date(start);
                                current.setDate(start.getDate() + i);
                                const dateStr = current.toISOString().split('T')[0];

                                let dailyTotal = 0;
                                timesheetData.timesheet.entries.forEach((entry: any) => {
                                  if (entry.date === dateStr) {
                                    dailyTotal += parseFloat(entry.hours);
                                  }
                                });

                                const formatSeconds = (totalHours: number) => {
                                  const totalSeconds = Math.round(totalHours * 3600);
                                  const hours = Math.floor(totalSeconds / 3600);
                                  const minutes = Math.floor((totalSeconds % 3600) / 60);
                                  const seconds = totalSeconds % 60;
                                  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                                };

                                return (
                                  <td key={i} className="px-2 py-4 text-center text-xs font-bold text-gray-900 font-mono dark:text-gray-100">
                                    {dailyTotal > 0 ? formatSeconds(dailyTotal) : '-'}
                                  </td>
                                );
                              })}
                              <td className="px-6 py-4 text-right text-xs font-bold text-blue-700 font-mono dark:text-blue-400">
                                {(() => {
                                  const total = timesheetData.timesheet.entries.reduce((acc: number, curr: any) => acc + parseFloat(curr.hours), 0);
                                  const totalSeconds = Math.round(total * 3600);
                                  const hours = Math.floor(totalSeconds / 3600);
                                  const minutes = Math.floor((totalSeconds % 3600) / 60);
                                  const seconds = totalSeconds % 60;
                                  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                                })()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Regular User View - Own Timesheet */}
            {userRole === 'user' && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 animate-in slide-in-from-right-4 duration-500 dark:bg-gray-900 dark:border-gray-800">
                {/* Header */}
                <div className="mb-8 flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">My Timesheet</h2>
                    {timesheetData?.timesheet?.status && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${timesheetData.timesheet.status === 'approved'
                          ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'
                          : timesheetData.timesheet.status === 'submitted'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-amber-500/15 dark:text-amber-300'
                        }`}>
                        {timesheetData.timesheet.status}
                      </span>
                    )}
                  </div>

                  <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 dark:bg-gray-800 dark:border-gray-700">
                    <button
                      onClick={() => shiftWeek(-1)}
                      className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500 dark:hover:bg-gray-700 dark:text-gray-400"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => {
                        if (!showUserWeekPicker) setUserSelectedYear(timesheetDate.getFullYear());
                        setShowUserWeekPicker(!showUserWeekPicker);
                      }}
                      className="px-3 flex items-center gap-2 text-sm font-semibold text-gray-700 min-w-[280px] justify-center text-center hover:bg-white rounded-md transition-all dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Calendar size={16} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider dark:text-gray-400">{getWeekRange(timesheetDate).split(',')[0]}</span>
                        <span className="leading-none text-xs">{timesheetDate.toDateString() === new Date().toDateString() ? 'Current' : 'Selected'} • Click</span>
                      </div>
                    </button>
                    <button
                      onClick={() => shiftWeek(1)}
                      className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500 dark:hover:bg-gray-700 dark:text-gray-400"
                    >
                      <ChevronRight size={18} />
                    </button>

                    {/* Week Picker Dropdown */}
                    {showUserWeekPicker && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowUserWeekPicker(false)} />
                        <div className="absolute top-full mt-2 right-0 bg-white border border-gray-300 rounded-lg shadow-xl z-20 w-80 max-h-96 overflow-y-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-black/40">
                          <div className="p-3 border-b border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Select Week</h3>
                            <p className="text-xs text-gray-600 mt-0.5 dark:text-gray-400">Choose year then week</p>
                          </div>
                          <div className="py-1">
                            {(() => {
                              if (userSelectedYear === null) {
                                // Show year selection
                                const currentYear = new Date().getFullYear();
                                const years = [];
                                for (let y = currentYear; y >= currentYear - 5; y--) {
                                  years.push(y);
                                }

                                return (
                                  <div>
                                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Select Year</p>
                                    </div>
                                    {years.map((year) => (
                                      <button
                                        key={year}
                                        onClick={() => setUserSelectedYear(year)}
                                        className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0 dark:hover:bg-gray-700 dark:border-gray-700"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{year}</span>
                                          {year === currentYear && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">(Current)</span>
                                          )}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                );
                              } else {
                                // Show weeks for selected year
                                const weeks = [];
                                const yearStart = new Date(userSelectedYear, 0, 1);
                                const day = yearStart.getDay();
                                const diff = yearStart.getDate() - day;
                                const firstSunday = new Date(yearStart);
                                firstSunday.setDate(diff);

                                let currentWeekStart = new Date(firstSunday);

                                while (currentWeekStart.getFullYear() <= userSelectedYear) {
                                  const weekEnd = new Date(currentWeekStart);
                                  weekEnd.setDate(currentWeekStart.getDate() + 6);

                                  if (currentWeekStart.getFullYear() === userSelectedYear || weekEnd.getFullYear() === userSelectedYear) {
                                    const isSelected =
                                      timesheetDate.toISOString().split('T')[0] >= currentWeekStart.toISOString().split('T')[0] &&
                                      timesheetDate.toISOString().split('T')[0] <= weekEnd.toISOString().split('T')[0];

                                    const isCurrent =
                                      new Date().toISOString().split('T')[0] >= currentWeekStart.toISOString().split('T')[0] &&
                                      new Date().toISOString().split('T')[0] <= weekEnd.toISOString().split('T')[0];

                                    weeks.push({
                                      sunday: new Date(currentWeekStart),
                                      label: getWeekRange(currentWeekStart),
                                      isSelected,
                                      isCurrent
                                    });
                                  }

                                  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
                                  if (weeks.length > 60) break;
                                }

                                return (
                                  <div>
                                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
                                      <button
                                        onClick={() => setUserSelectedYear(null)}
                                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                      >
                                        <span>←</span>
                                        <span>Back to Years</span>
                                      </button>
                                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{userSelectedYear}</p>
                                    </div>
                                    <div className="">
                                      {weeks.map((week, idx) => (
                                        <button
                                          key={idx}
                                          autoFocus={week.isSelected}
                                          onClick={() => {
                                            setTimesheetDate(week.sunday);
                                            const weekStart = week.sunday.toISOString().split('T')[0];
                                            fetchTimesheet(weekStart);
                                            setShowUserWeekPicker(false);
                                            setUserSelectedYear(null);
                                          }}
                                          className={`w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0 dark:hover:bg-gray-700 dark:border-gray-700 ${week.isSelected ? 'bg-gray-100 dark:bg-gray-700' : ''
                                            }`}
                                        >
                                          <div className="text-sm text-gray-900 dark:text-gray-100">
                                            {week.label}
                                            {week.isCurrent && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Current)</span>}
                                            {week.isSelected && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">✓</span>}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                            })()}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {isLoadingTimesheet ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : !timesheetData ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
                    <p>{timesheetError || 'No timesheet data available.'}</p>
                    <button
                      onClick={() => fetchTimesheet()}
                      className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm dark:border-gray-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-200 dark:bg-gray-800/80 dark:border-gray-800">
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase w-1/3 dark:text-gray-400">Task</th>
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                            const start = new Date(timesheetData.timesheet.week_start);
                            const current = new Date(start);
                            current.setDate(start.getDate() + i);
                            return (
                              <th key={day} className="px-2 py-4 text-xs font-bold text-gray-500 uppercase text-center w-[8%] dark:text-gray-400">
                                <div className="flex flex-col items-center">
                                  <span>{day}</span>
                                  <span className="text-[10px] opacity-60 font-medium mt-0.5">{current.getDate()}</span>
                                </div>
                              </th>
                            );
                          })}
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right w-24 dark:text-gray-400">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {(() => {
                          const rows: Record<number, any> = {};
                          const hoursFormatted: Record<number, Record<string, string>> = {};

                          timesheetData.timesheet.entries.forEach((entry: any) => {
                            if (!rows[entry.task]) {
                              const t = timesheetData.tasks?.find((task: any) => task.id === entry.task);
                              rows[entry.task] = {
                                id: entry.task,
                                title: t ? t.title : `Task #${entry.task}`,
                                hours: {},
                                total: 0
                              };
                              hoursFormatted[entry.task] = {};
                            }
                            const h = parseFloat(entry.hours);
                            rows[entry.task].hours[entry.date] = h;
                            rows[entry.task].total += h;
                            hoursFormatted[entry.task][entry.date] = entry.hours_formatted || '00:00:00';
                          });

                          if (Object.keys(rows).length === 0) {
                            return (
                              <tr>
                                <td colSpan={9} className="px-6 py-12 text-center text-gray-500 bg-white dark:text-gray-400 dark:bg-gray-900">
                                  No time logged for this week yet.
                                </td>
                              </tr>
                            );
                          }

                          // Helper to format seconds to HH:MM:SS
                          const formatSeconds = (totalHours: number) => {
                            const totalSeconds = Math.round(totalHours * 3600);
                            const hours = Math.floor(totalSeconds / 3600);
                            const minutes = Math.floor((totalSeconds % 3600) / 60);
                            const seconds = totalSeconds % 60;
                            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                          };

                          return Object.values(rows).map((row: any) => (
                            <tr key={row.id} className="hover:bg-gray-50/50 transition-colors bg-white dark:bg-gray-900 dark:hover:bg-gray-800/50">
                              <td className="px-6 py-5">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-gray-900 dark:text-white">{row.title}</span>
                                </div>
                              </td>
                              {Array.from({ length: 7 }).map((_, i) => {
                                const start = new Date(timesheetData.timesheet.week_start);
                                const current = new Date(start);
                                current.setDate(start.getDate() + i);
                                const dateStr = current.toISOString().split('T')[0];
                                const hours = row.hours[dateStr] || 0;
                                const formatted = hoursFormatted[row.id][dateStr] || '-';

                                return (
                                  <td key={i} className="px-2 py-5 text-center">
                                    <div className={`text-sm font-medium font-mono ${hours > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>
                                      {hours > 0 ? formatted : '-'}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="px-6 py-5 text-right bg-gray-50/30 dark:bg-gray-800/30">
                                <span className="text-sm font-bold text-blue-600 font-mono dark:text-blue-400">{formatSeconds(row.total)}</span>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                      <tfoot className="bg-gray-50/80 border-t border-gray-200 dark:bg-gray-800/80 dark:border-gray-800">
                        <tr>
                          <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase dark:text-gray-400">Total</td>
                          {Array.from({ length: 7 }).map((_, i) => {
                            const start = new Date(timesheetData.timesheet.week_start);
                            const current = new Date(start);
                            current.setDate(start.getDate() + i);
                            const dateStr = current.toISOString().split('T')[0];

                            let dailyTotal = 0;
                            timesheetData.timesheet.entries.forEach((entry: any) => {
                              if (entry.date === dateStr) {
                                dailyTotal += parseFloat(entry.hours);
                              }
                            });

                            const formatSeconds = (totalHours: number) => {
                              const totalSeconds = Math.round(totalHours * 3600);
                              const hours = Math.floor(totalSeconds / 3600);
                              const minutes = Math.floor((totalSeconds % 3600) / 60);
                              const seconds = totalSeconds % 60;
                              return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                            };

                            return (
                              <td key={i} className="px-2 py-4 text-center text-xs font-bold text-gray-900 font-mono dark:text-gray-100">
                                {dailyTotal > 0 ? formatSeconds(dailyTotal) : '-'}
                              </td>
                            );
                          })}
                          <td className="px-6 py-4 text-right text-xs font-bold text-blue-700 font-mono dark:text-blue-400">
                            {(() => {
                              const total = timesheetData.timesheet.entries.reduce((acc: number, curr: any) => acc + parseFloat(curr.hours), 0);
                              const totalSeconds = Math.round(total * 3600);
                              const hours = Math.floor(totalSeconds / 3600);
                              const minutes = Math.floor((totalSeconds % 3600) / 60);
                              const seconds = totalSeconds % 60;
                              return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Additional Time Requests Tab */}
        {activeTab === 'requests' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-visible dark:bg-gray-900 dark:border-gray-800">
            {/* Header with View Tabs */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 dark:text-white">Additional Time Requests</h2>

              {/* View Tabs */}
              <div className="flex gap-4 border-b border-gray-200 dark:border-gray-800">
                <button
                  onClick={() => setRequestsView('pending')}
                  className={`pb-3 px-1 font-semibold text-sm transition-colors relative ${requestsView === 'pending'
                      ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Pending ({pendingRequests.length})
                </button>
                <button
                  onClick={() => {
                    setRequestsView('history');
                    if (requestHistory.length === 0) {
                      fetchRequestHistory();
                    }
                  }}
                  className={`pb-3 px-1 font-semibold text-sm transition-colors relative ${requestsView === 'history'
                      ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  History ({requestHistory.length})
                </button>
              </div>
            </div>

            {/* Pending Requests View */}
            {requestsView === 'pending' && (
              <div className="p-6">
                {isLoadingRequests ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">No pending requests</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-800">
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Task
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Requested By
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Requested Time
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Reason
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100 dark:bg-gray-900 dark:divide-gray-800">
                        {pendingRequests.map((request) => (
                          <tr key={request.id} className="hover:bg-gray-50 transition-colors dark:hover:bg-gray-800">
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                              #{request.id}
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => {
                                  if (request.task_id) {
                                    fetchTaskDetails(request.task_id);
                                  } else {
                                    const matchingTask = tasks.find(t => t.title === request.task);
                                    if (matchingTask) {
                                      fetchTaskDetails(matchingTask.id);
                                    } else {
                                      toast.error('Task details not available');
                                    }
                                  }
                                }}
                                disabled={isLoadingTaskDetails}
                                className={`text-sm font-semibold transition-colors text-left ${isLoadingTaskDetails
                                    ? 'text-gray-400 cursor-wait dark:text-gray-500'
                                    : 'text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300'
                                  }`}
                              >
                                {request.task}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              {request.requested_by}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-mono font-semibold text-blue-600 dark:text-blue-400">
                                {request.requested_formatted || '00:00:00'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              {request.reason}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 transition-colors"
                                  onClick={() => handleApproveRequest(request.id)}
                                >
                                  Approve
                                </button>
                                <button
                                  className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 transition-colors"
                                  onClick={() => handleRejectRequest(request.id)}
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* History View */}
            {requestsView === 'history' && (
              <div className="p-6">
                {/* Filter Controls */}
                <div className="mb-4 flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Status:</label>
                  <select
                    value={historyFilter}
                    onChange={(e) => {
                      setHistoryFilter(e.target.value as any);
                      fetchRequestHistory(e.target.value === 'all' ? undefined : e.target.value as any);
                    }}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                  >
                    <option value="all">All</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                {isLoadingHistory ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : requestHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">No history found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-800">
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Task
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Requested By
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Requested Time
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Previous Time
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Approved Time
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Reviewed By
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Reviewed At
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider dark:text-gray-300">
                            Reason
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100 dark:bg-gray-900 dark:divide-gray-800">
                        {requestHistory.map((record) => (
                          <tr key={record.id} className="hover:bg-gray-50 transition-colors dark:hover:bg-gray-800">
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                              #{record.id}
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => {
                                  if (record.task_id) {
                                    fetchTaskDetails(record.task_id);
                                  }
                                }}
                                disabled={!record.task_id || isLoadingTaskDetails}
                                className={`text-sm font-semibold transition-colors text-left ${!record.task_id || isLoadingTaskDetails
                                    ? 'text-gray-400 cursor-not-allowed dark:text-gray-500'
                                    : 'text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300'
                                  }`}
                              >
                                {record.task}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              {record.requested_by}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-mono font-semibold text-blue-600 dark:text-blue-400">
                                {record.requested_formatted || '00:00:00'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-mono text-gray-600 dark:text-gray-300">
                                {record.previous_allocated_formatted || '00:00:00'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-mono font-semibold text-green-600 dark:text-green-400">
                                {record.approved_allocated_formatted || '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${record.status === 'approved'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'
                                  : 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'
                                }`}>
                                {record.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              {record.reviewed_by}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                              {toDMYTime(record.reviewed_at)}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              {record.reason || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {
        isAddTaskModalOpen && (
          <AddTaskModal
            isOpen={isAddTaskModalOpen}
            onClose={handleCloseModal}
            onTaskAdded={handleTaskAdded}
            editingTask={editingTask}
            onTaskUpdated={handleTaskUpdated}
          />
        )
      }

      {/* Request Extra Hours Modal */}
      {exceededTaskId && (() => {
        const exceededTask = tasks.find(t => t.id === exceededTaskId);
        if (!exceededTask) return null;

        return (
          <RequestExtraHoursModal
            isOpen={true}
            onClose={() => setExceededTaskId(null)}
            taskId={exceededTask.id}
            taskTitle={exceededTask.title}
            allocatedHours={parseFloat(exceededTask.allocated_hours) || 0}
            allocatedFormatted={exceededTask.allocated_formatted}
            consumedHours={exceededTask.consumed_hours || 0}
            consumedFormatted={exceededTask.consumed_formatted}
            exceededFormatted={exceededTask.exceeded_formatted}
            onSuccess={() => {
              fetchTasks(); // Refresh tasks after successful request
            }}
          />
        );
      })()}

      {assigningTask && (
        <AssignTaskModal
          isOpen
          onClose={() => setAssigningTask(null)}
          onAssignmentSuccess={() => { setAssigningTask(null); fetchTasks(); }}
          task={{ id: String(assigningTask.id), title: assigningTask.title, assignee: displayAssignee(assigningTask) || undefined, project: assigningTask.project ?? undefined }}
        />
      )}

      <ConfirmDialog
        isOpen={!!taskToDelete}
        onClose={() => setTaskToDelete(null)}
        onConfirm={deleteTask}
        title="Delete task?"
        message={taskToDelete ? `"${taskToDelete.title}" and its ${formatHM(hoursOf(taskToDelete.consumed_hours))} of logged time will be permanently deleted. This can't be undone.` : ''}
        confirmLabel="Delete task"
      />

      {/* Task Details Modal for Request Review */}
      {showTaskDetailsModal && selectedTaskDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:shadow-black/40">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between dark:bg-gray-900 dark:border-gray-800">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Task Details</h2>
              <button
                onClick={() => {
                  setShowTaskDetailsModal(false);
                  setSelectedTaskDetails(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors dark:hover:bg-gray-800"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Task Title */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-white">{selectedTaskDetails.title}</h3>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedTaskDetails.status} />
                  {selectedTaskDetails.needs_extra_hours && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded dark:bg-red-500/15 dark:text-red-300">
                      Needs Extra Hours
                    </span>
                  )}
                </div>
              </div>

              {/* Time Information Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-500/10 dark:border-blue-500/30">
                  <p className="text-xs text-blue-600 font-semibold mb-1 dark:text-blue-400">Allocated Hours</p>
                  <p className="text-2xl font-bold text-blue-900 font-mono dark:text-blue-300">
                    {selectedTaskDetails.allocated_formatted || `${selectedTaskDetails.allocated_hours}h`}
                  </p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 dark:bg-green-500/10 dark:border-green-500/30">
                  <p className="text-xs text-green-600 font-semibold mb-1 dark:text-green-400">Consumed Hours</p>
                  <p className="text-2xl font-bold text-green-900 font-mono dark:text-green-300">
                    {selectedTaskDetails.consumed_formatted || `${selectedTaskDetails.consumed_hours.toFixed(2)}h`}
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 dark:bg-purple-500/10 dark:border-purple-500/30">
                  <p className="text-xs text-purple-600 font-semibold mb-1 dark:text-purple-400">Remaining Hours</p>
                  <p className="text-2xl font-bold text-purple-900 font-mono dark:text-purple-300">
                    {selectedTaskDetails.remaining_formatted_hms || selectedTaskDetails.remaining_formatted || `${selectedTaskDetails.remaining_hours.toFixed(2)}h`}
                  </p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-500/10 dark:border-red-500/30">
                  <p className="text-xs text-red-600 font-semibold mb-1 dark:text-red-400">Exceeded By</p>
                  <p className="text-2xl font-bold text-red-900 font-mono dark:text-red-300">
                    {selectedTaskDetails.exceeded_formatted || '00:00:00'}
                  </p>
                </div>
              </div>

              {/* Task Information */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold mb-1 dark:text-gray-400">Project</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{selectedTaskDetails.project_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold mb-1 dark:text-gray-400">Assigned To</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {selectedTaskDetails.assigned_to?.username || 'Unassigned'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold mb-1 dark:text-gray-400">Created By</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{selectedTaskDetails.created_by || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold mb-1 dark:text-gray-400">Due Date</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{selectedTaskDetails.due_date || 'No due date'}</p>
                  </div>
                </div>
              </div>

              {/* Timer Status */}
              {selectedTaskDetails.is_stopped && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 dark:bg-amber-500/10 dark:border-amber-500/30">
                  <p className="text-sm font-semibold text-yellow-900 mb-1 dark:text-amber-300">Timer Status</p>
                  <p className="text-sm text-yellow-800 dark:text-amber-200">
                    Stopped ({selectedTaskDetails.stop_reason === 'AUTO' ? 'Automatically' : 'Manually'})
                    {selectedTaskDetails.stopped_at && ` at ${toDMYTime(selectedTaskDetails.stopped_at)}`}
                  </p>
                </div>
              )}

              {/* Additional Request Status */}
              {selectedTaskDetails.has_extra_hours_request && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 dark:bg-orange-500/10 dark:border-orange-500/30">
                  <p className="text-sm font-semibold text-orange-900 dark:text-orange-300">
                    ⚠️ This task has a pending additional hours request
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end dark:bg-gray-800 dark:border-gray-800">
              <button
                onClick={() => {
                  setShowTaskDetailsModal(false);
                  setSelectedTaskDetails(null);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout >
  );
};

export default TaskManagement;
