import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

function readCachedNotifications(key: string): Notification[] | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Notification[]) : undefined;
  } catch {
    return undefined;
  }
}

export function useNotifications() {
  const tenantState = useTenant();
  const tenantId = tenantState?.tenant?.id || null;
  const storageKey = tenantId ? `lastSeenNotification:${tenantId}` : 'lastSeenNotification';
  const cacheKey = tenantId ? `offline_notifications:${tenantId}` : 'offline_notifications:none';

  const [lastSeenTimestamp, setLastSeenTimestamp] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  // Re-hydrate the seen timestamp when a different tenant becomes authoritative.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setLastSeenTimestamp(localStorage.getItem(storageKey));
    } catch {
      setLastSeenTimestamp(null);
    }
  }, [storageKey]);

  const cachedNotifications = useMemo(() => readCachedNotifications(cacheKey), [cacheKey]);

  const { data: notifications, isLoading, isError, refetch } = useQuery({
    queryKey: ['user-notifications', tenantId],
    enabled: !!tenantId,
    initialData: cachedNotifications,
    staleTime: 30_000,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,title,message,created_at')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    // The bottom navigation consumes only the unread count. Avoid forcing a
    // fresh network request on every app focus/tap; realtime/manual refresh and
    // this light interval keep the list current without making the nav repaint.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!tenantId || !notifications || typeof window === 'undefined') return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(notifications));
    } catch {
      /* keep the live data even if device storage is unavailable/full */
    }
  }, [cacheKey, notifications, tenantId]);

  const unreadCount = notifications?.filter((notif) => {
    if (!lastSeenTimestamp) return true;
    const createdAt = new Date(notif.created_at).getTime();
    const lastSeen = new Date(lastSeenTimestamp).getTime();
    if (!Number.isFinite(createdAt) || !Number.isFinite(lastSeen)) return false;
    return createdAt > lastSeen;
  }).length || 0;

  const markAsSeen = () => {
    const now = new Date().toISOString();
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, now);
      } catch {
        /* ignore storage failures */
      }
    }
    setLastSeenTimestamp(now);
  };

  return {
    notifications,
    isLoading,
    isError,
    unreadCount,
    markAsSeen,
    refetch,
  };
}
