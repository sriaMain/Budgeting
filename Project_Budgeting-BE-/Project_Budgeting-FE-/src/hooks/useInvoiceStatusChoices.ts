import { useState, useEffect } from 'react';
import axiosInstance from '../utils/axiosInstance';

export interface StatusChoice {
    value: string;
    label: string;
}

export interface StatusChoicesResponse {
    success: boolean;
    data: StatusChoice[];
}

/**
 * Custom hook to fetch invoice status choices from the API
 * @returns Object containing status choices array, loading state, and error state
 */
export const useInvoiceStatusChoices = () => {
    const [statusChoices, setStatusChoices] = useState<StatusChoice[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStatusChoices = async () => {
            try {
                setLoading(true);
                setError(null);

                const response = await axiosInstance.get<StatusChoicesResponse>('invoices/status-choices/');

                if (response.data.success && response.data.data) {
                    setStatusChoices(response.data.data);
                } else {
                    throw new Error('Invalid response format');
                }
            } catch (err) {
                console.error('Error fetching invoice status choices:', err);
                setError('Failed to load status choices');

                // Fallback to default status choices if API fails
                setStatusChoices([
                    { value: 'Draft', label: 'Draft' },
                    { value: 'Issued', label: 'Issued' },
                    { value: 'Partially Paid', label: 'Partially Paid' },
                    { value: 'Paid', label: 'Paid' },
                    { value: 'Overdue', label: 'Overdue' },
                    { value: 'Cancelled', label: 'Cancelled' }
                ]);
            } finally {
                setLoading(false);
            }
        };

        fetchStatusChoices();
    }, []);

    return { statusChoices, loading, error };
};
