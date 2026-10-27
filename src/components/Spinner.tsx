export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-10 text-slate-600">
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700"
      />
      <span>{label}</span>
    </div>
  );
}
