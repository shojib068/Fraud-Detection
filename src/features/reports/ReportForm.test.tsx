import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, signedIn } from '../../test/render';
import { ReportForm } from './ReportForm';

const submitReport = vi.fn();
const uploadEvidence = vi.fn();
vi.mock('../../services/reports', () => ({
  submitReport: (...args: unknown[]) => submitReport(...args),
  uploadEvidence: (...args: unknown[]) => uploadEvidence(...args),
}));
vi.mock('../../services/search', () => ({
  listCategories: async () => [{ id: 'cat-1', name: 'Banking & Phishing Scam', description: null }],
}));

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Phone number that contacted you'), '০১৭১২-৩৪৫৬৭৮');
  await user.selectOptions(screen.getByLabelText('Category'), 'cat-1');
  await user.type(
    screen.getByLabelText('What happened?'),
    'Caller asked for my card number and OTP.',
  );
  await user.click(screen.getByRole('checkbox'));
}

describe('ReportForm', () => {
  beforeEach(() => {
    submitReport.mockReset();
    uploadEvidence.mockReset();
  });

  it('shows validation messages and does not submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportForm />, { auth: signedIn });
    await user.click(await screen.findByRole('button', { name: 'Submit for review' }));

    expect(await screen.findByText('Enter a phone number.')).toBeInTheDocument();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(
      screen.getByText('Describe what happened in at least 20 characters.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Please confirm you removed personal information.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number that contacted you')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(submitReport).not.toHaveBeenCalled();
  });

  it('rejects too many or unsupported evidence files', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWithProviders(<ReportForm />, { auth: signedIn });
    const input = await screen.findByLabelText('Evidence (optional)');

    const png = (n: string) => new File(['x'], n, { type: 'image/png' });
    await user.upload(input, [png('a.png'), png('b.png'), png('c.png'), png('d.png')]);
    expect(await screen.findByText('You can attach up to 3 images.')).toBeInTheDocument();

    await user.upload(input, [new File(['x'], 'doc.pdf', { type: 'application/pdf' })]);
    expect(
      await screen.findByText('Only JPEG, PNG or WebP images are allowed.'),
    ).toBeInTheDocument();

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await user.upload(input, [big]);
    expect(await screen.findByText('Each image must be 5 MB or smaller.')).toBeInTheDocument();
  });

  it('submits a normalized number and shows the reference', async () => {
    submitReport.mockResolvedValue({ id: 'r1', reference: 'SN-ABCDEF12' });
    const user = userEvent.setup();
    renderWithProviders(<ReportForm />, { auth: signedIn });
    await screen.findByLabelText('Category');
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(await screen.findByText('SN-ABCDEF12')).toBeInTheDocument();
    expect(submitReport).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+8801712345678', categoryId: 'cat-1' }),
    );
    expect(uploadEvidence).not.toHaveBeenCalled();
  });

  it('shows the server error when submission is refused', async () => {
    submitReport.mockRejectedValue(
      new Error('You already reported this number in the last 30 days.'),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReportForm />, { auth: signedIn });
    await screen.findByLabelText('Category');
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() =>
      expect(
        screen.getByText('You already reported this number in the last 30 days.'),
      ).toBeInTheDocument(),
    );
  });
});
