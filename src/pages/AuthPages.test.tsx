import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { LoginPage } from './LoginPage';
import { SignUpPage } from './SignUpPage';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
}));
vi.mock('../services/supabase', () => ({ supabase: { auth } }));

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  async function signIn(email: string, password: string) {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText('Email address'), email);
    await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    return user;
  }

  it('signs in with email and password', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    await signIn(' Rahim@Example.com ', 'secret-pass');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'rahim@example.com',
      password: 'secret-pass',
    });
  });

  it('shows a clear message for wrong credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await signIn('rahim@example.com', 'wrong-pass');
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('asks unverified users to verify, and can resend the email', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Email not confirmed' } });
    auth.resend.mockResolvedValue({ error: null });
    const user = await signIn('rahim@example.com', 'secret-pass');
    expect(await screen.findByText('Verify your email first')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(auth.resend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'signup', email: 'rahim@example.com' }),
    );
    expect(await screen.findByText('Verification email sent again.')).toBeInTheDocument();
  });

  it('requires both fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email and password.')).toBeInTheDocument();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('SignUpPage', () => {
  beforeEach(() => vi.clearAllMocks());

  async function fill(email: string, password: string, confirm = password) {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await user.type(screen.getByLabelText('Email address'), email);
    await user.type(screen.getByLabelText('Password'), password);
    await user.type(screen.getByLabelText('Confirm password'), confirm);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
  }

  it('validates email, password length and confirmation', async () => {
    await fill('not-an-email', 'short', 'other');
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('signs up and asks the user to check their inbox', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { identities: [{}] }, session: null },
      error: null,
    });
    await fill('Karim@Example.com', 'long-enough-pw');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'karim@example.com',
      password: 'long-enough-pw',
      options: { emailRedirectTo: expect.stringMatching(/\/login\?next=/) },
    });
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('karim@example.com')).toBeInTheDocument();
  });

  it('tells the user when the email already has an account', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    });
    await fill('karim@example.com', 'long-enough-pw');
    expect(
      await screen.findByText('An account with this email already exists. Sign in instead.'),
    ).toBeInTheDocument();
  });
});
