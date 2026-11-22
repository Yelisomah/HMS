import { InjectionToken } from '@angular/core';

export const API_ROOT_URL = 'https://healthmanagementsystem-a1l5.onrender.com/swagger-ui/index.html';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => API_ROOT_URL,
});

export const API_ENDPOINTS = {
  auth: {
    login: '/login',
    logout: '/logout',
    currentUser: '/user',
  },
  dashboard: '/dashboard/summary',
  patients: '/patients',
  appointments: '/appointments',
  staff: '/staff',
  departments: '/departments',
  pharmacy: '/pharmacy',
  billing: '/billing',
  reports: '/reports',
} as const;

/** Set to false once the hospital API is live. While true, the app runs on built-in demo data. */
export const USE_MOCK_DATA = false;

/** One REST collection per store resource. Change the paths here to match your API. */
export const RESOURCES = {
  patients: '/patients', staff: '/staff', depts: '/departments', beds: '/beds', admissions: '/admissions',
  vitals: '/vitals', orders: '/medication-orders', doses: '/medication-administrations', notes: '/nursing-notes',
  plans: '/care-plans', appts: '/appointments', labs: '/lab-orders', drugs: '/drugs', invoices: '/invoices',
  claims: '/claims', encounters: '/encounters', discharges: '/discharges', audit: '/audit-logs',
} as const;
export type ResourceKey = keyof typeof RESOURCES;
