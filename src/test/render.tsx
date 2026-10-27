import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AuthContext, type AuthState } from '../features/auth/context';

export const signedOut: AuthState = {
  session: null,
  user: null,
  roles: [],
  loading: false,
  isModerator: false,
  isAdmin: false,
  signOut: async () => {},
};

export const signedIn: AuthState = {
  ...signedOut,
  user: { id: '11111111-1111-1111-1111-111111111111' } as AuthState['user'],
  roles: ['user'],
};

/** Renders with router, a fresh query client and a fixed auth state. */
export function renderWithProviders(
  ui: ReactNode,
  { route = '/', auth = signedOut }: { route?: string; auth?: AuthState } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
