import type { FormErrors } from "../types";

/**
 * Flattens a single error value (string, array, or nested object) to a string.
 */
const flattenErrorValue = (value: unknown): string => {
   if (typeof value === 'string') return value;
   if (Array.isArray(value)) {
      return value.map(flattenErrorValue).join(', ');
   }
   if (value && typeof value === 'object') {
      // Nested object: join all leaf values (e.g. { field: ["msg"] })
      return Object.values(value as Record<string, unknown>)
         .map(flattenErrorValue)
         .join(' | ');
   }
   return String(value);
};

/**
 * Parses API error responses into a FormErrors object.
 * Handles standard Axios errors, DRF field errors, and general detail errors.
 */
export const parseApiErrors = (err: any): FormErrors => {
   const newErrors: FormErrors = {};
   console.error("API Error:", err);

   const data = err?.response?.data || err?.data;

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
         } else if (data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
            // Backend returns { "errors": { field: "msg", ... } } — handle plural key
            const fieldErrors: string[] = [];
            Object.entries(data.errors as Record<string, unknown>).forEach(([key, value]) => {
               const message = flattenErrorValue(value);
               newErrors[key] = message;
               fieldErrors.push(`${key}: ${message}`);
            });
            if (fieldErrors.length > 0) {
               newErrors.general = fieldErrors.join(' | ');
            }
         } else {
            // Collect all field-specific errors
            const fieldErrors: string[] = [];
            Object.entries(data).forEach(([key, value]) => {
               const message = flattenErrorValue(value);
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