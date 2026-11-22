import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { ENDPOINTS } from '../core/api/api.config';
import { ApiService } from '../core/api/api.service';
import { LoginRequest, LoginResponse, ResponseMessage } from '../core/api/api.models';

const ACCESS_KEY = 'hms-access-token';
const REFRESH_KEY = 'hms-refresh-token';

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  staffNumber: string;
  /** Upper-cased role name without any ROLE_ prefix, e.g. ADMIN, DOCTOR, NURSE. */
  role: string;
  mustChangePassword: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private refreshing$: Observable<string> | null = null;

  private readonly token = signal<string | null>(sessionStorage.getItem(ACCESS_KEY));

  /** Signed-in user, decoded from the access token. The server remains the authority on permissions. */
  readonly user = computed<SessionUser | null>(() => {
    const token = this.token();
    return token ? userFromClaims(decodeJwt(token)) : null;
  });
  readonly isAdmin = computed(() => hasRole(this.user()?.role, 'ADMIN'));
  readonly isDoctor = computed(() => hasRole(this.user()?.role, 'DOCTOR', 'PHYSICIAN'));
  readonly isNurse = computed(() => hasRole(this.user()?.role, 'NURSE'));

  login(credentials: LoginRequest): Observable<SessionUser> {
    return this.api.post<LoginResponse>(ENDPOINTS.auth.login, credentials).pipe(
      map((res) => {
        if (!res?.accessToken) throw new Error(res?.message || 'Sign-in failed. Check your details and try again.');
        this.saveTokens(res.accessToken, res.refreshToken);
        const user = this.user();
        if (!user) throw new Error('The server returned a session this app cannot read.');
        return user;
      }),
    );
  }

  /** Exchanges the refresh token for a new access token. Concurrent callers share one request. */
  refresh(): Observable<string> {
    const refreshToken = sessionStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return throwError(() => new Error('No refresh token'));
    this.refreshing$ ??= this.api.post<LoginResponse>(ENDPOINTS.auth.refresh, { refreshToken }).pipe(
      map((res) => {
        if (!res?.accessToken) throw new Error('Refresh failed');
        this.saveTokens(res.accessToken, res.refreshToken ?? refreshToken);
        return res.accessToken;
      }),
      finalize(() => (this.refreshing$ = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshing$;
  }

  logout(): Observable<void> {
    const hasToken = !!this.accessToken();
    const request: Observable<unknown> = hasToken
      ? this.api.post<ResponseMessage>(ENDPOINTS.auth.logout).pipe(catchError(() => of(null)))
      : of(null);
    return request.pipe(
      tap(() => this.clear()),
      map(() => void 0),
    );
  }

  /** Clears the local session and returns to the sign-in page. */
  expireSession(notice = 'Your session has expired. Please sign in again.'): void {
    this.clear();
    void this.router.navigate(['/login'], { state: { authNotice: notice } });
  }

  accessToken(): string | null {
    return this.token();
  }

  hasRefreshToken(): boolean {
    return !!sessionStorage.getItem(REFRESH_KEY);
  }

  /** True when there is a token that is unexpired, or that can be renewed. */
  isSignedIn(): boolean {
    const token = this.token();
    if (!token) return false;
    const exp = Number(decodeJwt(token)['exp']);
    if (Number.isFinite(exp) && exp * 1000 <= Date.now()) return this.hasRefreshToken();
    return true;
  }

  private saveTokens(access: string, refresh?: string): void {
    sessionStorage.setItem(ACCESS_KEY, access);
    if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
    this.token.set(access);
  }

  private clear(): void {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    this.token.set(null);
  }
}

export function hasRole(role: string | undefined, ...names: string[]): boolean {
  return !!role && names.some((n) => role.includes(n));
}

export function decodeJwt(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function roleFromClaims(claims: Record<string, unknown>): string {
  const raw = claims['role'] ?? claims['roles'] ?? claims['authorities'] ?? claims['scope'] ?? '';
  const first = Array.isArray(raw) ? raw[0] : raw;
  const value = typeof first === 'object' && first ? ((first as Record<string, unknown>)['authority'] ?? (first as Record<string, unknown>)['name']) : first;
  return str(value).split(/[ ,]/)[0].replace(/^ROLE_/i, '').toUpperCase();
}

function userFromClaims(claims: Record<string, unknown>): SessionUser {
  const username = str(claims['username'] ?? claims['preferred_username'] ?? claims['sub']);
  return {
    id: str(claims['userId'] ?? claims['uid'] ?? claims['id'] ?? claims['sub']),
    username,
    name: str(claims['name'] ?? claims['fullName']) || username,
    staffNumber: str(claims['staffNumber']),
    role: roleFromClaims(claims),
    mustChangePassword: claims['temporaryPassword'] === true || claims['mustChangePassword'] === true,
  };
}
