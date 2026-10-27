import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="btn-primary mt-6">
        Go to search
      </Link>
    </div>
  );
}
