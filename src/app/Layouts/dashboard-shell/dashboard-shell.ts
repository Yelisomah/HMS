import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService, UserRole } from '../../Auth/auth.service';
import { HospitalDataService } from '../../core/api/hospital-data.service';
import { HmsStore } from '../../core/hms.store';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-dashboard-shell',
  imports: [RouterOutlet, Sidebar, Topbar],
  templateUrl: './dashboard-shell.html',
})
export class DashboardShell {
  private readonly auth = inject(AuthService);
  readonly role: UserRole = this.auth.getRole() ?? 'Admin';
  readonly userId = this.auth.getUserId() ?? '';
  readonly email = this.auth.getEmail() ?? '';
  sidebarOpen = false;

  constructor() {
    const store = inject(HmsStore);
    store.session = { email: this.email, name: this.auth.getName() };
    store.actor.set(store.me(this.role).name);
    inject(HospitalDataService).hydrate().subscribe({ error: (e) => console.error('Could not load hospital data', e) });
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }
}
