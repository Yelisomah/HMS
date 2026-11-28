import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, filter, of, switchMap, throwError } from 'rxjs';
import { MOCKED_MODULES } from '../api.config';
import './hospital.mock';
import { MockHttpError, MockRoute, adjustedRoutes } from './mock-routes';

/**
 * Serves not-yet-built backend endpoints from memory so screens can be developed and demoed.
 * Only routes whose module is flagged true in MOCKED_MODULES are answered here; everything else
 * passes through to the real server. Remove a module's flag (set false) to go live - no UI change.
 * Mock data lives in memory only and resets on page reload.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const path = new URL(req.urlWithParams, 'http://local').pathname;
  for (const route of adjustedRoutes) {
    if (!MOCKED_MODULES[route.module] || route.method !== req.method) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    return respond(req, next, route, match.slice(1).map(decodeURIComponent));
  }
  return next(req);
};

function respond(req: HttpRequest<unknown>, next: HttpHandlerFn, route: MockRoute, params: string[]): Observable<HttpEvent<unknown>> {
  // urlWithParams: HttpClient keeps query parameters out of req.url.
  const url = new URL(req.urlWithParams, 'http://local');
  const query = Object.fromEntries(url.searchParams.entries());
  return of(null).pipe(
    delay(250),
    switchMap(() => {
      try {
        const out = route.handle({ params, query, body: req.body, // Only the final response: HttpClient also emits a "Sent" event first, which must not be mistaken for the reply.
          next: (r) => next(r).pipe(filter((e): e is HttpResponse<unknown> => e instanceof HttpResponse)), request: req });
        const result$ = out instanceof Observable ? out : of(out);
        return result$.pipe(switchMap((body) => of(new HttpResponse({ status: 200, body }))));
      } catch (e) {
        if (e instanceof MockHttpError) {
          return throwError(() => new HttpErrorResponse({ status: e.status, error: { message: e.message }, url: req.url }));
        }
        throw e;
      }
    }),
  );
}
