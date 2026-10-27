import { useEffect, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

export interface RealtimeSubscription {
  /** Table in the public schema. Realtime only delivers rows the user may select under RLS. */
  table: string;
  /** Optional Realtime filter, e.g. `reporter_id=eq.<uuid>`. */
  filter?: string;
}

interface Options {
  /** Channel name prefix, for debugging. */
  channel: string;
  subscriptions: RealtimeSubscription[];
  /** Query keys to refetch when any subscribed row changes. */
  queryKeys: QueryKey[];
  enabled?: boolean;
}

/**
 * Subscribes to Postgres changes and refetches the given queries when a row
 * changes. Payloads are ignored on purpose: data is always reloaded through the
 * normal RPCs, so RLS and redaction rules apply to what is shown.
 */
export function useRealtimeInvalidate({
  channel,
  subscriptions,
  queryKeys,
  enabled = true,
}: Options): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  // Stable dependencies for arrays the caller recreates on each render.
  const subsKey = JSON.stringify(subscriptions);
  const keysKey = JSON.stringify(queryKeys);

  useEffect(() => {
    if (!enabled) return;
    const subs = JSON.parse(subsKey) as RealtimeSubscription[];
    const keys = JSON.parse(keysKey) as QueryKey[];
    const refetch = () => {
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
    };

    // Unique topic per mount, so a remount (e.g. StrictMode) never reuses a
    // channel that is still being torn down.
    let ch = supabase.channel(`${channel}:${crypto.randomUUID()}`);
    for (const { table, filter } of subs) {
      ch = ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        refetch,
      );
    }
    ch.subscribe((state) => {
      if (state === 'SUBSCRIBED') {
        setStatus('live');
        // Catch up on anything that changed while connecting or offline.
        refetch();
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        setStatus('offline');
      }
    });

    return () => {
      setStatus('connecting');
      void supabase.removeChannel(ch);
    };
  }, [channel, subsKey, keysKey, enabled, queryClient]);

  return enabled ? status : 'offline';
}
