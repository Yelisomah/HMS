import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './Auth/auth.guard';
import { Login } from './Auth/login/login';
import { ResetPassword } from './Auth/reset-password/reset-password';
import { DashboardShell } from './Layouts/dashboard-shell/dashboard-shell';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'reset-password', component: ResetPassword },
  {
    path: 'app',
    component: DashboardShell,
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./Dashboard/overview').then((m) => m.Overview) },
      { path: 'queue', loadComponent: () => import('./Dashboard/queue').then((m) => m.Queue) },
      { path: 'patients', loadComponent: () => import('./Dashboard/patients').then((m) => m.Patients) },
      { path: 'patients/new', loadComponent: () => import('./Dashboard/patient-register').then((m) => m.PatientRegister) },
      { path: 'patients/:ref', loadComponent: () => import('./Dashboard/patient-chart').then((m) => m.PatientChart) },
      { path: 'notes/:noteId', loadComponent: () => import('./Dashboard/soap-note').then((m) => m.SoapNote) },
      { path: 'records', loadComponent: () => import('./Dashboard/records').then((m) => m.RecordsPage) },
      { path: 'account', loadComponent: () => import('./Dashboard/account').then((m) => m.Account) },
      { path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./Dashboard/admin').then((m) => m.Admin) },
      { path: '**', redirectTo: '' },
    ],
  },
  { path: '**', redirectTo: 'app' },
];
