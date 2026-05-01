import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Briefcase, FileText, Users, CheckSquare, Settings, Bell, Search, Menu, X } from 'lucide-react';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { Toast } from './Toast';


interface NavbarProps {
  userRole: 'admin' | 'user' | 'manager' | 'employee';
}

export const Navbar: React.FC<NavbarProps> = ({ userRole }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    { label: 'Projects', icon: <Briefcase size={18} />, roles: ['admin', 'manager',], path: '/projects' },
    { label: 'Reports', icon: <FileText size={18} />, roles: ['admin', 'manager'], path: '/reports' },
    { label: 'Contacts', icon: <Users size={18} />, roles: ['admin', 'manager'], path: '/contacts' },
    { label: 'Tasks', icon: <CheckSquare size={18} />, roles: ['admin', 'manager', 'user', 'employee'], path: '/task-management' },
    { label: 'Profile', icon: <Users size={18} />, roles: ['employee'], path: '/profile' },
    // Administration for both admin and manager, but manager only sees Manage Modules tab
    { label: 'Administration', icon: <Settings size={18} />, roles: ['admin', 'manager'], path: '/administration' },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 w-full relative">
      {/* Blur overlay when logging out */}
      {isLoggingOut && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-[2px] z-40 pointer-events-auto" />
      )}

      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 max-w-[1600px] mx-auto">

          {/* Left Side: Logo & Nav Links */}
          <div className="flex items-center gap-8">
            <div className="flex-shrink-0 flex items-center gap-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
                SI
              </div>

            </div>

            <div className="hidden md:flex space-x-1">
              {navItems.map((item) => {
                // Case-insensitive role check to handle different backend formats
                const userRoleLower = userRole?.toLowerCase();
                const hasAccess = item.roles.some(role => role.toLowerCase() === userRoleLower);
                if (!hasAccess) return null;

                const isActive = item.label === 'Administration'; // Simulating active state for demo logic or just styling
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.path)}
                    className={`
                        px-3 py-2 rounded-md text-lg font-bold transition-colors  duration-200 flex items-center gap-2
                        ${item.label === 'Dashboard'
                        ? 'bg-gray-100 text-blue-700'
                        : 'text-black hover:text-gray-700 hover:bg-gray-100 '
                      }
                      `}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Side: Search & Profile */}
          <div className="flex items-center gap-4">
            {/* <div className="hidden lg:flex relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input 
                      type="text" 
                      placeholder="Search..." 
                      className="pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-48 transition-all"
                  />
              </div>
            
              <button className="relative p-2 text-gray-500 hover:text-gray-700 transition-colors rounded-full hover:bg-gray-100">
                <Bell size={20} />
                <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
              </button> */}

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            <button
              className="hidden md:block px-3 py-2 bg-black rounded-md text-white hover:text-gray-800 hover:bg-gray-100"
              onClick={handleLogout}
            >
              Log out
            </button>


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
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
                    SI
                  </div>
                  <span className="font-semibold text-gray-800">Menu</span>
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
                  if (!item.roles.includes(userRole)) return null;

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
