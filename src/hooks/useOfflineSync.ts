import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { flushOfflineRegistrationQueue } from '@/lib/iftinOfflineApi';

interface QueuedOrder {
  id: string;
  data: any;
  timestamp: number;
}

const QUEUE_KEY = 'najax_queued_orders';

export const useOfflineSync = () => {
  const { isReallyOnline } = useConnectivity();
  const [queuedOrders, setQueuedOrders] = useState<QueuedOrder[]>([]);

  useEffect(() => {
    // Load queued orders from localStorage
    const loadQueue = () => {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (stored) {
        try {
          setQueuedOrders(JSON.parse(stored));
        } catch (error) {
          console.error('Error loading queued orders:', error);
        }
      }
    };

    loadQueue();
  }, []);

  // Sync queued orders when coming back online
  useEffect(() => {
    if (isReallyOnline && queuedOrders.length > 0) {
      syncQueuedOrders();
    }
  }, [isReallyOnline]); // Removed queuedOrders.length to prevent multiple syncs

  // Retry offline registrations that never reached the Iftin API.
  useEffect(() => {
    if (!isReallyOnline) return;
    void flushOfflineRegistrationQueue().catch(() => undefined);
  }, [isReallyOnline]);

  const queueOrder = (orderData: any) => {
    const queuedOrder: QueuedOrder = {
      id: crypto.randomUUID(),
      data: orderData,
      timestamp: Date.now(),
    };

    const newQueue = [...queuedOrders, queuedOrder];
    setQueuedOrders(newQueue);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));

    return queuedOrder.id;
  };

  const syncQueuedOrders = async () => {
    if (queuedOrders.length === 0) return;

    const successfulIds: string[] = [];

    for (const queuedOrder of queuedOrders) {
      try {
        const { error } = await supabase
          .from('orders')
          .insert(queuedOrder.data);

        if (!error) {
          successfulIds.push(queuedOrder.id);
        }
      } catch (error) {
        // Silent error handling
      }
    }

    // Remove successfully synced orders from queue
    if (successfulIds.length > 0) {
      const remainingQueue = queuedOrders.filter(
        order => !successfulIds.includes(order.id)
      );
      setQueuedOrders(remainingQueue);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
    }
  };

  return {
    isOnline: isReallyOnline,
    queuedOrders,
    queueOrder,
    syncQueuedOrders,
  };
};
