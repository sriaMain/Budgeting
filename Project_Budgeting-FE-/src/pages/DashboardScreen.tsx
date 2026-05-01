
import React from 'react';
import { Layout } from '../components/Layout';



// --- Reusable Dashboard Components ---

// --- Main Screen ---

interface DashboardScreenProps {
  userRole: 'admin' | 'user' | 'manager';
  currentPage: string;
  onNavigate: (page: string) => void;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({ userRole, currentPage, onNavigate }) => {
  return (
    <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>

      <div className="space-y-8 bg-white">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Coming Soon...</h1>
        </div>



        {/* Bottom Section: Milestones & Activity */}


      </div>
    </Layout>
  );
};

export default DashboardScreen;
