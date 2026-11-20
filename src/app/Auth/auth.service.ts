import { inject, Injectable } from '@angular/core';
import { Observable, finalize, map, of, tap, throwError } from 'rxjs';
import { API_ENDPOINTS, USE_MOCK_DATA } from '../core/api/api.config';
import { ApiService } from '../core/api/api.service';
import { AuthUser, LoginRequest, LoginResponse } from '../core/api/api.models';
import { HmsStore } from '../core/hms.store';

export const USER_ROLES = ['Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Lab_Technician'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const ROLE_STORAGE_KEY = 'hms-user-role';
const EMAIL_STORAGE_KEY = 'hms-user-email';
const USER_ID_STORAGE_KEY = 'hms-user-id';
const NAME_KEY = 'hms-user-name';
const ACCESS_TOKEN_KEY = 'hms-access-token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly store = inject(HmsStore);

  authenticate(email: string, password: string): Observable<AuthUser> {
    const credentials: LoginRequest = { email: email.trim(), password };
    if (USE_MOCK_DATA) {
      if (password.length < 8) {
        return throwError(() => new Error('Demo passwords must be at least eight characters.'));
      }

      const member = this.store.staff().find(
        (staff) => staff.email.toLowerCase() === credentials.email.toLowerCase(),
      );
      if (!member) {
        return throwError(() => new Error('Use an email address from the demo staff list.'));
      }

      const user: AuthUser = {
        id: member.id,
        name: member.name,
        email: member.email,
        role: toDashboardRole(member.role),
      };
      this.saveSession('demo-session-token', user);
      return of(user);
    }

    return this.api.post<unknown, LoginRequest>(API_ENDPOINTS.auth.login, credentials).pipe(
      map(parseLoginResponse),
      tap(({ access_token, user }) => this.saveSession(access_token, user)),
      map(({ user }) => user),
    );
  }

  requestPasswordReset(_email: string): Observable<never> {
    return throwError(
      () => new Error('Password reset is not available in the configured API documentation.'),
    );
  }

  getRole(): UserRole | null {
    const role = sessionStorage.getItem(ROLE_STORAGE_KEY);
    return isUserRole(role) ? role : null;
  }

  getEmail(): string | null {
    return sessionStorage.getItem(EMAIL_STORAGE_KEY);
  }

  getName(): string {
    return sessionStorage.getItem(NAME_KEY) ?? '';
  }

  getUserId(): string | null {
    return sessionStorage.getItem(USER_ID_STORAGE_KEY);
  }

  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  loadCurrentUser(): Observable<AuthUser> {
    if (USE_MOCK_DATA) {
      const userId = this.getUserId();
      const member = this.store.staff().find((staff) => staff.id === userId);
      if (!member) {
        return throwError(() => new Error('No signed-in demo user was found.'));
      }
      return of({
        id: member.id,
        name: member.name,
        email: member.email,
        role: toDashboardRole(member.role),
      });
    }

    return this.api.get<unknown>(API_ENDPOINTS.auth.currentUser).pipe(
      map((response) => {
        if (!isRecord(response) || !isRecord(response['user'])) {
          throw new Error('The current-user API returned an invalid response.');
        }
        return parseUser(response['user']);
      }),
    );
  }

  signOut(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(ROLE_STORAGE_KEY);
    sessionStorage.removeItem(EMAIL_STORAGE_KEY);
    sessionStorage.removeItem(USER_ID_STORAGE_KEY);
    sessionStorage.removeItem(NAME_KEY);
  }

  signOutFromApi(): Observable<void> {
    if (USE_MOCK_DATA) {
      this.signOut();
      return of(void 0);
    }

    if (!this.getAccessToken()) {
      this.signOut();
      return of(void 0);
    }

    return this.api.post<unknown, null>(API_ENDPOINTS.auth.logout, null).pipe(
      map(() => void 0),
      finalize(() => this.signOut()),
    );
  }

  dashboardPathFor(userId: string): string {
    if (!userId.trim()) {
      throw new Error('Cannot create a dashboard path without a user ID.');
    }
    return `/${encodeURIComponent(userId)}`;
  }

  private saveSession(accessToken: string, user: AuthUser): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    sessionStorage.setItem(ROLE_STORAGE_KEY, user.role);
    sessionStorage.setItem(EMAIL_STORAGE_KEY, user.email);
    sessionStorage.setItem(USER_ID_STORAGE_KEY, user.id);
    sessionStorage.setItem(NAME_KEY, user.name ?? '');
  }
}

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.some((role) => role === value);
}

export function isUserId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseLoginResponse(response: unknown): LoginResponse & { user: AuthUser } {
  if (!isRecord(response) || typeof response['access_token'] !== 'string') {
    throw new Error('The login API returned an invalid session response.');
  }

  if (!isRecord(response['user'])) {
    throw new Error('The login API did not return a user for these credentials.');
  }

  return {
    access_token: response['access_token'],
    user: parseUser(response['user']),
  };
}

function parseUser(user: Record<string, unknown>): AuthUser {
  if (
    typeof user['id'] !== 'string' ||
    !user['id'].trim() ||
    typeof user['email'] !== 'string' ||
    typeof user['role'] !== 'string'
  ) {
    throw new Error('The authentication API returned invalid user details.');
  }

  return {
    id: user['id'],
    email: user['email'],
    role: toDashboardRole(user['role']),
    ...(typeof user['name'] === 'string' ? { name: user['name'] } : {}),
  };
}

function toDashboardRole(role: string): UserRole {
  switch (role.trim().toLowerCase()) {
    case 'admin':
    case 'administrator':
      return 'Admin';
    case 'doctor':
      return 'Doctor';
    case 'nurse':
      return 'Nurse';
    case 'pharmacist':
      return 'Pharmacist';
    case 'lab technician':
    case 'lab_technician':
    case 'lab-technician':
    case 'lab':
      return 'Lab_Technician';
    default:
      throw new Error(`The API role "${role}" does not have a configured HMS dashboard.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
