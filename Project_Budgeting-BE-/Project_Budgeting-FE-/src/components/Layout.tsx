
import React from 'react';
import { Navbar } from './Navbar';

interface LayoutProps {
  children: React.ReactNode;
  userRole: 'admin' | 'user' | 'manager' | 'employee';
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, userRole, currentPage, onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#f6f8fa] w-full font-sans text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Navbar userRole={userRole} />
      <main className="min-w-0 max-w-[1600px] mx-auto px-4 pt-20 pb-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
};
