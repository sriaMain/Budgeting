# 📊 Budget Management Platform

A premium, enterprise-grade, end-to-end budgeting, quotation, and project tracking system. It is designed around a decoupled, state-of-the-art architecture featuring a robust **Django REST Framework (DRF)** backend and a highly responsive **React + TypeScript + Vite** frontend.

---

## 📌 Table of Contents
1. [System Overview & Business Flow](#-system-overview--business-flow)
2. [Key Capabilities](#-key-capabilities)
3. [Technology Stack](#%EF%B8%8F-technology-stack)
4. [Architecture & Project Structure](#-architecture--project-structure)
5. [Database Entity Breakdown (Backend Models)](#-database-entity-breakdown-backend-models)
6. [API Endpoints Overview](#-api-endpoints-overview)
7. [Installation & Setup](#-installation--setup)
8. [Environment Variables Reference](#-environment-variables-reference)
9. [Production Deployment Considerations](#%EF%B8%8F-production-deployment-considerations)
10. [Recent Updates](#-recent-updates)
11. [Changelog](#-changelog)

---

## 📌 System Overview & Business Flow

This application is a command center for professional service firms. It manages clients, drafts quotes, monitors projects against dynamic budgets, logs task progress with live WebSockets, captures vendor invoices, sends in-app notifications, and aggregates BI reporting.

```mermaid
graph TD
    A["Client & POC Creation"] --> B["Quotation Scoping & Pipeline"]
    B --> C["Quote Approval / Project Instantiation"]
    C --> D["Budget Allocation & Mode Selection"]
    D --> E["Task Assignment & Live Time Tracking"]
    E --> F["Timesheet Submission & Verification"]
    F --> G["Client Invoicing & Vendor Bills"]
    G --> H["Financial Reporting & Analytics"]
    H --> I["Notifications & Alerts"]

    style A fill:#e0f2fe,stroke:#0369a1,stroke-width:2px
    style B fill:#e0f2fe,stroke:#0369a1,stroke-width:2px
    style C fill:#fef9c3,stroke:#a16207,stroke-width:2px
    style D fill:#fef9c3,stroke:#a16207,stroke-width:2px
    style E fill:#f0fdf4,stroke:#15803d,stroke-width:2px
    style F fill:#f0fdf4,stroke:#15803d,stroke-width:2px
    style G fill:#fae8ff,stroke:#86198f,stroke-width:2px
    style H fill:#fae8ff,stroke:#86198f,stroke-width:2px
    style I fill:#fff1f2,stroke:#be123c,stroke-width:2px
```

### Business Flow Steps:
1. **Client Management**: Register companies and points of contact (POCs).
2. **Sales Pipeline**: Draft scope names, pricing, and services across stages (*Opportunity, Scoping, Proposal, Confirmed*).
3. **Project Instantiation**: Transition confirmed quotes into active projects automatically mapping existing client contracts.
4. **Intelligent Budgeting**: Allocate budgets based on:
   - **Quoted Amount Mode**: Syncs labor limits and budgets directly from line items.
   - **Manual Mode**: Custom hourly/monetary overrides.
5. **Task Execution & Live Tracking**: Assign tasks to developers. Developers track real-time activity via WebSockets.
6. **Billing & Costs**: Track outflows (vendor bills, staff rates) against inflows (client invoices/payment milestones).
7. **Business Intelligence**: Dashboards aggregate calculations (margins, cash flow) and export to Excel/PDF.
8. **Notifications**: In-app notification center for alerts, approvals, and system events.

---

## 🚀 Key Capabilities

### 1. Granular Budgeting & Outflow Control
* Real-time calculation of **Labor Outflows** by compiling timesheets and developer-specific rates.
* Aggregation of **Vendor Bills** and **Internal Expense Receipts** for external outflow tracking.
* Dynamic gauge visualization representing budget headroom limits with threshold alerts.
* **Profit Margin KPI cards** on the Projects screen showing dynamically computed profit percentages.

### 2. Live WebSocket Time Tracking
* Custom task timers using **Django Channels** and WebSockets, facilitating real-time Start / Pause / Stop states.
* Direct integration of timer logs into weekly timesheet entries, preventing manual logging errors.
* Streamlined request-and-approval logs for extra/overtime hours.

### 3. Comprehensive Financial Document Workflows
* Quotes with multi-row item structures specifying product categories, volumes, units, and rates.
* Automatic invoicing matching quoting line items to client requests.
* Full vendor lifecycle: Purchase Orders → Vendor Bills → Outgoing Payments.
* Integrated soft-delete triggers to preserve historical data audits.

### 4. BI Analytics & Reporting Dashboard
* Clean spreadsheets with metrics on: *Total Revenue, Invoiced, Received, Outstanding, and Margin %*.
* Interactive charts powered by **Recharts** with animated KPI cards via **Framer Motion**.
* Refined dashboard layout, alignment, and spacing for a more polished enterprise experience.
* Export to **Excel (.xlsx)** and **PDF** formats using client-side `xlsx` and `jsPDF` libraries.
* Highly parallelized database aggregations using Django aggregates.

### 5. Role-Based Access Control (RBAC)
* Database-backed permission system with granular codes (e.g., `VIEW_PROJECT`, `EDIT_FINANCES`).
* Admin panel to assign roles and permission bundles per user account.

### 6. In-App Notifications
* Dedicated notifications module for alerts, task approvals, extra-hours requests, and system events.
* Real-time delivery via Django Channels.

---

## 🛠️ Technology Stack

### Backend Services
| Layer | Technology |
|---|---|
| Core Runtime | Python 3.12+, Django 5.x |
| API Delivery | Django REST Framework (DRF) |
| Authentication | JSON Web Tokens via `djangorestframework-simplejwt` |
| Real-time Engine | Django Channels (WebSockets) + Redis Channel Layers |
| Background Tasks | Celery & Redis (emails, state updates) |
| Database (Dev) | SQLite |
| Database (Prod) | PostgreSQL / Neon DB |
| Media Storage | Cloudinary (`cloudinary_storage`) |
| ASGI Server | Daphne / Uvicorn |
| WSGI Server | Gunicorn |

### Frontend Client
| Layer | Technology |
|---|---|
| Runtime | React 19, TypeScript |
| Build Tool | Vite 7.x |
| Styling | Tailwind CSS 4.x |
| Animations | Framer Motion 12.x |
| State Manager | Redux Toolkit & React-Redux |
| Data Visualization | Recharts 3.x |
| HTTP Client | Axios (with JWT auto-refresh interceptors) |
| Drag-and-Drop | @hello-pangea/dnd |
| Icons | Lucide React |
| Notifications | React Hot Toast |
| Client-side PDF | jsPDF + jsPDF-autotable |
| Client-side Excel | xlsx |
| Routing | React Router DOM 7.x |

---

## 📂 Architecture & Project Structure

The project is split into two major decoupled parts:

```
Budgeting-master/
├── Project_Budgeting-BE-/      # Django REST API Backend
├── Project_Budgeting-FE-/      # React + Vite Frontend
├── README.md                   # This file
└── PROJECT_STATUS.md           # Latest development status
```

### Backend App Layout (`Project_Budgeting-BE-/`)
```
Project_Budgeting-BE-/
├── myproject/            # Django project settings & URL root
├── accounts/             # User accounts, JWT routing, developer rates
├── client/               # Client companies (Company) & contacts (POC)
├── product_group/        # Product catalog, price books, quote pipeline
├── Project/              # Projects, budgets, tasks, WebSocket timers, timesheets
├── finances/             # Invoices, POs, vendor bills, expenses, payments
├── notifications/        # In-app notifications & alerts
├── roles/                # RBAC schemas: Role, Permission, PermissionCategory
├── Reports/              # BI aggregation, Excel/PDF export services
├── core/                 # Global reusable templates, files, and helpers
├── manage.py
├── requirements.txt
└── run_all.bat           # One-click launcher for both servers (Windows)
```

* **`accounts`**: Custom Django User model (`AbstractUser` + `RBACUserMixin`). Houses role info and developer billing rates.
* **`client`**: Client directory (`Company`) and points of contact (`POC`).
* **`product_group`**: Product services directory, pricing structures, and sales opportunity quotes.
* **`Project`**: Projects, budget targets (`ProjectBudget`), task items, WebSocket timer events, and timesheets.
* **`finances`**: Financial outflows/inflows (Invoices, Purchase Orders, Vendor Bills, Expenses, and Payments).
* **`notifications`**: In-app notification delivery and event hooks.
* **`roles`**: Database-backed Role-Based Access Control (RBAC) schemas.
* **`Reports`**: Aggregation services for charts and downloadable reports.
* **`core`**: Global reusable templates, files, and helpers.

### Frontend Component Layout (`Project_Budgeting-FE-/src/`)
```
src/
├── auth/          # JWT authentication flow, state hooks, route protectors
├── components/    # Universal UI components (forms, tables, modals)
├── hooks/         # Custom React hooks
├── pages/         # 28 individual page layouts (see below)
├── routes/        # Route definitions and protected route wrappers
├── store/         # Central Redux store dispatchers & slices
├── types/         # Shared TypeScript type definitions
├── utils/         # Axios interceptors, API routing, WebSocket builders
├── App.tsx
└── main.tsx
```

#### All Pages (28 screens)
| Page File | Description |
|---|---|
| `DashboardScreen.tsx` | Animated KPI cards, charts, revenue/margin overview |
| `PipelineScreen.tsx` | Drag-and-drop sales pipeline with 4 stages |
| `ProjectsScreen.tsx` | Projects list with Profit Margin KPI card |
| `ProjectDetailsPage.tsx` | Full project detail: budget, tasks, timesheets |
| `TaskManagement.tsx` | Real-time WebSocket task timer & timesheet integration |
| `AddQuotePage.tsx` | Dynamic multi-row quote builder with margin & tax |
| `QuoteDetailsPage.tsx` | Quote detail, line items, status management |
| `ClientListPage.tsx` | Searchable client directory |
| `ClientDetailsPage.tsx` | Client profile with contacts and project history |
| `AddClientPage.tsx` | Client registration form |
| `ContactsScreen.tsx` | Points of Contact management |
| `GenerateInvoicePage.tsx` | Invoice creation mapped to quote line items |
| `InvoiceDetailsScreen.tsx` | Invoice viewer with payment tracking |
| `CreatePurchaseOrderPage.tsx` | Purchase order drafting form |
| `PurchaseOrderDetailsPage.tsx` | PO details with bill linkage |
| `BillDetailsPage.tsx` | Vendor bill viewer & approval workflow |
| `ExpenseDetailsPage.tsx` | Miscellaneous expense tracker |
| `VendorListPage.tsx` | Vendor/supplier directory |
| `VendorDetailsPage.tsx` | Vendor profile and bill history |
| `AddVendorPage.tsx` | Vendor registration form |
| `ReportsPage.tsx` | BI dashboard: charts, Excel & PDF export |
| `AdministrationScreen.tsx` | RBAC admin: roles, permissions, user management |
| `NotificationsScreen.tsx` | In-app notification center |
| `ProfilePage.tsx` | User profile and settings |
| `LoginForm.tsx` | JWT login screen |
| `ForgotPasswordForm.tsx` | Password reset via OTP |
| `VerificationScreen.tsx` | OTP verification screen |
| `CreatePasswordScreen.tsx` | New password creation screen |

---

## 🗄️ Database Entity Breakdown (Backend Models)

Here is a summary of the backend models mapping how data flows through the application:

### Accounts & Security
* **`Account`**: Custom Django User model inheriting `AbstractUser` and `RBACUserMixin`. Houses role info and developer billing rates.
* **`PasswordResetOTP`**: Security OTP logging for account recoveries.
* **`Role`**: Custom RBAC definition mapping permission bundles to system accounts.
* **`Permission`**: Granular security codes (e.g., `VIEW_PROJECT`, `EDIT_FINANCES`).
* **`PermissionCategory`**: Module tags (e.g., Client, Billing).

### Sales & Contracts
* **`Company`**: Directory of client companies.
* **`POC`**: Client points of contact.
* **`ProductGroup`**: Categorizations of services (e.g., SAP, Development, Analytics).
* **`Product_Services`**: Service catalog items with base unit prices.
* **`Quote`**: Sales opportunities capturing total cost, margin rates, tax rates, and lifecycle stage.
* **`QuoteItem`**: Individual lines in a quote.

### Project Tracking & Operations
* **`Project`**: Work scopes mapped to clients and quotes.
* **`ProjectBudget`**: Monitors current cash flow and hours. Supports **Quoted Amounts** sync and manual overrides.
* **`Task`**: Single items assigned to developers with estimates and tracked work hours.
* **`TaskTimerLog`**: Real-time timer entries (start/pause/stop WebSocket records).
* **`TaskExtraHoursRequest`**: Requests from developers to increase estimates, pending manager approvals.
* **`Timesheet`**: Weekly task tracking logs.
* **`TimesheetEntry`**: Individual task logs.

### Financial Transactions (Soft Delete Audited)
* **`Invoice`**: Client bills mapping project work.
* **`InvoiceItem`**: Client bill lines.
* **`InvoicePayment`**: Inward payments tracker.
* **`PurchaseOrder`**: Direct requests issued to contractors/vendors.
* **`VendorBill`**: Bills received from vendor activities.
* **`OutgoingPayment`**: Direct cash outflows mapping bills/expenses.
* **`Expense`**: Miscellaneous expenses (travel, software licenses).

### Notifications
* **`Notification`**: In-app alerts linked to users and system events.

---

## 🔌 API Endpoints Overview

The backend registers the following URL namespaces:

| Route Prefix | Component App | Responsibility |
|---|---|---|
| `/admin/` | Django Admin | Internal server administrator console |
| `/api/accounts/` | `accounts` | JWT tokens, login, registration, password resets |
| `/api/roles/` | `roles` | Role definitions, permissions mapping |
| `/api/` | `client` | Client companies and contacts management |
| `/api/` | `product_group` | Product catalog, price books, quote pipeline |
| `/api/` | `Project` | Projects, tasks, WebSocket time tracking logs, timesheets |
| `/api/` | `finances` | Invoices, expenses, purchase orders, payments |
| `/api/notifications/` | `notifications` | In-app notifications and alerts |
| `/api/` | `Reports` | Real-time BI dashboards, spreadsheet downloads, PDF generator |

---

## 🚀 Installation & Setup

You can run both systems locally in development.

### Prerequisites
* Python 3.12+
* Node.js v18+
* Redis server (running locally on port `6379` for Celery and WebSockets)

### 1. Quick Start — One-Click Launch (Windows)
Double-click **`run_all.bat`** inside the `Project_Budgeting-BE-` directory. This Windows batch script launches both servers in separate terminal windows automatically:
* Django Backend: `http://localhost:8000`
* React Vite Frontend: `http://localhost:5173`

---

### 2. Manual Service Configuration

#### Backend Setup
```bash
# 1. Navigate to the backend directory
cd Project_Budgeting-BE-

# 2. Create and activate a Python virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Apply database migrations
python manage.py migrate

# 5. (Optional) Create a superuser
python manage.py createsuperuser

# 6. Start the Django development server
python manage.py runserver

# 7. In a separate terminal, start the Celery worker
celery -A myproject worker -l info
```

#### Frontend Setup
```bash
# 1. Navigate to the frontend directory
cd Project_Budgeting-FE-

# 2. Install Node dependencies
npm install

# 3. Run the local dev server
npm run dev
```

---

## 🔐 Environment Variables Reference

### Backend (`.env` in `Project_Budgeting-BE-/`)
```env
SECRET_KEY=your-django-secret-key
DATABASE_URL=postgresql://user:pass@host:port/dbname

# Cloudinary media storage
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Redis (Celery & Channels)
REDIS_URL=redis://localhost:6379/0

# Email configuration (optional)
EMAIL_HOST=smtp.your-provider.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@example.com
EMAIL_HOST_PASSWORD=your-email-password
```

### Frontend (`.env` in `Project_Budgeting-FE-/`)
```env
# Defaults to http://localhost:8000 if not set
VITE_API_BASE_URL=http://localhost:8000
```

---

## 🛡️ Production Deployment Considerations

* **Database Engine**: Toggle to Neon DB or a standalone Postgres instance by updating `DATABASE_URL` in the backend `.env`.
* **WSGI / ASGI Servers**:
  * Run **Gunicorn** for standard HTTP API request handling.
  * Run **Daphne** or **Uvicorn** to handle persistent WebSocket (`ws://`) channels alongside Gunicorn.
* **File Uploads**: All receipts, attachments, and profile images automatically upload to Cloudinary via `cloudinary_storage` in `settings.py`.
* **Celery Workers**: Run `celery worker` to handle bulk emails, notifications, and state updates asynchronously without stalling API servers.
* **Security Filters**: Update `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` in `myproject/settings.py` to point to production domain URLs instead of wildcards or localhost.
* **Frontend Build**: Run `npm run build` in `Project_Budgeting-FE-/` to generate the optimized `dist/` bundle and serve it via a CDN or static file server (e.g., Nginx, Vercel, Netlify).
* **Procfile**: A `Procfile` is included in the backend directory for Heroku/Railway-style deployments.

---

# Recent Updates

## Dashboard
- Reordered the Financial Overview KPI cards to follow a more intuitive business flow: Total Budget, Total Received, Total Expenses, Forecasted Profit, and Net Profit.
- Improved dashboard card alignment and spacing for cleaner presentation.
- Refined the dashboard layout to enhance readability and visual hierarchy.

## Navigation
- Removed icons from the navigation bar for a cleaner enterprise-style interface.
- Fixed the active-page highlighting issue so Pipeline is now highlighted correctly alongside other menu items.
- Corrected active-route detection for all navigation items.
- Standardized spacing between Dashboard, Pipeline, Projects, and the other top-level menu items.
- Improved navbar consistency across the application.

## UI Improvements
- Fixed spacing inconsistencies across dashboard-related pages.
- Improved overall layout alignment and visual balance.
- Enhanced responsive behavior and visual consistency.
- Standardized margins and padding for a more polished professional UI.

## Documentation
- Updated the README to reflect the latest UI, navigation, and dashboard refinements.
- Added a dedicated changelog section for recent updates.
- Improved project documentation for easier onboarding and maintainability.

---

## 📜 Changelog

| Version | Date | Highlights |
|---|---|---|
| `aa3295b` | 2026-07 | Root-level README restructured; app-specific READMEs added |
| `7e3910d` | 2026-07 | Repository clean-up and file relocation |
| `8afd3a1` | 2026-07 | Documentation added; Forecasted Profit KPI card polished |
| `5e5a938` | 2026-07 | Dashboard rebuilt with animated KPI cards; Pipeline UI updated; `run_all.bat` launcher added |
| `ed177fa` | 2026-07 | Initial commit: Django backend modules + 27 React page/component layouts |

---

> **Active Branch:** `ravindra` — Currently adding a **Profit Margin KPI Card** to `ProjectsScreen.tsx`, refactoring the metrics grid from 3 to 4 columns.
