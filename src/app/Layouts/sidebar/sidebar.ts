import { Component, computed, EventEmitter, inject, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../Auth/auth.service';

interface NavigationItem {
  label: string;
  path: string;
  icon: string;
  roles: readonly string[];
}

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-sidebar',
  templateUrl: './sidebar.html',
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  @Input() open = false;
  @Output() closeMenu = new EventEmitter<void>();

  private readonly allRoles = ['ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE', 'PHARMACIST', 'LAB_TECHNICIAN', 'OPD'] as const;
  private readonly patientFlowRoles = ['ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE', 'OPD'] as const;
  private readonly recordRoles = ['ADMIN', 'DOCTOR', 'PHYSICIAN'] as const;

  private readonly items: NavigationItem[] = [
    { label: 'Overview', path: '', icon: '⌂', roles: this.allRoles },
    { label: 'Check-in queue', path: 'queue', icon: '▦', roles: this.patientFlowRoles },
    { label: 'Appointments', path: 'appointments', icon: '◷', roles: this.patientFlowRoles },
    { label: 'Admissions', path: 'admissions', icon: '▥', roles: ['ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE'] },
    { label: 'Wards & beds', path: 'wards', icon: '▣', roles: ['ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE'] },
    { label: 'Patients', path: 'patients', icon: '♙', roles: this.patientFlowRoles },
    { label: 'Register patient', path: 'patients/new', icon: '＋', roles: this.patientFlowRoles },
    { label: 'Billing', path: 'billing', icon: '¤', roles: ['ADMIN', 'OPD'] },
    { label: 'Laboratory', path: 'laboratory', icon: '⚗', roles: ['ADMIN', 'LAB_TECHNICIAN', 'DOCTOR', 'PHYSICIAN', 'NURSE'] },
    { label: 'Pharmacy', path: 'pharmacy', icon: '✚', roles: ['ADMIN', 'PHARMACIST', 'DOCTOR', 'PHYSICIAN'] },
    { label: 'Medical records', path: 'records', icon: '▤', roles: this.recordRoles },
    { label: 'Reports', path: 'reports', icon: '▨', roles: ['ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE', 'PHARMACIST', 'LAB_TECHNICIAN'] },
    { label: 'Staff directory', path: 'staff', icon: '☷', roles: this.allRoles },
    { label: 'User management', path: 'admin', icon: '⚿', roles: ['ADMIN'] },
    { label: 'My account', path: 'account', icon: '☺', roles: this.allRoles },
  ];

  readonly visibleItems = computed(() =>
    this.items.filter((item) => this.auth.hasAnyRole(...item.roles)),
  );

  routeFor(path: string): string {
    return path ? `/app/${path}` : '/app';
  }
}
