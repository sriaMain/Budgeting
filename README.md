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
8. [Production Deployment Considerations](#-production-deployment-considerations)

---

## 📌 System Overview & Business Flow

This application is a command center for professional service firms. It manages clients, drafts quotes, monitors projects against dynamic budgets, logs task progress with live WebSockets, captures vendor invoices, and aggregates BI reporting.

```mermaid
graph TD
    A["Client & POC Creation"] --> B["Quotation Scoping & Pipeline"]
    B --> C["Quote Approval / Project Instantiation"]
    C --> D["Budget Allocation & Mode Selection"]
    D --> E["Task Assignment & Live Time Tracking"]
    E --> F["Timesheet Submission & Verification"]
    F --> G["Client Invoicing & Vendor Bills"]
    G --> H["Financial Reporting & Analytics"]
    
    style A fill:#e0f2fe,stroke:#0369a1,stroke-width:2px
    style B fill:#e0f2fe,stroke:#0369a1,stroke-width:2px
    style C fill:#fef9c3,stroke:#a16207,stroke-width:2px
    style D fill:#fef9c3,stroke:#a16207,stroke-width:2px
    style E fill:#f0fdf4,stroke:#15803d,stroke-width:2px
    style F fill:#f0fdf4,stroke:#15803d,stroke-width:2px
    style G fill:#fae8ff,stroke:#86198f,stroke-width:2px
    style H fill:#fae8ff,stroke:#86198f,stroke-width:2px
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

---

## 🚀 Key Capabilities

### 1. Granular Budgeting & Outflow Control
* Real-time calculation of **Labor Outflows** by compiling timesheets and developer-specific rates.
* Aggregation of **Vendor Bills** and **Internal Expense Receipts** for external outflow tracking.
* Dynamic gauge visualization representing budget headroom limits with threshold alerts.

### 2. Live WebSocket Time Tracking
* Custom task timers using **Django Channels** and WebSockets, facilitating real-time Start / Pause / Stop states.
* Direct integration of timer logs into weekly timesheet entries, preventing manual logging errors.
* Streamlined request-and-approval logs for extra/overtime hours.

### 3. Comprehensive Financial Document Workflows
* Quotes with multi-row item structures specifying product categories, volumes, units, and rates.
* Automatic invoicing matching quoting line items to client requests.
* Integrated soft-delete triggers to preserve historical data audits.

### 4. BI Analytics & Reporting Dashboard
* Clean spreadsheets with metrics on: *Total Revenue, Invoiced, Received, Outstanding, and Margin %*.
* Highly parallelized database aggregations using Django aggregates.
* Export to **Excel (.xlsx)** and **PDF** formats.

---

## 🛠️ Technology Stack

### Backend Services
* **Core Runtime**: Python 3.12+, Django 5.x
* **API Delivery**: Django REST Framework (DRF)
* **Auth**: JSON Web Tokens (JWT) using `djangorestframework-simplejwt`
* **Real-time Engine**: Django Channels (WebSockets) backed by Redis Channel Layers
* **Background Tasks**: Celery & Redis (Task schedules, emails)
* **Storage Providers**: SQLite (Dev) / PostgreSQL (Prod) / Cloudinary (Media storage)

### Frontend client
* **Runtime**: React 19, TypeScript
* **Build tool**: Vite
* **Styling Engine**: Tailwind CSS
* **State Manager**: Redux Toolkit & React-Redux
* **Data Visualization**: Recharts
* **Drag-and-Drop**: @hello-pangea/dnd

---

## 📂 Architecture & Project Structure

The project is split into two major decoupled parts:

```
Budgeting-master/
├── Project_Budgeting-BE-/      # Django REST API Backend
└── Project_Budgeting-FE-/      # React + Vite Frontend
```

### Backend App Layout
* **`accounts`**: User accounts model (`Account`), simple JWT token routing, and developer hourly rate mappings.
* **`client`**: Client directory (`Company`) and points of contact (`POC`).
* **`product_group`**: Product services directory, pricing structures, and sales opportunity quotes.
* **`Project`**: Projects, budget targets (`ProjectBudget`), task items, WebSockets timer events, and timesheets.
* **`finances`**: Financial outflows/inflows (Invoices, Purchase Orders, Vendor Bills, Expenses, and Payments).
* **`roles`**: Database-backed Role-Based Access Control (RBAC) schemas.
* **`Reports`**: Aggregation services for charts and downloadable reports.
* **`core`**: Global reusable templates, files, and helpers.

### Frontend Component Layout
* **`src/auth`**: JWT authentication flow, state hooks, and route protectors.
* **`src/components`**: Universal UI components (dynamic forms, tables, details modal, AddQuoteForm).
* **`src/pages`**: 27 individual page layouts (dashboards, kanbans, reports, profiles, lists).
* **`src/store`**: Central Redux store dispatchers.
* **`src/utils`**: Custom Axios interception helpers, API routing, and WebSocket link builders.

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
| `/api/` | `Reports` | Real-time BI dashboards, spreadsheet downloads, PDF generator |

---

## 🚀 Installation & Setup

You can run both systems locally in development. 

### Prerequisites
* Python 3.12+
* Node.js v18+
* Redis server (running locally on port 6379 for Celery and WebSockets)

### 1. Start Both Services (Easy Mode)
Double-click **`run_all.bat`** at the project root. This Windows batch script will launch both servers in individual command line windows automatically:
* Django Backend server: `http://localhost:8000`
* React Vite Frontend: `http://localhost:5173`

---

### 2. Manual Service Configuration

#### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd Project_Budgeting-BE-
   ```
2. Create and activate a python virtual environment:
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up your `.env` variables (e.g., matching database credentials and Cloudinary credentials):
   ```env
   SECRET_KEY=your-django-secret-key
   DATABASE_URL=postgresql://user:pass@host:port/dbname
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   ```
5. Apply database migrations:
   ```bash
   python manage.py migrate
   ```
6. Start the Django ASGI/WSGI developer server:
   ```bash
   python manage.py runserver
   ```
7. Start Celery worker tasks:
   ```bash
   celery -A myproject worker -l info
   ```

#### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd Project_Budgeting-FE-
   ```
2. Install node dependencies:
   ```bash
   npm install
   ```
3. Configure environment variable targets:
   Create a `.env` file (optional, defaults to `http://localhost:8000`):
   ```env
   VITE_API_BASE_URL=http://localhost:8000
   ```
4. Run the local dev server:
   ```bash
   npm run dev
   ```

---

## 🛡️ Production Deployment Considerations

* **Database Engine**: Toggle the Neon DB or standalone Postgres server connection by adjusting the `DATABASE_URL` env variable.
* **WSGI / ASGI Servers**:
  * Run WSGI via **Gunicorn** for HTTP API request handling.
  * Run ASGI via **Daphne** or **Uvicorn** to handle persistent WebSocket (`ws://`) state channels.
* **File Uploads**: All receipts, attachments, and profile images automatically upload to Cloudinary using `cloudinary_storage` settings in `settings.py`.
* **Celery Workers**: Run background processes (`celery worker`) to handle bulk emails and state updates asynchronously without stalling API servers.
* **Security Filters**: Update `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` in `myproject/settings.py` to point to production domain URLs instead of wildcards or localhost values.
