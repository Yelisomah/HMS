import { Routes } from '@angular/router';
import { DashboardSection } from './Dashboard/dashboard-section';
import { DashboardShell } from './Layouts/dashboard-shell/dashboard-shell';
import { Login } from './Auth/login/login';
import { ResetPassword } from './Auth/reset-password/reset-password';
import { authGuard } from './Auth/auth.guard';
import { DashboardOverview } from './Dashboard/dashboard-overview';

export const routes: Routes = [
    {
        path: '',
        component: Login,
    },
    {
        path: 'reset-password',
        component: ResetPassword,
    },
    {
        path: ':userId',
        component: DashboardShell,
        canActivate: [authGuard],
        children: [
            { path: '', component: DashboardOverview },
            { path: ':section', component: DashboardSection },
            { path: '**', redirectTo: '' },
        ],
    },
    {
        path: '**',
        redirectTo: '',
    }
];
