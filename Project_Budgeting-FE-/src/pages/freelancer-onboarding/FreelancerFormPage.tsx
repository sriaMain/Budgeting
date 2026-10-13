import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/freelancerOnboarding';
import type { FreelancerChoices } from '../../types/freelancerOnboarding.types';
import { FreelancerWorkspace } from './components/FreelancerWorkspace';

/**
 * Full-page freelancer view (/freelancers/add, /freelancers/:id) - the same onboarding
 * wizard and operational tabs as the drawer, laid out as a page.
 */
export function FreelancerFormContent() {
  const navigate = useNavigate();
  const { freelancerId } = useParams<{ freelancerId: string }>();
  const routeId = freelancerId ? Number(freelancerId) : null;
  const [choices, setChoices] = useState<FreelancerChoices | null>(null);
  // A freelancer created on this page keeps the same (already loaded) workspace after the
  // URL switches from /add to /:id.
  const [createdId, setCreatedId] = useState<number | null>(null);
  const keepCreated = routeId !== null && routeId === createdId;

  useEffect(() => {
    let alive = true;
    api.getChoices().then((c) => alive && setChoices(c)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4 animate-fade-in-down">
      <button
        type="button"
        onClick={() => navigate('/freelancers')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium text-sm dark:text-gray-400 dark:hover:text-gray-100"
      >
        <ArrowLeft size={18} /> Back to Freelancers
      </button>
      <FreelancerWorkspace
        key={keepCreated || routeId === null ? 'new' : String(routeId)}
        freelancerId={keepCreated ? null : routeId}
        choices={choices}
        onCreated={(created) => {
          setCreatedId(created.id);
          navigate(`/freelancers/${created.id}`, { replace: true });
        }}
      >
        {({ title, subtitle, header, body, footer }) => (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
            <div className="px-4 sm:px-6 pt-5">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">{title}</h2>
              {subtitle && <p className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">{subtitle}</p>}
            </div>
            <div className="px-4 sm:px-6 py-5 space-y-5">
              {header}
              {body}
            </div>
            {footer && (
              <div className="sticky bottom-0 z-10 border-t border-gray-100 bg-white px-4 sm:px-6 py-4 rounded-b-lg dark:bg-gray-900 dark:border-gray-800">
                {footer}
              </div>
            )}
          </div>
        )}
      </FreelancerWorkspace>
    </div>
  );
}

const FreelancerFormPage: React.FC = () => {
  const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager') || 'admin';

  return (
    <Layout userRole={userRole} currentPage="freelancers" onNavigate={() => { }}>
      <FreelancerFormContent />
    </Layout>
  );
};

export default FreelancerFormPage;
