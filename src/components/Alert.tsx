import type { ReactNode } from 'react';

const TONES = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  success: 'border-green-200 bg-green-50 text-green-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
} as const;

interface AlertProps {
  tone?: keyof typeof TONES;
  title?: string;
  children?: ReactNode;
}

export function Alert({ tone = 'info', title, children }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
    </div>
  );
}
