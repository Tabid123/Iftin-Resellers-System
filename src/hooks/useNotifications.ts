import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

export function useNotifications() {
  const tenantState = useTenant();
  const tenantId = tenantState?.tenant?.id || null;
  const storageKey = tenantId ? `lastSeenNotification:${tenantId}` : 'lastSeenNotification';

  const [lastSeenTimestamp, setLastSeenTimestamp] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const { data: notifications, isLoading, isError, refetch } = useQuery({
    queryKey: ['user-notifications', tenantId],
    enabled: !!tenantId,
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
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30_000,
  });

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
