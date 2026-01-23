import { supabase } from '@/lib/supabase/client';
import type { Notification } from '@/lib/supabase/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Notification Service
 * Handles all notification-related operations including real-time subscriptions
 */

export interface NotificationFilters {
  isRead?: boolean;
  type?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  userId: string,
  filters?: NotificationFilters
): Promise<{ data: Notification[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false });

    if (filters?.isRead !== undefined) {
      query = query.eq('is_read', filters.isRead);
    }

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: error as Error };
    }

    return { data: data as Notification[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: string): Promise<{ count: number; error: Error | null }> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', userId)
      .eq('is_read', false);

    if (error) {
      return { count: 0, error: error as Error };
    }

    return { count: count ?? 0, error: null };
  } catch (error) {
    return { count: 0, error: error as Error };
  }
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await ((supabase
      .from('notifications') as any)
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId) as any);

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await ((supabase
      .from('notifications') as any)
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('recipient_user_id', userId) as any);

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Subscribe to real-time notification updates
 * Returns unsubscribe function
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notification: Notification) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_user_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload.new as Notification);
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to unread count changes
 * Returns unsubscribe function
 */
export function subscribeToUnreadCount(
  userId: string,
  callback: (count: number) => void
): () => void {
  let lastCount = 0;

  // Initial fetch
  getUnreadCount(userId).then(({ count }) => {
    lastCount = count;
    callback(count);
  });

  const channel: RealtimeChannel = supabase
    .channel(`notifications_count:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_user_id=eq.${userId}`,
      },
      async () => {
        // Refetch count on any change
        const { count } = await getUnreadCount(userId);
        if (count !== lastCount) {
          lastCount = count;
          callback(count);
        }
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}
