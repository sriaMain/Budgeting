import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import axiosInstance from '../utils/axiosInstance';
import type { HelpdeskTask } from '../utils/helpdeskTasks';

const fetchHelpdeskTasks = async (path: string) => {
    try {
        const { data } = await axiosInstance.get(path);
        return {
            tasks: (Array.isArray(data?.results) ? data.results : []) as HelpdeskTask[],
            fetchedAt: (data?.fetched_at ?? null) as string | null,
            scope: (data?.scope ?? null) as 'all' | 'mine' | null,
            error: null,
        };
    } catch (err) {
        const message = (axios.isAxiosError(err) && err.response?.data?.error) || 'Could not load tasks from the helpdesk. Try again.';
        return { tasks: [] as HelpdeskTask[], fetchedAt: null, scope: null, error: String(message) };
    }
};

/**
 * Tasks from the helpdesk (created and assigned there) - `path` is
 * '/projects/<id>/helpdesk-tasks/' for one project (Project Details' Tasks tab and
 * its Overdue Tasks KPI) or '/helpdesk-tasks/' for Task Management. Budgeting's
 * backend calls the helpdesk, so its API key never reaches the browser.
 */
export const useHelpdeskTasks = (path?: string) => {
    const [tasks, setTasks] = useState<HelpdeskTask[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [fetchedAt, setFetchedAt] = useState<string | null>(null);
    // 'mine' = Task Management for someone who isn't an admin / manager: only their own tasks.
    const [scope, setScope] = useState<'all' | 'mine' | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (!path) return;
        let cancelled = false; // a late answer for a page the user already left is dropped
        fetchHelpdeskTasks(path).then((result) => {
            if (cancelled) return;
            setTasks(result.tasks);
            setFetchedAt(result.fetchedAt);
            setScope(result.scope);
            setError(result.error);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [path, reloadKey]);

    const refresh = useCallback(() => {
        setLoading(true);
        setReloadKey((k) => k + 1);
    }, []);

    return { tasks, loading, error, fetchedAt, scope, refresh };
};
