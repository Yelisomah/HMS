import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { AdmissionsStore, Admission } from '../core/admissions.store';
import { PatientFull, PatientSearchResult } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';

@Component({
  selector: 'app-admissions',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Admissions</h1>
        <p class="dashboard-intro">Admit registered patients and record discharge details.</p>
      </div>
    </div>

    <p class="notice warn" role="status">
      Prototype mode: admission changes are held in memory and clear when the app reloads.
      The ward and bed list below is sample data until the backend and Ward/Bed module are available.
    </p>

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-label">Active admissions</span><strong>{{ activeAdmissions().length }}</strong></div>
      <div class="stat-card"><span class="stat-label">Available sample beds</span><strong>{{ store.availableBeds().length }}</strong></div>
      <div class="stat-card"><span class="stat-label">Recently discharged</span><strong>{{ dischargedAdmissions().length }}</strong></div>
    </div>

    <section class="panel-block">
      <h2>Find a registered patient</h2>
      <form class="form-row" (submit)="$event.preventDefault(); searchPatients()">
        <label>Name, phone, or patient ID<input [formControl]="patientQuery" placeholder="Search registered patients" /></label>
        <button class="mini" type="submit" [disabled]="searching() || patientQuery.invalid">
          {{ searching() ? 'Searching…' : 'Search' }}
        </button>
      </form>
      @if (patientSearchError()) { <p class="form-alert" role="alert">{{ patientSearchError() }}</p> }
      @if (searching()) { <p class="loading-message" role="status">Searching patients…</p> }
      @if (patientResults().length) {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Patient</th><th>Date of birth</th><th>Phone</th><th></th></tr></thead>
            <tbody>@for (patient of patientResults(); track patient.patientId) {
              <tr>
                <td>{{ patient.fullName }}</td><td>{{ patient.dateOfBirth || '—' }}</td><td>{{ patient.phoneNumber || '—' }}</td>
                <td><button class="text-button" type="button" [disabled]="loadingPatient()" (click)="selectPatient(patient)">Select</button></td>
              </tr>
            }</tbody>
          </table>
        </div>
      }
      @if (selectedPatient(); as patient) {
        <p class="notice" role="status">
          Selected: <b>{{ patientName(patient) }}</b> · Registration {{ patient.registrationNumber }}
          @if (patientAlreadyAdmitted()) { <span> — this patient already has an active admission.</span> }
        </p>
      }
      @if (loadingPatient()) { <p class="loading-message" role="status">Loading patient details…</p> }
    </section>

    <section class="panel-block">
      <h2>Admit patient</h2>
      <form class="grid-form compact" [formGroup]="admissionForm" (ngSubmit)="admit()">
        <label>Attending doctor ID *<input formControlName="attendingDoctorId" autocomplete="off" /></label>
        <label>Assigned nurse ID<input formControlName="assignedNurseId" autocomplete="off" /></label>
        <label class="wide">Reason for admission *<textarea rows="3" formControlName="reason"></textarea></label>
        <label class="wide">Available demo bed *
          <select formControlName="bedId">
            <option value="">Choose a bed…</option>
            @for (bed of store.availableBeds(); track bed.id) {
              <option [value]="bed.id">{{ bed.wardName }} · {{ bed.label }}</option>
            }
          </select>
        </label>
        @if (formError()) { <p class="form-alert wide" role="alert">{{ formError() }}</p> }
        @if (notice()) { <p class="notice wide" role="status">{{ notice() }}</p> }
        <div class="wide">
          <button class="primary-button inline-button" type="submit"
            [disabled]="busy() || loadingPatient() || !selectedPatient() || patientAlreadyAdmitted() || admissionForm.invalid || !store.availableBeds().length">
            {{ busy() ? 'Admitting…' : 'Admit patient' }}
          </button>
        </div>
      </form>
    </section>

    <section class="panel-block">
      <div class="section-head"><h2>Active admissions</h2><span class="muted">{{ activeAdmissions().length }} patient{{ activeAdmissions().length === 1 ? '' : 's' }}</span></div>
      @if (!activeAdmissions().length) {
        <p class="muted">No admissions have been created in this app session.</p>
      } @else {
        @for (admission of activeAdmissions(); track admission.id) {
          <article class="plan">
            <b>
              <a class="cell-link" [routerLink]="['/app/patients', admission.patientId]">{{ admission.patientName }}</a>
              <span class="pill pill-amber">Admitted</span>
            </b>
            <span>Reg. {{ admission.registrationNumber }} · {{ admission.wardName }} · {{ admission.bedLabel }}</span>
            <span>Admitted {{ admission.admittedAt | date: 'd MMM y, HH:mm' }} · Doctor ID {{ admission.attendingDoctorId }}</span>
            <span>Reason: {{ admission.reason }}</span>
            @if (admission.assignedNurseId) { <span>Assigned nurse ID {{ admission.assignedNurseId }}</span> }
            @if (dischargingId() === admission.id) {
              <form class="stack" (submit)="$event.preventDefault(); discharge(admission)">
                <label>Discharge summary *<textarea rows="3" [formControl]="dischargeSummary"></textarea></label>
                @if (dischargeError()) { <p class="form-alert" role="alert">{{ dischargeError() }}</p> }
                <div class="actions">
                  <button class="mini" type="submit" [disabled]="dischargeSummary.invalid || busy()">Confirm discharge</button>
                  <button class="mini ghost" type="button" (click)="cancelDischarge()">Cancel</button>
                </div>
              </form>
            } @else {
              <button class="mini ghost" type="button" (click)="startDischarge(admission)">Discharge</button>
            }
          </article>
        }
      }
    </section>

    @if (dischargedAdmissions().length) {
      <section class="panel-block">
        <h2>Discharged this session</h2>
        @for (admission of dischargedAdmissions(); track admission.id) {
          <article class="plan">
            <b>{{ admission.patientName }} <span class="pill pill-blue">Discharged</span></b>
            <span>{{ admission.wardName }} · {{ admission.bedLabel }} · {{ admission.dischargedAt | date: 'd MMM y, HH:mm' }}</span>
            <span>{{ admission.dischargeSummary }}</span>
          </article>
        }
      </section>
    }
  </section>`,
})
export class Admissions {
  readonly store = inject(AdmissionsStore);
  private readonly api = inject(HmsApi);
  private readonly auth = inject(AuthService);

  readonly patientQuery = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] });
  readonly patientResults = signal<PatientSearchResult[]>([]);
  readonly selectedPatient = signal<PatientFull | null>(null);
  readonly loadingPatient = signal(false);
  readonly searching = signal(false);
  readonly patientSearchError = signal('');
  readonly formError = signal('');
  readonly dischargeError = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly dischargingId = signal<string | null>(null);
  readonly dischargeSummary = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(2000)] });
  readonly activeAdmissions = this.store.activeAdmissions;
  readonly dischargedAdmissions = this.store.dischargedAdmissions;
  readonly patientAlreadyAdmitted = computed(() => {
    const patient = this.selectedPatient();
    return !!patient && (patient.admitted === true || this.activeAdmissions().some((item) => item.patientId === patient.id));
  });
  readonly admissionForm = new FormGroup({
    bedId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    attendingDoctorId: new FormControl(this.auth.isDoctor() ? this.auth.user()?.id ?? '' : '', { nonNullable: true, validators: [Validators.required] }),
    assignedNurseId: new FormControl(this.auth.isNurse() ? this.auth.user()?.id ?? '' : '', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(1000)] }),
  });

  patientName(patient: PatientFull): string {
    return [patient.firstName, patient.otherNames, patient.lastName].filter(Boolean).join(' ') || 'Patient';
  }

  searchPatients(): void {
    if (this.patientQuery.invalid) {
      this.patientQuery.markAsTouched();
      return;
    }
    this.searching.set(true);
    this.patientSearchError.set('');
    this.patientResults.set([]);
    this.api.searchPatients(this.patientQuery.value.trim(), 0, 20).subscribe({
      next: (result) => {
        this.patientResults.set(result.results ?? []);
        this.searching.set(false);
      },
      error: (error: unknown) => {
        this.patientSearchError.set(errorMessage(error, 'Patient search failed.'));
        this.searching.set(false);
      },
    });
  }

  selectPatient(result: PatientSearchResult): void {
    this.loadingPatient.set(true);
    this.patientSearchError.set('');
    this.api.patientById(result.patientId).subscribe({
      next: (response) => {
        if (!response.data?.registrationNumber) {
          this.patientSearchError.set('The patient details response did not include a registration number.');
          this.selectedPatient.set(null);
        } else {
          this.selectedPatient.set(response.data);
          this.formError.set('');
          this.notice.set('');
        }
        this.loadingPatient.set(false);
      },
      error: (error: unknown) => {
        this.patientSearchError.set(errorMessage(error, 'Could not load the selected patient.'));
        this.loadingPatient.set(false);
      },
    });
  }

  admit(): void {
    const patient = this.selectedPatient();
    if (this.admissionForm.invalid || !patient || !patient.registrationNumber || this.patientAlreadyAdmitted()) {
      this.admissionForm.markAllAsTouched();
      if (!patient) this.formError.set('Search for and select a registered patient first.');
      else if (!patient.registrationNumber) this.formError.set('The selected patient does not have a registration number.');
      else if (this.patientAlreadyAdmitted()) this.formError.set('This patient already has an active admission.');
      return;
    }

    this.busy.set(true);
    this.formError.set('');
    this.notice.set('');
    const form = this.admissionForm.getRawValue();
    try {
      const admission = this.store.admit({
        patientId: patient.id,
        registrationNumber: patient.registrationNumber,
        patientName: this.patientName(patient),
        dateOfBirth: patient.dateOfBirth,
        phoneNumber: patient.phoneNumber,
        bedId: form.bedId,
        attendingDoctorId: form.attendingDoctorId.trim(),
        assignedNurseId: form.assignedNurseId.trim() || undefined,
        admittingStaffId: this.auth.user()?.id ?? '',
        reason: form.reason.trim(),
      });
      this.notice.set(`${admission.patientName} was admitted to ${admission.wardName}, ${admission.bedLabel}.`);
      this.selectedPatient.set(null);
      this.patientResults.set([]);
      this.patientQuery.reset('');
      this.admissionForm.reset({
        bedId: '',
        attendingDoctorId: this.auth.isDoctor() ? this.auth.user()?.id ?? '' : '',
        assignedNurseId: this.auth.isNurse() ? this.auth.user()?.id ?? '' : '',
        reason: '',
      });
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'The admission could not be created.');
    } finally {
      this.busy.set(false);
    }
  }

  startDischarge(admission: Admission): void {
    this.dischargingId.set(admission.id);
    this.dischargeSummary.reset('');
    this.dischargeError.set('');
  }

  cancelDischarge(): void {
    this.dischargingId.set(null);
    this.dischargeSummary.reset('');
    this.dischargeError.set('');
  }

  discharge(admission: Admission): void {
    if (this.dischargeSummary.invalid) {
      this.dischargeSummary.markAsTouched();
      return;
    }
    this.busy.set(true);
    this.dischargeError.set('');
    try {
      this.store.discharge(admission.id, this.dischargeSummary.value, this.auth.user()?.id ?? '');
      this.notice.set(`${admission.patientName} was discharged and the sample bed was released.`);
      this.cancelDischarge();
    } catch (error) {
      this.dischargeError.set(error instanceof Error ? error.message : 'The patient could not be discharged.');
    } finally {
      this.busy.set(false);
    }
  }
}
