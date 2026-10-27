import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Alert } from '../components/Alert';
import { Spinner } from '../components/Spinner';
import { SearchForm } from '../features/search/SearchForm';
import { SearchResults } from '../features/search/SearchResults';
import { normalizeBDNumber } from '../lib/phone';
import { searchNumber } from '../services/search';

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const normalized = normalizeBDNumber(q);
  const e164 = normalized.ok ? normalized.e164 : null;

  const query = useQuery({
    queryKey: ['search', e164],
    queryFn: () => searchNumber(e164!),
    enabled: e164 !== null,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="sr-only">Search results</h1>
      <div className="card">
        <SearchForm key={q} initialValue={q} />
      </div>

      {!normalized.ok && q && (
        <Alert tone="error" title="Invalid number">
          {normalized.error}
        </Alert>
      )}
      {!q && <p className="text-slate-600">Enter a number to see reviewed community reports.</p>}
      {query.isLoading && <Spinner label="Searching reviewed reports…" />}
      {query.isError && (
        <Alert tone="error" title="Could not load results">
          {query.error.message}{' '}
          <button type="button" className="underline" onClick={() => query.refetch()}>
            Try again
          </button>
        </Alert>
      )}
      {query.data && <SearchResults result={query.data} />}
    </div>
  );
}
