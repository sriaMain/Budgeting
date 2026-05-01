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
import { initializeAuth } from "./auth/authThunk";
import { useAppSelector } from "./hooks/useAppSelector";

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<string>("dashboard");
  // Get userRole from Redux store - this will be set after login
  const userRole = useAppSelector((state) => state.auth.userRole) || "user";

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
  };

  useEffect(() => {
    console.log("App mounted, initializing auth...");

    initializeAuth();
    console.log("Auth initialization dispatched.");
  }, []);


  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-white p-4 sm:p-6 lg:p-8">
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginForm />} />

          <Route path="/forgot-password" element={<ForgotPasswordForm />} />
          <Route path="/verification" element={<VerificationScreen />} />


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

          <Route path="/create-password" element={<CreatePasswordScreen />} />


        </Routes >
      </BrowserRouter >
    </main >
  );
};

export default App;
