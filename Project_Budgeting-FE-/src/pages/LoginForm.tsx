import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch } from "react-redux";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, TrendingDown } from "lucide-react";
import type { LoginFormData, FormErrors } from "../types";
import axiosInstance from "../utils/axiosInstance";
import { useAppNavigation } from "../hooks/useAppNavigation";
import { parseApiErrors } from "../utils/parseApiErrors";
import { Toast } from "../components/Toast";

// Only the username / email is remembered - never the password.
const REMEMBER_KEY = "pb-remembered-identifier";

const readRemembered = (): string => {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? "";
  } catch {
    return "";
  }
};

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all " +
  "placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-100 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20";

const INPUT_ERROR_CLASS = "border-red-400 focus:border-red-500 focus:ring-red-100 dark:border-red-500/60 dark:focus:ring-red-500/20";

const PREVIEW_ROWS = [
  { label: "Engineering", amount: "₹18,40,000", pct: 82, color: "from-indigo-500 to-indigo-400" },
  { label: "Design", amount: "₹6,20,000", pct: 54, color: "from-violet-500 to-violet-400" },
  { label: "Infrastructure", amount: "₹5,10,000", pct: 71, color: "from-sky-500 to-sky-400" },
  { label: "Marketing", amount: "₹3,34,800", pct: 38, color: "from-emerald-500 to-emerald-400" },
];

