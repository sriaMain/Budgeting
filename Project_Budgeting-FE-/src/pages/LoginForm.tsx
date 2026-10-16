import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch } from "react-redux";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, TrendingDown } from "lucide-react";
import type { LoginFormData, FormErrors } from "../types";
import axiosInstance from "../utils/axiosInstance";
import { useAppNavigation } from "../hooks/useAppNavigation";
import { parseApiErrors } from "../utils/parseApiErrors";
import { Toast } from "../components/Toast";

/*
 * Login - ProjectBudget & Tracking.
 * Breakpoints: ≤480 small mobile · 481-767 mobile · 768-1023 tablet · 1024-1439 laptop · ≥1440 large.
 * Desktop (≥1024px) is a 50/50 split with the budget preview on the left; below that the form fills
 * the screen. Vertical spacing tightens below 650px of height.
 */

/** Left by the removed "Remember me" option - cleared so no username lingers in the browser. */
const LEGACY_REMEMBER_KEY = "pb-remembered-identifier";


const INPUT_CLASS =
  "box-border block w-full border border-slate-200 bg-white text-[15px] text-slate-900 shadow-sm transition-colors " +
  "h-[52px] rounded-[14px] px-[18px] max-[480px]:h-[50px] max-[480px]:px-[14px] md:h-14 " +
  "placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-100 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20";

const INPUT_ERROR_CLASS = "border-red-400 hover:border-red-400 focus:border-red-500 focus:ring-red-100 dark:border-red-500/60 dark:focus:ring-red-500/20";

const PREVIEW_ROWS = [
  { label: "Engineering", amount: "₹18,40,000", pct: 82, color: "from-indigo-500 to-indigo-400" },
  { label: "Design", amount: "₹6,20,000", pct: 54, color: "from-violet-500 to-violet-400" },
  { label: "Infrastructure", amount: "₹5,10,000", pct: 71, color: "from-sky-500 to-sky-400" },
  { label: "Marketing", amount: "₹3,34,800", pct: 38, color: "from-emerald-500 to-emerald-400" },
];

const LABEL_CLASS = "mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300";

export const LoginForm: React.FC = () => {
  const [formData, setFormData] = useState<LoginFormData>({ emailOrUsername: "", password: "", captchaInput: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const { goTo } = useAppNavigation();
  const dispatch = useDispatch();

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_REMEMBER_KEY);
    } catch {
      // storage unavailable - nothing to clear
    }
  }, []);

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

  const busy = isLoading || isNavigating;

  return (
    <div className="box-border flex min-h-[100dvh] w-full bg-white font-sans dark:bg-gray-950">
      {/* ---------------- Budget preview: left half on desktop, hidden below 1024px (illustrative sample data) ---------------- */}
      <section
        aria-hidden="true"
        className="relative hidden min-h-[100dvh] w-1/2 shrink-0 overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-12 min-[90rem]:px-16"
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

      {/* ---------------- Content panel: header · centred form · footer ---------------- */}
      <main
        className={`box-border flex min-w-0 flex-1 flex-col bg-white lg:w-1/2 lg:flex-none px-5 py-6 max-[480px]:px-4 max-[480px]:py-5 md:px-6 md:py-7 lg:py-8 lg:max-[90rem]:px-8 min-[90rem]:px-12 dark:bg-gray-950 [@media(max-height:649px)]:py-4`}
      >
        {/* Header */}
        <header className="flex items-center gap-4">
          {/* Sria Infotech logo (public/sria_logo_gray.png): the source is a square canvas with wide
              margins, so the box crops it to the mark + wordmark at any width. */}
          <span className="block w-[88px] shrink-0 overflow-hidden rounded-lg min-[481px]:w-[98px] dark:bg-white" style={{ aspectRatio: "98 / 62" }}>
            <img
              src="/sria_logo_gray.png"
              alt="Sria Infotech"
              className="block"
              style={{ width: "102.04%", maxWidth: "none", marginLeft: "-2.04%", marginTop: "-17.35%" }}
            />
          </span>
          <span className="h-8 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          <span className="min-w-0 text-[18px] font-semibold leading-tight tracking-tight text-slate-900 min-[481px]:text-[20px] dark:text-white">
            Project<span className="text-indigo-600 dark:text-indigo-400">Budget</span> &amp; Tracking
          </span>
        </header>

        {/* Login area - grows to fill and centres the form between header and footer */}
        <div className={`flex flex-1 items-center justify-center py-6 [@media(max-height:649px)]:py-4`}>
          <div className="relative mx-auto w-full max-w-[480px] max-[480px]:max-w-full md:max-w-[460px] lg:max-w-[480px]">
            {isNavigating && <div className="absolute inset-0 z-10 rounded-2xl bg-white/50 backdrop-blur-[2px] dark:bg-gray-950/50" aria-hidden="true" />}

            <h1
              className={`m-0 mb-2 text-[32px] font-bold leading-[1.2] tracking-tight text-slate-900 max-[480px]:text-[28px] md:text-[34px] lg:max-[90rem]:text-[36px] min-[90rem]:text-[40px] dark:text-white`}
            >
              Welcome Back
            </h1>
            <p
              className={`m-0 mb-6 text-[17px] leading-[1.5] text-slate-600 max-[480px]:text-[15px] md:mb-8 dark:text-slate-400 [@media(max-height:649px)]:mb-5`}
            >
              Manage your project finances seamlessly.
            </p>

            <form onSubmit={handleSubmit} noValidate aria-busy={busy}>
              <div className={`flex flex-col gap-[18px] max-[480px]:gap-4 md:gap-[22px] [@media(max-height:649px)]:gap-4`}>
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
                  <label htmlFor="login-identifier" className={LABEL_CLASS}>
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
                    autoFocus
                    disabled={busy}
                    aria-invalid={!!errors.emailOrUsername}
                    aria-describedby={errors.emailOrUsername ? "login-identifier-error" : undefined}
                    className={`${INPUT_CLASS} ${errors.emailOrUsername ? INPUT_ERROR_CLASS : ""}`}
                  />
                  {errors.emailOrUsername && (
                    <p id="login-identifier-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.emailOrUsername}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="login-password" className={LABEL_CLASS}>
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
                      disabled={busy}
                      aria-invalid={!!errors.password}
                      aria-describedby={errors.password ? "login-password-error" : undefined}
                      className={`${INPUT_CLASS} pr-12 ${errors.password ? INPUT_ERROR_CLASS : ""}`}
                    />
                    {/* 20px icon, 16px from the right edge (12px offset + 4px padding) */}
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p id="login-password-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.password}</p>
                  )}
                  <div className="mt-4 flex justify-end">
                    <Link
                      to="/forgot-password"
                      className="rounded text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Forgot password?
                    </Link>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="group mt-6 box-border flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-base font-semibold text-white shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 active:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-70 max-[480px]:h-12 md:h-[52px] dark:focus-visible:ring-indigo-500/30"
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

        <footer className="pt-6 text-center text-[13px] text-slate-400 lg:text-left dark:text-slate-500">
          © {new Date().getFullYear()} ProjectBudget &amp; Tracking. All rights reserved.
        </footer>
      </main>

      {showToast && <Toast message="Login successful!" type="success" onClose={() => setShowToast(false)} />}
    </div>
  );
};
