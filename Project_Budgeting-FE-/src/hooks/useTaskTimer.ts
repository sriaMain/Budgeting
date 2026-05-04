import { useState, useEffect, useCallback, useRef } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { buildWebSocketUrl } from '../utils/apiConfig';
import { toast } from 'react-hot-toast';
import store from '../store/store';

interface TimerState {
    taskId: string | null;
    startTime: number | null; // timestamp in ms
    elapsedSeconds: number; // accumulated seconds from previous sessions
    isRunning: boolean;
}

interface UseTaskTimerReturn {
    activeTimerTaskId: string | null;
    getElapsedTime: (taskId: string) => number;
    isTaskRunning: (taskId: string) => boolean;
    startTimer: (taskId: string, currentElapsed?: number) => Promise<void>;
    pauseTimer: (taskId: string) => Promise<void>;
    stopTimer: (taskId: string) => Promise<void>;
    fetchTimerState: (taskId: string) => Promise<void>;
    formatTime: (seconds: number) => string;
}

const STORAGE_KEY = 'task_timer_state';

export const useTaskTimer = (): UseTaskTimerReturn => {
    const [timerState, setTimerState] = useState<TimerState>(() => {
        // Initialize from localStorage
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return { taskId: null, startTime: null, elapsedSeconds: 0, isRunning: false };
            }
        }
        return { taskId: null, startTime: null, elapsedSeconds: 0, isRunning: false };
    });

    const [currentTime, setCurrentTime] = useState(Date.now());
    const intervalRef = useRef<number | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    // Save to localStorage whenever state changes
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
    }, [timerState]);

    // Update current time every second when timer is running
    useEffect(() => {
        if (timerState.isRunning) {
            intervalRef.current = window.setInterval(() => {
                setCurrentTime(Date.now());
            }, 1000);
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [timerState.isRunning]);

    // WebSocket Management
    const disconnectWebSocket = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
            console.log('Timer WebSocket disconnected');
        }
    }, []);

    const connectWebSocket = useCallback((taskId: string) => {
        disconnectWebSocket();

        const token = store.getState().auth.accessToken;
        const wsUrl = buildWebSocketUrl('/ws/timer/', token ?? undefined);

        try {
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('Timer WebSocket connected for task:', taskId);
                // Send start message if required by the backend
                socket.send(JSON.stringify({
                    type: 'subscribe',
                    task_id: taskId
                }));
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Timer WebSocket message:', data);
                    
                    // Handle timer events with comprehensive data
                    if (data.task_id === taskId || !data.task_id) {
                        // Use total_seconds from WebSocket for accurate time
                        const totalSeconds = data.total_seconds || data.elapsed_time || data.seconds;
                        
                        if (totalSeconds !== undefined) {
                            setTimerState(prev => {
                                // If timer is running, sync with server time
                                if (data.running !== undefined && data.running) {
                                    return {
                                        ...prev,
                                        elapsedSeconds: totalSeconds,
                                        startTime: Date.now(), // Sync local start point with server update
                                        isRunning: true
                                    };
                                } else if (data.running !== undefined && !data.running) {
                                    // Timer paused/stopped
                                    return {
                                        ...prev,
                                        elapsedSeconds: totalSeconds,
                                        startTime: null,
                                        isRunning: false
                                    };
                                } else {
                                    // Just update elapsed time
                                    return {
                                        ...prev,
                                        elapsedSeconds: totalSeconds,
                                        startTime: Date.now()
                                    };
                                }
                            });
                        }
                    }
                } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                }
            };

            socket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            socket.onclose = () => {
                console.log('WebSocket closed');
                socketRef.current = null;
            };

            socketRef.current = socket;
        } catch (err) {
            console.error('Failed to establish WebSocket connection:', err);
        }
    }, [disconnectWebSocket]);

    // Clean up WebSocket on unmount
    useEffect(() => {
        return () => disconnectWebSocket();
    }, [disconnectWebSocket]);

    // Calculate elapsed time for a task
    const getElapsedTime = useCallback((taskId: string): number => {
        if (timerState.taskId !== taskId) {
            return 0;
        }

        if (timerState.isRunning && timerState.startTime) {
            const runningSecs = Math.floor((currentTime - timerState.startTime) / 1000);
            return Math.max(0, timerState.elapsedSeconds + runningSecs);
        }

        return timerState.elapsedSeconds;
    }, [timerState, currentTime]);

    // Check if a task's timer is running
    const isTaskRunning = useCallback((taskId: string): boolean => {
        return timerState.taskId === taskId && timerState.isRunning;
    }, [timerState]);

    // Pause timer for a task
    const pauseTimer = useCallback(async (taskId: string) => {
        if (timerState.taskId !== taskId || !timerState.isRunning) {
            return;
        }

        try {
            // Calculate total elapsed time to send to backend if needed
            const totalElapsed = getElapsedTime(taskId);

            // Call API to pause timer FIRST
            const response = await axiosInstance.post(`tasks/${taskId}/timer/pause/`);
            console.log('Timer paused on backend for task:', taskId, response.data);

            // Extract total_seconds from response (this is the accurate accumulated time)
            const totalSeconds = response.data?.total_seconds || totalElapsed;

            // Update through WebSocket if open
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({
                    type: 'pause_timer',
                    task_id: taskId,
                    elapsed_time: totalSeconds
                }));
            }

            // THEN update local state with the accurate total from backend
            setTimerState({
                taskId,
                startTime: null,
                elapsedSeconds: totalSeconds,
                isRunning: false,
            });

            disconnectWebSocket();
            toast.success('Timer paused');
        } catch (error: any) {
            console.error('Failed to pause timer:', error);
            toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to pause timer');
        }
    }, [timerState, getElapsedTime, disconnectWebSocket]);

    // Start timer for a task
    const startTimer = useCallback(async (taskId: string, currentElapsed: number = 0) => {
        try {
            // If another timer is running, pause it first
            if (timerState.isRunning && timerState.taskId && timerState.taskId !== taskId) {
                await pauseTimer(timerState.taskId);
            }

            // Now start the new timer on the backend
            console.log('Starting timer for task:', taskId);
            const response = await axiosInstance.post(`tasks/${taskId}/timer/start/`);
            console.log('Timer started successfully on backend:', response.data);

            // Extract total_seconds from response (accumulated time from previous sessions)
            const totalSeconds = response.data?.total_seconds || 0;

            // Connect WebSocket for real-time tracking
            connectWebSocket(taskId);

            // Update local state AFTER successful start
            // Use total_seconds from backend as the base elapsed time
            setTimerState({
                taskId,
                startTime: Date.now(),
                elapsedSeconds: totalSeconds,
                isRunning: true,
            });

            const message = response.data?.message || 'Timer started';
            toast.success(message);
        } catch (error: any) {
            console.error('Failed to start timer:', error);
            const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to start timer';
            toast.error(errorMessage);

            setTimerState(prev => ({
                ...prev,
                isRunning: false,
                startTime: null,
            }));
        }
    }, [timerState, pauseTimer, connectWebSocket]);

    // Stop timer for a task (pause and reset)
    const stopTimer = useCallback(async (taskId: string) => {
        if (timerState.taskId !== taskId) {
            return;
        }

        try {
            // Call the stop API endpoint
            await axiosInstance.post(`tasks/${taskId}/timer/stop/`);
            console.log('Timer stopped on backend for task:', taskId);

            // Update through WebSocket if open
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({
                    type: 'stop_timer',
                    task_id: taskId
                }));
            }

            // Reset local state
            setTimerState({
                taskId: null,
                startTime: null,
                elapsedSeconds: 0,
                isRunning: false,
            });

            disconnectWebSocket();
            toast.success('Timer stopped and reset');
        } catch (error: any) {
            console.error('Failed to stop timer:', error);
            const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to stop timer';
            toast.error(errorMessage);
        }
    }, [timerState, disconnectWebSocket]);

    // Fetch timer state from backend
    const fetchTimerState = useCallback(async (taskId: string) => {
        try {
            const response = await axiosInstance.get(`tasks/${taskId}/timer/state/`);
            const data = response.data;

            // Update local state based on timer status
            if (data.status === 'running' && data.is_current_task_running) {
                setTimerState({
                    taskId: taskId,
                    startTime: Date.now() - (data.elapsed_seconds * 1000),
                    elapsedSeconds: data.elapsed_seconds || 0,
                    isRunning: true,
                });
                connectWebSocket(taskId);
            } else if (data.status === 'paused' && data.elapsed_seconds > 0) {
                // Timer is paused but has elapsed time
                setTimerState({
                    taskId: taskId,
                    startTime: null,
                    elapsedSeconds: data.elapsed_seconds,
                    isRunning: false,
                });
            }
        } catch (error: any) {
            console.error('Failed to fetch timer state:', error);
            // Don't show error toast for state fetch failures
        }
    }, [connectWebSocket]);

    // Format seconds to HH:MM:SS
    const formatTime = useCallback((seconds: number): string => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, []);

    return {
        activeTimerTaskId: timerState.taskId,
        getElapsedTime,
        isTaskRunning,
        startTimer,
        pauseTimer,
        stopTimer,
        fetchTimerState,
        formatTime,
    };
};

