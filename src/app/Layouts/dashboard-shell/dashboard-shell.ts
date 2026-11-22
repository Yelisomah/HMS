import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-dashboard-shell',
  imports: [RouterOutlet, Sidebar, Topbar],
  template: `
    <div class="app-shell">
      <app-sidebar [open]="sidebarOpen()" (closeMenu)="sidebarOpen.set(false)" />
      <div class="shell-main">
        <app-topbar (menuToggle)="sidebarOpen.set(!sidebarOpen())" />
        <main class="shell-content"><router-outlet /></main>
      </div>
    </div>
  `,
})
export class DashboardShell {
  readonly sidebarOpen = signal(false);
}
