import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../../Auth/auth.service';

const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/refresh', '/api/auth/forgot-password', '/api/auth/reset-password'];
const isPublic = (url: string) => PUBLIC_PATHS.some((p) => url.includes(p));
const withToken = (req: HttpRequest<unknown>, token: string) =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

/** Adds the bearer token, and renews it once (using the refresh token) when the server answers 401. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken();
  if (isPublic(request.url) || !token) return next(request);

  return next(withToken(request, token)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
      if (!auth.hasRefreshToken()) {
        auth.expireSession();
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        switchMap((fresh) => next(withToken(request, fresh))),
        catchError((refreshError: unknown) => {
          auth.expireSession();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
