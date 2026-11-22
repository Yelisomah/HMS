import { Component, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../Auth/auth.service';
import { MedicalRecord } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { clean, todayIso } from '../shared/ui';

/** List + create/edit/delete for medical records. Pass patientId or doctorId to choose what to list. */
@Component({
  selector: 'app-records-panel',
  imports: [ReactiveFormsModule],
  template: `
  <section class="panel-block">
    <div class="section-head">
      <h2>Medical records</h2>
      <button class="mini" type="button" (click)="startNew()">New record</button>
    </div>
    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }

    @if (editing()) {
      <form class="grid-form compact" [formGroup]="form" (ngSubmit)="save()">
        <label>Patient ID *<input formControlName="patientId" /></label>
        <label>Doctor ID *<input formControlName="doctorId" /></label>
        <label>Date of visit<input type="date" formControlName="dateOfVisit" /></label>
        <label class="wide">Diagnosis<input formControlName="diagnosis" /></label>
        <label class="wide">Treatment note<textarea rows="3" formControlName="treatmentNote"></textarea></label>
        <label>Prescribed medication<input formControlName="prescribedMedication" /></label>
        <label>Allergies<input formControlName="allergies" /></label>
        <label>Lab report<input formControlName="labReport" /></label>
        <label class="inline-check"><input type="checkbox" formControlName="followUpRequired" /> Follow-up required</label>
        @if (form.controls.followUpRequired.value) { <label>Follow-up date<input type="date" formControlName="followUpDate" /></label> }
        <div class="wide actions">
          <button class="mini" type="submit" [disabled]="busy() || form.invalid">{{ editingId() ? 'Save changes' : 'Create record' }}</button>
          <button class="mini ghost-btn" type="button" (click)="editing.set(false)">Cancel</button>
        </div>
      </form>
    }

    @if (loading()) { <p class="loading-message" role="status">Loading records…</p> }
    @else {
      @for (r of records(); track r.id) {
        <div class="plan">
          <b>{{ r.dateOfVisit || 'Undated' }} · {{ r.diagnosis || 'No diagnosis' }}</b>
          <span>{{ r.treatmentNote || 'No treatment note' }}</span>
          @if (r.prescribedMedication) { <span>Medication: {{ r.prescribedMedication }}</span> }
          @if (r.allergies) { <span class="allergy">Allergies: {{ r.allergies }}</span> }
          @if (r.labReport) { <span>Lab: {{ r.labReport }}</span> }
          @if (r.followUpRequired) { <span>Follow-up{{ r.followUpDate ? ' on ' + r.followUpDate : ' required' }}</span> }
          <span class="actions"><button class="text-button" type="button" (click)="startEdit(r)">Edit</button><button class="text-button danger" type="button" (click)="remove(r)">Delete</button></span>
        </div>
      } @empty { <p class="muted">No records to show.</p> }
    }
  </section>`,
})
export class RecordsPanel {
  private readonly api = inject(HmsApi);
  private readonly auth = inject(AuthService);
  readonly patientId = input<string>('');
  readonly doctorId = input<string>('');

  readonly records = signal<MedicalRecord[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editing = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly form = new FormGroup({
    patientId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    doctorId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    diagnosis: new FormControl('', { nonNullable: true }),
    treatmentNote: new FormControl('', { nonNullable: true }),
    dateOfVisit: new FormControl(todayIso(), { nonNullable: true }),
    followUpRequired: new FormControl(false, { nonNullable: true }),
    followUpDate: new FormControl('', { nonNullable: true }),
    allergies: new FormControl('', { nonNullable: true }),
    labReport: new FormControl('', { nonNullable: true }),
    prescribedMedication: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    effect(() => { void this.patientId(); void this.doctorId(); this.load(); });
  }

  load(): void {
    const p = this.patientId(), d = this.doctorId();
    if (!p && !d) { this.records.set([]); return; }
    this.loading.set(true);
    this.error.set('');
    (p ? this.api.recordsByPatient(p) : this.api.recordsByDoctor(d)).subscribe({
      next: (r) => { this.records.set(r ?? []); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e)); this.records.set([]); this.loading.set(false); },
    });
  }

  startNew(): void {
    this.editingId.set(null);
    this.form.reset({
      patientId: this.patientId(), doctorId: this.doctorId() || this.auth.user()?.id || '',
      dateOfVisit: todayIso(), followUpRequired: false,
    });
    this.editing.set(true);
  }

  startEdit(r: MedicalRecord): void {
    this.editingId.set(r.id);
    this.form.reset({
      patientId: r.patient?.id ?? this.patientId(), doctorId: r.doctor?.id ?? this.auth.user()?.id ?? '',
      diagnosis: r.diagnosis ?? '', treatmentNote: r.treatmentNote ?? '', dateOfVisit: r.dateOfVisit ?? '',
      followUpRequired: r.followUpRequired ?? false, followUpDate: r.followUpDate ?? '',
      allergies: r.allergies ?? '', labReport: r.labReport ?? '', prescribedMedication: r.prescribedMedication ?? '',
    });
    this.editing.set(true);
  }

  save(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const body = clean({ ...raw, followUpDate: raw.followUpRequired ? raw.followUpDate : '' });
    const id = this.editingId();
    this.busy.set(true);
    this.error.set('');
    (id ? this.api.updateRecord(id, body) : this.api.createRecord(body)).subscribe({
      next: () => { this.busy.set(false); this.editing.set(false); this.notice.set(id ? 'Record updated.' : 'Record created.'); this.load(); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not save the record.')); this.busy.set(false); },
    });
  }

  remove(r: MedicalRecord): void {
    if (!window.confirm('Delete this medical record? This cannot be undone.')) return;
    this.api.deleteRecord(r.id).subscribe({
      next: () => { this.notice.set('Record deleted.'); this.load(); },
      error: (e: unknown) => this.error.set(errorMessage(e)),
    });
  }
}

@Component({
  selector: 'app-records-page',
  imports: [ReactiveFormsModule, RecordsPanel],
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">Hospital workspace</p><h1>Medical records</h1><p class="dashboard-intro">Look up records by doctor or by patient.</p></div></div>
    <form class="form-row" (submit)="$event.preventDefault(); apply()">
      <label>Look up by<select [formControl]="mode"><option value="doctor">Doctor ID</option><option value="patient">Patient ID</option></select></label>
      <label>{{ mode.value === 'doctor' ? 'Doctor ID' : 'Patient ID' }}<input [formControl]="idCtl" /></label>
      <button class="mini" type="submit" [disabled]="!idCtl.value.trim()">Load records</button>
    </form>
    @if (patientId() || doctorId()) { <app-records-panel [patientId]="patientId()" [doctorId]="doctorId()" /> }
  </section>`,
})
export class RecordsPage {
  private readonly auth = inject(AuthService);
  readonly mode = new FormControl<'doctor' | 'patient'>('doctor', { nonNullable: true });
  readonly idCtl = new FormControl(this.auth.user()?.id ?? '', { nonNullable: true });
  readonly patientId = signal('');
  readonly doctorId = signal('');

  constructor() {
    if (this.auth.isDoctor() && this.idCtl.value) this.doctorId.set(this.idCtl.value);
  }

  apply(): void {
    const id = this.idCtl.value.trim();
    this.patientId.set(this.mode.value === 'patient' ? id : '');
    this.doctorId.set(this.mode.value === 'doctor' ? id : '');
  }
}
