import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, isUserId, UserRole } from './auth.service';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const role = auth.getRole();
  const authenticatedUserId = auth.getUserId();
  const requestedUserId = route.paramMap.get('userId');

  if (!role || !authenticatedUserId) {
    return router.createUrlTree(['/']);
  }

  if (!isUserId(requestedUserId)) {
    return router.createUrlTree([auth.dashboardPathFor(authenticatedUserId)]);
  }

  if (requestedUserId !== authenticatedUserId) {
    return router.createUrlTree([auth.dashboardPathFor(authenticatedUserId)]);
  }

  return true;
};

export const rolesGuard = (roles: UserRole[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const role = auth.getRole();
  return role && roles.includes(role) ? true : router.createUrlTree([auth.dashboardPathFor(auth.getUserId() ?? '')]);
};
