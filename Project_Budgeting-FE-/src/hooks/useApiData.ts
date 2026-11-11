/**
 * GET an API URL whenever it or its params change; `loading` is derived from the request key
 * (no setState in the effect body). `reload()` fetches again. Keeps the last data while a new
 * request is in flight, so tables don't flash empty. `errorStatus` is the failed response's
 * HTTP status (undefined for a network error/timeout), so callers can tell "not found" from
 * "the server or database is down".
 */
import { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { errorText } from '../utils/resources';

export function useApiData<T>(url: string | null, params: Record<string, unknown> = {}, failMessage = 'Failed to load') {
    const [reloadKey, setReloadKey] = useState(0);
    const requestKey = url ? `${url}|${JSON.stringify(params)}|${reloadKey}` : '';
    const [result, setResult] = useState<{ key: string; data?: T; error?: string; status?: number } | null>(null);

    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        axiosInstance.get<T>(url, { params })
            .then((res) => { if (!cancelled) setResult({ key: requestKey, data: res.data }); })
            .catch(async (err) => {
                const message = await errorText(err, failMessage);
                const status: number | undefined = err?.response?.status;
                if (!cancelled) setResult((prev) => ({ key: requestKey, data: prev?.data, error: message, status }));
            });
        return () => { cancelled = true; };
        // params are part of requestKey
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestKey]);

    const loading = !!url && result?.key !== requestKey;
    const error = !loading ? result?.error : undefined;
    const errorStatus = error ? result?.status : undefined;
    const reload = useCallback(() => setReloadKey((k) => k + 1), []);
    return { data: error ? undefined : result?.data, staleData: result?.data, loading, error, errorStatus, reload };
}
