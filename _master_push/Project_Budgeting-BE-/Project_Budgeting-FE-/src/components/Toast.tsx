import React, { useEffect } from "react";
import { CheckCircle, X } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = "success",
  onClose,
  duration = 3000,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = type === "success" ? "bg-green-50 dark:bg-green-500/10" : type === "error" ? "bg-red-50 dark:bg-red-500/10" : "bg-blue-50 dark:bg-blue-500/10";
  const borderColor = type === "success" ? "border-green-200 dark:border-green-500/30" : type === "error" ? "border-red-200 dark:border-red-500/30" : "border-blue-200 dark:border-blue-500/30";
  const textColor = type === "success" ? "text-green-800 dark:text-green-300" : type === "error" ? "text-red-800 dark:text-red-300" : "text-blue-800 dark:text-blue-300";
  const iconColor = type === "success" ? "text-green-600 dark:text-green-400" : type === "error" ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400";

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 ${bgColor} ${borderColor} border ${textColor} px-4 py-3 rounded-lg shadow-lg max-w-md animate-slideInFromRight`}
      role="alert"
    >
      {type === "success" && <CheckCircle className={`w-5 h-5 ${iconColor} flex-shrink-0`} />}
      <span className="font-medium text-sm">{message}</span>
      <button
        onClick={onClose}
        className={`ml-2 ${iconColor} hover:opacity-70 transition-opacity`}
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
