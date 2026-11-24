import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { ActiveCheckIn, CheckInService } from '../core/api/checkin.service';
import { errorMessage } from '../core/api/errors';
import { pretty, tone } from '../shared/ui';

@Component({
  selector: 'app-overview',
  imports: [DatePipe, RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Good day{{ name() ? ', ' + name() : '' }}</h1>
        <p class="dashboard-intro">{{ intro() }}</p>
      </div>
      <span class="today-label">{{ today | date: 'EEEE, MMMM d' }}</span>
    </div>

    @if (canViewPatientFlow()) {
    @if (loading()) {
      <p class="loading-message" role="status">Loading the queue…</p>
    } @else if (error()) {
      <div class="form-alert dashboard-alert" role="alert">{{ error() }} <button class="text-button" (click)="load()">Retry</button></div>
    } @else {
      <div class="stat-grid">
        <a class="stat-card" routerLink="/app/queue"><span class="stat-icon stat-orange" aria-hidden="true">▦</span><span class="stat-label">Waiting</span><strong>{{ waiting() }}</strong><span class="stat-link">Open queue →</span></a>
        <a class="stat-card" routerLink="/app/queue"><span class="stat-icon stat-blue" aria-hidden="true">✚</span><span class="stat-label">In progress</span><strong>{{ inProgress() }}</strong><span class="stat-link">Open queue →</span></a>
        <a class="stat-card" routerLink="/app/queue"><span class="stat-icon stat-teal" aria-hidden="true">♙</span><span class="stat-label">Active check-ins</span><strong>{{ items().length }}</strong><span class="stat-link">View all →</span></a>
        <a class="stat-card" routerLink="/app/patients/new"><span class="stat-icon stat-purple" aria-hidden="true">＋</span><span class="stat-label">New patient</span><strong>Register</strong><span class="stat-link">Start registration →</span></a>
      </div>

      <div class="two-col">
        <section class="panel-block">
          <h2>Next in queue</h2>
          @for (c of next(); track c.registrationNumber) {
            <a class="list-row" [routerLink]="['/app/patients', c.registrationNumber]" [queryParams]="{ by: 'reg' }">
              <b>#{{ c.queuePosition ?? '–' }}</b>
              <span>{{ c.patientName }} <small>{{ c.registrationNumber }}</small></span>
              <span class="pill pill-{{ tone(c.status) }}">{{ pretty(c.status) }}</span>
            </a>
          } @empty { <p class="muted">Nobody is waiting right now.</p> }
        </section>
        <section class="panel-block">
          <h2>Quick actions</h2>
          @if (auth.isAdmin()) { <a class="list-row" routerLink="/app/admin"><span class="dot dot-amber"></span><span>Manage staff accounts</span></a> }
          <a class="list-row" routerLink="/app/patients"><span class="dot dot-amber"></span><span>Find a patient</span></a>
          <a class="list-row" routerLink="/app/patients/new"><span class="dot dot-amber"></span><span>Register a new patient</span></a>
          <a class="list-row" routerLink="/app/queue"><span class="dot dot-amber"></span><span>Check in a patient from the queue page</span></a>
        </section>
      </div>
    }
    } @else {
      <section class="panel-block">
        <h2>{{ role() }} workspace</h2>
        <p class="muted">
          Patient, pharmacy, and laboratory workflows are not connected for this role yet.
          You can update your account settings while those services are being configured.
        </p>
        <a class="mini" routerLink="/app/account">Open my account</a>
      </section>
    }
  </section>`,
})
export class Overview {
  private readonly checkins = inject(CheckInService);
  private readonly auth = inject(AuthService);
  readonly name = computed(() => this.auth.user()?.name ?? '');
  readonly role = computed(() => this.auth.user()?.role ?? 'Staff');
  readonly intro = computed(() => {
    if (this.auth.isAdmin()) return 'Hospital-wide patient flow and staff oversight.';
    if (this.auth.isDoctor()) return 'Your clinical workspace: patient flow, charts, notes, and records.';
    if (this.auth.isNurse()) return 'Your care workspace: patient flow, charts, notes, and observations.';
    if (this.auth.hasAnyRole('OPD')) return 'Outpatient registration and patient flow.';
    return 'Your role-specific workflows are not connected yet.';
  });
  readonly canViewPatientFlow = computed(() => this.auth.hasAnyRole('ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE', 'OPD'));
  readonly today = new Date();
  readonly items = signal<ActiveCheckIn[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tone = tone;
  readonly pretty = pretty;

  readonly waiting = computed(() => this.items().filter((c) => c.status === 'WAITING').length);
  readonly inProgress = computed(() => this.items().filter((c) => c.status === 'IN_PROGRESS').length);
  readonly next = computed(() =>
    [...this.items()].filter((c) => c.status !== 'DISCHARGED').sort((a, b) => (a.queuePosition ?? 999) - (b.queuePosition ?? 999)).slice(0, 6),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.checkins.active().subscribe({
      next: (list) => { this.items.set(list); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
}
