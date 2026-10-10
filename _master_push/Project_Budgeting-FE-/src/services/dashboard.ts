import axiosInstance from '../utils/axiosInstance';
import type {
  DashboardMetrics,
  OrgOverview,
  TaskStatusGrouped,
  WeeklySummary,
  AdminOverview,
} from '../types/dashboard.types';

export const getMetrics = async (): Promise<DashboardMetrics> => {
  const { data } = await axiosInstance.get('dashboard/metrics/');
  return data;
};

export const getOrgOverview = async (): Promise<OrgOverview> => {
  const { data } = await axiosInstance.get('dashboard/org-overview/');
  return data;
};

export const getTaskStatusGrouped = async (): Promise<TaskStatusGrouped> => {
  const { data } = await axiosInstance.get('tasks/grouped-by-status/');
  return data;
};

export const getWeeklySummary = async (): Promise<WeeklySummary> => {
  const { data } = await axiosInstance.get('timesheet/weekly-summary/');
  return data;
};

export const getAdminOverview = async (): Promise<AdminOverview> => {
  const { data } = await axiosInstance.get('dashboard/admin-overview/');
  return data;
};
