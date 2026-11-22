import { Component, EventEmitter, inject, Output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../Auth/auth.service';

@Component({
  selector: 'app-topbar',
  templateUrl: './topbar.html',
})
export class Topbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly user = this.auth.user;
  @Output() menuToggle = new EventEmitter<void>();

  get label(): string {
    const u = this.user();
    return u?.name || u?.staffNumber || u?.username || '';
  }

  get initials(): string {
    return this.label.slice(0, 1).toUpperCase() || '?';
  }

  signOut(): void {
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/login'));
  }
}
