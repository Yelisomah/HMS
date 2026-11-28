import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { MOCKED_MODULES } from '../core/api/api.config';
import { PatientFull, PatientSearchResult } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import {
  Admission, AdmissionType, Bed, DischargeType, StaffMember,
} from '../core/api/hospital.models';
import { fullName, pretty } from '../shared/ui';

const ADMISSION_TYPES: AdmissionType[] = ['EMERGENCY', 'ELECTIVE', 'TRANSFER_IN', 'MATERNITY'];
const DISCHARGE_TYPES: DischargeType[] = ['RECOVERED', 'REFERRED', 'AGAINST_MEDICAL_ADVICE', 'DECEASED'];

@Component({
  selector: 'app-admissions',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Admissions</h1>
        <p class="dashboard-intro">Admit registered patients to a bed, transfer them between beds and record discharge.</p>
      </div>
      <button class="mini ghost" type="button" (click)="reload()" [disabled]="loading()">Refresh</button>
    </div>

    @if (mocked) {
      <p class="notice warn" role="status">
        Preview mode: the admissions, bed and staff endpoints are not live yet, so this page uses temporary
        in-memory data that resets on reload. Patients searched here are real.
      </p>
    }

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-label">Active admissions</span><strong>{{ active().length }}</strong></div>
      <div class="stat-card"><span class="stat-label">Available beds</span><strong>{{ availableBeds().length }}</strong></div>
      <div class="stat-card"><span class="stat-label">Discharged</span><strong>{{ discharged().length }}</strong></div>
    </div>

    @if (loadError()) { <p class="form-alert" role="alert">{{ loadError() }}</p> }
    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }

    <section class="panel-block">
      <h2>1. Find a registered patient</h2>
      <form class="form-row" (submit)="$event.preventDefault(); searchPatients()">
        <label>Name, phone, or patient ID<input [formControl]="patientQuery" placeholder="Search registered patients" /></label>
        <button class="mini" type="submit" [disabled]="searching() || patientQuery.invalid">{{ searching() ? 'Searching…' : 'Search' }}</button>
      </form>
      @if (patientSearchError()) { <p class="form-alert" role="alert">{{ patientSearchError() }}</p> }
      @if (patientResults().length) {
        <div class="table-wrap"><table>
          <thead><tr><th>Patient</th><th>Date of birth</th><th>Phone</th><th></th></tr></thead>
          <tbody>@for (p of patientResults(); track p.patientId) {
            <tr>
              <td>{{ p.fullName }}</td><td>{{ p.dateOfBirth || '—' }}</td><td>{{ p.phoneNumber || '—' }}</td>
              <td><button class="text-button" type="button" [disabled]="loadingPatient()" (click)="selectPatient(p)">Select</button></td>
            </tr>
          }</tbody>
        </table></div>
      }
      @if (selectedPatient(); as p) {
        <p class="notice" role="status">
          Selected: <b>{{ name(p) }}</b> · Registration {{ p.registrationNumber }}
          @if (alreadyAdmitted()) { <span> — this patient already has an active admission.</span> }
        </p>
      }
    </section>

    <section class="panel-block">
      <h2>2. Admit to a bed</h2>
      <form class="grid-form compact" [formGroup]="form" (ngSubmit)="admit()">
        <label>Admission type *
          <select formControlName="admissionType">
            @for (t of admissionTypes; track t) { <option [value]="t">{{ label(t) }}</option> }
          </select>
        </label>
        <label>Bed *
          <select formControlName="bedId">
            <option value="">Choose a bed…</option>
            @for (g of bedGroups(); track g.ward) {
              <optgroup [label]="g.ward">@for (b of g.beds; track b.id) { <option [value]="b.id">{{ b.label }}</option> }</optgroup>
            }
          </select>
        </label>
        <label>Attending doctor *
          @if (doctors().length) {
            <select formControlName="attendingDoctorId">
              <option value="">Choose a doctor…</option>
              @for (d of doctors(); track d.id) { <option [value]="d.id">{{ staffLabel(d) }}</option> }
            </select>
          } @else { <input formControlName="attendingDoctorId" placeholder="Doctor user ID" autocomplete="off" /> }
        </label>
        <label>Assigned nurse
          @if (nurses().length) {
            <select formControlName="assignedNurseId">
              <option value="">Not assigned</option>
              @for (n of nurses(); track n.id) { <option [value]="n.id">{{ staffLabel(n) }}</option> }
            </select>
          } @else { <input formControlName="assignedNurseId" placeholder="Nurse user ID (optional)" autocomplete="off" /> }
        </label>
        <label class="wide">Reason for admission *<textarea rows="3" formControlName="reason" maxlength="1000"></textarea></label>
        @if (formError()) { <p class="form-alert wide" role="alert">{{ formError() }}</p> }
        <div class="wide">
          <button class="primary-button inline-button" type="submit"
            [disabled]="busy() || !selectedPatient() || alreadyAdmitted() || form.invalid">
            {{ busy() ? 'Admitting…' : 'Admit patient' }}
          </button>
          @if (!availableBeds().length && !loading()) { <span class="muted"> No beds are currently available.</span> }
        </div>
      </form>
    </section>

    <section class="panel-block">
      <div class="section-head"><h2>Active admissions</h2><span class="muted">{{ active().length }} patient{{ active().length === 1 ? '' : 's' }}</span></div>
      @if (loading()) { <p class="loading-message" role="status">Loading admissions…</p> }
      @else if (!active().length) { <p class="muted">No patients are currently admitted.</p> }
      @for (a of active(); track a.id) {
        <article class="plan">
          <b>
            <a class="cell-link" [routerLink]="['/app/patients', a.registrationNumber]">{{ a.patientName }}</a>
            <span class="pill pill-amber">{{ label(a.admissionType) }}</span>
          </b>
          <span>Reg. {{ a.registrationNumber }} · {{ a.wardName }} · Bed {{ a.bedLabel }}</span>
          <span>Admitted {{ a.admittedAt | date: 'd MMM y, HH:mm' }} · Dr. {{ a.attendingDoctorName || a.attendingDoctorId }}
            @if (a.assignedNurseId) { · Nurse {{ a.assignedNurseName || a.assignedNurseId }} }</span>
          <span>Reason: {{ a.reason }}</span>

          @if (panel()?.id === a.id && panel()?.kind === 'transfer') {
            <form class="stack" [formGroup]="transferForm" (ngSubmit)="transfer(a)">
              <label>New bed *
                <select formControlName="newBedId">
                  <option value="">Choose a bed…</option>
                  @for (g of bedGroups(); track g.ward) {
                    <optgroup [label]="g.ward">@for (b of g.beds; track b.id) { <option [value]="b.id">{{ b.label }}</option> }</optgroup>
                  }
                </select>
              </label>
              <label>Reason for transfer *<input formControlName="reason" maxlength="500" /></label>
              @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
              <div class="actions">
                <button class="mini" type="submit" [disabled]="transferForm.invalid || busy()">Confirm transfer</button>
                <button class="mini ghost" type="button" (click)="closePanel()">Cancel</button>
              </div>
            </form>
          } @else if (panel()?.id === a.id && panel()?.kind === 'discharge') {
            <form class="stack" [formGroup]="dischargeForm" (ngSubmit)="discharge(a)">
              <label>Discharge type *
                <select formControlName="dischargeType">@for (t of dischargeTypes; track t) { <option [value]="t">{{ label(t) }}</option> }</select>
              </label>
              <label>Discharge summary *<textarea rows="3" formControlName="summary" maxlength="2000"></textarea></label>
              <label>Follow-up instructions<textarea rows="2" formControlName="followUpInstructions" maxlength="1000"></textarea></label>
              @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
              <div class="actions">
                <button class="mini" type="submit" [disabled]="dischargeForm.invalid || busy()">Confirm discharge</button>
                <button class="mini ghost" type="button" (click)="closePanel()">Cancel</button>
              </div>
            </form>
          } @else {
            <div class="actions">
              <button class="mini ghost" type="button" (click)="openPanel(a, 'transfer')">Transfer bed</button>
              <button class="mini ghost" type="button" (click)="openPanel(a, 'discharge')">Discharge</button>
            </div>
          }
        </article>
      }
    </section>

    @if (discharged().length) {
      <section class="panel-block">
        <h2>Discharged</h2>
        @for (a of discharged(); track a.id) {
          <article class="plan">
            <b>{{ a.patientName }} <span class="pill pill-blue">{{ label(a.dischargeType) }}</span></b>
            <span>{{ a.wardName }} · Bed {{ a.bedLabel }} · {{ a.admittedAt | date: 'd MMM' }} → {{ a.dischargedAt | date: 'd MMM y, HH:mm' }}</span>
            <span>{{ a.dischargeSummary }}</span>
            @if (a.followUpInstructions) { <span>Follow-up: {{ a.followUpInstructions }}</span> }
          </article>
        }
      </section>
    }
  </section>`,
})
export class Admissions implements OnInit {
  private readonly api = inject(HmsApi);
  private readonly auth = inject(AuthService);

  readonly mocked = MOCKED_MODULES.admissions || MOCKED_MODULES.wards;
  readonly admissionTypes = ADMISSION_TYPES;
  readonly dischargeTypes = DISCHARGE_TYPES;

  readonly admissions = signal<Admission[]>([]);
  readonly beds = signal<Bed[]>([]);
  readonly doctors = signal<StaffMember[]>([]);
  readonly nurses = signal<StaffMember[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);

  readonly active = computed(() => this.admissions().filter((a) => a.status === 'ADMITTED'));
  readonly discharged = computed(() => this.admissions().filter((a) => a.status === 'DISCHARGED'));
  readonly availableBeds = computed(() => this.beds().filter((b) => b.status === 'AVAILABLE'));
  readonly bedGroups = computed(() => {
    const groups = new Map<string, Bed[]>();
    for (const b of this.availableBeds()) groups.set(b.wardName ?? b.wardId, [...(groups.get(b.wardName ?? b.wardId) ?? []), b]);
    return [...groups].map(([ward, beds]) => ({ ward, beds }));
  });

  readonly patientQuery = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] });
  readonly patientResults = signal<PatientSearchResult[]>([]);
  readonly selectedPatient = signal<PatientFull | null>(null);
  readonly searching = signal(false);
  readonly loadingPatient = signal(false);
  readonly patientSearchError = signal('');
  readonly formError = signal('');
  readonly alreadyAdmitted = computed(() => {
    const p = this.selectedPatient();
    return !!p && (p.admitted === true || this.active().some((a) => a.registrationNumber === p.registrationNumber));
  });

  readonly form = new FormGroup({
    admissionType: new FormControl<AdmissionType>('ELECTIVE', { nonNullable: true }),
    bedId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    attendingDoctorId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    assignedNurseId: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(1000)] }),
  });

  readonly panel = signal<{ id: string; kind: 'transfer' | 'discharge' } | null>(null);
  readonly panelError = signal('');
  readonly transferForm = new FormGroup({
    newBedId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }),
  });
  readonly dischargeForm = new FormGroup({
    dischargeType: new FormControl<DischargeType>('RECOVERED', { nonNullable: true }),
    summary: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(2000)] }),
    followUpInstructions: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
  });

  ngOnInit(): void {
    const me = this.auth.user();
    if (this.auth.isDoctor() && me) this.form.controls.attendingDoctorId.setValue(me.id);
    if (this.auth.isNurse() && me) this.form.controls.assignedNurseId.setValue(me.id);
    this.api.staff({ role: 'DOCTOR', active: true }).subscribe({ next: (s) => this.doctors.set(s), error: () => this.doctors.set([]) });
    this.api.staff({ role: 'NURSE', active: true }).subscribe({ next: (s) => this.nurses.set(s), error: () => this.nurses.set([]) });
    this.reload();
  }

  label = (v?: string) => pretty(v);
  name = (p: PatientFull) => fullName(p) || 'Patient';
  staffLabel = (s: StaffMember) => `${s.firstName} ${s.lastName}${s.department ? ' · ' + s.department : ''}`;

  reload(): void {
    this.loading.set(true);
    this.loadError.set('');
    let pending = 2;
    const done = () => { if (--pending === 0) this.loading.set(false); };
    this.api.admissions({ size: 100 }).subscribe({
      next: (r) => { this.admissions.set(r.content ?? []); done(); },
      error: (e: unknown) => { this.loadError.set(errorMessage(e, 'Could not load admissions.')); done(); },
    });
    this.api.beds().subscribe({
      next: (b) => { this.beds.set(b); done(); },
      error: (e: unknown) => { this.loadError.set(errorMessage(e, 'Could not load beds.')); done(); },
    });
  }

  searchPatients(): void {
    if (this.patientQuery.invalid) return;
    this.searching.set(true);
    this.patientSearchError.set('');
    this.patientResults.set([]);
    this.api.searchPatients(this.patientQuery.value.trim(), 0, 20).subscribe({
      next: (r) => { this.patientResults.set(r.results ?? []); this.searching.set(false); },
      error: (e: unknown) => { this.patientSearchError.set(errorMessage(e, 'Patient search failed.')); this.searching.set(false); },
    });
  }

  selectPatient(result: PatientSearchResult): void {
    this.loadingPatient.set(true);
    this.patientSearchError.set('');
    this.api.patientById(result.patientId).subscribe({
      next: (r) => {
        if (!r.data?.registrationNumber) this.patientSearchError.set('This patient has no registration number.');
        else { this.selectedPatient.set(r.data); this.formError.set(''); this.notice.set(''); }
        this.loadingPatient.set(false);
      },
      error: (e: unknown) => { this.patientSearchError.set(errorMessage(e, 'Could not load the patient.')); this.loadingPatient.set(false); },
    });
  }

  admit(): void {
    const p = this.selectedPatient();
    if (!p?.registrationNumber || this.form.invalid || this.alreadyAdmitted()) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.formError.set('');
    this.api.admit({
      registrationNumber: p.registrationNumber, bedId: v.bedId, admissionType: v.admissionType,
      attendingDoctorId: v.attendingDoctorId.trim(), assignedNurseId: v.assignedNurseId.trim() || undefined, reason: v.reason.trim(),
    }).subscribe({
      next: (a) => {
        this.busy.set(false);
        this.notice.set(`${a.patientName} was admitted to ${a.wardName}, bed ${a.bedLabel}.`);
        this.selectedPatient.set(null);
        this.patientResults.set([]);
        this.patientQuery.reset('');
        this.form.patchValue({ bedId: '', reason: '', admissionType: 'ELECTIVE' });
        this.reload();
      },
      error: (e: unknown) => { this.busy.set(false); this.formError.set(errorMessage(e, 'The admission could not be created.')); },
    });
  }

  openPanel(a: Admission, kind: 'transfer' | 'discharge'): void {
    this.panel.set({ id: a.id, kind });
    this.panelError.set('');
    this.transferForm.reset({ newBedId: '', reason: '' });
    this.dischargeForm.reset({ dischargeType: 'RECOVERED', summary: '', followUpInstructions: '' });
  }
  closePanel(): void { this.panel.set(null); this.panelError.set(''); }

  transfer(a: Admission): void {
    if (this.transferForm.invalid) return;
    const v = this.transferForm.getRawValue();
    this.busy.set(true);
    this.api.transferAdmission(a.id, { newBedId: v.newBedId, reason: v.reason.trim() }).subscribe({
      next: (u) => { this.busy.set(false); this.notice.set(`${u.patientName} was moved to ${u.wardName}, bed ${u.bedLabel}.`); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'The transfer failed.')); },
    });
  }

  discharge(a: Admission): void {
    if (this.dischargeForm.invalid) return;
    const v = this.dischargeForm.getRawValue();
    this.busy.set(true);
    this.api.dischargeAdmission(a.id, {
      dischargeType: v.dischargeType, summary: v.summary.trim(), followUpInstructions: v.followUpInstructions.trim() || undefined,
    }).subscribe({
      next: (u) => { this.busy.set(false); this.notice.set(`${u.patientName} was discharged and the bed released for cleaning.`); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Discharge failed.')); },
    });
  }
}
