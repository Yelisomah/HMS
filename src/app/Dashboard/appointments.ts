import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MOCKED_MODULES } from '../core/api/api.config';
import { PatientFull } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { Appointment, AppointmentStatus, StaffMember } from '../core/api/hospital.models';
import { PatientPicker } from '../shared/patient-picker';
import { pretty } from '../shared/ui';

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const STATUS_PILL: Record<AppointmentStatus, string> = {
  SCHEDULED: 'pill-blue', CHECKED_IN: 'pill-green', COMPLETED: 'pill-green', CANCELLED: 'pill-red', NO_SHOW: 'pill-amber',
};

@Component({
  selector: 'app-appointments',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, PatientPicker],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Appointments</h1>
        <p class="dashboard-intro">Book, move and cancel appointments, and check patients in when they arrive.</p>
      </div>
      <button class="mini ghost" type="button" (click)="reload()" [disabled]="loading()">Refresh</button>
    </div>

    @if (mocked) {
      <p class="notice warn" role="status">
        Preview mode: the appointment and staff endpoints are not live yet, so this page uses temporary in-memory
        data that resets on reload. Patient search and check-in are real.
      </p>
    }

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-label">Appointments this day</span><strong>{{ appointments().length }}</strong></div>
      <div class="stat-card"><span class="stat-label">Awaiting arrival</span><strong>{{ count('SCHEDULED') }}</strong></div>
      <div class="stat-card"><span class="stat-label">Checked in</span><strong>{{ count('CHECKED_IN') }}</strong></div>
      <div class="stat-card"><span class="stat-label">Cancelled / no-show</span><strong>{{ count('CANCELLED') + count('NO_SHOW') }}</strong></div>
    </div>

    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }

    <section class="panel-block">
      <div class="form-row">
        <button class="mini ghost" type="button" (click)="shift(-1)" aria-label="Previous day">‹ Previous</button>
        <label>Date<input type="date" [formControl]="dateControl" /></label>
        <button class="mini ghost" type="button" (click)="shift(1)" aria-label="Next day">Next ›</button>
        <button class="mini" type="button" (click)="today()">Today</button>
        <label>Doctor
          <select [formControl]="doctorFilter">
            <option value="">All doctors</option>
            @for (d of doctors(); track d.id) { <option [value]="d.id">{{ staffName(d) }}</option> }
          </select>
        </label>
      </div>
      <h2>{{ dateControl.value | date: 'EEEE, d MMMM y' }}</h2>
      @if (loading()) { <p class="loading-message" role="status">Loading appointments…</p> }
      @else if (!appointments().length) { <p class="muted">No appointments for this day.</p> }
      @for (a of appointments(); track a.id) {
        <article class="plan">
          <b>
            {{ a.scheduledAt | date: 'HH:mm' }} · {{ a.durationMinutes }} min ·
            <a class="cell-link" [routerLink]="['/app/patients', a.registrationNumber]">{{ a.patientName }}</a>
            <span class="pill {{ pill(a.status) }}">{{ label(a.status) }}</span>
          </b>
          <span>Reg. {{ a.registrationNumber }} · Dr. {{ a.doctorName || a.doctorId }}</span>
          <span>Reason: {{ a.reason }}</span>
          @if (a.cancelReason) { <span>Cancelled: {{ a.cancelReason }}</span> }

          @if (panel()?.id === a.id && panel()?.kind === 'reschedule') {
            <form class="stack" [formGroup]="rescheduleForm" (ngSubmit)="reschedule(a)">
              <label>New date *<input type="date" formControlName="date" [min]="minDate" /></label>
              <label>Time slot *
                <select formControlName="time">
                  <option value="">{{ rescheduleSlots().length ? 'Choose a time…' : 'No free slots on this date' }}</option>
                  @for (s of rescheduleSlots(); track s) { <option [value]="s">{{ s }}</option> }
                </select>
              </label>
              @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
              <div class="actions">
                <button class="mini" type="submit" [disabled]="rescheduleForm.invalid || busy()">Confirm new time</button>
                <button class="mini ghost" type="button" (click)="closePanel()">Cancel</button>
              </div>
            </form>
          } @else if (panel()?.id === a.id && panel()?.kind === 'cancel') {
            <form class="stack" [formGroup]="cancelForm" (ngSubmit)="cancel(a)">
              <label>Reason for cancelling *<input formControlName="reason" maxlength="300" /></label>
              @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
              <div class="actions">
                <button class="mini" type="submit" [disabled]="cancelForm.invalid || busy()">Cancel appointment</button>
                <button class="mini ghost" type="button" (click)="closePanel()">Keep it</button>
              </div>
            </form>
          } @else if (a.status === 'SCHEDULED') {
            <div class="actions">
              @if (isToday()) { <button class="mini" type="button" [disabled]="busy()" (click)="arrive(a)">Check in</button> }
              <button class="mini ghost" type="button" (click)="openPanel(a, 'reschedule')">Reschedule</button>
              <button class="mini ghost" type="button" (click)="openPanel(a, 'cancel')">Cancel</button>
              @if (isToday()) { <button class="mini ghost" type="button" [disabled]="busy()" (click)="noShow(a)">No-show</button> }
            </div>
          }
        </article>
      }
    </section>

    <section class="panel-block">
      <h2>Book an appointment</h2>
      <app-patient-picker [(patient)]="patient" />
      <form class="grid-form compact" [formGroup]="bookForm" (ngSubmit)="book()">
        <label>Doctor *
          @if (doctors().length) {
            <select formControlName="doctorId">
              <option value="">Choose a doctor…</option>
              @for (d of doctors(); track d.id) { <option [value]="d.id">{{ staffName(d) }}</option> }
            </select>
          } @else { <input formControlName="doctorId" placeholder="Doctor user ID" autocomplete="off" /> }
        </label>
        <label>Date *<input type="date" formControlName="date" [min]="minDate" /></label>
        <label>Time slot *
          <select formControlName="time">
            <option value="">{{ slotsLoading() ? 'Loading…' : bookSlots().length ? 'Choose a time…' : 'Pick a doctor and date' }}</option>
            @for (s of bookSlots(); track s) { <option [value]="s">{{ s }}</option> }
          </select>
        </label>
        <label class="wide">Reason for visit *<textarea rows="2" formControlName="reason" maxlength="500"></textarea></label>
        @if (formError()) { <p class="form-alert wide" role="alert">{{ formError() }}</p> }
        <div class="wide">
          <button class="primary-button inline-button" type="submit" [disabled]="busy() || !patient() || bookForm.invalid">
            {{ busy() ? 'Booking…' : 'Book appointment' }}
          </button>
        </div>
      </form>
    </section>
  </section>`,
})
export class Appointments implements OnInit {
  private readonly api = inject(HmsApi);

  readonly mocked = MOCKED_MODULES.appointments || MOCKED_MODULES.staff;
  readonly minDate = localIso(new Date());

  readonly dateControl = new FormControl(localIso(new Date()), { nonNullable: true });
  readonly doctorFilter = new FormControl('', { nonNullable: true });
  readonly doctors = signal<StaffMember[]>([]);
  readonly appointments = signal<Appointment[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly formError = signal('');
  private readonly viewDate = signal(this.dateControl.value);
  readonly isToday = computed(() => this.viewDate() === localIso(new Date()));

  readonly patient = signal<PatientFull | null>(null);
  readonly bookSlots = signal<string[]>([]);
  readonly slotsLoading = signal(false);
  readonly rescheduleSlots = signal<string[]>([]);
  readonly bookForm = new FormGroup({
    doctorId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    date: new FormControl(localIso(new Date()), { nonNullable: true, validators: [Validators.required] }),
    time: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }),
  });

  readonly panel = signal<{ id: string; kind: 'reschedule' | 'cancel' } | null>(null);
  readonly panelError = signal('');
  readonly rescheduleForm = new FormGroup({
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    time: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly cancelForm = new FormGroup({
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(300)] }),
  });

  ngOnInit(): void {
    this.api.staff({ role: 'DOCTOR', active: true }).subscribe({ next: (s) => this.doctors.set(s), error: () => this.doctors.set([]) });
    this.dateControl.valueChanges.subscribe((v) => { if (v) { this.viewDate.set(v); this.reload(); } });
    this.doctorFilter.valueChanges.subscribe(() => this.reload());
    this.bookForm.controls.doctorId.valueChanges.subscribe(() => this.loadBookSlots());
    this.bookForm.controls.date.valueChanges.subscribe(() => this.loadBookSlots());
    this.rescheduleForm.controls.date.valueChanges.subscribe(() => this.loadRescheduleSlots());
    this.reload();
    this.loadBookSlots();
  }

  label = (v?: string) => pretty(v);
  pill = (s: AppointmentStatus) => STATUS_PILL[s];
  staffName = (s: StaffMember) => `${s.firstName} ${s.lastName}${s.department ? ' · ' + s.department : ''}`;
  count = (s: AppointmentStatus) => this.appointments().filter((a) => a.status === s).length;

  today(): void { this.dateControl.setValue(localIso(new Date())); }
  shift(days: number): void {
    const d = new Date(`${this.dateControl.value}T00:00:00`);
    d.setDate(d.getDate() + days);
    this.dateControl.setValue(localIso(d));
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.appointments({ date: this.dateControl.value, doctorId: this.doctorFilter.value || undefined }).subscribe({
      next: (a) => { this.appointments.set(a); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not load appointments.')); this.loading.set(false); },
    });
  }

  private loadBookSlots(): void {
    const { doctorId, date } = this.bookForm.getRawValue();
    this.bookForm.controls.time.setValue('');
    if (!doctorId || !date) { this.bookSlots.set([]); return; }
    this.slotsLoading.set(true);
    this.api.appointmentAvailability(doctorId, date).subscribe({
      next: (r) => { this.bookSlots.set(r.slots ?? []); this.slotsLoading.set(false); },
      error: (e: unknown) => { this.bookSlots.set([]); this.slotsLoading.set(false); this.formError.set(errorMessage(e, 'Could not load free times.')); },
    });
  }

  private loadRescheduleSlots(): void {
    const a = this.appointments().find((x) => x.id === this.panel()?.id);
    const date = this.rescheduleForm.controls.date.value;
    this.rescheduleForm.controls.time.setValue('');
    if (!a || !date) { this.rescheduleSlots.set([]); return; }
    this.api.appointmentAvailability(a.doctorId, date).subscribe({
      next: (r) => this.rescheduleSlots.set(r.slots ?? []),
      error: (e: unknown) => { this.rescheduleSlots.set([]); this.panelError.set(errorMessage(e, 'Could not load free times.')); },
    });
  }

  book(): void {
    const p = this.patient();
    if (!p?.registrationNumber || this.bookForm.invalid) return;
    const v = this.bookForm.getRawValue();
    this.busy.set(true);
    this.formError.set('');
    this.api.bookAppointment({
      registrationNumber: p.registrationNumber, doctorId: v.doctorId.trim(), durationMinutes: 30,
      scheduledAt: `${v.date}T${v.time}:00`, reason: v.reason.trim(),
    }).subscribe({
      next: (a) => {
        this.busy.set(false);
        this.notice.set(`Appointment booked for ${a.patientName} on ${v.date} at ${v.time}.`);
        this.patient.set(null);
        this.bookForm.patchValue({ reason: '' });
        this.dateControl.setValue(v.date);
        this.loadBookSlots();
        this.reload();
      },
      error: (e: unknown) => { this.busy.set(false); this.formError.set(errorMessage(e, 'The appointment could not be booked.')); this.loadBookSlots(); },
    });
  }

  openPanel(a: Appointment, kind: 'reschedule' | 'cancel'): void {
    this.panel.set({ id: a.id, kind });
    this.panelError.set('');
    this.rescheduleSlots.set([]);
    this.rescheduleForm.reset({ date: '', time: '' });
    this.cancelForm.reset({ reason: '' });
  }
  closePanel(): void { this.panel.set(null); this.panelError.set(''); }

  reschedule(a: Appointment): void {
    if (this.rescheduleForm.invalid) return;
    const v = this.rescheduleForm.getRawValue();
    this.busy.set(true);
    this.api.rescheduleAppointment(a.id, { scheduledAt: `${v.date}T${v.time}:00` }).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`Appointment moved to ${v.date} at ${v.time}.`); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Could not reschedule.')); },
    });
  }

  cancel(a: Appointment): void {
    if (this.cancelForm.invalid) return;
    this.busy.set(true);
    this.api.cancelAppointment(a.id, { reason: this.cancelForm.getRawValue().reason.trim() }).subscribe({
      next: () => { this.busy.set(false); this.notice.set('Appointment cancelled.'); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Could not cancel.')); },
    });
  }

  noShow(a: Appointment): void {
    this.busy.set(true);
    this.error.set('');
    this.api.markNoShow(a.id).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`${a.patientName} was marked as a no-show.`); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.error.set(errorMessage(e, 'Could not update the appointment.')); },
    });
  }

  /** Real check-in first (puts the patient in the live queue), then links it to the appointment. */
  arrive(a: Appointment): void {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.checkIn(a.registrationNumber).subscribe({
      next: (c) => {
        this.api.appointmentArrived(a.id, { registrationNumber: a.registrationNumber, checkedInAt: c.checkInTime }).subscribe({
          next: () => { this.busy.set(false); this.notice.set(`${a.patientName} is checked in and in the queue.`); this.reload(); },
          error: (e: unknown) => {
            this.busy.set(false);
            this.notice.set(`${a.patientName} is checked in, but the appointment could not be updated: ${errorMessage(e, 'unknown error')}`);
            this.reload();
          },
        });
      },
      error: (e: unknown) => { this.busy.set(false); this.error.set(errorMessage(e, 'Check-in failed.')); },
    });
  }
}
