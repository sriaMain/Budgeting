import React, { useState, useCallback } from "react";
import { InputField } from "../components/InputField";
import { Button } from "../components/Button";

import { EyeIcon, EyeOffIcon } from "../components/Icons";
import type { LoginFormData, FormErrors } from "../types";
import { Link } from "react-router-dom";

import axiosInstance from "../utils/axiosInstance";
import { useAppNavigation } from "../hooks/useAppNavigation";
import { useDispatch } from "react-redux";
import { parseApiErrors } from "../utils/parseApiErrors";

const emailDomains: { [key: string]: string } = {
  "gamil.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmial.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "hotamil.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "msm.com": "msn.com"
};

const getEmailSuggestion = (val: string): string | null => {
  if (!val || !val.includes("@")) return null;
  const parts = val.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  const correctedDomain = emailDomains[domain.toLowerCase().trim()];
  if (correctedDomain) {
    return `${local}@${correctedDomain}`;
  }
  return null;
};


export const LoginForm: React.FC = () => {
  const [formData, setFormData] = useState<LoginFormData>({
    emailOrUsername: "",
    password: "",
    captchaInput: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { goTo } = useAppNavigation();
  const dispatch = useDispatch();



  const togglePasswordVisibility = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (errors.general) {
      setErrors((prev) => ({ ...prev, general: undefined }));
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
      identifier: formData.emailOrUsername,
      password: formData.password,
    };

    try {
      const response = await axiosInstance.post("/accounts/login/", payLoad);

      if (response.status === 200) {
        // Map roles array to userRole
        const backendRole = response.data.user.roles[0] || 'user';

        // Map backend roles to frontend roles
        let userRole: 'admin' | 'user' | 'manager' = 'user';
        if (backendRole.toLowerCase() === 'admin') {
          userRole = 'admin';
        } else if (backendRole.toLowerCase() === 'project manager' || backendRole.toLowerCase() === 'manager') {
          userRole = 'manager';
        } else {
          userRole = 'user';
        }

        dispatch({
          type: "auth/loginSuccess",
          payload: {
            isAuthenticated: true,
            userRole: userRole,
            accessToken: response.data.access_token,
            username: response.data.user.username,
            email: response.data.user.email,
          },
        });

        // Navigate immediately
        goTo("/dashboard");
      }
    } catch (err) {
      const newErrors = parseApiErrors(err);

      setErrors(newErrors);

    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="w-full max-w-[480px] min-h-[600px] mx-auto bg-white relative">

      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
          Welcome Back
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-2" noValidate>
        {/* General Error Alert */}
        {errors.general && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center">
            <svg
              className="w-5 h-5 mr-2 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
              ></path>
            </svg>
            {errors.general}
          </div>
        )}

        <InputField
          label="Username/Email address"
          name="emailOrUsername"
          type="text"
          value={formData.emailOrUsername}
          onChange={handleChange}
          error={errors.emailOrUsername}
          placeholder="Enter your username or email"
          autoComplete="username"
        />

        {(() => {
          const suggestion = getEmailSuggestion(formData.emailOrUsername);
          if (!suggestion) return null;
          return (
            <div className="mt-1 mb-3 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 flex items-center justify-between animate-fadeIn">
              <span>Did you mean <strong className="font-semibold text-blue-800">{suggestion}</strong>?</span>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, emailOrUsername: suggestion }))}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 underline focus:outline-none cursor-pointer"
              >
                Correct it
              </button>
            </div>
          );
        })()}

        <div className="relative">
          <InputField
            label="Password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            placeholder="Enter your password"
            autoComplete="current-password"
            endIcon={showPassword ? <EyeOffIcon /> : <EyeIcon />}
            onEndIconClick={togglePasswordVisibility}
          />
        </div>



        <div className="space-y-6">
          <Button type="submit" isLoading={isLoading}>
            Login
          </Button>

          <div className="flex items-center justify-end">

            <Link
              to="/forgot-password"
              className="text-sm font-medium text-blue-500 hover:text-brand-800 hover:underline transition-colors"
              tabIndex={0}
            >
              Forgot Password
            </Link>
          </div>
        </div>
      </form>


    </div>
  );
};
