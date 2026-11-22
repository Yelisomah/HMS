import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PossibleDuplicate } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { clean } from '../shared/ui';

@Component({
  selector: 'app-patient-register',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
  <section class="dashboard-view">
    <a class="back-link" routerLink="/app/patients">← All patients</a>
    <div class="page-heading"><div><p class="eyebrow">Hospital workspace</p><h1>Register patient</h1><p class="dashboard-intro">Fields marked * are required.</p></div></div>

    @if (duplicates().length) {
      <section class="panel-block warn-block" role="alert">
        <h2>Possible existing patients</h2>
        <p class="note">{{ message() || 'These records look similar. Check them before creating a new one.' }}</p>
        @for (d of duplicates(); track d.patientId) {
          <a class="list-row" [routerLink]="['/app/patients', d.patientId]"><span class="dot dot-amber"></span><span>{{ d.fullName }} <small>{{ d.dateOfBirth || 'DOB unknown' }} · {{ d.phoneNumber || 'no phone' }}</small></span><span>Open →</span></a>
        }
        <div class="actions" style="margin-top:12px">
          <button class="mini" type="button" (click)="submit(true)" [disabled]="busy()">This is a different person — register anyway</button>
        </div>
      </section>
    }

    <form class="panel-block grid-form" [formGroup]="form" (ngSubmit)="submit(false)" novalidate>
      <h2>Patient details</h2>
      <label>First name *<input formControlName="firstName" autocomplete="off" /></label>
      <label>Other names<input formControlName="otherNames" /></label>
      <label>Last name *<input formControlName="lastName" /></label>
      <label>Date of birth *<input type="date" formControlName="dateOfBirth" [max]="today" /></label>
      <label>Gender *<select formControlName="gender"><option value="">Select…</option><option>Male</option><option>Female</option></select></label>
      <label>Phone number *<input type="tel" formControlName="phoneNumber" /></label>
      <label class="wide">Address<input formControlName="address" /></label>
      <label>NHIS number<input formControlName="nhisNumber" /></label>

      <h2>Next of kin</h2>
      <label>Name *<input formControlName="nextOfKinName" /></label>
      <label>Relationship<input formControlName="nextOfKinRelationship" /></label>
      <label>Phone number *<input type="tel" formControlName="nextOfKinPhoneNumber" /></label>

      @if (form.touched && form.invalid) { <p class="form-alert wide" role="alert">Complete the fields marked * before saving.</p> }
      @if (error()) { <p class="form-alert wide" role="alert">{{ error() }}</p> }
      <div class="wide"><button class="primary-button inline-button" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Register patient' }}</button></div>
    </form>
  </section>`,
})
export class PatientRegister {
  private readonly api = inject(HmsApi);
  private readonly router = inject(Router);
  readonly today = new Date().toISOString().slice(0, 10);
  private readonly req = (max = 255) => new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(max)] });
  private readonly opt = (max = 255) => new FormControl('', { nonNullable: true, validators: [Validators.maxLength(max)] });

  readonly form = new FormGroup({
    firstName: this.req(), otherNames: this.opt(), lastName: this.req(),
    dateOfBirth: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    gender: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(Male|Female)$/i)] }),
    phoneNumber: this.req(), address: this.opt(), nhisNumber: this.opt(50),
    nextOfKinName: this.req(), nextOfKinRelationship: this.opt(100), nextOfKinPhoneNumber: this.req(30),
  });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly duplicates = signal<PossibleDuplicate[]>([]);

  submit(confirmDuplicates: boolean): void {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.busy.set(true);
    this.error.set('');
    const body = { ...clean(this.form.getRawValue()), ...(confirmDuplicates ? { confirmPossibleDuplicates: true } : {}) };
    this.api.registerPatient(body as never).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (r.registered && r.patient?.patientId) {
          void this.router.navigate(['/app/patients', r.patient.patientId]);
        } else if (r.possibleMatches?.length) {
          this.message.set(r.message ?? '');
          this.duplicates.set(r.possibleMatches);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          this.error.set(r.message || 'The patient could not be registered.');
        }
      },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'The patient could not be registered.')); this.busy.set(false); },
    });
  }
}
