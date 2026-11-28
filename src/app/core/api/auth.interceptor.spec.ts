import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../Auth/auth.service';
import { authInterceptor } from './auth.interceptor';

function jwt(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.x`;
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  const oldToken = jwt({ sub: 'u1', role: 'DOCTOR' });
  const newToken = jwt({ sub: 'u1', role: 'DOCTOR', n: 2 });

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('hms-access-token', oldToken);
    sessionStorage.setItem('hms-refresh-token', 'refresh-1');
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'login', children: [] }]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { ctrl.verify(); TestBed.resetTestingModule(); });

  it('adds the bearer token', () => {
    http.get('/api/patients/search').subscribe();
    const req = ctrl.expectOne('/api/patients/search');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${oldToken}`);
    req.flush({});
  });

  it('does not attach a token to login', () => {
    http.post('/api/auth/login', {}).subscribe();
    expect(ctrl.expectOne('/api/auth/login').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once on 401 and retries with the new token', () => {
    let result: unknown;
    http.get('/api/checkin/active').subscribe((r) => (result = r));
    ctrl.expectOne('/api/checkin/active').flush({}, { status: 401, statusText: 'Unauthorized' });

    const refresh = ctrl.expectOne((r) => r.url.endsWith('/api/auth/refresh'));
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    refresh.flush({ accessToken: newToken, refreshToken: 'refresh-2' });

    const retry = ctrl.expectOne('/api/checkin/active');
    expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${newToken}`);
    retry.flush(['ok']);
    expect(result).toEqual(['ok']);
    expect(sessionStorage.getItem('hms-refresh-token')).toBe('refresh-2');
  });

  it('signs out when the refresh fails', () => {
    const auth = TestBed.inject(AuthService);
    let failed = false;
    http.get('/api/checkin/active').subscribe({ error: () => (failed = true) });
    ctrl.expectOne('/api/checkin/active').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne((r) => r.url.endsWith('/api/auth/refresh')).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(failed).toBe(true);
    expect(auth.accessToken()).toBeNull();
  });
});
