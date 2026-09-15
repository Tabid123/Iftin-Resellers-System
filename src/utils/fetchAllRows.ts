import { supabase } from '@/integrations/supabase/client';

/**
 * Recursively fetch all rows from a Supabase query, bypassing the 1000-row default limit.
 * Pass a query builder function that returns the query WITHOUT .range() or .limit().
 */
export async function fetchAllRows<T = any>(
  buildQuery: () => any,
  pageSize = 1000
): Promise<T[]> {
  let allData: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) {
      console.error('fetchAllRows error:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allData = [...allData, ...(data as T[])];
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allData;
}
