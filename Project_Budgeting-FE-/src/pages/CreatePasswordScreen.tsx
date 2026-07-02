import React, { useState } from "react";
import { InputField } from "../components/InputField";
import { Button } from "../components/Button";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { Lock, ShieldCheck, Stars } from "lucide-react";
import axiosInstance from "../utils/axiosInstance";
import { Toast } from "../components/Toast";
import { useAppNavigation } from "../hooks/useAppNavigation";

const CreatePasswordScreen: React.FC = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>(
    {}
  );
  const [showToast, setShowToast] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const { goTo } = useAppNavigation();

  // Validation Rules (replicated from Requirements for logic check)
  const isPasswordValid = (p: string) =>
    p.length >= 8 &&
    p.length <= 32 &&
    /[A-Z]/.test(p) &&
    /[0-9]/.test(p) &&
    /[!@#$%^&*(),.?":{}|<>]/.test(p);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    if (!isPasswordValid(password)) {
      newErrors.password = "Please fulfill all password requirements below.";
    }

    if (password !== confirmPassword) {
      newErrors.confirm = "Passwords do not match.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Clear errors and start loading
    setErrors({});
    setIsLoading(true);
    const reset_token = localStorage.getItem("reset_token") || "";  

    try {
      // Simulate API call
      const response = await axiosInstance.post("/accounts/reset-password/", {
        reset_token: reset_token,
        new_password: password,
        confirm_password: confirmPassword,
      });
      if (response.status === 200) {
        setIsLoading(false);
        localStorage.removeItem("reset_token");
        
        // Show toast and navigate after delay
        setIsNavigating(true);
        setShowToast(true);
        setTimeout(() => {
          goTo("/");
        }, 1800);
      }
    } catch (error: any) {
      setErrors({ password: "Failed to reset password. Please try again." });
    }
  };

  return (
    <div className="min-h-screen w-full bg-white flex overflow-hidden relative">
      {/* Blur overlay when navigating */}
      {isNavigating && (
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-50 pointer-events-auto" />
      )}
      
      {/* Left Side - Illustration (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-50 relative items-center justify-center p-12 overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-200/30 rounded-full blur-3xl" />
        </div>

        {/* Main Visual Composition */}
        <div className="relative z-10 w-full max-w-md aspect-square">
          {/* Central Lock Element */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] shadow-2xl shadow-blue-900/20 flex items-center justify-center transform -rotate-6 transition-transform hover:rotate-0 duration-700">
            <div className="absolute inset-0 bg-white/10 rounded-[2.5rem] backdrop-blur-sm" />
            <Lock
              className="w-32 h-32 text-white drop-shadow-lg"
              strokeWidth={1.5}
            />

            {/* Floating Elements */}
            <div className="absolute -top-8 -right-8 bg-yellow-400 p-4 rounded-2xl shadow-lg animate-bounce delay-700">
              <Stars className="w-8 h-8 text-yellow-900" />
            </div>
            <div className="absolute -bottom-6 -left-6 bg-green-500 p-4 rounded-2xl shadow-lg animate-bounce delay-1000">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Decorative Elements simulating the 'person' in the prompt design */}
          <div className="absolute bottom-0 right-12 w-full h-24 bg-gradient-to-t from-indigo-100 to-transparent opacity-50" />
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 md:p-16 lg:p-24 overflow-y-auto">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Create New Password
            </h1>
            <p className="text-gray-500 text-base leading-relaxed">
              Your new password needs to be different from the password you used
              before.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
              <InputField
                label="New Password"
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password)
                    setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                error={errors.password}
                togglePassword
              />

              <InputField
                label="Confirm Password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirm)
                    setErrors((prev) => ({ ...prev, confirm: undefined }));
                }}
                error={errors.confirm}
                togglePassword
              />
            </div>

            {/* Requirements Checklist */}
            <div className="pt-2">
              <PasswordRequirements password={password} />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                isLoading={isLoading}
                disabled={!password || !confirmPassword}
              >
                Reset Password
              </Button>
            </div>
          </form>
        </div>
      </div>
      
      {/* Toast Notification */}
      {showToast && (
        <Toast
          message="Password reset successfully!"
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
};

export default CreatePasswordScreen;
