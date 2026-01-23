import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './AuthContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RealtimeConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'offline';

interface RealtimeContextType {
  connectionState: RealtimeConnectionState;
  isConnected: boolean;
  activeSubscriptions: number;
  subscribe: (
    channelName: string,
    config: {
      event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
      schema: string;
      table: string;
      filter?: string;
      callback: (payload: any) => void;
    }
  ) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

interface RealtimeProviderProps {
  children: ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('disconnected');
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const subscriptionCountRef = useRef(0);

  // Monitor Supabase Realtime connection state
  useEffect(() => {
    if (!user || !isOnline) {
      setConnectionState('offline');
      return;
    }

    // Initial state - assume connected when online and user is authenticated
    // Note: Supabase Realtime doesn't expose direct connection state events
    // We'll infer state from subscription success/failure
    if (isOnline && user) {
      setConnectionState('connected');
    }

    return () => {
      // Cleanup handled by individual subscriptions
    };
  }, [user, isOnline]);

  // Cleanup all subscriptions when user changes or goes offline
  useEffect(() => {
    if (!user || !isOnline) {
      // Clean up all channels
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      channelsRef.current.clear();
      subscriptionCountRef.current = 0;
      setActiveSubscriptions(0);
      setConnectionState('offline');
    }
  }, [user?.id, isOnline]);

  // Subscribe function
  const subscribe = useCallback(
    (
      channelName: string,
      config: {
        event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
        schema: string;
        table: string;
        filter?: string;
        callback: (payload: any) => void;
      }
    ): (() => void) => {
      if (!user || !isOnline) {
        // Return no-op unsubscribe if offline
        return () => {};
      }

      // Create unique channel name with user ID to avoid conflicts
      const uniqueChannelName = `${channelName}:${user.id}:${Date.now()}`;

      // Check if channel already exists
      if (channelsRef.current.has(uniqueChannelName)) {
        console.warn(`Channel ${uniqueChannelName} already exists`);
      }

      // Create channel
      const channel = supabase
        .channel(uniqueChannelName)
        .on(
          'postgres_changes' as any,
          {
            event: config.event,
            schema: config.schema,
            table: config.table,
            filter: config.filter,
          },
          (payload: any) => {
            // Only call callback if online
            if (isOnline) {
              try {
                config.callback(payload);
              } catch (error) {
                console.error(`Error in realtime callback for ${uniqueChannelName}:`, error);
              }
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConnectionState('connected');
            subscriptionCountRef.current += 1;
            setActiveSubscriptions(subscriptionCountRef.current);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setConnectionState('reconnecting');
          }
        });

      channelsRef.current.set(uniqueChannelName, channel);

      // Return unsubscribe function
      return () => {
        const channelToRemove = channelsRef.current.get(uniqueChannelName);
        if (channelToRemove) {
          supabase.removeChannel(channelToRemove);
          channelsRef.current.delete(uniqueChannelName);
          subscriptionCountRef.current = Math.max(0, subscriptionCountRef.current - 1);
          setActiveSubscriptions(subscriptionCountRef.current);
        }
      };
    },
    [user, isOnline]
  );

  const value: RealtimeContextType = {
    connectionState,
    isConnected: connectionState === 'connected' && isOnline,
    activeSubscriptions,
    subscribe,
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (context === undefined) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}
