/**
 * TaskDeepLinkHandler.tsx
 *
 * Landing page for email deep-links: /task-access?token=<signed_token>
 *
 * Flow:
 *  1. Extract token from URL.
 *  2. Call GET /api/task-access/?token= (unauthenticated request is allowed;
 *     the backend will return status='login_required' with a `next` field).
 *  3. Handle each status returned by the backend:
 *     - ok            → redirect to /task-management?task=<id>
 *     - login_required → redirect to /?next=<encoded_destination>
 *     - expired       → show expiry UI
 *     - reassigned    → show reassignment UI
 *     - unauthorized  → show access denied UI
 *     - not_found     → show not-found UI
 *     - any error     → show generic error UI
 */

import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axiosInstance from "../utils/axiosInstance";

// ── Status type ──────────────────────────────────────────────────────────────

type DeepLinkStatus =
  | "loading"
  | "ok"
  | "login_required"
  | "expired"
  | "reassigned"
  | "unauthorized"
  | "not_found"
  | "error";

interface DeepLinkResult {
  status: DeepLinkStatus;
  message?: string;
  task_id?: number;
  task_title?: string;
  project_name?: string;
  next?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

const TaskDeepLinkHandler: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [result, setResult] = useState<DeepLinkResult>({ status: "loading" });

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setResult({ status: "error", message: "No token provided in the URL." });
      return;
    }

    axiosInstance
      .get(`/api/task-access/`, { params: { token } })
      .then((res) => {
        const data = res.data as DeepLinkResult;

        if (data.status === "ok") {
          // Navigate to task management and open the specific task
          navigate(`/task-management?task=${data.task_id}`, { replace: true });
        } else if (data.status === "login_required") {
          // Preserve the deep-link destination so LoginForm can return here
          const destination = `/task-access?token=${encodeURIComponent(token)}`;
          navigate(`/?next=${encodeURIComponent(destination)}`, { replace: true });
        } else {
          setResult(data);
        }
      })
      .catch((err) => {
        const data = err?.response?.data as DeepLinkResult | undefined;
        if (data?.status) {
          setResult(data);
        } else {
          setResult({
            status: "error",
            message: "An unexpected error occurred. Please try again later.",
          });
        }
      });
  }, [token]);

  // ── Render states ──────────────────────────────────────────────────────────

  if (result.status === "loading") {
    return <StatusScreen icon="⏳" title="Verifying your link…" subtitle="Please wait while we validate your task access link." color="blue" />;
  }

  if (result.status === "expired") {
    return (
      <StatusScreen
        icon="⏰"
        title="Link Expired"
        subtitle="This task assignment link has expired. Please contact your project manager or admin to resend the assignment."
        color="amber"
        action={{ label: "Go to Dashboard", href: "/dashboard" }}
      />
    );
  }

  if (result.status === "reassigned") {
    return (
      <StatusScreen
        icon="🔄"
        title="Task Reassigned"
        subtitle="This task has been reassigned to another team member. Your link is no longer valid."
        color="purple"
        action={{ label: "Go to Dashboard", href: "/dashboard" }}
      />
    );
  }

  if (result.status === "unauthorized") {
    return (
      <StatusScreen
        icon="🔒"
        title="Access Denied"
        subtitle="This task link is not associated with your account."
        color="red"
        action={{ label: "Go to Dashboard", href: "/dashboard" }}
      />
    );
  }

  if (result.status === "not_found") {
    return (
      <StatusScreen
        icon="🗑️"
        title="Task Not Found"
        subtitle="This task no longer exists. It may have been deleted."
        color="gray"
        action={{ label: "Go to Dashboard", href: "/dashboard" }}
      />
    );
  }

  return (
    <StatusScreen
      icon="⚠️"
      title="Something Went Wrong"
      subtitle={result.message ?? "An unexpected error occurred."}
      color="red"
      action={{ label: "Go to Dashboard", href: "/dashboard" }}
    />
  );
};

// ── Reusable status screen sub-component ──────────────────────────────────────

interface StatusScreenProps {
  icon: string;
  title: string;
  subtitle: string;
  color: "blue" | "amber" | "purple" | "red" | "gray";
  action?: { label: string; href: string };
}

const colorMap: Record<StatusScreenProps["color"], { bg: string; text: string; btn: string; ring: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-700",   btn: "bg-blue-600 hover:bg-blue-700",   ring: "ring-blue-200" },
  amber:  { bg: "bg-amber-50",  text: "text-amber-700",  btn: "bg-amber-500 hover:bg-amber-600",  ring: "ring-amber-200" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", btn: "bg-purple-600 hover:bg-purple-700", ring: "ring-purple-200" },
  red:    { bg: "bg-red-50",    text: "text-red-700",    btn: "bg-red-600 hover:bg-red-700",    ring: "ring-red-200" },
  gray:   { bg: "bg-gray-50",   text: "text-gray-700",   btn: "bg-gray-600 hover:bg-gray-700",   ring: "ring-gray-200" },
};

const StatusScreen: React.FC<StatusScreenProps> = ({ icon, title, subtitle, color, action }) => {
  const navigate = useNavigate();
  const c = colorMap[color];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className={`max-w-md w-full rounded-2xl shadow-xl p-10 text-center ring-1 ${c.ring} bg-white`}>
        {/* Icon badge */}
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${c.bg} mb-6 text-4xl`}>
          {icon}
        </div>

        {/* Title */}
        <h1 className={`text-2xl font-bold mb-3 ${c.text}`}>{title}</h1>

        {/* Subtitle */}
        <p className="text-slate-500 text-sm leading-relaxed mb-8">{subtitle}</p>

        {/* Action button */}
        {action && (
          <button
            onClick={() => navigate(action.href, { replace: true })}
            className={`${c.btn} text-white font-semibold px-8 py-3 rounded-xl transition-colors duration-200 shadow-sm`}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
};

export default TaskDeepLinkHandler;
