import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid, Briefcase, FileText, Users, CheckSquare, Settings,
  Bell, Search, Menu, X, Check, Trash, Trash2, AlertCircle, Info,
  DollarSign, CheckCircle2, LogIn, CreditCard
} from 'lucide-react';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useAppSelector } from '../hooks/useAppSelector';
import { Toast } from './Toast';
import { useNotifications } from '../hooks/useNotifications';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';


interface NavbarProps {
  userRole: 'admin' | 'user' | 'manager' | 'employee';
}

export const Navbar: React.FC<NavbarProps> = ({ userRole }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Notification states and custom hook
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllNotificationsAsRead,
    removeNotification,
  } = useNotifications();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleNotificationClick = async (notification: any) => {
    setIsDropdownOpen(false);

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const username = useAppSelector((state) => state.auth.username);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format notification time
  const formatRelativeTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${diffDays}d ago`;
  };

  // Get matching icon and color for notifications
  const getNotificationIcon = (type: string, priority: string) => {
    const size = 16;
    let icon = <Info size={size} className="text-blue-500" />;
    let bg = 'bg-blue-50';

    if (priority === 'high') {
      icon = <AlertCircle size={size} className="text-rose-500" />;
      bg = 'bg-rose-50';
    } else {
      switch (type) {
        case 'budget':
          icon = <Settings size={size} className="text-amber-500" />;
          bg = 'bg-amber-50';
          break;
        case 'expense':
          icon = <CreditCard size={size} className="text-rose-500" />;
          bg = 'bg-rose-50';
          break;
        case 'invoice':
          icon = <FileText size={size} className="text-emerald-500" />;
          bg = 'bg-emerald-50';
          break;
        case 'payment':
          icon = <DollarSign size={size} className="text-indigo-500" />;
          bg = 'bg-indigo-50';
          break;
        case 'project':
          icon = <Briefcase size={size} className="text-cyan-500" />;
          bg = 'bg-cyan-50';
          break;
        case 'task':
          icon = <CheckCircle2 size={size} className="text-green-500" />;
          bg = 'bg-green-50';
          break;
        case 'quote':
          icon = <FileText size={size} className="text-blue-500" />;
          bg = 'bg-blue-50';
          break;
        case 'contact':
          icon = <Users size={size} className="text-indigo-500" />;
          bg = 'bg-indigo-50';
          break;
        case 'login':
          icon = <LogIn size={size} className="text-slate-500" />;
          bg = 'bg-slate-50';
          break;
        case 'system':
          icon = <AlertCircle size={size} className="text-red-500" />;
          bg = 'bg-red-50';
          break;
      }
    }

    return { icon, bg };
  };


  const handleLogout = () => {
    setIsMobileMenuOpen(false);
    setIsLoggingOut(true);
    setShowToast(true);

    setTimeout(() => {
      dispatch({ type: "auth/logoutSuccess" });
      navigate('/');
    }, 1000);
  }

  const navItems = [
    { label: 'Pipeline', icon: <LayoutGrid size={18} />, roles: ['admin', 'manager'], path: '/pipeline' },
    { label: 'Projects', icon: <Briefcase size={18} />, roles: ['admin', 'manager', 'user'], path: '/projects' },
    { label: 'Reports', icon: <FileText size={18} />, roles: ['admin', 'manager', 'user'], path: '/reports' },
    { label: 'Contacts', icon: <Users size={18} />, roles: ['admin', 'manager'], path: '/contacts' },
    { label: 'Tasks', icon: <CheckSquare size={18} />, roles: ['admin', 'manager', 'user', 'employee'], path: '/task-management' },
    { label: 'Profile', icon: <Users size={18} />, roles: ['employee'], path: '/profile' },
    // Administration for both admin and manager, but manager only sees Manage Modules tab
    { label: 'Administration', icon: <Settings size={18} />, roles: ['admin', 'manager'], path: '/administration' },
  ];

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-30 w-full shadow-sm transition-premium">
      {/* Blur overlay when logging out */}
      {isLoggingOut && (
        <div className="fixed inset-0 bg-white/45 backdrop-blur-[4px] z-40 pointer-events-auto" />
      )}

      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-[72px] max-w-[1600px] mx-auto items-center">

          {/* Left Side: Logo & Nav Links */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => navigate('/dashboard')}
              className={`
                flex-shrink-0 px-3.5 py-2 rounded-xl text-sm font-semibold transition-premium flex items-center gap-2
                ${window.location.pathname.startsWith('/dashboard')
                  ? 'bg-blue-55 text-blue-700 bg-blue-50/70 shadow-sm border border-blue-100/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                }
              `}
            >
              Dashboard
            </button>

            <div className="hidden md:flex space-x-1.5">
              {navItems.map((item) => {
                const userRoleLower = userRole?.toLowerCase();
                const hasAccess = item.roles.some(role => role.toLowerCase() === userRoleLower);
                if (!hasAccess) return null;

                const isActive = window.location.pathname.startsWith(item.path);
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.path)}
                    className={`
                      px-3.5 py-2 rounded-xl text-sm font-semibold transition-premium flex items-center gap-2
                      ${isActive
                        ? 'bg-blue-55 text-blue-700 bg-blue-50/70 shadow-sm border border-blue-100/50'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }
                    `}
                  >
                    <span className={isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Side: Search & Profile */}
          <div className="flex items-center gap-4">
            {/* Notification Bell Icon & Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-premium border border-slate-200/40 relative"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                aria-label="View notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown Card */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn">
                  {/* Dropdown Header */}
                  <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/60 flex items-center justify-between">
                    <span className="font-semibold text-slate-900 text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => {
                          markAllNotificationsAsRead();
                          setIsDropdownOpen(false);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  {/* Dropdown Body */}
                  <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs">
                        <Bell size={28} className="mx-auto mb-2 text-slate-300 opacity-60" />
                        No notifications yet
                      </div>
                    ) : (
                      notifications.slice(0, 5).map((notification) => {
                        const { icon, bg } = getNotificationIcon(
                          notification.notification_type,
                          notification.priority
                        );
                        return (
                          <div
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`p-3.5 flex gap-3 transition-colors hover:bg-slate-50 cursor-pointer relative group ${!notification.is_read ? 'bg-blue-50/20' : ''
                              }`}
                          >
                            {/* Icon Indicator */}
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                              {icon}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pr-8">
                              <h4 className={`text-xs font-semibold text-slate-800 truncate ${!notification.is_read ? 'font-bold text-slate-950' : ''
                                }`}>
                                {notification.title}
                              </h4>
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                                {notification.message}
                              </p>
                              <span className="text-[10px] text-slate-400 font-medium block mt-1.5">
                                {formatRelativeTime(notification.created_at)}
                              </span>
                            </div>

                            {/* Action Buttons */}
                            <div className="absolute right-2 top-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!notification.is_read && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(notification.id);
                                  }}
                                  title="Mark as read"
                                  className="p-1 hover:bg-emerald-50 rounded text-emerald-600 transition-colors"
                                >
                                  <Check size={13} />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeNotification(notification.id);
                                }}
                                title="Delete"
                                className="p-1 hover:bg-rose-50 rounded text-rose-600 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-center">
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        navigate('/notifications');
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center justify-center gap-1 mx-auto py-1"
                    >
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-slate-700 hover:bg-slate-100 rounded-xl transition-premium border border-slate-200/40"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            {userRole === 'user' ? (
              <div className="relative hidden md:block" ref={profileDropdownRef}>
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold hover:scale-105 transition-premium shadow-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  aria-label="User profile"
                >
                  {username ? username.charAt(0).toUpperCase() : 'U'}
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn py-2">
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/profile'); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2.5 font-medium"
                    >
                      <span>👤</span> My Profile
                    </button>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/profile'); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2.5 font-medium"
                    >
                      <span>⚙️</span> Account Settings
                    </button>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/profile'); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2.5 font-medium"
                    >
                      <span>🔒</span> Change Password
                    </button>
                    <button
                      onClick={() => { setIsProfileOpen(false); navigate('/notifications'); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2.5 font-medium"
                    >
                      <span>🔔</span> Notifications
                    </button>
                    <button
                      onClick={() => { setIsProfileOpen(false); toast('Help Center is coming soon! 🚀'); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2.5 font-medium"
                    >
                      <span>❓</span> Help
                    </button>
                    <hr className="border-slate-100 my-1" />
                    <button
                      onClick={() => { setIsProfileOpen(false); handleLogout(); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50/50 transition-colors flex items-center gap-2.5 font-semibold"
                    >
                      <span>🚪</span> Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="hidden md:block px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm transition-premium shadow-sm hover:shadow hover:scale-[1.02]"
                onClick={handleLogout}
              >
                Log out
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer */}
          <div className="fixed top-0 right-0 h-full w-64 bg-white shadow-2xl z-50 md:hidden transform transition-transform duration-300 ease-in-out">
            <div className="flex flex-col h-full">
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-slate-900">
                    Dashboard
                  </span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Navigation Items */}
              <nav className="flex-1 overflow-y-auto py-4">
                {navItems.map((item) => {
                  const userRoleLower = userRole?.toLowerCase();
                  const hasAccess = item.roles.some(role => role.toLowerCase() === userRoleLower);
                  if (!hasAccess) return null;

                  return (
                    <button
                      key={item.label}
                      onClick={() => {
                        navigate(item.path);
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-gray-600">{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Logout Button */}
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 bg-black text-white rounded-md hover:bg-gray-800 transition-colors font-medium"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast Notification */}
      {showToast && (
        <Toast
          message="Logged out successfully!"
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}
    </nav>
  );
};
