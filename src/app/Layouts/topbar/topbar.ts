import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, UserRole } from '../../Auth/auth.service';

@Component({
  imports: [],
  selector: 'app-topbar',
  templateUrl: './topbar.html',
})
export class Topbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  @Input({ required: true }) role: UserRole = 'Admin';
  @Input() email = '';
  @Output() menuToggle = new EventEmitter<void>();

  get initials(): string {
    return this.email.slice(0, 1).toUpperCase() || this.role.slice(0, 1);
  }

  signOut(): void {
    this.auth.signOutFromApi().subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: () =>
        void this.router.navigateByUrl('/', {
          state: { authNotice: 'Signed out locally, but the server session could not be closed.' },
        }),
    });
  }
}
