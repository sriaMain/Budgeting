export type NotificationType =
  | 'budget'
  | 'expense'
  | 'invoice'
  | 'payment'
  | 'project'
  | 'task'
  | 'quote'
  | 'contact'
  | 'login'
  | 'system';

export type NotificationPriority = 'low' | 'medium' | 'high';

export interface Notification {
  id: number;
  recipient: number;
  title: string;
  message: string;
  notification_type: NotificationType;
  priority: NotificationPriority;
  is_read: boolean;
  module_name?: string | null;
  record_id?: number | null;
  redirect_url?: string | null;
  created_at: string;
}

export interface NotificationFilter {
  type: NotificationType | 'all';
  priority: NotificationPriority | 'all';
  is_read: 'all' | 'read' | 'unread';
}
