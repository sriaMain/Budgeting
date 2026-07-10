import React, { useState, useEffect } from "react";
import { Navbar } from "../components/Navbar";
import { useNotifications } from "../hooks/useNotifications";
import {
  Bell,
  Check,
  Trash2,
  AlertCircle,
  Info,
  DollarSign,
  Briefcase,
  CheckCircle2,
  LogIn,
  Settings,
  CreditCard,
  SlidersHorizontal,
  FolderMinus,
  Sparkles,
  FileText,
} from "lucide-react";
import type { NotificationType, NotificationPriority } from "../types/notification";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import axiosInstance from "../utils/axiosInstance";

interface NotificationsScreenProps {
  userRole: "admin" | "user" | "manager" | "employee";
  currentPage?: string;
  onNavigate?: (page: string) => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  userRole,
}) => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllNotificationsAsRead,
    removeNotification,
    clearAllNotifications,
  } = useNotifications();

  const handleNotificationClick = async (notification: any) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    const type = notification.notification_type;
    const recordId = notification.record_id;
    const redirectUrl = notification.redirect_url;

    // Determine the API path to check existence and permissions
    let apiPath = '';
    if (type === 'project' || type === 'budget') {
      apiPath = `/projects/${recordId}/`;
    } else if (type === 'task') {
      apiPath = `/tasks/${recordId}/`;
    } else if (type === 'quote') {
      apiPath = `/quotes/${recordId}/`;
    } else if (type === 'contact') {
      apiPath = `/client/${recordId}/`;
    } else if (type === 'invoice' || type === 'payment') {
      apiPath = `/invoices/${recordId}/`;
    }

    if (!apiPath || !recordId) {
      if (redirectUrl) {
        navigate(redirectUrl);
      }
      return;
    }

    try {
      await axiosInstance.get(apiPath);

      if (type === 'project') {
        navigate(`/projects/${recordId}`);
      } else if (type === 'budget') {
        navigate(`/projects/${recordId}`, { state: { activeTab: 'Budget' } });
      } else if (type === 'task') {
        navigate(`/task-management`, { state: { taskId: recordId } });
      } else if (type === 'contact') {
        navigate(`/contacts`, { state: { clientId: recordId } });
      } else if (redirectUrl) {
        navigate(redirectUrl);
      }
    } catch (error: any) {
      console.error("Error checking record access:", error);
      if (error.response?.status === 403 || error.response?.status === 401) {
        toast.error("You do not have permission to access this record.");
      } else {
        toast.error("The related record was not found.");
      }
    }
  };

  // Filter states
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedReadStatus, setSelectedReadStatus] = useState<string>("all");

  // Refetch notifications whenever filters change
  useEffect(() => {
    fetchNotifications({
      type: selectedType,
      priority: selectedPriority,
      is_read: selectedReadStatus,
    });
  }, [selectedType, selectedPriority, selectedReadStatus, fetchNotifications]);

  const formatRelativeTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${diffDays}d ago`;
  };

  const getNotificationDetails = (type: NotificationType, priority: NotificationPriority) => {
    const size = 20;
    let icon = <Info size={size} className="text-blue-500" />;
    let bg = "bg-blue-50/80 border border-blue-100/50";
    let priorityBadge = "bg-blue-50 text-blue-700 border-blue-100";

    if (priority === "high") {
      icon = <AlertCircle size={size} className="text-rose-500 animate-pulse" />;
      bg = "bg-rose-50/80 border border-rose-100/50";
      priorityBadge = "bg-rose-50 text-rose-700 border border-rose-100";
    } else if (priority === "medium") {
      priorityBadge = "bg-amber-50 text-amber-700 border-amber-100";
    }

    if (priority !== "high") {
      switch (type) {
        case "budget":
          icon = <Settings size={size} className="text-amber-500" />;
          bg = "bg-amber-50/80 border border-amber-100/50";
          break;
        case "expense":
          icon = <CreditCard size={size} className="text-rose-500" />;
          bg = "bg-rose-50/80 border border-rose-100/50";
          break;
        case "invoice":
          icon = <FileText size={size} className="text-emerald-500" />;
          bg = "bg-emerald-50/80 border border-emerald-100/50";
          break;
        case "payment":
          icon = <DollarSign size={size} className="text-indigo-500" />;
          bg = "bg-indigo-50/80 border border-indigo-100/50";
          break;
        case "project":
          icon = <Briefcase size={size} className="text-cyan-500" />;
          bg = "bg-cyan-50/80 border border-cyan-100/50";
          break;
        case "task":
          icon = <CheckCircle2 size={size} className="text-green-500" />;
          bg = "bg-green-50/80 border border-green-100/50";
          break;
        case "quote":
          icon = <FileText size={size} className="text-blue-500" />;
          bg = "bg-blue-50/80 border border-blue-100/50";
          break;
        case "login":
          icon = <LogIn size={size} className="text-slate-500" />;
          bg = "bg-slate-50/80 border border-slate-100/50";
          break;
        case "system":
          icon = <AlertCircle size={size} className="text-red-500" />;
          bg = "bg-red-50/80 border border-red-100/50";
          break;
      }
    }

    return { icon, bg, priorityBadge };
  };

  const notificationTypes = [
    { key: "all", label: "All Types" },
    { key: "budget", label: "Budgets" },
    { key: "expense", label: "Expenses" },
    { key: "invoice", label: "Invoices" },
    { key: "payment", label: "Payments" },
    { key: "project", label: "Projects" },
    { key: "task", label: "Tasks" },
    { key: "login", label: "Logins" },
    { key: "system", label: "System Alerts" },
  ];

  const priorities = [
    { key: "all", label: "All Priorities" },
    { key: "low", label: "Low Priority" },
    { key: "medium", label: "Medium Priority" },
    { key: "high", label: "High Priority" },
  ];

  const readStatuses = [
    { key: "all", label: "All Messages" },
    { key: "unread", label: "Unread Only" },
    { key: "read", label: "Read Only" },
  ];

  // Helper to get nice text representations
  const getReadableType = (type: NotificationType) => {
    if (type === "login") return "Login Event";
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar userRole={userRole} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <span className="p-2 bg-blue-600 text-white rounded-2xl shadow-md hover:shadow-lg transition-all scale-95 md:scale-100">
                <Bell size={24} />
              </span>
              Notifications Center
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              View and manage system activities, alert triggers, and real-time logs.
            </p>
          </div>

          <div className="flex items-center gap-3.5">
            {unreadCount > 0 && (
              <button
                onClick={markAllNotificationsAsRead}
                className="px-4 py-2 border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-premium flex items-center gap-2"
              >
                <Check size={16} />
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAllNotifications}
                className="px-4 py-2 border border-rose-200/40 bg-rose-50/50 hover:bg-rose-50 text-rose-700 font-semibold rounded-xl text-xs sm:text-sm transition-premium flex items-center gap-2"
              >
                <Trash2 size={16} />
                Clear history
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
            <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block">
              Total Notifications
            </span>
            <span className="text-3xl font-bold text-slate-900 block mt-1">
              {notifications.length}
            </span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden">
            <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block">
              Unread Logs
            </span>
            <span className="text-3xl font-bold text-slate-900 block mt-1">
              {unreadCount}
            </span>
            {unreadCount > 0 && (
              <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            )}
          </div>
        </div>

        {/* Interactive Filters Grid */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <SlidersHorizontal size={16} className="text-slate-400" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Advanced Filters
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Filter by Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase">
                Filter by Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {notificationTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Priority */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase">
                Filter by Priority
              </label>
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {priorities.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Read Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase">
                Filter by Read Status
              </label>
              <select
                value={selectedReadStatus}
                onChange={(e) => setSelectedReadStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {readStatuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden min-h-[400px] flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col justify-center items-center py-20 text-slate-400">
              <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin mb-3"></div>
              <span className="text-xs font-semibold">Syncing notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex-1 flex flex-col justify-center items-center py-24 text-slate-400">
              <FolderMinus size={48} className="text-slate-200 mb-3" />
              <span className="text-sm font-bold text-slate-800">No Notifications Found</span>
              <p className="text-xs text-slate-400 mt-1 max-w-xs text-center px-4">
                There are no notifications matching your active filter settings.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 flex-1">
              {notifications.map((notification) => {
                const { icon, bg, priorityBadge } = getNotificationDetails(
                  notification.notification_type,
                  notification.priority
                );

                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors hover:bg-slate-50/50 cursor-pointer relative group ${!notification.is_read ? "bg-blue-50/15" : ""
                      }`}
                  >
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      {/* Icon */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg} shadow-sm`}>
                        {icon}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1 pr-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={`text-sm text-slate-800 truncate ${!notification.is_read ? "font-bold text-slate-950" : "font-medium"
                            }`}>
                            {notification.title}
                          </h3>
                          <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-full capitalize ${priorityBadge}`}>
                            {notification.priority}
                          </span>
                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/40 px-2 py-0.5 rounded-full">
                            {getReadableType(notification.notification_type)}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">
                          {notification.message}
                        </p>
                        <span className="text-[11px] text-slate-400 font-medium block mt-2">
                          {formatRelativeTime(notification.created_at)} &bull; {new Date(notification.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 border-slate-100 pt-3.5 sm:pt-0">
                      {!notification.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                          className="p-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-premium shadow-sm"
                          title="Mark as read"
                        >
                          <Check size={14} />
                          <span className="sm:hidden lg:inline">Mark Read</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(notification.id);
                        }}
                        className="p-2 bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-premium shadow-sm"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                        <span className="sm:hidden lg:inline">Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default NotificationsScreen;
