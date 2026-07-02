
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
    <div className="min-h-screen bg-gray-50 w-full font-sans text-gray-900">
      <Navbar userRole={userRole} />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};
