import { DatePipe } from '@angular/common';
import { Component, effect, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { LatestVitals, TrendResponse, VitalsRequest } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { inject } from '@angular/core';
import { Spark } from '../shared/ui';

const num = () => new FormControl<number | null>(null, { validators: [Validators.min(0)] });

@Component({
  selector: 'app-vitals-panel',
  imports: [DatePipe, ReactiveFormsModule, Spark],
  template: `
  <div class="two-col">
    <section class="panel-block">
      <h2>Latest vitals</h2>
      @if (latest()?.vitals; as v) {
        <dl class="kv">
          <dt>Recorded</dt><dd>{{ v.recordedAt | date: 'd MMM, HH:mm' }} @if (v.recordedBy) { by {{ v.recordedBy }} }</dd>
          <dt>Temperature</dt><dd>{{ show(v.temperatureC, '°C') }}</dd>
          <dt>Blood pressure</dt><dd>{{ v.systolicMmHg ?? '—' }}/{{ v.diastolicMmHg ?? '—' }} mmHg</dd>
          <dt>Pulse</dt><dd>{{ show(v.pulseBpm, 'bpm') }}</dd>
          <dt>SpO₂</dt><dd>{{ show(v.spo2Percent, '%') }}</dd>
          <dt>Weight</dt><dd>{{ show(v.weightKg, 'kg') }}</dd>
          <dt>Height</dt><dd>{{ show(v.heightCm, 'cm') }}</dd>
        </dl>
        @if (v.abnormalFlags?.length) { <p style="margin-top:10px">@for (f of v.abnormalFlags; track f) { <span class="pill pill-red" style="margin-right:6px">{{ f }}</span> }</p> }
        @if (v.assessmentNote) { <p class="note">{{ v.assessmentNote }}</p> }
      } @else { <p class="muted">{{ latest()?.message || (loading() ? 'Loading…' : 'No vitals recorded yet.') }}</p> }
    </section>

    <section class="panel-block">
      <h2>Record vitals</h2>
      @if (!checkInId()) {
        <p class="muted">Vitals are recorded against an active check-in. The visit ID must be returned by the patient’s check-in details before this form can be used.</p>
      } @else {
        <form class="grid-form compact" [formGroup]="form" (ngSubmit)="save(false)">
          <label>Temp (°C)<input type="number" step="0.1" formControlName="temperatureC" /></label>
          <label>Pulse (bpm)<input type="number" formControlName="pulseBpm" /></label>
          <label>SpO₂ (%)<input type="number" formControlName="spo2Percent" /></label>
          <label>Systolic<input type="number" formControlName="systolicMmHg" /></label>
          <label>Diastolic<input type="number" formControlName="diastolicMmHg" /></label>
          <label>Weight (kg)<input type="number" step="0.1" formControlName="weightKg" /></label>
          <label>Height (cm)<input type="number" step="0.1" formControlName="heightCm" /></label>
          <div class="wide actions"><button class="mini" type="submit" [disabled]="busy() || form.invalid">{{ busy() ? 'Saving…' : 'Save vitals' }}</button></div>
        </form>
        @if (warnings().length) {
          <div class="notice warn" role="alert">
            <b>Some values look out of range:</b>
            <ul>@for (w of warnings(); track w) { <li>{{ w }}</li> }</ul>
            <button class="mini" type="button" (click)="save(true)" [disabled]="busy()">Values are correct — save anyway</button>
          </div>
        }
        @if (message()) { <p class="notice" role="status">{{ message() }}</p> }
        @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
      }
    </section>
  </div>

  <section class="panel-block" style="margin-top:16px">
    <h2>Trend</h2>
    @if (loadError()) {
      <p class="form-alert" role="alert">{{ loadError() }}</p>
    } @else if (trend(); as t) {
      @if (!t.readingCount) { <p class="muted">{{ t.message || 'No readings in this period.' }}</p> }
      @else {
        <div class="spark-row" style="margin-top:0">
          <app-spark label="Temperature" unit="°C" [values]="values(t.temperature)" />
          <app-spark label="Pulse" unit="bpm" [values]="values(t.pulse)" />
          <app-spark label="SpO₂" unit="%" [values]="values(t.spo2)" />
          <app-spark label="Systolic" unit="mmHg" [values]="systolic(t)" />
          <app-spark label="Weight" unit="kg" [values]="values(t.weight)" />
        </div>
        @if (t.bloodPressure?.length) {
          <div class="table-wrap"><table>
            <thead><tr><th>Recorded</th><th>Blood pressure</th><th>Flags</th></tr></thead>
            <tbody>@for (b of t.bloodPressure; track b.recordedAt) {
              <tr><td>{{ b.recordedAt | date: 'd MMM, HH:mm' }}</td><td>{{ b.systolicMmHg }}/{{ b.diastolicMmHg }}</td>
                <td>@if (b.abnormal) { <span class="pill pill-red">{{ b.flags?.join(', ') || 'Abnormal' }}</span> } @else { <span class="pill pill-green">Normal</span> }</td></tr>
            }</tbody></table></div>
        }
      }
    }
  </section>`,
})
export class VitalsPanel {
  private readonly api = inject(HmsApi);
  readonly reg = input.required<string>();
  readonly checkInId = input<number | null>(null);

  readonly latest = signal<LatestVitals | null>(null);
  readonly trend = signal<TrendResponse | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly message = signal('');
  readonly warnings = signal<string[]>([]);

  readonly form = new FormGroup({
    temperatureC: num(), pulseBpm: num(), spo2Percent: num(), systolicMmHg: num(),
    diastolicMmHg: num(), weightKg: num(), heightCm: num(),
  });

  constructor() {
    effect(() => { const r = this.reg(); if (r) this.load(r); });
  }

  show(v: number | undefined, unit: string): string {
    return v === undefined || v === null ? '—' : `${v} ${unit}`;
  }
  values(points?: { value: number }[]): number[] {
    return (points ?? []).map((p) => p.value);
  }
  systolic(t: TrendResponse): number[] {
    return (t.bloodPressure ?? []).map((p) => p.systolicMmHg);
  }

  private load(reg: string): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.latestVitals(reg).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (r) => this.latest.set(r),
      error: (e: unknown) => this.latest.set({ found: false, message: errorMessage(e, 'Latest vitals could not be loaded.') }),
    });
    this.api.vitalsTrend(reg).subscribe({
      next: (r) => this.trend.set(r),
      error: (e: unknown) => {
        this.trend.set(null);
        this.loadError.set(errorMessage(e, 'Vitals trend could not be loaded.'));
      },
    });
  }

  save(confirm: boolean): void {
    const id = this.checkInId();
    if (!id) return;
    const raw = this.form.getRawValue();
    const body: VitalsRequest = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null)) as VitalsRequest;
    if (!Object.keys(body).length) { this.error.set('Enter at least one measurement.'); return; }
    if (confirm) body.confirmOutOfRange = true;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    this.api.recordVitals(id, body).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (r.recorded) {
          this.warnings.set([]);
          this.message.set(r.message || 'Vitals recorded.');
          this.form.reset();
          this.load(this.reg());
        } else if (r.warnings?.length) {
          this.warnings.set(r.warnings);
        } else {
          this.error.set(r.message || 'Vitals were not recorded.');
        }
      },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Vitals could not be saved.')); this.busy.set(false); },
    });
  }
}
