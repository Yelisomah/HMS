import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { MOCKED_MODULES } from '../core/api/api.config';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { Admission, Bed, BedStatus, Ward } from '../core/api/hospital.models';
import { pretty } from '../shared/ui';

type Filter = 'ALL' | BedStatus;
const FILTERS: Filter[] = ['ALL', 'AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'];

@Component({
  selector: 'app-wards',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Wards and beds</h1>
        <p class="dashboard-intro">Live bed board. Select a bed to release it after cleaning or take it out of service.</p>
      </div>
      <button class="mini ghost" type="button" (click)="reload()" [disabled]="loading()">Refresh</button>
    </div>

    @if (mocked) {
      <p class="notice warn" role="status">
        Preview mode: the ward and bed endpoints are not live yet, so this page uses temporary in-memory data
        that resets on reload.
      </p>
    }

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-label">Total beds</span><strong>{{ count('ALL') }}</strong></div>
      <div class="stat-card"><span class="stat-label">Available</span><strong>{{ count('AVAILABLE') }}</strong></div>
      <div class="stat-card"><span class="stat-label">Occupied</span><strong>{{ count('OCCUPIED') }}</strong></div>
      <div class="stat-card"><span class="stat-label">Occupancy</span><strong>{{ occupancy() }}%</strong></div>
    </div>

    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }

    <div class="tabs" role="tablist" aria-label="Filter beds by status">
      @for (f of filters; track f) {
        <button type="button" role="tab" [class.on]="filter() === f" [attr.aria-selected]="filter() === f" (click)="filter.set(f)">
          {{ f === 'ALL' ? 'All' : label(f) }} ({{ count(f) }})
        </button>
      }
    </div>

    @if (loading()) { <p class="loading-message" role="status">Loading wards…</p> }
    @else if (!wards().length) { <p class="muted">No wards have been set up yet.</p> }

    @for (w of visibleWards(); track w.id) {
      <h2 class="ward-title">{{ w.name }}
        <small>{{ occupiedIn(w) }} of {{ w.beds?.length ?? 0 }} occupied @if (w.type) { · {{ label(w.type) }} }</small>
      </h2>
      @if (!w.beds?.length) { <p class="muted">No beds match this filter.</p> }
      <div class="bed-grid">
        @for (b of w.beds; track b.id) {
          <button type="button" class="bed {{ tone(b.status) }}" [attr.aria-pressed]="selected()?.id === b.id" (click)="select(b)">
            <b>{{ b.label }}</b>
            <span>{{ label(b.status) }}</span>
            @if (b.status === 'OCCUPIED') { <small>{{ patientFor(b) }}</small> }
          </button>
        }
      </div>
      @if (selected(); as b) {
        @if (b.wardId === w.id) {
          <section class="panel-block" aria-live="polite">
            <h2>Bed {{ b.label }} · {{ label(b.status) }}</h2>
            @if (b.status === 'OCCUPIED') {
              <p>Occupied by <a class="cell-link" [routerLink]="['/app/patients', patientReg(b)]">{{ patientFor(b) }}</a>.
                Transfer or discharge the patient from <a class="cell-link" routerLink="/app/admissions">Admissions</a> to free this bed.</p>
            } @else if (canManage()) {
              <div class="actions">
                @if (b.status !== 'AVAILABLE') {
                  <button class="mini" type="button" [disabled]="busy()" (click)="setStatus(b, 'AVAILABLE')">
                    {{ b.status === 'CLEANING' ? 'Mark clean · release bed' : 'Return to service' }}
                  </button>
                }
                @if (b.status === 'AVAILABLE') {
                  <button class="mini ghost" type="button" [disabled]="busy()" (click)="setStatus(b, 'CLEANING')">Send for cleaning</button>
                }
                @if (b.status !== 'MAINTENANCE') {
                  <button class="mini ghost" type="button" [disabled]="busy()" (click)="setStatus(b, 'MAINTENANCE')">Out of service</button>
                }
              </div>
            } @else { <p class="muted">Your role can view beds but not change their status.</p> }
          </section>
        }
      }
    }

    @if (isAdmin()) {
      <section class="panel-block">
        <h2>Set up wards and beds</h2>
        <form class="form-row" [formGroup]="wardForm" (ngSubmit)="addWard()">
          <label>Ward name *<input formControlName="name" maxlength="100" /></label>
          <label>Type
            <select formControlName="type">
              @for (t of wardTypes; track t) { <option [value]="t">{{ label(t) }}</option> }
            </select>
          </label>
          <label>Bed prefix<input formControlName="bedPrefix" maxlength="3" placeholder="e.g. M" /></label>
          <label>Starting beds<input type="number" min="0" max="50" formControlName="bedCount" /></label>
          <button class="mini" type="submit" [disabled]="wardForm.invalid || busy()">Add ward</button>
        </form>
        @if (wards().length) {
          <form class="form-row" [formGroup]="bedForm" (ngSubmit)="addBed()">
            <label>Ward
              <select formControlName="wardId">
                <option value="">Choose a ward…</option>
                @for (w of wards(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
              </select>
            </label>
            <label>New bed label *<input formControlName="label" maxlength="20" /></label>
            <button class="mini" type="submit" [disabled]="bedForm.invalid || busy()">Add bed</button>
          </form>
        }
        @if (formError()) { <p class="form-alert" role="alert">{{ formError() }}</p> }
      </section>
    }
  </section>`,
})
export class Wards implements OnInit {
  private readonly api = inject(HmsApi);
  private readonly auth = inject(AuthService);

  readonly mocked = MOCKED_MODULES.wards || MOCKED_MODULES.admissions;
  readonly filters = FILTERS;
  readonly wardTypes = ['GENERAL', 'SURGICAL', 'MATERNITY', 'PAEDIATRIC', 'ICU'];
  readonly isAdmin = computed(() => this.auth.hasAnyRole('ADMIN'));
  readonly canManage = computed(() => this.auth.hasAnyRole('ADMIN', 'NURSE'));

  readonly wards = signal<Ward[]>([]);
  readonly admissions = signal<Admission[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly formError = signal('');
  readonly filter = signal<Filter>('ALL');
  readonly selected = signal<Bed | null>(null);

  private readonly allBeds = computed(() => this.wards().flatMap((w) => w.beds ?? []));
  readonly occupancy = computed(() => {
    const total = this.allBeds().filter((b) => b.status !== 'MAINTENANCE').length;
    return total ? Math.round((this.allBeds().filter((b) => b.status === 'OCCUPIED').length / total) * 100) : 0;
  });
  readonly visibleWards = computed(() => {
    const f = this.filter();
    return this.wards().map((w) => ({ ...w, beds: (w.beds ?? []).filter((b) => f === 'ALL' || b.status === f) }));
  });

  readonly wardForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    type: new FormControl('GENERAL', { nonNullable: true }),
    bedPrefix: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(3)] }),
    bedCount: new FormControl(0, { nonNullable: true, validators: [Validators.min(0), Validators.max(50)] }),
  });
  readonly bedForm = new FormGroup({
    wardId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    label: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(20)] }),
  });

  ngOnInit(): void { this.reload(); }

  label = (v?: string) => pretty(v);
  tone = (s: BedStatus) => ({ AVAILABLE: 'bed-ok', OCCUPIED: 'bed-red', CLEANING: 'bed-amber', MAINTENANCE: 'bed-free' })[s];
  count = (f: Filter) => this.allBeds().filter((b) => f === 'ALL' || b.status === f).length;
  occupiedIn = (w: Ward) => (this.wards().find((x) => x.id === w.id)?.beds ?? []).filter((b) => b.status === 'OCCUPIED').length;
  private admissionFor = (b: Bed) => this.admissions().find((a) => a.id === b.admissionId || a.bedId === b.id);
  patientFor = (b: Bed) => this.admissionFor(b)?.patientName ?? 'Patient';
  patientReg = (b: Bed) => this.admissionFor(b)?.registrationNumber ?? '';

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    let pending = 2;
    const done = () => { if (--pending === 0) this.loading.set(false); };
    this.api.wards().subscribe({
      next: (w) => {
        this.wards.set(w);
        const sel = this.selected();
        this.selected.set(sel ? (w.flatMap((x) => x.beds ?? []).find((b) => b.id === sel.id) ?? null) : null);
        done();
      },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not load wards.')); done(); },
    });
    this.api.admissions({ status: 'ADMITTED', size: 200 }).subscribe({
      next: (r) => { this.admissions.set(r.content ?? []); done(); },
      error: () => { this.admissions.set([]); done(); },
    });
  }

  select(b: Bed): void { this.selected.set(this.selected()?.id === b.id ? null : b); this.notice.set(''); }

  setStatus(b: Bed, status: BedStatus): void {
    this.busy.set(true);
    this.error.set('');
    this.api.setBedStatus(b.id, status).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`Bed ${b.label} is now ${this.label(status).toLowerCase()}.`); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.error.set(errorMessage(e, 'Could not change the bed status.')); },
    });
  }

  addWard(): void {
    if (this.wardForm.invalid) return;
    const v = this.wardForm.getRawValue();
    this.busy.set(true);
    this.formError.set('');
    this.api.createWard({ name: v.name.trim(), type: v.type, bedPrefix: v.bedPrefix.trim() || undefined, bedCount: v.bedCount || undefined }).subscribe({
      next: (w) => { this.busy.set(false); this.notice.set(`Ward "${w.name}" was added.`); this.wardForm.reset({ name: '', type: 'GENERAL', bedPrefix: '', bedCount: 0 }); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.formError.set(errorMessage(e, 'Could not add the ward.')); },
    });
  }

  addBed(): void {
    if (this.bedForm.invalid) return;
    const v = this.bedForm.getRawValue();
    this.busy.set(true);
    this.formError.set('');
    this.api.addBed(v.wardId, { label: v.label.trim() }).subscribe({
      next: (b) => { this.busy.set(false); this.notice.set(`Bed ${b.label} was added.`); this.bedForm.controls.label.reset(''); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.formError.set(errorMessage(e, 'Could not add the bed.')); },
    });
  }
}
