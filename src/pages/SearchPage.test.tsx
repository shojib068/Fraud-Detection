import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceError } from '../services/supabase';
import { renderWithProviders } from '../test/render';
import type { SearchResult } from '../types/database';
import { SearchPage } from './SearchPage';

const searchNumber = vi.fn<(e164: string) => Promise<SearchResult>>();
vi.mock('../services/search', () => ({ searchNumber: (e164: string) => searchNumber(e164) }));

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
    </Routes>,
    { route },
  );
}

const empty: SearchResult = {
  number: '+8801712345678',
  approved_count: 0,
  categories: [],
  first_reported: null,
  last_reported: null,
  reports: [],
};

describe('SearchPage', () => {
  beforeEach(() => searchNumber.mockReset());

  it('shows an invalid-number error without calling the API', () => {
    renderAt('/search?q=12345');
    expect(screen.getByText('Invalid number')).toBeInTheDocument();
    expect(searchNumber).not.toHaveBeenCalled();
  });

  it('shows a loading state, then "No reviewed reports found" without calling it safe', async () => {
    searchNumber.mockResolvedValue(empty);
    renderAt('/search?q=%2B8801712345678');
    expect(screen.getByText('Searching reviewed reports…')).toBeInTheDocument();
    expect(
      await screen.findByText(/No reviewed reports found for 01712-345678/),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not mean the number is safe/)).toBeInTheDocument();
    expect(searchNumber).toHaveBeenCalledWith('+8801712345678');
  });

  it('normalizes Bangla digits from the URL', async () => {
    searchNumber.mockResolvedValue(empty);
    renderAt(`/search?q=${encodeURIComponent('০১৭১২৩৪৫৬৭৮')}`);
    await screen.findByText(/No reviewed reports found/);
    expect(searchNumber).toHaveBeenCalledWith('+8801712345678');
  });

  it('renders reviewed reports with neutral wording', async () => {
    searchNumber.mockResolvedValue({
      ...empty,
      approved_count: 2,
      categories: ['Banking & Phishing Scam'],
      first_reported: '2026-01-01',
      last_reported: '2026-02-01',
      reports: [
        {
          id: 'r1',
          category: 'Banking & Phishing Scam',
          incident_date: '2026-02-01',
          public_summary: 'Asked for card details.',
          reviewed_at: '2026-02-02T00:00:00Z',
        },
        {
          id: 'r2',
          category: 'Banking & Phishing Scam',
          incident_date: '2026-01-01',
          public_summary: 'Claimed account would be blocked.',
          reviewed_at: '2026-01-02T00:00:00Z',
        },
      ],
    });
    renderAt('/search?q=01712345678');
    expect(
      await screen.findByText(/2 reviewed community reports for 01712-345678/),
    ).toBeInTheDocument();
    expect(screen.getByText('Asked for card details.')).toBeInTheDocument();
    expect(screen.queryByText(/fraudulent/i)).not.toBeInTheDocument();
  });

  it('shows a network error with retry', async () => {
    searchNumber.mockRejectedValueOnce(
      new ServiceError('Network error. Check your connection and try again.'),
    );
    renderAt('/search?q=01712345678');
    expect(await screen.findByText('Could not load results')).toBeInTheDocument();
    searchNumber.mockResolvedValue(empty);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No reviewed reports found/)).toBeInTheDocument();
  });
});
