import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const SUPPORTED_ROLES = [
  'ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE', 'PHARMACIST', 'LAB_TECHNICIAN', 'OPD',
] as const;
export const CLINICAL_ROLES = ['ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE'] as const;
export const PATIENT_FLOW_ROLES = [...CLINICAL_ROLES, 'OPD'] as const;
export const PATIENT_CHART_ROLES = [...CLINICAL_ROLES, 'OPD'] as const;
export const RECORD_ROLES = ['ADMIN', 'DOCTOR', 'PHYSICIAN'] as const;

/** Requires a signed-in user. The backend still authorises every request. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isSignedIn() ? true : inject(Router).createUrlTree(['/login']);
};

/** Allows only roles explicitly assigned to the route. */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const roles: unknown = route.data['roles'];
  if (!Array.isArray(roles) || !roles.every((role) => typeof role === 'string')) {
    return router.createUrlTree(['/access-denied']);
  }
  return auth.hasAnyRole(...roles) ? true : router.createUrlTree(['/access-denied']);
};

/** Keeps the sign-in page out of reach once signed in. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isSignedIn() ? inject(Router).createUrlTree(['/app']) : true;
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin() ? true : inject(Router).createUrlTree(['/app']);
};
