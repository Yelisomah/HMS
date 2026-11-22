import { InjectionToken } from '@angular/core';

/**
 * Base URL for API calls.
 *
 * An empty string means "same origin": the browser calls `/api/...` on whatever host serves the
 * app. In development `proxy.conf.json` forwards that to the backend, and in production nginx
 * (see `nginx.conf.template`) does the same. That keeps CORS out of the picture entirely.
 *
 * To call the backend directly instead, set this to
 * 'https://healthmanagementsystem-a1l5.onrender.com' — the backend must then allow your
 * frontend origin through CORS.
 */
export const API_ROOT_URL = 'https://healthmanagementsystem-a1l5.onrender.com';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => API_ROOT_URL,
});

export const ENDPOINTS = {
  auth: {
    login: '/api/auth/login',
    refresh: '/api/auth/refresh',
    logout: '/api/auth/logout',
    forgotPassword: '/api/auth/forgot-password',
    resetPassword: '/api/auth/reset-password',
    changePassword: '/api/auth/change-password',
    adminResetPassword: (userId: string) => `/api/auth/admin/reset-password/${enc(userId)}`,
  },
  admin: {
    invite: '/api/admin/invite',
    unlock: (id: string) => `/api/admin/users/${enc(id)}/unlock`,
    reactivate: (id: string) => `/api/admin/users/${enc(id)}/reactivate`,
    deactivate: (id: string) => `/api/admin/users/${enc(id)}/deactivate`,
    role: (id: string) => `/api/admin/users/${enc(id)}/role`,
  },
  patients: {
    register: '/api/patients/register',
    search: '/api/patients/search',
    byId: (id: string) => `/api/patients/${enc(id)}`,
    byReg: (reg: string) => `/api/patients/registration/${enc(reg)}`,
  },
  checkin: {
    checkIn: (reg: string) => `/api/checkin/patient/registration/${enc(reg)}`,
    checkOut: (id: number | string) => `/api/checkin/checkout/${enc(id)}`,
    active: '/api/checkin/active',
    byStaff: (staffId: string) => `/api/checkin/staff/${enc(staffId)}`,
  },
  vitals: {
    record: (checkInId: number | string) => `/api/checkin/${enc(checkInId)}/vitals`,
    trend: (reg: string) => `/api/patients/registration/${enc(reg)}/vitals`,
    latest: (reg: string) => `/api/patients/registration/${enc(reg)}/vitals/latest`,
  },
  history: {
    all: (reg: string) => `/api/patients/registration/${enc(reg)}/medical-history`,
    list: (reg: string, kind: HistoryKind) =>
      `/api/patients/registration/${enc(reg)}/medical-history/${kind}`,
    item: (reg: string, kind: HistoryKind, id: string) =>
      `/api/patients/registration/${enc(reg)}/medical-history/${kind}/${enc(id)}`,
  },
  notes: {
    forCheckIn: (checkInId: number | string) => `/api/checkin/${enc(checkInId)}/soap-note`,
    byId: (id: string) => `/api/soap-notes/${enc(id)}`,
    draft: (id: string) => `/api/soap-notes/${enc(id)}/draft`,
    complete: (id: string) => `/api/soap-notes/${enc(id)}/complete`,
    amend: (id: string) => `/api/soap-notes/${enc(id)}/amend`,
    reassign: (id: string) => `/api/soap-notes/${enc(id)}/reassign`,
    revisions: (id: string) => `/api/soap-notes/${enc(id)}/revisions`,
    forPatient: (reg: string) => `/api/patients/registration/${enc(reg)}/soap-notes`,
  },
  records: {
    create: '/api/medical-records',
    byId: (id: string) => `/api/medical-records/${enc(id)}`,
    byPatient: (id: string) => `/api/medical-records/patient/${enc(id)}`,
    byDoctor: (id: string) => `/api/medical-records/doctor/${enc(id)}`,
  },
} as const;

export type HistoryKind = 'allergies' | 'conditions' | 'surgeries';

function enc(value: string | number): string {
  return encodeURIComponent(String(value));
}
