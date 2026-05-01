import React, { useState } from 'react';
import { X, Clock, AlertTriangle } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface RequestExtraHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: number;
  taskTitle: string;
  allocatedHours: number;
  allocatedFormatted?: string;
  consumedHours: number;
  consumedFormatted?: string;
  exceededFormatted?: string;
  onSuccess?: () => void;
}

export const RequestExtraHoursModal: React.FC<RequestExtraHoursModalProps> = ({
  isOpen,
  onClose,
  taskId,
  taskTitle,
  allocatedHours,
  allocatedFormatted,
  consumedHours,
  consumedFormatted,
  exceededFormatted,
  onSuccess
}) => {
  // Helper function to convert decimal hours to HH:MM:SS format
  const decimalToHHMMSS = (decimalHours: number): string => {
    const totalSeconds = Math.round(decimalHours * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Helper function to convert HH:MM:SS format to decimal hours
  const hhmmssToDecimal = (hhmmssString: string): number => {
    const parts = hhmmssString.split(':').map(Number);
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return hours + (minutes / 60) + (seconds / 3600);
    } else if (parts.length === 2) {
      // Support HH:MM format as well
      const [hours, minutes] = parts;
      return hours + (minutes / 60);
    }
    return 0;
  };

  // Calculate additional hours needed: consumed - allocated
  const additionalHoursNeeded = Math.max(0, consumedHours - allocatedHours);

  // Auto-fill with additional hours needed (consumed - allocated) in HH:MM:SS format
  const [requestedHours, setRequestedHours] = useState<string>(decimalToHHMMSS(additionalHoursNeeded));
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate HH:MM:SS or HH:MM format
    const timePattern = /^([0-9]{1,2}):([0-5][0-9])(:([0-5][0-9]))?$/;
    if (!timePattern.test(requestedHours)) {
      toast.error('Please enter time in HH:MM:SS or HH:MM format (e.g., 05:30:00 or 05:30)');
      return;
    }

    // Normalize to HH:MM:SS format (add :00 if only HH:MM)
    let normalizedTime = requestedHours;
    if (requestedHours.split(':').length === 2) {
      normalizedTime = `${requestedHours}:00`;
    }

    const decimalHours = hhmmssToDecimal(normalizedTime);
    
    if (decimalHours <= 0) {
      toast.error('Please enter a valid time greater than 00:00:00');
      return;
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for the request');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await axiosInstance.post(
        `/tasks/${taskId}/extra-hours/request/`,
        {
          requested_hours: normalizedTime, // Send in HH:MM:SS format
          reason: reason.trim()
        }
      );

      if (response.status === 200 || response.status === 201) {
        toast.success('Additional hours requested successfully');
        setRequestedHours('00:00:00');
        setReason('');
        onSuccess?.();
        onClose();
      }
    } catch (error: any) {
      console.error('Failed to request extra hours:', error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          'Failed to request additional hours';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const exceededHours = Math.max(0, consumedHours - allocatedHours);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="text-orange-600" size={24} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Request Additional Hours</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isSubmitting}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Warning Message */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Clock className="text-orange-600 mt-0.5 flex-shrink-0" size={20} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-orange-900 mb-1">
                  Time Limit Exceeded
                </p>
                <p className="text-sm text-orange-700">
                  You have exceeded the allocated time for this task by{' '}
                  <span className="font-bold font-mono">
                    {exceededFormatted || `${exceededHours.toFixed(2)}h`}
                  </span>.
                </p>
              </div>
            </div>
          </div>

          {/* Task Info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Task:</span>
              <span className="text-sm font-semibold text-gray-900">{taskTitle}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Allocated Hours:</span>
              <span className="text-sm font-semibold text-gray-900 font-mono">
                {allocatedFormatted || `${allocatedHours.toFixed(2)}h`}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Consumed Hours:</span>
              <span className="text-sm font-semibold text-orange-600 font-mono">
                {consumedFormatted || `${consumedHours.toFixed(2)}h`}
              </span>
            </div>
          </div>

          {/* Requested Hours Input */}
          <div>
            <label htmlFor="requestedHours" className="block text-sm font-semibold text-gray-700 mb-2">
              Additional Hours Needed <span className="text-red-500">*</span>
            </label>
            <input
              id="requestedHours"
              type="text"
              value={requestedHours}
              onChange={(e) => setRequestedHours(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-mono"
              placeholder="HH:MM:SS (e.g., 05:30:00)"
              required
              disabled={isSubmitting}
              pattern="[0-9]{1,2}:[0-5][0-9](:[0-5][0-9])?"
            />
            <p className="text-xs text-gray-500 mt-1">
              Auto-calculated as (Consumed - Allocated) in HH:MM:SS format. You can adjust this value as needed.
            </p>
          </div>

          {/* Reason Textarea */}
          <div>
            <label htmlFor="reason" className="block text-sm font-semibold text-gray-700 mb-2">
              Reason for Additional Time <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
              placeholder="Please explain why you need additional time..."
              required
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 mt-1">
              Provide a clear explanation for the admin to review
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Request Additional Hours'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
