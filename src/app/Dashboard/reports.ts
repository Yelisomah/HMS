import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../Auth/auth.service';
import { MOCKED_MODULES } from '../core/api/api.config';
import { CURRENCY } from '../core/api/billing-math';
import { downloadCsv, toCsv } from '../core/api/csv';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { KpiFormat, ReportResponse, ReportType } from '../core/api/hospital.models';

interface ReportDef { type: ReportType; label: string; hint: string; roles: string[]; dated: boolean }
const REPORTS: ReportDef[] = [
  { type: 'admissions', label: 'Admissions', hint: 'Admissions, discharges and length of stay', roles: ['ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE'], dated: true },
  { type: 'occupancy', label: 'Bed occupancy', hint: 'Current beds by ward and status', roles: ['ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE'], dated: false },
  { type: 'appointments', label: 'Appointments', hint: 'Bookings, cancellations and no-shows by doctor', roles: ['ADMIN', 'DOCTOR', 'PHYSICIAN', 'NURSE'], dated: true },
  { type: 'pharmacy', label: 'Pharmacy', hint: 'Dispensing volume and stock position', roles: ['ADMIN', 'PHARMACIST'], dated: true },
  { type: 'laboratory', label: 'Laboratory', hint: 'Orders, abnormal rates and turnaround', roles: ['ADMIN', 'LAB_TECHNICIAN', 'DOCTOR', 'PHYSICIAN'], dated: true },
  { type: 'revenue', label: 'Revenue', hint: 'Invoiced, collected and outstanding amounts', roles: ['ADMIN'], dated: true },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

@Component({
  selector: 'app-reports',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Reports</h1>
        <p class="dashboard-intro">Operational summaries for a chosen period. Export any table as CSV.</p>
      </div>
    </div>

    @if (mocked) {
      <p class="notice warn" role="status">
        Preview mode: the report endpoints are not live yet. Figures are calculated from the temporary in-memory
        data created in this session, so they start empty and reset on reload.
      </p>
    }

    <div class="tabs" role="tablist" aria-label="Report">
      @for (r of available(); track r.type) {
        <button type="button" role="tab" [class.on]="selected() === r.type" [attr.aria-selected]="selected() === r.type" (click)="select(r.type)">{{ r.label }}</button>
      }
    </div>

    @if (current(); as def) {
      <p class="muted">{{ def.hint }}</p>
      <form class="form-row" [formGroup]="range" (ngSubmit)="run()">
        @if (def.dated) {
          <label>From<input type="date" formControlName="from" [max]="today" /></label>
          <label>To<input type="date" formControlName="to" [max]="today" /></label>
          <button class="mini ghost" type="button" (click)="preset(7)">Last 7 days</button>
          <button class="mini ghost" type="button" (click)="preset(30)">Last 30 days</button>
          <button class="mini ghost" type="button" (click)="monthToDate()">This month</button>
        }
        <button class="mini" type="submit" [disabled]="loading() || range.invalid">{{ loading() ? 'Running…' : 'Run report' }}</button>
      </form>
    } @else { <p class="form-alert" role="alert">Your role does not have access to any reports.</p> }

    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
    @if (loading() && !report()) { <p class="loading-message" role="status">Building report…</p> }

    @if (report(); as r) {
      <p class="muted">
        @if (current()?.dated) { {{ r.from | date: 'd MMM y' }} – {{ r.to | date: 'd MMM y' }} · }
        Generated {{ r.generatedAt | date: 'd MMM y, HH:mm' }}
      </p>

      <div class="stat-grid">
        @for (k of r.kpis; track k.label) {
          <div class="stat-card"><span class="stat-label">{{ k.label }}</span><strong>{{ kpi(k.value, k.format) }}</strong></div>
        }
      </div>

      @if (chart(); as c) {
        <section class="panel-block">
          <h2>{{ c.title }}</h2>
          @if (!c.hasData) { <p class="muted">No data in this period.</p> }
          @else {
            <svg class="report-chart" [attr.viewBox]="'0 0 ' + c.w + ' ' + c.h" role="img" [attr.aria-label]="c.title">
              <line [attr.x1]="c.left" [attr.y1]="c.base" [attr.x2]="c.w" [attr.y2]="c.base" stroke="#c9d6d4" />
              <text [attr.x]="c.left - 6" y="14" text-anchor="end" font-size="11" fill="#5b6f6c">{{ c.max }}</text>
              <text [attr.x]="c.left - 6" [attr.y]="c.base" text-anchor="end" font-size="11" fill="#5b6f6c">0</text>
              @for (b of c.bars; track $index) {
                <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.width" [attr.height]="b.height" [attr.fill]="b.color" rx="2"><title>{{ b.title }}</title></rect>
              }
              @for (l of c.ticks; track l.x) {
                <text [attr.x]="l.x" [attr.y]="c.h - 6" text-anchor="middle" font-size="11" fill="#5b6f6c">{{ l.text }}</text>
              }
            </svg>
            <p class="legend">
              @for (s of c.series; track s.name) { <span><i class="swatch" [style.background]="s.color"></i>{{ s.name }}</span> }
            </p>
          }
        </section>
      }

      <section class="panel-block">
        <div class="section-head">
          <h2>{{ r.table.title || 'Details' }}</h2>
          <button class="mini ghost" type="button" [disabled]="!r.table.rows.length" (click)="exportCsv(r)">Export CSV</button>
        </div>
        @if (!r.table.rows.length) { <p class="muted">No rows for this period.</p> }
        @else {
          <div class="table-wrap"><table>
            <thead><tr>@for (col of r.table.columns; track $index) { <th>{{ col }}</th> }</tr></thead>
            <tbody>@for (row of r.table.rows; track $index) { <tr>@for (cell of row; track $index) { <td>{{ cell ?? '—' }}</td> }</tr> }</tbody>
          </table></div>
        }
      </section>
    }
  </section>`,
  styles: [`
    .report-chart{width:100%;max-height:260px}
    .legend{display:flex;gap:16px;flex-wrap:wrap;margin:8px 0 0;color:var(--muted);font-size:13px}
    .swatch{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
  `],
})
export class Reports implements OnInit {
  private readonly api = inject(HmsApi);
  private readonly auth = inject(AuthService);

  readonly mocked = MOCKED_MODULES.reports;
  readonly today = iso(new Date());
  readonly available = computed(() => REPORTS.filter((r) => this.auth.hasAnyRole(...r.roles)));
  readonly selected = signal<ReportType | null>(null);
  readonly current = computed(() => this.available().find((r) => r.type === this.selected()) ?? null);
  readonly report = signal<ReportResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly range = new FormGroup({
    from: new FormControl(daysAgo(6), { nonNullable: true, validators: [Validators.required] }),
    to: new FormControl(iso(new Date()), { nonNullable: true, validators: [Validators.required] }),
  });

  readonly chart = computed(() => {
    const c = this.report()?.chart;
    if (!c) return null;
    const colors = ['#1b7f79', '#c98a1b'];
    const w = 600, h = 230, left = 36, base = 190, top = 16;
    const max = Math.max(1, ...c.series.flatMap((s) => s.values));
    const groups = c.labels.length;
    const slot = (w - left) / Math.max(groups, 1);
    const barW = Math.max(2, Math.min(28, (slot * 0.8) / c.series.length));
    const bars = c.labels.flatMap((label, g) => c.series.map((s, k) => {
      const v = s.values[g] ?? 0;
      const height = (v / max) * (base - top);
      return { x: left + g * slot + (slot - barW * c.series.length) / 2 + k * barW, y: base - height, width: barW, height, color: colors[k % colors.length], title: `${label} · ${s.name}: ${v}` };
    }));
    const step = Math.max(1, Math.ceil(groups / 6));
    const ticks = c.labels.map((text, g) => ({ text: text.length === 10 ? text.slice(5) : text, x: left + g * slot + slot / 2 })).filter((_, g) => g % step === 0);
    return { title: c.title, w, h, left, base, max, bars, ticks, hasData: c.series.some((s) => s.values.some((v) => v > 0)),
      series: c.series.map((s, k) => ({ name: s.name, color: colors[k % colors.length] })) };
  });

  ngOnInit(): void {
    const first = this.available()[0];
    if (first) { this.selected.set(first.type); this.run(); }
  }

  select(type: ReportType): void { this.selected.set(type); this.report.set(null); this.run(); }
  preset(days: number): void { this.range.setValue({ from: daysAgo(days - 1), to: iso(new Date()) }); this.run(); }
  monthToDate(): void { const d = new Date(); this.range.setValue({ from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(d) }); this.run(); }

  kpi(value: number, format: KpiFormat = 'number'): string {
    switch (format) {
      case 'currency': return new Intl.NumberFormat('en-GH', { style: 'currency', currency: CURRENCY }).format(value);
      case 'percent': return `${value}%`;
      case 'days': return `${value} d`;
      case 'hours': return `${value} h`;
      default: return new Intl.NumberFormat().format(value);
    }
  }

  run(): void {
    const type = this.selected();
    if (!type || this.range.invalid) return;
    const { from, to } = this.range.getRawValue();
    if (from > to) { this.error.set('The start date must not be after the end date.'); return; }
    this.loading.set(true);
    this.error.set('');
    this.api.report(type, from, to).subscribe({
      next: (r) => { this.report.set(r); this.loading.set(false); },
      error: (e: unknown) => { this.report.set(null); this.error.set(errorMessage(e, 'The report could not be generated.')); this.loading.set(false); },
    });
  }

  exportCsv(r: ReportResponse): void {
    downloadCsv(`${r.type}-report_${r.from}_to_${r.to}.csv`, toCsv(r.table.columns, r.table.rows));
  }
}
