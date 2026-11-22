import { Component, computed, EventEmitter, inject, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../Auth/auth.service';

interface NavigationItem {
  label: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
  hideForNurse?: boolean;
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

  private readonly items: NavigationItem[] = [
    { label: 'Overview', path: '', icon: '⌂' },
    { label: 'Check-in queue', path: 'queue', icon: '▦' },
    { label: 'Patients', path: 'patients', icon: '♙' },
    { label: 'Register patient', path: 'patients/new', icon: '＋' },
    { label: 'Medical records', path: 'records', icon: '▤', hideForNurse: true },
    { label: 'User management', path: 'admin', icon: '⚿', adminOnly: true },
    { label: 'My account', path: 'account', icon: '☺' },
  ];

  readonly visibleItems = computed(() =>
    this.items.filter((i) => (!i.adminOnly || this.auth.isAdmin()) && (!i.hideForNurse || !this.auth.isNurse())),
  );

  routeFor(path: string): string {
    return path ? `/app/${path}` : '/app';
  }
}
