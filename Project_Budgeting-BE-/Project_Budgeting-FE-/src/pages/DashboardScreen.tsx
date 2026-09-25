
import React from 'react';
import { Layout } from '../components/Layout';
import { OrgDashboard } from './OrgDashboard';
import { MyDashboard } from './MyDashboard';

interface DashboardScreenProps {
  userRole: 'admin' | 'user' | 'manager';
  currentPage: string;
  onNavigate: (page: string) => void;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({ userRole, currentPage, onNavigate }) => {
  const isOrgView = userRole === 'admin' || userRole === 'manager';

  return (
    <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
      {isOrgView ? <OrgDashboard /> : <MyDashboard />}
    </Layout>
  );
};

export default DashboardScreen;
