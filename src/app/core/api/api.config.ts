import { InjectionToken } from '@angular/core';

/**
 * Base URL for API calls.
 *
 * The current deployment calls the HMS API directly. The backend must allow this app's origin
 * through CORS. Override API_BASE_URL in an environment-specific provider when deploying elsewhere.
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
    // Placeholder: the current backend OpenAPI document does not expose a user-list route.
    users: '/api/admin/users',
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

  // ---------------------------------------------------------------------------
  // PENDING: proposed routes the backend does not expose yet. While MOCKED_MODULES
  // has the module set to true, mock/mock-backend.interceptor.ts answers them in memory.
  // Once the backend ships a route, fix the path here and set the module flag to false.
  // ---------------------------------------------------------------------------
  wards: {
    list: '/api/wards',
    create: '/api/wards',
    addBed: (id: string) => `/api/wards/${enc(id)}/beds`,
    beds: '/api/beds',
    bedStatus: (id: string) => `/api/beds/${enc(id)}/status`,
  },
  admissions: {
    list: '/api/admissions',
    create: '/api/admissions',
    byId: (id: string) => `/api/admissions/${enc(id)}`,
    transfer: (id: string) => `/api/admissions/${enc(id)}/transfer`,
    discharge: (id: string) => `/api/admissions/${enc(id)}/discharge`,
    byPatient: (reg: string) => `/api/patients/registration/${enc(reg)}/admissions`,
  },
  staff: {
    list: '/api/staff',
    byId: (id: string) => `/api/staff/${enc(id)}`,
  },
  reports: {
    byType: (type: string) => `/api/reports/${enc(type)}`,
  },
  billing: {
    invoices: '/api/billing/invoices',
    invoice: (id: string) => `/api/billing/invoices/${enc(id)}`,
    payments: (id: string) => `/api/billing/invoices/${enc(id)}/payments`,
    void: (id: string) => `/api/billing/invoices/${enc(id)}/void`,
    pendingCharges: '/api/billing/pending-charges',
  },
  lab: {
    tests: '/api/lab/tests',
    orders: '/api/lab/orders',
    order: (id: string) => `/api/lab/orders/${enc(id)}`,
    collect: (id: string) => `/api/lab/orders/${enc(id)}/collect`,
    results: (id: string) => `/api/lab/orders/${enc(id)}/results`,
    cancel: (id: string) => `/api/lab/orders/${enc(id)}/cancel`,
  },
  pharmacy: {
    prescriptions: '/api/pharmacy/prescriptions',
    prescription: (id: string) => `/api/pharmacy/prescriptions/${enc(id)}`,
    dispense: (id: string) => `/api/pharmacy/prescriptions/${enc(id)}/dispense`,
    cancelPrescription: (id: string) => `/api/pharmacy/prescriptions/${enc(id)}/cancel`,
    drugs: '/api/pharmacy/drugs',
    drugStock: (id: string) => `/api/pharmacy/drugs/${enc(id)}/stock`,
  },
  appointments: {
    list: '/api/appointments',
    create: '/api/appointments',
    byId: (id: string) => `/api/appointments/${enc(id)}`,
    availability: '/api/appointments/availability',
    reschedule: (id: string) => `/api/appointments/${enc(id)}/reschedule`,
    cancel: (id: string) => `/api/appointments/${enc(id)}/cancel`,
    noShow: (id: string) => `/api/appointments/${enc(id)}/no-show`,
    arrived: (id: string) => `/api/appointments/${enc(id)}/arrived`,
  },
} as const;

/** true = answered by the in-memory mock; false = real backend. Flip per module when the API is live. */
export const MOCKED_MODULES = {
  admissions: true,
  wards: true,
  staff: true,
  appointments: true,
  pharmacy: true,
  lab: true,
  billing: true,
  reports: true,
} as const;

export type HistoryKind = 'allergies' | 'conditions' | 'surgeries';

function enc(value: string | number): string {
  return encodeURIComponent(String(value));
}
