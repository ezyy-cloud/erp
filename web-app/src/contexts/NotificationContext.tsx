import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  getNotifications,
  getUnreadCount,
  markAsRead as markNotificationAsRead,
  markAllAsRead,
  subscribeToNotifications,
  subscribeToUnreadCount,
  type NotificationFilters,
} from '@/lib/services/notificationService';
import type { Notification } from '@/lib/supabase/types';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: Error | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  fetchMoreNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;

  // Fetch notifications
  const fetchNotifications = useCallback(
    async (reset = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setError(null);
        setLoading(true);
        const currentOffset = reset ? 0 : offset;
        const filters: NotificationFilters = {
          limit,
          offset: currentOffset,
        };

        const { data, error: fetchError } = await getNotifications(user.id, filters);

        if (fetchError) {
          setError(fetchError);
          return;
        }

        if (data) {
          if (reset) {
            setNotifications(data);
            setOffset(data.length);
          } else {
            setNotifications((prev) => [...prev, ...data]);
            setOffset((prev) => prev + data.length);
          }

          setHasMore(data.length === limit);
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    },
    [user, offset, limit]
  );

  // Refresh notifications (reset and fetch from beginning)
  const refreshNotifications = useCallback(async () => {
    setOffset(0);
    setHasMore(true);
    await fetchNotifications(true);
  }, [fetchNotifications]);

  // Fetch more notifications (pagination)
  const fetchMoreNotifications = useCallback(async () => {
    if (!hasMore || loading) return;
    await fetchNotifications(false);
  }, [hasMore, loading, fetchNotifications]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;

    try {
      const { count, error: countError } = await getUnreadCount(user.id);
      if (!countError) {
        setUnreadCount(count);
      }
    } catch (err) {
      console.error('Error fetching unread count:', err);
    }
  }, [user]);

  // Mark notification as read
  const markAsRead = useCallback(
    async (notificationId: string) => {
      const { error: markError } = await markNotificationAsRead(notificationId);
      if (markError) {
        console.error('Error marking notification as read:', markError);
        return;
      }

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    },
    []
  );

  // Mark all as read
  const markAllAsReadHandler = useCallback(async () => {
    if (!user) return;

    const { error: markError } = await markAllAsRead(user.id);
    if (markError) {
      console.error('Error marking all as read:', markError);
      return;
    }

    // Update local state
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);
  }, [user]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) {
      setLoading(false);
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Initial fetch
    let mounted = true;
    fetchNotifications(true).then(() => {
      if (mounted) {
        fetchUnreadCount();
      }
    });

    // Subscribe to new notifications
    const unsubscribeNotifications = subscribeToNotifications(user.id, (newNotification) => {
      if (mounted) {
        setNotifications((prev) => [newNotification, ...prev]);
        if (!newNotification.is_read) {
          setUnreadCount((prev) => prev + 1);
        }
      }
    });

    // Subscribe to unread count changes
    const unsubscribeCount = subscribeToUnreadCount(user.id, (count) => {
      if (mounted) {
        setUnreadCount(count);
      }
    });

    // Cleanup
    return () => {
      mounted = false;
      unsubscribeNotifications();
      unsubscribeCount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only depend on user.id to avoid re-subscribing unnecessarily

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead: markAllAsReadHandler,
    refreshNotifications,
    fetchMoreNotifications,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
