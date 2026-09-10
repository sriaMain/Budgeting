import React, { useEffect, useState } from "react";
import { LoginForm } from "./pages/LoginForm";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from 'react-hot-toast';
import { ForgotPasswordForm } from "./pages/ForgotPasswordForm";
import VerificationScreen from "./pages/VerificationScreen";
import CreatePasswordScreen from "./pages/CreatePasswordScreen";
import DashboardScreen from "./pages/DashboardScreen";
import AdministrationScreen from "./pages/AdministrationScreen";

import ProjectsScreen from "./pages/ProjectsScreen";
import ProtectedRoute from "./auth/ProtectedRoute";
import ProjectDetailsPage from "./pages/ProjectDetailsPage";
import TaskManagement from "./pages/TaskManagement";
import ContactsScreen from "./pages/ContactsScreen";
import PipelineScreen from "./pages/PipelineScreen";
import QuoteDetailsPage from "./pages/QuoteDetailsPage";
import AddQuotePage from "./pages/AddQuotePage";
import ProfilePage from "./pages/ProfilePage";
import InvoiceDetailsScreen from "./pages/InvoiceDetailsScreen";
import GenerateInvoicePage from "./pages/GenerateInvoicePage";
import CreatePurchaseOrderPage from "./pages/CreatePurchaseOrderPage";
import PurchaseOrderDetailsPage from "./pages/PurchaseOrderDetailsPage";
import BillDetailsPage from "./pages/BillDetailsPage";
import ExpenseDetailsPage from "./pages/ExpenseDetailsPage";
import ReportsPage from "./pages/ReportsPage";
import VendorListPage from "./pages/vendor-onboarding/VendorListPage";
import VendorOnboardingWizardPage from "./pages/vendor-onboarding/VendorOnboardingWizardPage";
import VendorDetailsPage from "./pages/vendor-onboarding/VendorDetailsPage";
import VendorApprovalQueuePage from "./pages/vendor-onboarding/VendorApprovalQueuePage";
import VendorPortalPage from "./pages/vendor-onboarding/public/VendorPortalPage";
import FreelancerListPage from "./pages/freelancer-onboarding/FreelancerListPage";
import FreelancerFormPage from "./pages/freelancer-onboarding/FreelancerFormPage";
import FreelancerOnboardingPortalPage from "./pages/freelancer-onboarding/public/FreelancerOnboardingPortalPage";
import EmployeeOnboardingPortalPage from "./pages/employee-onboarding/public/EmployeeOnboardingPortalPage";
import EmployeeOnboardingReviewPage from "./pages/employee-onboarding/EmployeeOnboardingReviewPage";
import AdminFillOnboardingPage from "./pages/employee-onboarding/AdminFillOnboardingPage";
import { initializeAuth } from "./auth/authThunk";
import { useAppSelector } from "./hooks/useAppSelector";
import { useAppDispatch } from "./hooks/useAppDispatch";

