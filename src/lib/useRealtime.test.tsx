import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtimeInvalidate } from './useRealtime';

type Handler = () => void;

const mock = vi.hoisted(() => {
  const state = {
    handlers: [] as { table: string; filter?: string; handler: () => void }[],
    statusCallback: undefined as ((s: string) => void) | undefined,
    topic: '',
  };
  const channel = {
    on: vi.fn((_type: string, opts: { table: string; filter?: string }, handler: () => void) => {
      state.handlers.push({ table: opts.table, filter: opts.filter, handler });
      return channel;
    }),
    subscribe: vi.fn((cb: (s: string) => void) => {
      state.statusCallback = cb;
      return channel;
    }),
  };
  return {
    state,
    channel,
    supabase: {
      channel: vi.fn((topic: string) => {
        state.topic = topic;
        return channel;
      }),
      removeChannel: vi.fn(async () => 'ok'),
    },
  };
});

vi.mock('../services/supabase', () => ({ supabase: mock.supabase }));
// The test setup mocks this hook for every other test.
vi.unmock('./useRealtime');

function setup(enabled = true) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useRealtimeInvalidate({
        channel: 'test',
        subscriptions: [
          { table: 'report_updates', filter: 'reporter_id=eq.u1' },
          { table: 'appeals' },
        ],
        queryKeys: [['my-reports'], ['appeals']],
        enabled,
      }),
    { wrapper },
  );
  return { ...hook, invalidate };
}

describe('useRealtimeInvalidate', () => {
  beforeEach(() => {
    mock.state.handlers = [];
    mock.state.statusCallback = undefined;
    vi.clearAllMocks();
  });

  it('subscribes to each table with its filter', () => {
    setup();
    expect(mock.state.topic).toMatch(/^test:/);
    expect(mock.state.handlers.map(({ table, filter }) => ({ table, filter }))).toEqual([
      { table: 'report_updates', filter: 'reporter_id=eq.u1' },
      { table: 'appeals', filter: undefined },
    ]);
  });

  it('reports live status and refetches queries on changes', () => {
    const { result, invalidate } = setup();
    expect(result.current).toBe('connecting');

    act(() => mock.state.statusCallback?.('SUBSCRIBED'));
    expect(result.current).toBe('live');
    invalidate.mockClear();

    act(() => (mock.state.handlers[0]!.handler as Handler)());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-reports'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['appeals'] });

    act(() => mock.state.statusCallback?.('CHANNEL_ERROR'));
    expect(result.current).toBe('offline');
  });

  it('removes the channel on unmount', () => {
    const { unmount } = setup();
    unmount();
    expect(mock.supabase.removeChannel).toHaveBeenCalledWith(mock.channel);
  });

  it('does nothing when disabled', () => {
    const { result } = setup(false);
    expect(mock.supabase.channel).not.toHaveBeenCalled();
    expect(result.current).toBe('offline');
  });
});
