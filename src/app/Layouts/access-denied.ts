import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { SUPPORTED_ROLES } from '../Auth/auth.guard';

@Component({
  selector: 'app-access-denied',
  imports: [RouterLink],
  template: `
    <main class="auth-page">
      <section class="auth-card">
        <p class="eyebrow">Access restricted</p>
        <h1>This workspace is not configured for your role</h1>
        <p class="muted">
          Your role ({{ role() || 'unrecognized' }}) has no access to this page.
          Contact an administrator if you believe this is incorrect.
        </p>
        @if (knownRole()) { <a class="primary-button inline-button" routerLink="/app/account">Open my account</a> }
        @else { <button class="primary-button inline-button" type="button" (click)="signOut()">Sign out</button> }
      </section>
    </main>
  `,
})
export class AccessDenied {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly role = () => this.auth.user()?.role ?? '';
  readonly knownRole = () => this.auth.hasAnyRole(...SUPPORTED_ROLES);

  signOut(): void {
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/login'));
  }
}