// Login/forgot-password/verification render a single fixed-width card that
// relies on a centering parent - unlike the app's full-screen pages
// (dashboard, onboarding portals, etc.), which must fill the viewport
// themselves and so are rendered directly under <main> instead.
const CenteredAuthPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
    {children}
  </div>
);

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<string>("dashboard");
  // Get userRole from Redux store - this will be set after login
  const userRole = useAppSelector((state) => state.auth.userRole) || "user";
  const dispatch = useAppDispatch();

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
  };

  useEffect(() => {
    console.log("App mounted, initializing auth...");

    dispatch(initializeAuth());
    console.log("Auth initialization dispatched.");
  }, [dispatch]);


  return (
    <main className="min-h-screen w-full bg-white">
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CenteredAuthPage><LoginForm /></CenteredAuthPage>} />

          <Route path="/forgot-password" element={<CenteredAuthPage><ForgotPasswordForm /></CenteredAuthPage>} />
          <Route path="/verification" element={<CenteredAuthPage><VerificationScreen /></CenteredAuthPage>} />

          {/* Vendor self-service onboarding portal - secure token in the URL is the only
              access control; must NOT be wrapped in ProtectedRoute since the vendor has
              no account/login at all. */}
          <Route path="/vendor-onboarding/:token" element={<VendorPortalPage />} />

          {/* Employee self-service onboarding portal - secure token in the URL is the only
              access control; must NOT be wrapped in ProtectedRoute since the employee has
              no need to log in to complete onboarding. */}
          <Route path="/employee-onboarding/:token" element={<EmployeeOnboardingPortalPage />} />

          {/* Freelancer self-service onboarding portal - secure token in the URL is the only
              access control; must NOT be wrapped in ProtectedRoute since the freelancer has
              no account/login at all. */}
          <Route path="/freelancer-onboarding/:token" element={<FreelancerOnboardingPortalPage />} />


          {/* Protect Dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardScreen
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Protect Administration */}
          <Route
            path="/administration"
            element={
              <ProtectedRoute>
                <AdministrationScreen
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />
          <Route path="/contacts" element={
            <ProtectedRoute>
              <ContactsScreen

              />
            </ProtectedRoute>
          } />

          {/* Protect Pipeline */}
          <Route
            path="/pipeline"
            element={
              <ProtectedRoute>
                <PipelineScreen
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Protect Projects */}
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <ProjectsScreen
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Protect Quotes */}
          <Route
            path="/projects/:projectId"
            element={
              <ProtectedRoute>
                <ProjectDetailsPage
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />
          {/* Protect Quote Details */}
          <Route
            path="/pipeline/quote/:quoteNo"
            element={
              <ProtectedRoute>
                <QuoteDetailsPage
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Task Management */}
          <Route
            path="/task-management"
            element={
              <ProtectedRoute>
                <TaskManagement
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Profile Page */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Protect Add Quote */}
          <Route
            path="/pipeline/add-quote"
            element={
              <ProtectedRoute>
                <AddQuotePage />
              </ProtectedRoute>
            }
          />

          {/* Edit Quote */}
          <Route
            path="/pipeline/edit-quote/:quoteId"
            element={
              <ProtectedRoute>
                <AddQuotePage />
              </ProtectedRoute>
            }
          />

          {/* Edit Project */}
          <Route
            path="/projects/edit/:projectId"
            element={
              <ProtectedRoute>
                <AddQuotePage />
              </ProtectedRoute>
            }
          />

          {/* Generate Invoice Page (Full Screen) */}
          <Route
            path="/generate-invoice/:quotationId"
            element={
              <ProtectedRoute>
                <GenerateInvoicePage />
              </ProtectedRoute>
            }
          />

          {/* Invoice Details Screen */}
          <Route
            path="/invoices/:invoiceId"
            element={
              <ProtectedRoute>
                <InvoiceDetailsScreen
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Edit Invoice Page */}
          <Route
            path="/invoices/:invoiceId/edit"
            element={
              <ProtectedRoute>
                <GenerateInvoicePage />
              </ProtectedRoute>
            }
          />

          {/* Create Purchase Order Page */}
          <Route
            path="/create-purchase-order/:quotationId"
            element={
              <ProtectedRoute>
                <CreatePurchaseOrderPage />
              </ProtectedRoute>
            }
          />

          {/* Purchase Order Details Page */}
          <Route
            path="/purchase-orders/:poId"
            element={
              <ProtectedRoute>
                <PurchaseOrderDetailsPage />
              </ProtectedRoute>
            }
          />

          {/* Purchase Order Details Page */}
          <Route
            path="/purchase-orders/:poId"
            element={
              <ProtectedRoute>
                <PurchaseOrderDetailsPage />
              </ProtectedRoute>
            }
          />

          {/* Bill Details Page */}
          <Route
            path="/bills/:billId"
            element={
              <ProtectedRoute>
                <BillDetailsPage
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Expense Details Page */}
          <Route
            path="/expenses/:expenseId"
            element={
              <ProtectedRoute>
                <ExpenseDetailsPage
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Reports Page */}
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <ReportsPage
                  userRole={userRole}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                />
              </ProtectedRoute>
            }
          />

          {/* Vendor Onboarding */}
          <Route
            path="/vendors"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <VendorListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vendors/add"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <VendorOnboardingWizardPage />
              </ProtectedRoute>
            }
          />
          {/* Freelancer Onboarding */}
          <Route
            path="/freelancers"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <FreelancerListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/freelancers/add"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <FreelancerFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/freelancers/:freelancerId"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <FreelancerFormPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/vendors/:vendorId/edit"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <VendorOnboardingWizardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vendors/:vendorId"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <VendorDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vendors/approvals"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <VendorApprovalQueuePage />
              </ProtectedRoute>
            }
          />

          {/* Employee Onboarding - admin review */}
          <Route
            path="/employee-onboarding/review/:accountId"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <EmployeeOnboardingReviewPage />
              </ProtectedRoute>
            }
          />

          {/* Employee Onboarding - admin fills the onboarding wizard on the employee's behalf */}
          <Route
            path="/employee-onboarding/fill/:accountId"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <AdminFillOnboardingPage />
              </ProtectedRoute>
            }
          />

          <Route path="/create-password" element={<CreatePasswordScreen />} />


        </Routes >
      </BrowserRouter >
    </main >
  );
};

export default App;
