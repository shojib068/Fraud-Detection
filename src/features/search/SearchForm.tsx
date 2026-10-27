import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { normalizeBDNumber } from '../../lib/phone';

export function SearchForm({ initialValue = '' }: { initialValue?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = normalizeBDNumber(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    navigate(`/search?q=${encodeURIComponent(result.e164)}`);
  }

  return (
    <form role="search" onSubmit={onSubmit} noValidate className="w-full">
      <label htmlFor="search-number" className="label">
        Phone number
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="search-number"
          name="q"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          className="input"
          placeholder="01712-345678 or ০১৭১২৩৪৫৬৭৮"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'search-number-error' : 'search-number-hint'}
        />
        <button type="submit" className="btn-primary sm:w-auto">
          Search
        </button>
      </div>
      {error ? (
        <p id="search-number-error" role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <p id="search-number-hint" className="mt-2 text-xs text-slate-600">
          Bangladesh mobile numbers. English or Bangla digits.
        </p>
      )}
    </form>
  );
}
