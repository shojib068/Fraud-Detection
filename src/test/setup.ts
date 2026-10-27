import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// Components under test never open real Realtime websockets.
// src/lib/useRealtime.test.tsx tests the hook itself with a mocked client.
vi.mock('../lib/useRealtime', () => ({ useRealtimeInvalidate: () => 'live' }));
