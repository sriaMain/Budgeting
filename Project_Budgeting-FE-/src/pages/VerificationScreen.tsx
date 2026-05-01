import React, { useState, useEffect } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import OtpInput from "../components/OtpInput";
import { useAppNavigation } from "../hooks/useAppNavigation";
import { useLocation } from "react-router-dom";
import axiosInstance from "../utils/axiosInstance";
import type { FormErrors } from "../types";
import { parseApiErrors } from "../utils/parseApiErrors";
import { Toast } from "../components/Toast";

const VerificationScreen: React.FC = () => {
  const [otp, setOtp] = useState("");
  const [timeLeft, setTimeLeft] = useState(41); // 41 seconds as per screenshot
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [errors, setErrors] = useState<FormErrors>({});
  const email = params.get("email") ?? "sri@gmail.com";
  const { goBack, goTo } = useAppNavigation();

 const [remaining, setRemaining] = useState<number>(0);
 const [isResending, setIsResending] = useState<boolean>(false);
 const [showToast, setShowToast] = useState(false);
 const [toastMessage, setToastMessage] = useState("");
 const [isNavigating, setIsNavigating] = useState(false);

  // ----------------------------
  // 🔥 USE EFFECT FOR TIMER
  // ----------------------------
  useEffect(() => {
    // 1️⃣ Read cooldown timestamp from localStorage
    // Support both keys: `otp_resend_at` (used after a resend) and `otp_sent_at` (set when OTP initially requested)
    const storedResendAt = localStorage.getItem("otp_resend_at") || localStorage.getItem("otp_sent_at");

    if (storedResendAt) {
      let resendAt = parseInt(storedResendAt);
      const now = Date.now();

      // Backend might return seconds (unix) instead of ms — normalize
      if (resendAt < 1e12) {
        // looks like seconds, convert to ms
        resendAt = resendAt * 1000;
      }

      // If stored value is not a timestamp but a TTL (e.g., seconds remaining), handle that
      // If resendAt appears to be small (< 1e10) treat it as seconds-ttl
      if (resendAt < 1e10) {
        const diff = Math.max(0, Math.floor(resendAt));
        setRemaining(diff);
      } else {
        // 2️⃣ Calculate remaining seconds from absolute timestamp
        const diff = Math.max(0, Math.floor((resendAt - now) / 1000));
        setRemaining(diff);
      }
    }

    // 3️⃣ Start interval for countdown
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    // 4️⃣ Cleanup (important)
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const handleConfirm = async () => {
    try {
      const response = await axiosInstance.post("/accounts/verify-otp/", {
        email: email,
        otp: otp,
      });
      if (response.status === 200) {
        const data = response.data;
        // store reset token if provided
        if (data?.reset_token) {
          localStorage.setItem("reset_token", data.reset_token);
        }
        
        // Show toast and navigate after delay
        setIsNavigating(true);
        setToastMessage("OTP verified successfully!");
        setShowToast(true);
        setTimeout(() => {
          goTo("/create-password");
        }, 1800);
      }
    } catch (err: any) {
  const newErrors=     parseApiErrors(err); 
  
    
          setErrors(newErrors)
  };
  }
const handleResendOtp = async () => {
  try {
    const response = await axiosInstance.post("/accounts/otp-request/", {
      email: email,
    });
    if (response.status === 200) {
      console.log("OTP resent successfully");
      return true;
    }
  } catch (err) {
   const errors = parseApiErrors(err);
    setErrors(errors);
  }
  return false;
};

  // Clear general error when user edits the OTP
  useEffect(() => {
    if (errors.general) setErrors((prev) => ({ ...prev, general: undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleResend = async () => {
    if (remaining > 0 || isResending) return; // guard
    setIsResending(true);
    const ok = await handleResendOtp();
    setIsResending(false);

    if (ok) {
      // Backend accepted resend → start 60s cooldown
      const resendAt = Date.now() + 60 * 1000;
      localStorage.setItem("otp_resend_at", resendAt.toString());
      setRemaining(60);
      
      // Show toast for resend success
      setToastMessage("OTP resent successfully!");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } else {
      
    }
  };

  return (
    <div className="max-w-md w-full flex flex-col items-center text-center animate-fade-in relative">
      {/* Blur overlay when navigating */}
      {isNavigating && (
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 pointer-events-auto rounded-lg" />
      )}
      
      {/* Header Section */}
      <h1 className="text-[2rem] font-bold text-gray-900 mb-4 tracking-tight">
        Check Your email
      </h1>

      <p className="text-gray-500 text-lg leading-relaxed max-w-xs mx-auto mb-2">
        Please enter the four digit verification code we sent to
      </p>
      <p className="text-gray-900 font-bold text-lg mb-6">{email}</p>

      {/* General error alert (invalid/expired OTP etc.) */}
      {errors.general && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center max-w-md mx-auto">
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
          <div>{errors.general}</div>
        </div>
      )}

      {/* OTP Input Section */}
      <div className="w-full flex justify-center">
        <OtpInput length={4} value={otp} onChange={setOtp} />
      </div>

      {/* Confirm Button */}
      <button
        onClick={handleConfirm}
        disabled={otp.length !== 4}
        className={`
          w-[280px] py-3.5 rounded-xl font-bold text-white text-lg transition-all duration-200 transform
          ${
            otp.length === 4
              ? "bg-[#1D4ED8] hover:bg-[#1E40AF] shadow-lg shadow-blue-900/20 cursor-pointer active:scale-[0.98]"
              : "bg-[#1D4ED8] opacity-90 cursor-not-allowed" // Keeping it blue but maybe slightly different interaction as per design often staying primary
          }
        `}
        // Note: In the image, the button is solid blue.
        // I'm assuming it stays blue but might not do anything if empty.
      >
        Confirm
      </button>

      {/* Resend Timer */}
    <div className="mt-6 text-gray-400 font-medium text-[15px] flex items-center gap-1">
  <span>Didn't get the email? </span>

  <button
    onClick={handleResend}
    disabled={remaining > 0 || isResending}
    className={`
      flex items-center gap-2
      ${remaining === 0 && !isResending 
        ? "text-blue-700 hover:underline cursor-pointer" 
        : "text-gray-400 cursor-default"
      }
    `}
  >
    {isResending ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span>Resending...</span>
      </>
    ) : remaining > 0 ? (
      `Resend in ${formatTime(remaining)}`
    ) : (
      "Resend code"
    )}
  </button>
</div>

      {/* Back Button */}
      <button
        className="mt-8 flex items-center gap-2 text-gray-900 font-bold text-lg hover:text-gray-700 transition-colors group"
        onClick={goBack}
      >
        <ArrowLeft className="w-6 h-6 stroke-[3px] group-hover:-translate-x-1 transition-transform duration-200" />
        Back
      </button>
      
      {/* Toast Notification */}
      {showToast && (
        <Toast
          message={toastMessage}
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
};

export default VerificationScreen;
