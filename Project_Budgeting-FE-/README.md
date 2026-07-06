# 💻 Budgeting Platform Frontend

This is the decoupled frontend client for the Budget Management Platform, built using **React 19**, **TypeScript**, and **Vite**.

---

## 📌 Features & Component Breakdown

### 1. Centralized State & User Auth (`src/auth` & `src/store`)
* **SimpleJWT Authentication**: Automatically includes `Bearer <Token>` on all API requests using Axios interceptors.
* **Token Lifetime & Auto-Refresh**: If a request encounters a `401 Unauthorized` status, it intercepts it, requests a fresh access token from `/accounts/refresh/` using a secure credentials cookie, updates the Redux store, and retries the original request.
* **Route Protection**: JWT-based auth guards block unauthenticated entries, redirecting to the login screen.

### 2. Time Tracking Dashboard (`src/pages/TaskManagement.tsx`)
* A full-fledged Kanban view separating dev tasks by status (*Todo, In Progress, Review, Done*).
* **Live Timers**: Leverages WebSockets via `ws/timer/` connection. Developers can start, pause, and stop times directly on the page, computing active durations locally and synchronizing them to timesheets on the backend.
* **Extra Hours Requests**: UI form to request estimate extensions for tasks.

### 3. Sales pipeline Kanban (`src/pages/PipelineScreen.tsx`)
* Visual column tracker grouping quotations by progress stages:
  * `opportunity`: Initial lead
  * `scoping`: Detailed service catalog mapping
  * `proposal`: Sent proposals pending evaluation
  * `confirmed`: Contract confirmed (triggers project creation wizard)
* **Drag and Drop**: Utilizes `@hello-pangea/dnd` for stage transitions.

### 4. Interactive Scoping Builder (`src/components/AddQuoteForm.tsx`)
* A dynamic tabular form allowing scoping managers to build complex proposals:
  * Dynamic row generation (Add, Duplicate, Remove).
  * Product category lists (e.g. SAP BASIS, Python, Analytics) mapped from price lists.
  * Real-time calculation of lines (`Qty × Unit Price`), sub-totals, customizable VAT/taxes, and margins.
  * API validation error parsers.

### 5. Pivot Reporting & Visual Analytics (`src/pages/ReportsPage.tsx`)
* Responsive line, bar, and pie charts summarizing inflow metrics via `Recharts`.
* Interactive pivots filtering metrics by company, project, and time intervals.
* Single-click exporter converting filtered pivot matrices to raw **Excel (XLSX)** spreadsheets or print-ready **PDF** documents.

---

## 🛠️ UI Tech Stack

* **Rendering Engine**: React 19 (TypeScript enabled)
* **Build System**: Vite (Fast HMR & build optimization)
* **Styling**: Tailwind CSS
* **Transitions**: Framer Motion (page animations and modal overlays)
* **API Handler**: Axios (Interceptors, automatic request retries)
* **State Managers**: Redux Toolkit & React-Redux
* **Charting**: Recharts
* **Excel Processor**: SheetJS (XLSX)
* **PDF Exporter**: jsPDF & jsPDF-AutoTable

---

## 📂 Source Code Structure

```
src/
├── assets/           # Vector designs, mock images, brand logos
├── auth/             # JWT middleware, login page, Redux auth slice
├── components/       # Universal forms, modals, tables, dialog boxes
├── hooks/            # Custom React hooks (debounce, timers, API helpers)
├── pages/            # 27 individual view templates
├── routes/           # Routing configuration maps
├── store/            # Redux Toolkit configured store
├── types/            # TypeScript schemas & global types
└── utils/            # Axios API config, WebSockets links, text formatting
```

---

## 🚀 Running Frontend Locally

### Prerequisites
Make sure **Node.js v18+** is installed on your machine.

1. Install package modules:
   ```bash
   npm install
   ```

2. Run the Vite development server:
   ```bash
   npm run dev
   ```
   *The server defaults to port 5173:* `http://localhost:5173`.

### Commands List
* **`npm run dev`**: Starts local hot-reloading development server.
* **`npm run build`**: Compiles TypeScript definitions (`tsc`) and builds production distribution assets in the `/dist` directory.
* **`npm run lint`**: Inspects code files for syntax errors and warnings using ESLint configurations.
* **`npm run preview`**: Starts a local preview server serving the production build directory for validation.

---

## 🔌 API & Websockets Connection
* Configure backend API base endpoints by setting the environment variable:
  ```env
  VITE_API_BASE_URL=https://your-backend-api.com
  ```
* If `VITE_API_BASE_URL` is omitted, the frontend automatically infers the origin base endpoint relative to the user's host on port 8000 (e.g. `http://<domain>:8000/api/`).
* Websocket channels automatically inherit protocol modes (`ws://` or secure `wss://`) depending on the context protocol.
