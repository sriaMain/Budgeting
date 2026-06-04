import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Filter, Play, Pause, Square,
  ChevronLeft, ChevronRight, Calendar, ArrowLeft, X, Edit2
} from 'lucide-react';
import { Layout } from '../components/Layout';
import axiosInstance from '../utils/axiosInstance';
import { buildWebSocketUrl } from '../utils/apiConfig';
import { toast } from 'react-hot-toast';
import { AddTaskModal } from '../components/AddTaskModal';
import { RequestExtraHoursModal } from '../components/RequestExtraHoursModal';
import { useAppSelector } from '../hooks/useAppSelector';

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

interface TaskGroup {
  project: string;
  tasks: Task[];
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

// Status Badge Component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const statusStyles: Record<string, string> = {
    'in_progress': 'bg-emerald-600 text-white',
    'planned': 'bg-gray-600 text-white',
    'completed': 'bg-blue-600 text-white',
    'needs_attention': 'bg-red-600 text-white',
  };

  const statusLabels: Record<string, string> = {
    'in_progress': 'In Progress',
    'planned': 'Planned',
    'completed': 'Completed',
    'needs_attention': 'Needs attention',
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusStyles[status] || statusStyles['planned']
        }`}
    >
      {statusLabels[status] || status}
    </span>
  );
};

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
      <span className="text-sm font-medium text-gray-700">{status}</span>
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

// Main TaskManagement Component
export const TaskManagement: React.FC<TaskManagementProps> = ({ userRole, currentPage, onNavigate }) => {
  const currentUsername = useAppSelector((state) => state.auth.username);
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const [activeTab, setActiveTab] = React.useState<'list' | 'board' | 'timesheet' | 'requests'>('list');
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = React.useState(false);
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingStatusTaskId, setEditingStatusTaskId] = useState<number | null>(null);
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

    const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
    const year = start.getFullYear();

    // Get ISO week number
    const startOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (start.getTime() - startOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);

    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}, ${year} (Week ${weekNum})`;
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
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, [accessToken]);

  // Update elapsed time for running tasks every second
  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTimes(prev => {
        const updated = { ...prev };
        tasks.forEach(task => {
          if (task.running && task.started_at) {
            const startTime = new Date(task.started_at).getTime();
            const now = new Date().getTime();
            const elapsedMs = now - startTime;
            updated[task.id] = task.total_seconds + Math.floor(elapsedMs / 1000);
          }
        });
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [tasks]);

  // Fetch users and status choices on mount
  React.useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axiosInstance.get('accounts/users/');
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

        // Initialize elapsed times for running tasks
        const initialElapsedTimes: Record<number, number> = {};
        allTasks.forEach(task => {
          if (task.running && task.started_at) {
            const startTime = new Date(task.started_at).getTime();
            const now = new Date().getTime();
            const elapsedMs = now - startTime;
            initialElapsedTimes[task.id] = task.total_seconds + Math.floor(elapsedMs / 1000);
          } else {
            initialElapsedTimes[task.id] = task.total_seconds;
          }
        });
        setElapsedTimes(initialElapsedTimes);

        // Calculate stats from tasks
        const unassigned = allTasks.filter(t => !t.assigned_to).length;
        const overdue = allTasks.filter(t => {
          if (!t.due_date) return false;
          return new Date(t.due_date) < new Date() && t.status !== 'completed';
        }).length;

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
            // Count projects that are not completed
            const activeProjects = company.project_details.filter(
              (p: any) => p.status !== 'completed'
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
        setEditingStatusTaskId(null);
        // Refresh both list and board data
        fetchTasks();
        fetchGroupedTasks();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status');
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

  // Group tasks by project
  const groupTasksByProject = (): TaskGroup[] => {
    const grouped: Record<string, Task[]> = {};

    tasks.forEach(task => {
      const projectName = task.project_name || 'Unspecified';
      if (!grouped[projectName]) {
        grouped[projectName] = [];
      }
      grouped[projectName].push(task);
    });

    return Object.entries(grouped).map(([project, tasks]) => ({
      project,
      tasks
    }));
  };

  const taskGroups = groupTasksByProject();

  // Stat Cards Data - now using real data from API
  const stats = [
    { title: 'Total active projects', value: projectStats.totalActiveProjects },
    { title: 'Overdue Tasks', value: projectStats.overdueTasks },
    { title: 'Unassigned Tasks', value: projectStats.unassignedTasks },
  ];

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

  const handleTaskClick = (task: Task) => {
    // Only allow admins to edit tasks
    if (userRole === 'admin') {
      setEditingTask(task);
      setIsAddTaskModalOpen(true);
    }
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
                  started_at: new Date().toISOString()
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

  return (
    <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
      <div className="min-h-screen bg-gray-50 p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Task Management</h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white rounded-lg border border-gray-200 p-5"
            >
              <p className="text-xs text-gray-600 mb-1">{stat.title}</p>
              <p
                className={`text-3xl font-bold ${stat.title === 'Overdue Tasks' ? 'text-red-600' : 'text-gray-900'
                  }`}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Tabs and Actions Container */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          {/* Tabs */}
          <div className="flex gap-6 px-6 pt-4 border-b border-gray-200">
            {(['list', 'board', 'timesheet'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === 'timesheet') {
                    if (userRole === 'admin' || userRole === 'manager') {
                      fetchWeeklySummary();
                      setTimesheetStep('summary');
                    } else {
                      fetchTimesheet();
                    }
                  }
                }}
                className={`pb-3 px-1 font-semibold text-sm transition-colors relative ${activeTab === tab
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                {tab === 'list' ? 'Task List' : tab === 'board' ? 'Task Board' : 'Timesheet'}
              </button>
            ))}

            {/* Additional Time Requests tab - only for admin and manager */}
            {(userRole === 'admin' || userRole === 'manager') && (
              <button
                onClick={() => {
                  setActiveTab('requests');
                  fetchPendingRequests();
                  fetchRequestHistory();
                }}
                className={`pb-3 px-1 font-semibold text-sm transition-colors relative ${activeTab === 'requests'
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Additional Time Requests
              </button>
            )}
          </div>

          {/* Action Bar */}
          {activeTab !== 'timesheet' && (
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-center justify-start gap-2">
                {/* New button - only visible for admin users */}
                {activeTab === 'list' && userRole === 'admin' && (
                  <button
                    onClick={() => setIsAddTaskModalOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={16} />
                    New
                  </button>
                )}

                {/* <button className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors">
                  <Search size={16} />
                  View All Tasks
                </button> */}

                <div className="relative">
                  <select
                    value={selectedAssigneeId}
                    onChange={(e) => setSelectedAssigneeId(e.target.value)}
                    className="flex items-center gap-2 border border-gray-300 text-gray-700 pl-8 pr-8 py-2 rounded-md text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors appearance-none bg-white cursor-pointer"
                  >
                    <option value="">All Assignees</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.username || u.first_name || u.email}</option>
                    ))}
                  </select>
                  <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="flex items-center gap-2 border border-gray-300 text-gray-700 pl-8 pr-8 py-2 rounded-md text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors appearance-none bg-white cursor-pointer"
                  >
                    <option value="">All Statuses</option>
                    {statusChoices.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>

                {/* <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors">
                  Group By Project
                </button> */}
              </div>
            </div>
          )}
        </div>

        {/* List View */}
        {activeTab === 'list' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            {isLoadingTasks ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Task/Description
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Allocated Time
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Consumed Hours
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Remaining
                    </th>
                    {/* Actions column - hidden for admin and manager users */}
                    {userRole !== 'admin' && userRole !== 'manager' && (
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Actions
                      </th>
                    )}

                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {taskGroups.map((group) => (
                    <React.Fragment key={group.project}>
                      {/* Project Name Row */}
                      <tr className="bg-white border-b border-gray-200 border-t-4 border-t-blue-800">
                        <td colSpan={userRole === 'admin' || userRole === 'manager' ? 5 : 6} className="px-6 py-3">
                          <span className="text-base font-bold text-gray-900">{group.project}</span>
                        </td>
                      </tr>
                      {/* Task Rows for this project */}
                      {group.tasks.map((task) => (
                        <tr
                          key={task.id}
                          onClick={() => handleTaskClick(task)}
                          className="hover:bg-gray-50 transition-colors cursor-pointer group"
                        >
                          <td className="px-6 py-4">
                            <div className="relative flex items-center gap-2 group/status">
                              <StatusBadge status={task.status} />
                              {userRole === 'user' && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingStatusTaskId(editingStatusTaskId === task.id ? null : task.id);
                                    }}
                                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors opacity-0 group-hover/status:opacity-100"
                                    title="Change Status"
                                  >
                                    <Edit2 size={14} />
                                  </button>

                                  {editingStatusTaskId === task.id && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-10 cursor-default"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingStatusTaskId(null);
                                        }}
                                      />
                                      <div className="absolute top-full left-0 mt-1 bg-white shadow-xl rounded-md border border-gray-200 z-20 w-44 overflow-hidden">
                                        {['planned', 'in_progress', 'completed', 'needs_attention'].map((choice) => (
                                          <button
                                            key={choice}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              updateTaskStatus(task.id, choice);
                                            }}
                                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 capitalize transition-colors border-b border-gray-50 last:border-0 ${task.status === choice ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                                              }`}
                                          >
                                            {choice.replace('_', ' ')}
                                          </button>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900">{task.title}</span>
                              {task.assigned_to && (
                                <span className="text-xs text-gray-500 mt-1">
                                  Assigned to: {task.assigned_to.username}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm text-gray-900 font-mono">
                              {task.allocated_formatted || parseFloat(task.allocated_hours || '0').toFixed(2) + 'h'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm text-gray-900 font-mono">
                              {task.consumed_formatted || (task.consumed_hours || 0).toFixed(2) + 'h'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`text-sm font-medium font-mono ${(task.remaining_hours || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {task.remaining_formatted_hms || (task.remaining_hours || 0).toFixed(2) + 'h'}
                            </span>
                          </td>
                          {/* Actions column - hidden for admin and manager users */}
                          {userRole !== 'admin' && userRole !== 'manager' && (
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center gap-2">
                                {/* Control Buttons Group - Only hidden when needs extra hours or has pending approval */}
                                {!task.needs_extra_hours && !task.has_extra_hours_request && (
                                  <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!task.running) handleStartTimer(task.id);
                                      }}
                                      className={`p-1.5 rounded-md transition-all ${task.running
                                        ? 'text-gray-300 cursor-not-allowed'
                                        : 'text-green-600 hover:bg-white hover:shadow-sm'
                                        }`}
                                      disabled={task.running}
                                      title="Play"
                                    >
                                      <Play size={14} fill={!task.running ? "currentColor" : "none"} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (task.running) handlePauseTimer(task.id);
                                      }}
                                      className={`p-1.5 rounded-md transition-all ${!task.running
                                        ? 'text-gray-300 cursor-not-allowed'
                                        : 'text-orange-600 hover:bg-white hover:shadow-sm'
                                        }`}
                                      disabled={!task.running}
                                      title="Pause"
                                    >
                                      <Pause size={14} fill={task.running ? "currentColor" : "none"} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (task.running) handleStopTimer(task.id);
                                      }}
                                      className={`p-1.5 rounded-md transition-all ${!task.running
                                        ? 'text-gray-300 cursor-not-allowed'
                                        : 'text-red-600 hover:bg-white hover:shadow-sm'
                                        }`}
                                      disabled={!task.running}
                                      title="Stop"
                                    >
                                      <Square size={14} fill={task.running ? "currentColor" : "none"} />
                                    </button>
                                  </div>
                                )}

                                {/* Timer Field (Dynamic elapsed time) - Hidden when needs extra hours or pending approval */}
                                {!task.needs_extra_hours && !task.has_extra_hours_request && (
                                  <div className={`px-2 py-1.5 rounded-lg border text-xs font-mono min-w-[70px] text-center transition-all ${task.is_stopped
                                      ? 'bg-red-50 border-red-200 text-red-600 font-semibold'
                                      : task.running
                                        ? 'bg-green-50 border-green-200 text-green-700 font-bold'
                                        : 'bg-gray-50 border-gray-200 text-gray-500'
                                    }`}>
                                    {formatElapsedTime(elapsedTimes[task.id] || task.total_seconds || 0)}
                                    {task.is_stopped && <span className="ml-1 text-[10px]">(Stopped)</span>}
                                  </div>
                                )}

                                {/* Request Additional Time Button or Pending Approval Badge */}
                                {(
                                  // Show for running tasks that exceeded allocated time
                                  (!task.is_stopped && task.consumed_hours > parseFloat(task.allocated_hours)) ||
                                  // Show for tasks that were auto-stopped by the system (time ran out)
                                  (task.is_stopped && task.stop_reason === 'AUTO')
                                ) && (
                                    task.has_extra_hours_request ? (
                                      // Show "Pending Approval" badge if request already sent
                                      <div className="px-3 py-1.5 bg-yellow-100 border border-yellow-300 text-yellow-800 text-xs font-medium rounded-lg whitespace-nowrap">
                                        Pending Approval
                                      </div>
                                    ) : (
                                      // Show "Request Additional Time" button if no request sent yet
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExceededTaskId(task.id);
                                        }}
                                        className="px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap"
                                        title="Request additional time for this task"
                                      >
                                        Timer Consumed - Request Additional Time
                                      </button>
                                    )
                                  )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
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
                  <div className="bg-gray-50 p-3 space-y-3 max-h-[600px] overflow-y-auto rounded-b-lg border border-gray-200">
                    {groupedTasks.planned.tasks.map((task: any) => (
                      <div key={task.id} className="bg-white rounded-lg p-3 shadow-sm border-l-4 border-purple-600">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">{task.title}</h4>
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between">
                            <span>Allocated:</span>
                            <span className="font-semibold font-mono">{task.allocated_formatted || task.allocated_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consumed:</span>
                            <span className="font-semibold text-orange-600 font-mono">{task.consumed_formatted || task.consumed_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Remaining:</span>
                            <span className="font-semibold text-green-600 font-mono">{task.remaining_formatted_hms || task.remaining_hours + 'h'}</span>
                          </div>
                          {task.assigned_to && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-xs font-semibold text-blue-700">
                                  {task.assigned_to.username.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-700">{task.assigned_to.username}</span>
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
                  <div className="bg-gray-50 p-3 space-y-3 max-h-[600px] overflow-y-auto rounded-b-lg border border-gray-200">
                    {groupedTasks.in_progress.tasks.map((task: any) => (
                      <div key={task.id} className="bg-white rounded-lg p-3 shadow-sm border-l-4 border-green-600">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">{task.title}</h4>
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between">
                            <span>Allocated:</span>
                            <span className="font-semibold font-mono">{task.allocated_formatted || task.allocated_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consumed:</span>
                            <span className="font-semibold text-orange-600 font-mono">{task.consumed_formatted || task.consumed_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Remaining:</span>
                            <span className="font-semibold text-green-600 font-mono">{task.remaining_formatted_hms || task.remaining_hours + 'h'}</span>
                          </div>
                          {task.assigned_to && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-xs font-semibold text-blue-700">
                                  {task.assigned_to.username.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-700">{task.assigned_to.username}</span>
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
                  <div className="bg-gray-50 p-3 space-y-3 max-h-[600px] overflow-y-auto rounded-b-lg border border-gray-200">
                    {groupedTasks.completed.tasks.map((task: any) => (
                      <div key={task.id} className="bg-white rounded-lg p-3 shadow-sm border-l-4 border-blue-600">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">{task.title}</h4>
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between">
                            <span>Allocated:</span>
                            <span className="font-semibold font-mono">{task.allocated_formatted || task.allocated_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consumed:</span>
                            <span className="font-semibold text-orange-600 font-mono">{task.consumed_formatted || task.consumed_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Remaining:</span>
                            <span className="font-semibold text-green-600 font-mono">{task.remaining_formatted_hms || task.remaining_hours + 'h'}</span>
                          </div>
                          {task.assigned_to && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-xs font-semibold text-blue-700">
                                  {task.assigned_to.username.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-700">{task.assigned_to.username}</span>
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
                  <div className="bg-gray-50 p-3 space-y-3 max-h-[600px] overflow-y-auto rounded-b-lg border border-gray-200">
                    {groupedTasks.needs_attention.tasks.map((task: any) => (
                      <div key={task.id} className="bg-white rounded-lg p-3 shadow-sm border-l-4 border-red-600">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">{task.title}</h4>
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between">
                            <span>Allocated:</span>
                            <span className="font-semibold font-mono">{task.allocated_formatted || task.allocated_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consumed:</span>
                            <span className="font-semibold text-orange-600 font-mono">{task.consumed_formatted || task.consumed_hours + 'h'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Remaining:</span>
                            <span className="font-semibold text-green-600 font-mono">{task.remaining_formatted_hms || task.remaining_hours + 'h'}</span>
                          </div>
                          {task.assigned_to && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-xs font-semibold text-blue-700">
                                  {task.assigned_to.username.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-700">{task.assigned_to.username}</span>
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
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible animate-in fade-in duration-500">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900 mb-1">Weekly Timesheet Summary</h2>
                          <p className="text-sm text-gray-600">View and manage employee timesheets</p>
                        </div>
                        <div className="relative flex items-center bg-white border border-gray-200 rounded-lg p-1.5 shadow-sm">
                          <button
                            onClick={() => {
                              const newDate = new Date(timesheetDate);
                              newDate.setDate(newDate.getDate() - 7);
                              setTimesheetDate(newDate);
                              const sunday = new Date(newDate);
                              sunday.setDate(newDate.getDate() - newDate.getDay());
                              fetchWeeklySummary(sunday.toISOString().split('T')[0]);
                            }}
                            className="p-1.5 hover:bg-gray-50 rounded-md transition-all text-gray-600"
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <button
                            onClick={() => {
                              if (!showWeekPicker) setAdminSelectedYear(timesheetDate.getFullYear());
                              setShowWeekPicker(!showWeekPicker);
                            }}
                            className="px-4 flex items-center gap-2 min-w-[300px] justify-center hover:bg-gray-50 rounded-md transition-all"
                          >
                            <Calendar size={18} className="text-blue-600" />
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-bold text-gray-900">
                                {weeklySummary?.week?.label || getWeekRange(timesheetDate)}
                              </span>
                              <span className="text-[10px] text-gray-500 font-medium mt-0.5">
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
                            className="p-1.5 hover:bg-gray-50 rounded-md transition-all text-gray-600"
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
                              <div className="absolute top-full mt-2 right-0 bg-white border border-gray-300 rounded-lg shadow-xl z-20 w-80 max-h-96 overflow-y-auto">
                                <div className="p-3 border-b border-gray-200 bg-white">
                                  <h3 className="text-sm font-semibold text-gray-900">Select Week</h3>
                                  <p className="text-xs text-gray-600 mt-0.5">Choose year then week</p>
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
                                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                                            <p className="text-xs font-medium text-gray-600">Select Year</p>
                                          </div>
                                          {years.map((year) => (
                                            <button
                                              key={year}
                                              onClick={() => setAdminSelectedYear(year)}
                                              className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0"
                                            >
                                              <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-gray-900">{year}</span>
                                                {year === currentYear && (
                                                  <span className="text-xs text-gray-500">(Current)</span>
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
                                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                            <button
                                              onClick={() => setAdminSelectedYear(null)}
                                              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                                            >
                                              <span>←</span>
                                              <span>Back to Years</span>
                                            </button>
                                            <p className="text-xs font-medium text-gray-600">{adminSelectedYear}</p>
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
                                                className={`w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0 ${week.isSelected ? 'bg-gray-100' : ''
                                                  }`}
                                              >
                                                <div className="text-sm text-gray-900">
                                                  {week.label}
                                                  {week.isCurrent && <span className="ml-2 text-xs text-gray-500">(Current)</span>}
                                                  {week.isSelected && <span className="ml-2 text-xs text-gray-500">✓</span>}
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
                    <div className="px-6 py-5 bg-white border-b border-gray-100">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        {/* Summary Stats */}
                        {weeklySummary?.summary && (
                          <div className="flex gap-4">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg px-4 py-3 border border-blue-200">
                              <div className="flex items-center gap-3">
                                <div className="bg-blue-600 rounded-lg p-2">
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Total Employees</p>
                                  <p className="text-2xl font-bold text-blue-900">{weeklySummary.summary.total_employees}</p>
                                </div>
                              </div>
                            </div>
                            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg px-4 py-3 border border-green-200">
                              <div className="flex items-center gap-3">
                                <div className="bg-green-600 rounded-lg p-2">
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-green-700 uppercase tracking-wide">Total Time</p>
                                  <p className="text-2xl font-bold text-green-900 font-mono">{weeklySummary.summary.total_formatted || '00:00:00'}</p>
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
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white outline-none transition-all text-sm"
                          />
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        </div>
                      </div>
                    </div>

                    {/* Summary Table */}
                    {isLoadingWeeklySummary ? (
                      <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : !weeklySummary || weeklySummary.data.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <p>No timesheet data available for this week.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50/50 border-y border-gray-100">
                            <tr>
                              <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Employee</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Total Time</th>
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                              <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Last Updated</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
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
                                  className="hover:bg-gray-50/80 cursor-pointer transition-colors group"
                                >
                                  <td className="px-8 py-5">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{record.employee.name}</span>
                                      <span className="text-xs text-gray-400 font-medium">{record.employee.username}</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-5 text-center">
                                    <span className="text-sm font-bold text-gray-900 font-mono">{record.total_formatted || '00:00:00'}</span>
                                  </td>
                                  <td className="px-6 py-5">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${record.status === 'approved'
                                        ? 'bg-green-100 text-green-800'
                                        : record.status === 'submitted'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                      }`}>
                                      {record.status}
                                    </span>
                                  </td>
                                  <td className="px-8 py-5 text-right">
                                    <span className="text-sm font-medium text-gray-500">
                                      {new Date(record.last_updated).toLocaleString()}
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
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 animate-in slide-in-from-right-4 duration-500">
                    {/* Header */}
                    <div className="mb-8 flex justify-between items-center">
                      <button
                        onClick={() => setTimesheetStep('summary')}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 hover:shadow-sm transition-all"
                      >
                        <ArrowLeft size={16} />
                        Back to Summary
                      </button>

                      <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1">
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
                          className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (!showEmployeeWeekPicker) setEmployeeSelectedYear(timesheetDate.getFullYear());
                            setShowEmployeeWeekPicker(!showEmployeeWeekPicker);
                          }}
                          className="px-3 flex items-center gap-2 text-sm font-semibold text-gray-700 min-w-[280px] justify-center text-center hover:bg-white rounded-md transition-all"
                        >
                          <Calendar size={16} />
                          <div className="flex flex-col">
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{getWeekRange(timesheetDate).split(',')[0]}</span>
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
                          className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500"
                        >
                          <ChevronRight size={18} />
                        </button>

                        {/* Week Picker Dropdown */}
                        {showEmployeeWeekPicker && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowEmployeeWeekPicker(false)} />
                            <div className="absolute top-full mt-2 right-0 bg-white border border-gray-300 rounded-lg shadow-xl z-20 w-80 max-h-96 overflow-y-auto">
                              <div className="p-3 border-b border-gray-200 bg-white">
                                <h3 className="text-sm font-semibold text-gray-900">Select Week</h3>
                                <p className="text-xs text-gray-600 mt-0.5">Choose year then week</p>
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
                                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                                          <p className="text-xs font-medium text-gray-600">Select Year</p>
                                        </div>
                                        {years.map((year) => (
                                          <button
                                            key={year}
                                            onClick={() => setEmployeeSelectedYear(year)}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0"
                                          >
                                            <div className="flex items-center justify-between">
                                              <span className="text-sm font-medium text-gray-900">{year}</span>
                                              {year === currentYear && (
                                                <span className="text-xs text-gray-500">(Current)</span>
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
                                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                          <button
                                            onClick={() => setEmployeeSelectedYear(null)}
                                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                                          >
                                            <span>←</span>
                                            <span>Back to Years</span>
                                          </button>
                                          <p className="text-xs font-medium text-gray-600">{employeeSelectedYear}</p>
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
                                              className={`w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0 ${week.isSelected ? 'bg-gray-100' : ''
                                                }`}
                                            >
                                              <div className="text-sm text-gray-900">
                                                {week.label}
                                                {week.isCurrent && <span className="ml-2 text-xs text-gray-500">(Current)</span>}
                                                {week.isSelected && <span className="ml-2 text-xs text-gray-500">✓</span>}
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

                    <h2 className="text-2xl font-bold text-gray-900 mb-8">{selectedEmployeeName}'s Timesheet</h2>

                    {/* Render the same timesheet grid as employee view */}
                    {isLoadingTimesheet ? (
                      <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : !timesheetData ? (
                      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <p>{timesheetError || 'No timesheet data available.'}</p>
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-200">
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase w-1/3">Task</th>
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                                const start = new Date(timesheetData.timesheet.week_start);
                                const current = new Date(start);
                                current.setDate(start.getDate() + i);
                                return (
                                  <th key={day} className="px-2 py-4 text-xs font-bold text-gray-500 uppercase text-center w-[8%]">
                                    <div className="flex flex-col items-center">
                                      <span>{day}</span>
                                      <span className="text-[10px] opacity-60 font-medium mt-0.5">{current.getDate()}</span>
                                    </div>
                                  </th>
                                );
                              })}
                              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right w-24">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
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
                                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500 bg-white">
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
                                <tr key={row.id} className="hover:bg-gray-50/50 transition-colors bg-white">
                                  <td className="px-6 py-5">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-bold text-gray-900">{row.title}</span>
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
                                        <div className={`text-sm font-medium font-mono ${hours > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                                          {hours > 0 ? formatted : '-'}
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="px-6 py-5 text-right bg-gray-50/30">
                                    <span className="text-sm font-bold text-blue-600 font-mono">{formatSeconds(row.total)}</span>
                                  </td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                          <tfoot className="bg-gray-50/80 border-t border-gray-200">
                            <tr>
                              <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Total</td>
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
                                  <td key={i} className="px-2 py-4 text-center text-xs font-bold text-gray-900 font-mono">
                                    {dailyTotal > 0 ? formatSeconds(dailyTotal) : '-'}
                                  </td>
                                );
                              })}
                              <td className="px-6 py-4 text-right text-xs font-bold text-blue-700 font-mono">
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
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 animate-in slide-in-from-right-4 duration-500">
                {/* Header */}
                <div className="mb-8 flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-1">My Timesheet</h2>
                    {timesheetData?.timesheet?.status && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${timesheetData.timesheet.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : timesheetData.timesheet.status === 'submitted'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {timesheetData.timesheet.status}
                      </span>
                    )}
                  </div>

                  <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1">
                    <button
                      onClick={() => shiftWeek(-1)}
                      className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => {
                        if (!showUserWeekPicker) setUserSelectedYear(timesheetDate.getFullYear());
                        setShowUserWeekPicker(!showUserWeekPicker);
                      }}
                      className="px-3 flex items-center gap-2 text-sm font-semibold text-gray-700 min-w-[280px] justify-center text-center hover:bg-white rounded-md transition-all"
                    >
                      <Calendar size={16} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{getWeekRange(timesheetDate).split(',')[0]}</span>
                        <span className="leading-none text-xs">{timesheetDate.toDateString() === new Date().toDateString() ? 'Current' : 'Selected'} • Click</span>
                      </div>
                    </button>
                    <button
                      onClick={() => shiftWeek(1)}
                      className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500"
                    >
                      <ChevronRight size={18} />
                    </button>

                    {/* Week Picker Dropdown */}
                    {showUserWeekPicker && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowUserWeekPicker(false)} />
                        <div className="absolute top-full mt-2 right-0 bg-white border border-gray-300 rounded-lg shadow-xl z-20 w-80 max-h-96 overflow-y-auto">
                          <div className="p-3 border-b border-gray-200 bg-white">
                            <h3 className="text-sm font-semibold text-gray-900">Select Week</h3>
                            <p className="text-xs text-gray-600 mt-0.5">Choose year then week</p>
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
                                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                                      <p className="text-xs font-medium text-gray-600">Select Year</p>
                                    </div>
                                    {years.map((year) => (
                                      <button
                                        key={year}
                                        onClick={() => setUserSelectedYear(year)}
                                        className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="text-sm font-medium text-gray-900">{year}</span>
                                          {year === currentYear && (
                                            <span className="text-xs text-gray-500">(Current)</span>
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
                                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                      <button
                                        onClick={() => setUserSelectedYear(null)}
                                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                                      >
                                        <span>←</span>
                                        <span>Back to Years</span>
                                      </button>
                                      <p className="text-xs font-medium text-gray-600">{userSelectedYear}</p>
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
                                          className={`w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0 ${week.isSelected ? 'bg-gray-100' : ''
                                            }`}
                                        >
                                          <div className="text-sm text-gray-900">
                                            {week.label}
                                            {week.isCurrent && <span className="ml-2 text-xs text-gray-500">(Current)</span>}
                                            {week.isSelected && <span className="ml-2 text-xs text-gray-500">✓</span>}
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
                  <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                    <p>{timesheetError || 'No timesheet data available.'}</p>
                    <button
                      onClick={() => fetchTimesheet()}
                      className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-200">
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase w-1/3">Task</th>
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                            const start = new Date(timesheetData.timesheet.week_start);
                            const current = new Date(start);
                            current.setDate(start.getDate() + i);
                            return (
                              <th key={day} className="px-2 py-4 text-xs font-bold text-gray-500 uppercase text-center w-[8%]">
                                <div className="flex flex-col items-center">
                                  <span>{day}</span>
                                  <span className="text-[10px] opacity-60 font-medium mt-0.5">{current.getDate()}</span>
                                </div>
                              </th>
                            );
                          })}
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right w-24">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
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
                                <td colSpan={9} className="px-6 py-12 text-center text-gray-500 bg-white">
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
                            <tr key={row.id} className="hover:bg-gray-50/50 transition-colors bg-white">
                              <td className="px-6 py-5">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-gray-900">{row.title}</span>
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
                                    <div className={`text-sm font-medium font-mono ${hours > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                                      {hours > 0 ? formatted : '-'}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="px-6 py-5 text-right bg-gray-50/30">
                                <span className="text-sm font-bold text-blue-600 font-mono">{formatSeconds(row.total)}</span>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                      <tfoot className="bg-gray-50/80 border-t border-gray-200">
                        <tr>
                          <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Total</td>
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
                              <td key={i} className="px-2 py-4 text-center text-xs font-bold text-gray-900 font-mono">
                                {dailyTotal > 0 ? formatSeconds(dailyTotal) : '-'}
                              </td>
                            );
                          })}
                          <td className="px-6 py-4 text-right text-xs font-bold text-blue-700 font-mono">
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
          <div className="bg-white rounded-lg border border-gray-200 overflow-visible">
            {/* Header with View Tabs */}
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Additional Time Requests</h2>

              {/* View Tabs */}
              <div className="flex gap-4 border-b border-gray-200">
                <button
                  onClick={() => setRequestsView('pending')}
                  className={`pb-3 px-1 font-semibold text-sm transition-colors relative ${requestsView === 'pending'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
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
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
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
                    <p className="text-gray-500">No pending requests</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Task
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Requested By
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Requested Time
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Reason
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {pendingRequests.map((request) => (
                          <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">
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
                                    ? 'text-gray-400 cursor-wait'
                                    : 'text-blue-600 hover:text-blue-800 hover:underline'
                                  }`}
                              >
                                {request.task}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {request.requested_by}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-mono font-semibold text-blue-600">
                                {request.requested_formatted || '00:00:00'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
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
                  <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
                  <select
                    value={historyFilter}
                    onChange={(e) => {
                      setHistoryFilter(e.target.value as any);
                      fetchRequestHistory(e.target.value === 'all' ? undefined : e.target.value as any);
                    }}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <p className="text-gray-500">No history found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Task
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Requested By
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Requested Time
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Previous Time
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Approved Time
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Reviewed By
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Reviewed At
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Reason
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {requestHistory.map((record) => (
                          <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">
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
                                    ? 'text-gray-400 cursor-not-allowed'
                                    : 'text-blue-600 hover:text-blue-800 hover:underline'
                                  }`}
                              >
                                {record.task}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {record.requested_by}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-mono font-semibold text-blue-600">
                                {record.requested_formatted || '00:00:00'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-mono text-gray-600">
                                {record.previous_allocated_formatted || '00:00:00'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-mono font-semibold text-green-600">
                                {record.approved_allocated_formatted || '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${record.status === 'approved'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                                }`}>
                                {record.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {record.reviewed_by}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {new Date(record.reviewed_at).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
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

      {/* Task Details Modal for Request Review */}
      {showTaskDetailsModal && selectedTaskDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Task Details</h2>
              <button
                onClick={() => {
                  setShowTaskDetailsModal(false);
                  setSelectedTaskDetails(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Task Title */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{selectedTaskDetails.title}</h3>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedTaskDetails.status} />
                  {selectedTaskDetails.needs_extra_hours && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
                      Needs Extra Hours
                    </span>
                  )}
                </div>
              </div>

              {/* Time Information Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-xs text-blue-600 font-semibold mb-1">Allocated Hours</p>
                  <p className="text-2xl font-bold text-blue-900 font-mono">
                    {selectedTaskDetails.allocated_formatted || `${selectedTaskDetails.allocated_hours}h`}
                  </p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-xs text-green-600 font-semibold mb-1">Consumed Hours</p>
                  <p className="text-2xl font-bold text-green-900 font-mono">
                    {selectedTaskDetails.consumed_formatted || `${selectedTaskDetails.consumed_hours.toFixed(2)}h`}
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-xs text-purple-600 font-semibold mb-1">Remaining Hours</p>
                  <p className="text-2xl font-bold text-purple-900 font-mono">
                    {selectedTaskDetails.remaining_formatted_hms || selectedTaskDetails.remaining_formatted || `${selectedTaskDetails.remaining_hours.toFixed(2)}h`}
                  </p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-xs text-red-600 font-semibold mb-1">Exceeded By</p>
                  <p className="text-2xl font-bold text-red-900 font-mono">
                    {selectedTaskDetails.exceeded_formatted || '00:00:00'}
                  </p>
                </div>
              </div>

              {/* Task Information */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold mb-1">Project</p>
                    <p className="text-sm text-gray-900">{selectedTaskDetails.project_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold mb-1">Assigned To</p>
                    <p className="text-sm text-gray-900">
                      {selectedTaskDetails.assigned_to?.username || 'Unassigned'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold mb-1">Created By</p>
                    <p className="text-sm text-gray-900">{selectedTaskDetails.created_by || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold mb-1">Due Date</p>
                    <p className="text-sm text-gray-900">{selectedTaskDetails.due_date || 'No due date'}</p>
                  </div>
                </div>
              </div>

              {/* Timer Status */}
              {selectedTaskDetails.is_stopped && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-yellow-900 mb-1">Timer Status</p>
                  <p className="text-sm text-yellow-800">
                    Stopped ({selectedTaskDetails.stop_reason === 'AUTO' ? 'Automatically' : 'Manually'})
                    {selectedTaskDetails.stopped_at && ` at ${new Date(selectedTaskDetails.stopped_at).toLocaleString()}`}
                  </p>
                </div>
              )}

              {/* Additional Request Status */}
              {selectedTaskDetails.has_extra_hours_request && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-orange-900">
                    ⚠️ This task has a pending additional hours request
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
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
