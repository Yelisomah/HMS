import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { PatientSearchResponse } from '../core/api/api.models';

@Component({
  selector: 'app-patients',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div><p class="eyebrow">Hospital workspace</p><h1>Patients</h1><p class="dashboard-intro">Search by name or phone number, or jump straight to a registration number.</p></div>
      <a class="primary-button inline-button" routerLink="/app/patients/new">Register patient</a>
    </div>

    <div class="toolbar">
      <form class="form-row" (submit)="$event.preventDefault(); search(0)">
        <label>Name or phone<input type="search" [formControl]="query" placeholder="Search patients" /></label>
        <button class="mini" type="submit" [disabled]="loading()">Search</button>
      </form>
      <form class="form-row" (submit)="$event.preventDefault(); openReg()">
        <label>Registration number<input [formControl]="reg" placeholder="Open by number" /></label>
        <button class="mini" type="submit" [disabled]="!reg.value.trim()">Open</button>
      </form>
    </div>

    @if (loading()) {
      <p class="loading-message" role="status">Searching…</p>
    } @else if (error()) {
      <div class="form-alert dashboard-alert" role="alert">{{ error() }}</div>
    } @else if (result(); as r) {
      @if (!r.results?.length) {
        <div class="panel-card empty-state"><p>{{ r.message || 'No patients matched your search.' }}</p>
          @if (r.suggestedAction) { <p class="muted">{{ r.suggestedAction }}</p> }</div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Patient</th><th>Date of birth</th><th>Phone</th></tr></thead>
            <tbody>
              @for (p of r.results; track p.patientId) {
                <tr>
                  <td><a class="cell-link" [routerLink]="['/app/patients', p.patientId]">{{ p.fullName }}</a></td>
                  <td>{{ p.dateOfBirth || '—' }}</td>
                  <td>{{ p.phoneNumber || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="pager">
          <button class="mini ghost-btn" type="button" [disabled]="r.page <= 0" (click)="search(r.page - 1)">← Previous</button>
          <span class="muted">Page {{ r.page + 1 }} of {{ r.totalPages || 1 }} · {{ r.totalMatches }} match{{ r.totalMatches === 1 ? '' : 'es' }}</span>
          <button class="mini ghost-btn" type="button" [disabled]="r.page + 1 >= r.totalPages" (click)="search(r.page + 1)">Next →</button>
        </div>
      }
    }
  </section>`,
})
export class Patients {
  private readonly api = inject(HmsApi);
  private readonly router = inject(Router);
  readonly query = new FormControl('', { nonNullable: true });
  readonly reg = new FormControl('', { nonNullable: true });
  readonly result = signal<PatientSearchResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() { this.search(0); }

  search(page: number): void {
    this.loading.set(true);
    this.error.set('');
    this.api.searchPatients(this.query.value.trim(), page).subscribe({
      next: (r) => { this.result.set(r); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  openReg(): void {
    void this.router.navigate(['/app/patients', this.reg.value.trim()], { queryParams: { by: 'reg' } });
  }
}
