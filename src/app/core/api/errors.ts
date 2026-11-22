import { HttpErrorResponse } from '@angular/common/http';

/** Turns any thrown value into a message that is safe to show to staff. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server. Check your connection — if the server was idle it may need a minute to wake up.';
    const body = error.error;
    const fromBody =
      typeof body === 'string' ? body
      : body && typeof body === 'object' ? (body.message ?? body.error ?? body.detail ?? firstFieldError(body))
      : null;
    if (typeof fromBody === 'string' && fromBody.trim() && !fromBody.trim().startsWith('<')) return fromBody;
    if (error.status === 401) return 'Your session has expired or the credentials are wrong.';
    if (error.status === 403) return 'You do not have permission to do that.';
    if (error.status === 404) return 'That record was not found.';
    if (error.status === 409) return 'This record was changed by someone else. Reload it and try again.';
    if (error.status >= 500) return 'The server had a problem. Please try again shortly.';
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function firstFieldError(body: Record<string, unknown>): string | null {
  const errors = body['errors'];
  if (Array.isArray(errors) && errors.length) {
    const e = errors[0];
    return typeof e === 'string' ? e : ((e as { defaultMessage?: string })?.defaultMessage ?? null);
  }
  const entries = Object.values(body).filter((v) => typeof v === 'string') as string[];
  return entries.length ? entries[0] : null;
}