export const LoginForm: React.FC = () => {
  const [formData, setFormData] = useState<LoginFormData>(() => ({
    emailOrUsername: readRemembered(),
    password: "",
    captchaInput: "",
  }));
  const [rememberMe, setRememberMe] = useState(() => readRemembered() !== "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const { goTo } = useAppNavigation();
  const dispatch = useDispatch();

  const togglePasswordVisibility = useCallback(() => setShowPassword((prev) => !prev), []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear errors as soon as the user edits the field.
    if (errors[name as keyof FormErrors] || errors.general) {
      setErrors((prev) => ({ ...prev, [name]: undefined, general: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.emailOrUsername.trim()) {
      newErrors.emailOrUsername = "Username or email is required";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});
    const payLoad = {
      identifier: formData.emailOrUsername.trim(),
      password: formData.password,
    };

    try {
      const response = await axiosInstance.post("/accounts/login/", payLoad);

      if (response.status === 200) {
        try {
          if (rememberMe) localStorage.setItem(REMEMBER_KEY, payLoad.identifier);
          else localStorage.removeItem(REMEMBER_KEY);
        } catch {
          // storage unavailable (private mode) - nothing to remember
        }

        // Map backend roles to frontend roles
        const backendRole = response.data.user.roles[0] || "user";
        let userRole: "admin" | "user" | "manager" = "user";
        if (backendRole.toLowerCase() === "admin") {
          userRole = "admin";
        } else if (backendRole.toLowerCase() === "project manager" || backendRole.toLowerCase() === "manager") {
          userRole = "manager";
        }

        dispatch({
          type: "auth/loginSuccess",
          payload: {
            isAuthenticated: true,
            userRole,
            accessToken: response.data.access_token,
            username: response.data.user.username,
            email: response.data.user.email,
          },
        });

        // Show toast and soften the form, then navigate after a brief delay
        setIsNavigating(true);
        setShowToast(true);
        setTimeout(() => {
          goTo("/dashboard");
        }, 1800);
      }
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-white font-sans lg:flex-row dark:bg-gray-950">
      {/* ---------------- Sign-in form: right on desktop, the whole screen on mobile ---------------- */}
      <section className="relative order-1 flex min-h-screen w-full flex-col bg-white px-6 py-12 lg:order-2 lg:w-1/2 lg:px-20 dark:bg-gray-950">
        {/* Brand */}
        <div className="flex items-center gap-3">
          {/* Sria Infotech logo (public/sria_logo_gray.png). The source is a square canvas with
              wide margins, so the box crops it to the mark + wordmark. White plate in dark mode
              keeps the grey wordmark legible. */}
          <span
            role="img"
            aria-label="Sria Infotech"
            className="block h-[62px] w-[98px] shrink-0 rounded-lg bg-no-repeat dark:bg-white"
            style={{ backgroundImage: "url(/sria_logo_gray.png)", backgroundSize: "100px 100px", backgroundPosition: "-2px -17px" }}
          />
          <span className="h-8 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            Project<span className="text-indigo-600 dark:text-indigo-400">Budget</span>
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="relative w-full max-w-md">
            {isNavigating && (
              <div className="absolute inset-0 z-10 rounded-2xl bg-white/50 backdrop-blur-[2px] dark:bg-gray-950/50" />
            )}

            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">Welcome Back</h1>
              <p className="mt-2 text-slate-600 dark:text-slate-400">Manage your project finances seamlessly.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {errors.general && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errors.general}</span>
                </div>
              )}

              <div>
                <label htmlFor="login-identifier" className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">
                  Username or email
                </label>
                <input
                  id="login-identifier"
                  name="emailOrUsername"
                  type="text"
                  value={formData.emailOrUsername}
                  onChange={handleChange}
                  placeholder="you@company.com"
                  autoComplete="username"
                  autoFocus={!formData.emailOrUsername}
                  aria-invalid={!!errors.emailOrUsername}
                  aria-describedby={errors.emailOrUsername ? "login-identifier-error" : undefined}
                  className={`${INPUT_CLASS} ${errors.emailOrUsername ? INPUT_ERROR_CLASS : ""}`}
                />
                {errors.emailOrUsername && (
                  <p id="login-identifier-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.emailOrUsername}</p>
                )}
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    autoFocus={!!formData.emailOrUsername}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? "login-password-error" : undefined}
                    className={`${INPUT_CLASS} pr-12 ${errors.password ? INPUT_ERROR_CLASS : ""}`}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="login-password-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.password}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600 focus:ring-2 focus:ring-indigo-500 dark:border-slate-600"
                  />
                  Remember me
                </label>
                <Link
                  to="/forgot-password"
                  className="rounded text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading || isNavigating}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100 dark:focus-visible:ring-indigo-500/30"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    Sign In <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 lg:text-left dark:text-slate-500">© {new Date().getFullYear()} ProjectBudget. All rights reserved.</p>
      </section>

      {/* ---------------- Product preview: left on desktop, hidden on mobile (illustrative sample data) ---------------- */}
      <section
        aria-hidden="true"
        className="relative order-2 hidden min-h-screen overflow-hidden bg-slate-950 lg:order-1 lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center lg:px-16"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950 to-indigo-950/80" />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute left-1/3 top-1/3 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative w-full max-w-md">
          {/* Main budget card */}
          <div className="group/card rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Q3 Budget Allocation</p>
                <p className="mt-1.5 text-3xl font-bold tracking-tight text-white">₹48,60,000</p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/20">On track</span>
            </div>

            <div className="mt-5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Spent ₹33,04,800</span>
                <span className="font-medium text-slate-200">68%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400" />
              </div>
            </div>

            <div className="mt-5 space-y-1.5">
              {PREVIEW_ROWS.map((row) => (
                <div key={row.label} className="group/row -mx-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.06]">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">{row.label}</span>
                    <span className="font-medium text-white">
                      {row.amount}
                      <span className="ml-2 text-xs text-slate-400 opacity-0 transition-opacity group-hover/row:opacity-100">{row.pct}% used</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full bg-gradient-to-r ${row.color} transition-all duration-500 group-hover/row:brightness-125`} style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating variance card */}
          <div className="absolute -bottom-8 -right-10 flex items-center gap-3 rounded-xl border border-white/10 bg-slate-800/80 px-4 py-3 shadow-xl shadow-black/30 backdrop-blur-xl transition-transform duration-300 hover:-translate-y-0.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
              <TrendingDown className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs text-slate-400">Variance vs plan</p>
              <p className="text-sm font-semibold text-white">4.2% under budget</p>
            </div>
          </div>
        </div>

        <div className="relative mt-20 max-w-md text-center">
          <h2 className="text-xl font-semibold tracking-tight text-white">Every rupee, every project, one view.</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Plan budgets, track actual spend and catch variance early - across clients, vendors and teams.
          </p>
        </div>
      </section>

      {showToast && <Toast message="Login successful!" type="success" onClose={() => setShowToast(false)} />}
    </div>
  );
};
