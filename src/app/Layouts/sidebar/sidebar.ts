import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { UserRole } from '../../Auth/auth.service';

interface NavigationItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-sidebar',
  templateUrl: './sidebar.html',
})
export class Sidebar {
  @Input({ required: true }) role: UserRole = 'Admin';
  @Input({ required: true }) userId = '';
  @Input() open = false;
  @Output() closeMenu = new EventEmitter<void>();

  readonly navigationItems: NavigationItem[] = [
    { label: 'Overview', path: '', icon: '⌂' },
    { label: 'Patients', path: 'patients', icon: '♙' },
    { label: 'Appointments', path: 'appointments', icon: '▦' },
    { label: 'Wards and beds', path: 'wards', icon: '▥' },
    { label: 'Medication round', path: 'medications', icon: '✚' },
    { label: 'Laboratory', path: 'laboratory', icon: '⚗' },
    { label: 'Pharmacy', path: 'pharmacy', icon: '℞' },
    { label: 'Billing', path: 'billing', icon: '$' },
    { label: 'Handover', path: 'handover', icon: '⇄' },
    { label: 'Insurance claims', path: 'insurance', icon: '✓' },
    { label: 'Staff', path: 'staff', icon: '♧' },
    { label: 'Departments', path: 'departments', icon: '⊞' },
    { label: 'Reports', path: 'reports', icon: '▤' },
    { label: 'Audit log', path: 'audit', icon: '☰' },
    { label: 'Access control', path: 'access', icon: '⚿' },
  ];

  get visibleItems(): NavigationItem[] {
    const allowed: Record<UserRole, string[]> = {
      Admin: ['', 'patients', 'appointments', 'wards', 'laboratory', 'pharmacy', 'billing', 'insurance', 'staff', 'departments', 'reports', 'audit', 'access'],
      Doctor: ['', 'patients', 'appointments', 'wards', 'laboratory'],
      Nurse: ['', 'patients', 'wards', 'medications', 'handover', 'laboratory'],
      Pharmacist: ['', 'patients', 'pharmacy'],
      Lab_Technician: ['', 'patients', 'laboratory'],
    };
    return this.navigationItems.filter((item) => allowed[this.role].includes(item.path));
  }

  routeFor(path: string): string {
    const dashboardPath = `/${encodeURIComponent(this.userId)}`;
    return path ? `${dashboardPath}/${path}` : dashboardPath;
  }
}
