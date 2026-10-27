/** Only allow same-site relative redirects after sign-in. */
export function safeNext(value: string | null, fallback = '/my-reports'): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}
