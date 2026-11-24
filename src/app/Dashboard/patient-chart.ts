import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../Auth/auth.service';
import { ActiveCheckIn, CheckInService } from '../core/api/checkin.service';
import { PatientFull } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { fullName, pretty, tone } from '../shared/ui';
import { HistoryPanel } from './history-panel';
import { NotesPanel } from './notes-panel';
import { RecordsPanel } from './records';
import { VitalsPanel } from './vitals-panel';

const TABS = ['Summary', 'Vitals', 'History', 'Notes', 'Records'] as const;
type Tab = (typeof TABS)[number];

@Component({
  selector: 'app-patient-chart',
  imports: [DatePipe, RouterLink, VitalsPanel, HistoryPanel, NotesPanel, RecordsPanel],
  template: `
  <section class="dashboard-view">
    <a class="back-link" routerLink="/app/patients">← All patients</a>

    @if (loading()) {
      <p class="loading-message" role="status">Loading patient…</p>
    } @else if (error()) {
      <div class="form-alert dashboard-alert" role="alert">{{ error() }}</div>
    } @else if (patient(); as p) {
      <header class="banner">
        <span class="user-avatar big" aria-hidden="true">{{ name().slice(0, 1) }}</span>
        <div class="banner-main">
          <h1>{{ name() }}</h1>
          <p>{{ p.age ?? '—' }} y · {{ p.gender || '—' }} · Reg. {{ p.registrationNumber || '—' }}@if (p.nhisNumber) { · NHIS {{ p.nhisNumber }} }</p>
          <p>{{ p.phoneNumber || 'No phone on file' }}@if (p.admitted) { · <b>Admitted</b> }@if (p.deceased) { · <b>Deceased</b> }</p>
        </div>
        <div class="banner-alerts">
          @if (checkIn(); as c) { <span class="pill pill-{{ tone(c.status) }}">{{ pretty(c.status) }} · queue #{{ c.queuePosition ?? '–' }}</span> }
          @else { <span class="pill pill-green">Not checked in</span> }
        </div>
      </header>

      <nav class="tabs" role="tablist">
        @for (t of tabs(); track t) { <button role="tab" type="button" [class.on]="tab() === t" [attr.aria-selected]="tab() === t" (click)="tab.set(t)">{{ t }}</button> }
      </nav>
      @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
      @if (actionError()) { <p class="form-alert" role="alert">{{ actionError() }}</p> }

      @switch (tab()) {
        @case ('Summary') {
          <div class="two-col">
            <section class="panel-block"><h2>Details</h2>
              <dl class="kv">
                <dt>Date of birth</dt><dd>{{ p.dateOfBirth || '—' }}</dd>
                <dt>Registered</dt><dd>{{ p.registrationDate || '—' }}</dd>
                <dt>Address</dt><dd>{{ address() || '—' }}</dd>
                <dt>Email</dt><dd>{{ p.email || '—' }}</dd>
                <dt>Marital status</dt><dd>{{ p.maritalStatus || '—' }}</dd>
                <dt>Occupation</dt><dd>{{ p.occupation || '—' }}</dd>
                <dt>Next of kin</dt><dd>{{ p.nextOfKinName || '—' }}@if (p.nextOfKinRelationship) { ({{ p.nextOfKinRelationship }}) }@if (p.nextOfKinPhoneNumber) { · {{ p.nextOfKinPhoneNumber }} }</dd>
              </dl>
            </section>
            <section class="panel-block"><h2>Visit</h2>
              @if (checkIn(); as c) {
                <dl class="kv">
                  <dt>Status</dt><dd><span class="pill pill-{{ tone(c.status) }}">{{ pretty(c.status) }}</span></dd>
                  <dt>Checked in</dt><dd>{{ c.checkInTime | date: 'd MMM, HH:mm' }}</dd>
                  <dt>Queue position</dt><dd>{{ c.queuePosition ?? '—' }}</dd>
                  <dt>Check-in ID</dt><dd>@if (checkInId(); as id) { {{ id }} } @else { <span class="muted">unavailable</span> }</dd>
                </dl>
                @if (!checkInId()) {
                  <p class="form-alert" role="alert">{{ checkIn()?.checkInIdError || 'The API did not return this visit’s check-in ID. Refresh the queue or contact support.' }}</p>
                }
                <div class="actions" style="margin-top:14px">
                  @if (canUseClinicalTabs()) {
                    <button class="mini" type="button" (click)="tab.set('Vitals')">Record vitals</button>
                    <button class="mini" type="button" (click)="tab.set('Notes')">SOAP note</button>
                  }
                  <button class="mini ghost" type="button" [disabled]="!checkInId() || busy()" (click)="checkOut()">Check out</button>
                </div>
              } @else {
                <p class="muted">This patient is not currently checked in.</p>
                <button class="mini" type="button" [disabled]="busy() || !p.registrationNumber" (click)="doCheckIn()">{{ busy() ? 'Checking in…' : 'Check in now' }}</button>
              }
            </section>
          </div>
        }
        @case ('Vitals') { @if (canUseClinicalTabs()) { <app-vitals-panel [reg]="p.registrationNumber ?? ''" [checkInId]="checkInId()" /> } }
        @case ('History') { @if (canUseClinicalTabs()) { <app-history-panel [reg]="p.registrationNumber ?? ''" /> } }
        @case ('Notes') { @if (canUseClinicalTabs()) { <app-notes-panel [reg]="p.registrationNumber ?? ''" [checkInId]="checkInId()" /> } }
        @case ('Records') { @if (canViewRecords()) { <app-records-panel [patientId]="p.id" /> } }
      }
    }
  </section>`,
})
export class PatientChart {
  private readonly api = inject(HmsApi);
  private readonly checkins = inject(CheckInService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly tabs = computed(() => {
    if (this.auth.hasAnyRole('OPD')) return ['Summary'] as const;
    return this.canViewRecords() ? TABS : TABS.filter((tab) => tab !== 'Records');
  });
  readonly canUseClinicalTabs = computed(() => this.auth.hasAnyRole('ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE'));
  readonly canViewRecords = computed(() => this.auth.hasAnyRole('ADMIN', 'DOCTOR', 'PHYSICIAN'));
  readonly tab = signal<Tab>('Summary');
  readonly patient = signal<PatientFull | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly actionError = signal('');
  readonly busy = signal(false);
  readonly checkIn = signal<ActiveCheckIn | null>(null);
  readonly tone = tone;
  readonly pretty = pretty;
  readonly name = computed(() => fullName(this.patient()) || 'Patient');
  readonly address = computed(() => [this.patient()?.address, this.patient()?.town, this.patient()?.city].filter(Boolean).join(', '));
  readonly checkInId = computed(() => this.checkIn()?.checkInId ?? null);

  constructor() {
    const ref = this.route.snapshot.paramMap.get('ref') ?? '';
    const q = this.route.snapshot.queryParamMap;
    const byReg = q.get('by') === 'reg';
    const fromQuery = Number(q.get('checkIn')) || null;

    // Look up by ID or registration number. If the ID lookup finds nothing, try the other.
    const first$ = byReg ? this.api.patientByReg(ref) : this.api.patientById(ref);
    const second = byReg ? this.api.patientById(ref) : this.api.patientByReg(ref);
    first$
      .pipe(catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 404 ? second : throwError(() => error),
      ))
      .pipe(
        switchMap((res) => {
          this.patient.set(res?.data ?? null);
          return this.checkins.active();
        }),
      )
      .subscribe({
        next: (active) => {
          const reg = this.patient()?.registrationNumber;
          const match = active.find((a) => a.registrationNumber === reg) ?? null;
          this.checkIn.set(match ? { ...match, checkInId: match.checkInId ?? fromQuery } : null);
          if (!this.patient()) this.error.set('That patient was not found.');
          this.loading.set(false);
        },
        error: (e: unknown) => { this.error.set(errorMessage(e, 'That patient was not found.')); this.loading.set(false); },
      });
  }

  doCheckIn(): void {
    const reg = this.patient()?.registrationNumber;
    if (!reg) return;
    this.run(this.api.checkIn(reg), 'Patient checked in.', () => this.refreshCheckIn());
  }

  checkOut(): void {
    const id = this.checkInId();
    if (!id || !window.confirm('Check this patient out?')) return;
    this.run(this.api.checkOut(id), 'Patient checked out.', () => this.checkIn.set(null));
  }

  private refreshCheckIn(): void {
    this.checkins.active().subscribe((list) => {
      const reg = this.patient()?.registrationNumber;
      this.checkIn.set(list.find((a) => a.registrationNumber === reg) ?? null);
    });
  }

  private run(call: Observable<unknown>, msg: string, after: () => void): void {
    this.busy.set(true);
    this.notice.set('');
    this.actionError.set('');
    call.subscribe({
      next: () => { this.busy.set(false); after(); this.notice.set(msg); },
      error: (e: unknown) => { this.actionError.set(errorMessage(e)); this.busy.set(false); },
    });
  }
}
