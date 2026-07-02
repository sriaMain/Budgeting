import React, { useState } from "react";
import { InputField } from "../components/InputField";
import { Button } from "../components/Button";
import { ArrowLeftIcon } from "../components/Icons";
import { useAppNavigation } from "../hooks/useAppNavigation";
import axios from "axios";
import axiosInstance from "../utils/axiosInstance";
import type { FormErrors } from "../types";
import { parseApiErrors } from "../utils/parseApiErrors";
import { Toast } from "../components/Toast";

export const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const { goBack, goTo } = useAppNavigation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Email is required");
      return;
    }
    // Basic email regex
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Simulate API
      const response = await axiosInstance.post("/accounts/otp-request/", {
        email: email,
      });

      if (response.status === 200) {

        // Prefer server-provided otp timestamp but always set a resend cutoff
        const serverOtpSentAt = response.data?.otp_sent_at;

        // Normalize and store otp_sent_at (store ms if server gave seconds)
        if (serverOtpSentAt) {
          let sentAt = parseInt(serverOtpSentAt as string);
          if (!Number.isNaN(sentAt) && sentAt < 1e12) sentAt = sentAt * 1000;
          localStorage.setItem("otp_sent_at", sentAt.toString());
        } else {
          localStorage.setItem("otp_sent_at", Date.now().toString());
        }

        // Set explicit resend cutoff timestamp (ms). This ensures VerificationScreen starts timer.
        const resendCutoff = Date.now() + 60 * 1000;
        localStorage.setItem("otp_resend_at", resendCutoff.toString());

        // Save the email as well for convenience
        localStorage.setItem("otp_email", email);

        // Show toast and navigate after delay
        setIsNavigating(true);
        setShowToast(true);
        setTimeout(() => {
          const encoded = encodeURIComponent(email);
          goTo(`/verification?email=${encoded}`);
        }, 1800);
      }
    } catch (err: any) {
          const newErrors = parseApiErrors(err);
    
          // set the general error string into the string state
          setError(
            newErrors.general ??
              (err instanceof Error ? err.message : "An unexpected error occurred")
          );
    } finally {
      setIsLoading(false);
    }
  };

  //   if (isSuccess) {
  //       return (
  //           <div className="flex flex-col md:flex-row w-full max-w-9xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden min-h-[400px] animate-fadeIn">
  //               {/* Image Side */}
  //               <div className="hidden md:block w-full md:w-1/2 bg-cover bg-center" style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1614064641938-3bcee529cfc4?auto=format&fit=crop&q=80&w=1000")' }}></div>

  //               {/* Content Side */}
  //               <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center items-center text-center">
  //                 <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
  //                     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
  //                 </div>
  //                 <h3 className="text-2xl font-bold text-gray-900 mb-2">Check your mail</h3>
  //                 <p className="text-gray-600 mb-8">We have sent password recovery instructions to your email.</p>
  //                 <Button onClick={goBack} variant="secondary">
  //                     Back to Login
  //                 </Button>
  //               </div>
  //           </div>
  //       )
  //   }

  return (
    <div className="flex flex-col md:flex-row w-full max-w-4xl mx-auto bg-white rounded-2xl  overflow-hidden min-h-[600px] animate-fadeIn relative">
      {/* Blur overlay when navigating */}
      {isNavigating && (
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 pointer-events-auto" />
      )}
      
      {/* Image Side */}
      <div
        className="hidden md:block w-full md:w-1/2 bg-cover bg-center relative"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1614064641938-3bcee529cfc4?auto=format&fit=crop&q=80&w=1000")',
        }}
      >
        <div className="absolute inset-0 bg-blue-900/20"></div>
      </div>

      {/* Form Side */}
      <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
        <div className="max-w-xs mx-auto w-full">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Forgot Your Password?
          </h2>
          <p className="text-gray-500 mb-8 text-sm"></p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <InputField
              label="Email"
              type="email"
              placeholder=""
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              error={error}
              className="bg-gray-50"
            />

            <Button type="submit" isLoading={isLoading}>
              Send
            </Button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center text-sm font-bold text-gray-900 hover:text-gray-700 transition-colors focus:outline-none"
              >
                <ArrowLeftIcon className="w-5 h-5 mr-2" />
                Back to login
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {/* Toast Notification */}
      {showToast && (
        <Toast
          message="OTP sent successfully!"
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
};
