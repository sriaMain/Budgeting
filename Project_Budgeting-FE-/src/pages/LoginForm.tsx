import React, { useState, useCallback } from "react";
import { InputField } from "../components/InputField";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { EyeIcon, EyeOffIcon } from "../components/Icons";
import type { LoginFormData, FormErrors } from "../types";
import { Link } from "react-router-dom";
import { Captcha } from "../components/Captcha";
import axiosInstance from "../utils/axiosInstance";
import { useAppNavigation } from "../hooks/useAppNavigation";
import { useDispatch } from "react-redux";
import { parseApiErrors } from "../utils/parseApiErrors";
import { Toast } from "../components/Toast";

export const LoginForm: React.FC = () => {
  const [formData, setFormData] = useState<LoginFormData>({
    emailOrUsername: "",
    password: "",
   captchaInput: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaRefreshCounter, setCaptchaRefreshCounter] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
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

  const handleCaptchaInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCaptchaInput(e.target.value);
    if (errors.captcha) {
      setErrors((prev) => ({ ...prev, captcha: undefined }));
    }
  };

  // Callback for the Captcha component to report the valid token
  const handleCaptchaTokenChange = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);

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

    // Captcha Validation
    if (!captchaInput) {
      newErrors.captcha = "Please enter the characters shown above";
      // refresh captcha on missing input
      setCaptchaRefreshCounter(c => c + 1);
    } else if (captchaInput !== captchaToken) {
      newErrors.captcha = "Incorrect characters. Please try again.";
      // refresh captcha after incorrect attempt
      setCaptchaRefreshCounter(c => c + 1);
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
        
        // Show toast and blur form, then navigate after brief delay
        setIsNavigating(true);
        setShowToast(true);
        setTimeout(() => {
          goTo("/dashboard");
        }, 1800);
      }
    }  catch (err: any) {
      const newErrors = parseApiErrors(err);

      setErrors(newErrors);
      // On any failed login attempt from server, refresh captcha
      setCaptchaRefreshCounter(c => c + 1);
    } finally {
      setIsLoading(false);
    }
  };

  if (loginSuccess) {
    return (
      <div className="text-center p-8 bg-green-50 rounded-2xl border border-green-100 animate-fadeIn">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 13l4 4L19 7"
            ></path>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome Back!</h2>
        <p className="text-gray-600">Login successful. Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[480px] min-h-[600px] mx-auto bg-white relative">
      {/* Blur overlay when navigating */}
      {isNavigating && (
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 pointer-events-auto" />
      )}
      
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

        <div className="space-y-3 pt-2">
          <label className="block text-base font-medium text-gray-900 mb-2">
            Security Check
          </label>
          <div className="flex justify-center bg-gray-50 p-3 rounded-lg border border-gray-200">
            <Captcha onCaptchaChange={handleCaptchaTokenChange} refreshCounter={captchaRefreshCounter} />
          </div>
          <InputField
            label=""
            name="captcha"
            type="text"
            value={captchaInput}
            onChange={handleCaptchaInputChange}
            error={errors.captcha}
            placeholder="Type the characters above"
            autoComplete="off"
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
      
      {/* Toast Notification */}
      {showToast && (
        <Toast
          message="Login successful!"
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
};
