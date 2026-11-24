import { Routes } from '@angular/router';
import {
  authGuard, CLINICAL_ROLES, guestGuard, PATIENT_CHART_ROLES, PATIENT_FLOW_ROLES, RECORD_ROLES, roleGuard, SUPPORTED_ROLES,
} from './Auth/auth.guard';
import { Login } from './Auth/login/login';
import { ResetPassword } from './Auth/reset-password/reset-password';
import { AccessDenied } from './Layouts/access-denied';
import { DashboardShell } from './Layouts/dashboard-shell/dashboard-shell';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'reset-password', component: ResetPassword },
  { path: 'access-denied', component: AccessDenied },
  {
    path: 'app',
    component: DashboardShell,
    canActivate: [authGuard, roleGuard],
    data: { roles: SUPPORTED_ROLES },
    children: [
      { path: '', canActivate: [roleGuard], data: { roles: SUPPORTED_ROLES }, loadComponent: () => import('./Dashboard/overview').then((m) => m.Overview) },
      { path: 'queue', canActivate: [roleGuard], data: { roles: PATIENT_FLOW_ROLES }, loadComponent: () => import('./Dashboard/queue').then((m) => m.Queue) },
      { path: 'admissions', canActivate: [roleGuard], data: { roles: CLINICAL_ROLES }, loadComponent: () => import('./Dashboard/admissions').then((m) => m.Admissions) },
      { path: 'patients', canActivate: [roleGuard], data: { roles: PATIENT_FLOW_ROLES }, loadComponent: () => import('./Dashboard/patients').then((m) => m.Patients) },
      { path: 'patients/new', canActivate: [roleGuard], data: { roles: PATIENT_FLOW_ROLES }, loadComponent: () => import('./Dashboard/patient-register').then((m) => m.PatientRegister) },
      { path: 'patients/:ref', canActivate: [roleGuard], data: { roles: PATIENT_CHART_ROLES }, loadComponent: () => import('./Dashboard/patient-chart').then((m) => m.PatientChart) },
      { path: 'notes/:noteId', canActivate: [roleGuard], data: { roles: CLINICAL_ROLES }, loadComponent: () => import('./Dashboard/soap-note').then((m) => m.SoapNote) },
      { path: 'records', canActivate: [roleGuard], data: { roles: RECORD_ROLES }, loadComponent: () => import('./Dashboard/records').then((m) => m.RecordsPage) },
      { path: 'account', canActivate: [roleGuard], data: { roles: SUPPORTED_ROLES }, loadComponent: () => import('./Dashboard/account').then((m) => m.Account) },
      { path: 'admin', canActivate: [roleGuard], data: { roles: ['ADMIN'] }, loadComponent: () => import('./Dashboard/admin').then((m) => m.Admin) },
      { path: '**', redirectTo: '' },
    ],
  },
  { path: '**', redirectTo: 'app' },
];
