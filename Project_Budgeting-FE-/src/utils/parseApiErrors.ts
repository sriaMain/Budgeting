import type { FormErrors } from "../types";

/**
 * Parses API error responses into a FormErrors object.
 * Handles standard Axios errors, DRF field errors, and general detail errors.
 */
export const parseApiErrors = (err: any): FormErrors => {
   const newErrors: FormErrors = {};
   // Log only the status/URL: the error object carries the request body (bank / KYC data).
   console.error("API Error:", err?.response?.status ?? "network", err?.config?.url ?? "");

   const data = err?.response?.data || err?.data;

   // Field errors may arrive wrapped: {"errors": {...}} (client create) or
   // {"error": "first message", "errors": {...}} (the DRF exception handler).
   if (data && typeof data === 'object' && !Array.isArray(data) && data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
      Object.entries(data.errors as Record<string, unknown>).forEach(([key, value]) => {
         newErrors[key] = flattenMessage(value);
      });
      newErrors.general = typeof data.error === 'string' ? data.error
         : typeof data.message === 'string' ? data.message
         : Object.values(newErrors)[0] || 'Please correct the highlighted fields.';
      return newErrors;
   }

   if (data) {
      // 1. Handle string response
      if (typeof data === 'string') {
         newErrors.general = data;
      }
      // 2. Handle array of strings
      else if (Array.isArray(data)) {
         newErrors.general = data.join(', ');
      }
      // 3. Handle object response (most common in DRF)
      else if (typeof data === 'object') {
         // Check for 'error' or 'detail' or 'message' keys first
         if (data.error) {
            newErrors.general = Array.isArray(data.error) ? data.error.join(', ') : String(data.error);
         } else if (data.detail) {
            newErrors.general = Array.isArray(data.detail) ? data.detail.join(', ') : String(data.detail);
         } else if (data.message) {
            newErrors.general = Array.isArray(data.message) ? data.message.join(', ') : String(data.message);
         } else if (data.non_field_errors) {
            newErrors.general = Array.isArray(data.non_field_errors) ? data.non_field_errors.join(', ') : String(data.non_field_errors);
         } else {
            // Collect all field-specific errors
            const fieldErrors: string[] = [];
            Object.entries(data).forEach(([key, value]) => {
               const message = Array.isArray(value) ? value.join(', ') : String(value);
               // Map to specific field if needed, or just collect for general display
               newErrors[key] = message;
               fieldErrors.push(`${key}: ${message}`);
            });

            if (fieldErrors.length > 0 && !newErrors.general) {
               newErrors.general = fieldErrors.join(' | ');
            }
         }
      }
   }

   // Fallback if no specific error data was found
   if (!newErrors.general && !Object.keys(newErrors).length) {
      newErrors.general = err instanceof Error ? err.message : 'An unexpected error occurred';
   }

   return newErrors;
};

/** First readable message from a DRF error value (string, list or nested object). */
function flattenMessage(value: unknown): string {
   if (Array.isArray(value)) return value.map(flattenMessage).filter(Boolean).join(', ');
   if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(flattenMessage).filter(Boolean).join(', ');
   return value == null ? '' : String(value);
}
