import { Component, computed, inject, model, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { PatientFull, PatientSearchResult } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { fullName } from './ui';

/** Reusable "find a registered patient" control. Two-way bind the chosen patient: [(patient)]="selected". */
@Component({
  selector: 'app-patient-picker',
  imports: [ReactiveFormsModule],
  template: `
    @if (patient(); as p) {
      <p class="notice" role="status">
        Selected: <b>{{ display(p) }}</b> · Registration {{ p.registrationNumber }}
        <button class="text-button" type="button" (click)="patient.set(null)">Change</button>
      </p>
    } @else {
      <form class="form-row" (submit)="$event.preventDefault(); search()">
        <label>Name, phone, or patient ID<input [formControl]="query" placeholder="Search registered patients" /></label>
        <button class="mini" type="submit" [disabled]="searching() || query.invalid">{{ searching() ? 'Searching…' : 'Search' }}</button>
      </form>
      @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
      @if (searched() && !results().length && !error() && !searching()) { <p class="muted">No registered patients matched.</p> }
      @if (results().length) {
        <div class="table-wrap"><table>
          <thead><tr><th>Patient</th><th>Date of birth</th><th>Phone</th><th></th></tr></thead>
          <tbody>@for (r of results(); track r.patientId) {
            <tr>
              <td>{{ r.fullName }}</td><td>{{ r.dateOfBirth || '—' }}</td><td>{{ r.phoneNumber || '—' }}</td>
              <td><button class="text-button" type="button" [disabled]="loading()" (click)="choose(r)">Select</button></td>
            </tr>
          }</tbody>
        </table></div>
      }
    }`,
})
export class PatientPicker {
  private readonly api = inject(HmsApi);
  readonly patient = model<PatientFull | null>(null);
  readonly query = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] });
  readonly results = signal<PatientSearchResult[]>([]);
  readonly searching = signal(false);
  readonly loading = signal(false);
  readonly searched = signal(false);
  readonly error = signal('');
  readonly display = (p: PatientFull) => fullName(p) || 'Patient';

  search(): void {
    if (this.query.invalid) return;
    this.searching.set(true);
    this.error.set('');
    this.results.set([]);
    this.api.searchPatients(this.query.value.trim(), 0, 20).subscribe({
      next: (r) => { this.results.set(r.results ?? []); this.searched.set(true); this.searching.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Patient search failed.')); this.searching.set(false); },
    });
  }

  choose(r: PatientSearchResult): void {
    this.loading.set(true);
    this.error.set('');
    this.api.patientById(r.patientId).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (!res.data?.registrationNumber) { this.error.set('This patient has no registration number.'); return; }
        this.patient.set(res.data);
        this.results.set([]);
        this.query.reset('');
        this.searched.set(false);
      },
      error: (e: unknown) => { this.loading.set(false); this.error.set(errorMessage(e, 'Could not load the patient.')); },
    });
  }
}
