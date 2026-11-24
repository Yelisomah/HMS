import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActiveCheckIn, CheckInService } from '../core/api/checkin.service';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { pretty, tone } from '../shared/ui';

@Component({
  selector: 'app-queue',
  imports: [DatePipe, RouterLink, ReactiveFormsModule],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div><p class="eyebrow">Hospital workspace</p><h1>Check-in queue</h1><p class="dashboard-intro">Everyone currently checked in, in queue order.</p></div>
      <button class="primary-button inline-button" type="button" (click)="load()" [disabled]="loading()">Refresh</button>
    </div>

    <section class="panel-block">
      <h2>Check in a patient</h2>
      <form class="form-row" (submit)="$event.preventDefault(); checkIn()">
        <label>Registration number<input [formControl]="reg" placeholder="e.g. the number on the patient card" /></label>
        <button class="mini" type="submit" [disabled]="busy() || reg.invalid">{{ busy() ? 'Checking in…' : 'Check in' }}</button>
      </form>
      @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
      @if (actionError()) { <p class="form-alert" role="alert">{{ actionError() }}</p> }
    </section>

    @if (loading()) {
      <p class="loading-message" role="status">Loading the queue…</p>
    } @else if (error()) {
      <div class="form-alert dashboard-alert" role="alert">{{ error() }}</div>
    } @else if (!items().length) {
      <div class="panel-card empty-state"><p>No active check-ins.</p></div>
    } @else {
      @if (unresolved().length) {
        <p class="notice warn" role="status">
          The API did not provide check-in IDs for {{ unresolved().length }} visit{{ unresolved().length === 1 ? '' : 's' }}.
          Those visits cannot open vitals, notes, or checkout until the patient response includes its check-ins.
        </p>
      }
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Patient</th><th>Registration no.</th><th>Age</th><th>Checked in</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (c of sorted(); track c.registrationNumber + c.checkInTime) {
              <tr>
                <td>{{ c.queuePosition ?? '–' }}</td>
                <td>{{ c.patientName }} @if (c.checkInIdError) { <small class="muted">{{ c.checkInIdError }}</small> }</td>
                <td>{{ c.registrationNumber }}</td>
                <td>{{ c.age ?? '–' }}</td>
                <td>{{ c.checkInTime | date: 'HH:mm' }}</td>
                <td><span class="pill pill-{{ tone(c.status) }}">{{ pretty(c.status) }}</span></td>
                <td><a class="cell-link" [routerLink]="['/app/patients', c.registrationNumber]" [queryParams]="{ by: 'reg', checkIn: c.checkInId }">Open chart →</a></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </section>`,
})
export class Queue {
  private readonly checkins = inject(CheckInService);
  private readonly api = inject(HmsApi);
  readonly items = signal<ActiveCheckIn[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly actionError = signal('');
  readonly reg = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly tone = tone;
  readonly pretty = pretty;
  readonly sorted = computed(() => [...this.items()].sort((a, b) => (a.queuePosition ?? 999) - (b.queuePosition ?? 999)));
  readonly unresolved = computed(() => this.items().filter((item) => item.checkInId === null));

  constructor() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.checkins.active().subscribe({
      next: (l) => { this.items.set(l); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  checkIn(): void {
    this.busy.set(true);
    this.notice.set('');
    this.actionError.set('');
    this.api.checkIn(this.reg.value.trim()).subscribe({
      next: (r) => {
        this.notice.set(`${r.patientName} is checked in at position ${r.queuePosition ?? '–'}.`);
        this.reg.reset('');
        this.busy.set(false);
        this.load();
      },
      error: (e: unknown) => { this.actionError.set(errorMessage(e, 'Could not check this patient in.')); this.busy.set(false); },
    });
  }
}
