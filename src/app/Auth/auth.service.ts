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
  /** All normalized roles from the token. */
  roles: readonly string[];
  /** Primary normalized role for display. */
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
  readonly isAdmin = computed(() => hasRole(this.user()?.roles, 'ADMIN'));
  readonly isDoctor = computed(() => hasRole(this.user()?.roles, 'DOCTOR', 'PHYSICIAN'));
  readonly isNurse = computed(() => hasRole(this.user()?.roles, 'NURSE'));

  login(credentials: LoginRequest): Observable<SessionUser> {
    return this.api.post<LoginResponse>(ENDPOINTS.auth.login, credentials).pipe(
      map((res) => {
        if (!res?.accessToken) throw new Error(res?.message || 'Sign-in failed. Check your details and try again.');
        const user = userFromClaims(decodeJwt(res.accessToken));
        if (!user.id || !user.roles.length) {
          throw new Error('The server returned a token without a readable user ID and role.');
        }
        this.saveTokens(res.accessToken, res.refreshToken);
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

  hasAnyRole(...roles: string[]): boolean {
    return hasRole(this.user()?.roles, ...roles);
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

export function hasRole(roles: string | readonly string[] | undefined, ...names: string[]): boolean {
  const actual = (typeof roles === 'string' ? [roles] : roles ?? []).map(normalizeRole);
  return names.some((name) => actual.includes(normalizeRole(name)));
}

export function decodeJwt(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1] ?? '';
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const json = decodeURIComponent(
      atob(padded)
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

function normalizeRole(role: string): string {
  return role.trim().replace(/^ROLE_/i, '').replace(/[\s-]+/g, '_').toUpperCase();
}

export function rolesFromClaims(claims: Record<string, unknown>): string[] {
  const roles: string[] = [];
  const add = (value: unknown, splitString = false): void => {
    if (Array.isArray(value)) {
      value.forEach((item) => add(item));
      return;
    }
    if (value && typeof value === 'object') {
      const item = value as Record<string, unknown>;
      add(item['authority'] ?? item['name']);
      return;
    }
    if (typeof value !== 'string') return;
    const values = splitString ? value.split(/[,\s]+/) : [value];
    for (const item of values) {
      const role = normalizeRole(item);
      if (role && !roles.includes(role)) roles.push(role);
    }
  };

  add(claims['role']);
  add(claims['roles'], true);
  add(claims['authorities'], true);
  add(claims['authority'], true);
  add(claims['scope'], true);

  const realmAccess = claims['realm_access'];
  if (realmAccess && typeof realmAccess === 'object') add((realmAccess as Record<string, unknown>)['roles']);
  const resourceAccess = claims['resource_access'];
  if (resourceAccess && typeof resourceAccess === 'object') {
    for (const resource of Object.values(resourceAccess as Record<string, unknown>)) {
      if (resource && typeof resource === 'object') add((resource as Record<string, unknown>)['roles']);
    }
  }
  return roles;
}

function userFromClaims(claims: Record<string, unknown>): SessionUser {
  const username = str(claims['username'] ?? claims['preferred_username'] ?? claims['sub']);
  const roles = rolesFromClaims(claims);
  return {
    id: str(claims['userId'] ?? claims['uid'] ?? claims['id'] ?? claims['sub']),
    username,
    name: str(claims['name'] ?? claims['fullName']) || username,
    staffNumber: str(claims['staffNumber']),
    roles,
    role: roles[0] ?? '',
    mustChangePassword: claims['temporaryPassword'] === true || claims['mustChangePassword'] === true,
  };
}
