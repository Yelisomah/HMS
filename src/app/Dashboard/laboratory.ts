import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { MOCKED_MODULES } from '../core/api/api.config';
import { PatientFull } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { LabFlag, LabOrder, LabOrderStatus, LabOrderTest, LabPriority, LabTest } from '../core/api/hospital.models';
import { computeFlag } from '../core/api/lab-flags';
import { PatientPicker } from '../shared/patient-picker';
import { pretty } from '../shared/ui';

type Tab = 'orders' | 'request' | 'patient';
type ResultRow = FormGroup<{ value: FormControl<string>; critical: FormControl<boolean>; comment: FormControl<string> }>;
type StatusFilter = 'OPEN' | 'ALL' | LabOrderStatus;

const PRIORITIES: LabPriority[] = ['ROUTINE', 'URGENT', 'STAT'];
const PRIORITY_RANK: Record<LabPriority, number> = { STAT: 0, URGENT: 1, ROUTINE: 2 };
const STATUS_PILL: Record<LabOrderStatus, string> = { REQUESTED: 'pill-amber', COLLECTED: 'pill-blue', COMPLETED: 'pill-green', CANCELLED: 'pill-red' };
const PRIORITY_PILL: Record<LabPriority, string> = { ROUTINE: 'pill-blue', URGENT: 'pill-amber', STAT: 'pill-red' };
const FLAG_PILL: Record<LabFlag, string> = { NORMAL: 'pill-green', LOW: 'pill-amber', HIGH: 'pill-amber', ABNORMAL: 'pill-amber', CRITICAL: 'pill-red' };

@Component({
  selector: 'app-laboratory',
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, RouterLink, PatientPicker],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Laboratory</h1>
        <p class="dashboard-intro">Request tests, collect specimens, enter results and review them against reference ranges.</p>
      </div>
      <button class="mini ghost" type="button" (click)="reload()" [disabled]="loading()">Refresh</button>
    </div>

    @if (mocked) {
      <p class="notice warn" role="status">
        Preview mode: the laboratory endpoints are not live yet, so this page uses temporary in-memory data that
        resets on reload. Patient search is real.
      </p>
    }

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-label">Awaiting collection</span><strong>{{ countStatus('REQUESTED') }}</strong></div>
      <div class="stat-card"><span class="stat-label">Awaiting results</span><strong>{{ countStatus('COLLECTED') }}</strong></div>
      <div class="stat-card"><span class="stat-label">Urgent / STAT open</span><strong>{{ urgentOpen() }}</strong></div>
      <div class="stat-card"><span class="stat-label">Abnormal results</span><strong>{{ abnormalCount() }}</strong></div>
    </div>

    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }

    <div class="tabs" role="tablist">
      <button type="button" role="tab" [class.on]="tab() === 'orders'" (click)="tab.set('orders')">Work queue</button>
      @if (canRequest()) { <button type="button" role="tab" [class.on]="tab() === 'request'" (click)="tab.set('request')">Request tests</button> }
      <button type="button" role="tab" [class.on]="tab() === 'patient'" (click)="tab.set('patient')">Patient results</button>
    </div>

    <ng-template #orderCard let-o let-actions="actions">
      <article class="plan">
        <b>
          <a class="cell-link" [routerLink]="['/app/patients', o.registrationNumber]">{{ o.patientName }}</a>
          <span class="pill {{ statusPill(o.status) }}">{{ label(o.status) }}</span>
          <span class="pill {{ priorityPill(o.priority) }}">{{ label(o.priority) }}</span>
        </b>
        <span>{{ o.id }} · Reg. {{ o.registrationNumber }} · Requested {{ o.createdAt | date: 'd MMM y, HH:mm' }}@if (o.requestedByName) { · Dr. {{ o.requestedByName }} }</span>
        @if (o.clinicalNotes) { <span>Clinical notes: {{ o.clinicalNotes }}</span> }
        @if (o.collectedAt) { <span>Specimen collected {{ o.collectedAt | date: 'd MMM y, HH:mm' }}@if (o.collectionNote) { · {{ o.collectionNote }} }</span> }
        @if (o.cancelReason) { <span>Cancelled: {{ o.cancelReason }}</span> }
        <div class="table-wrap"><table>
          <thead><tr><th>Test</th><th>Specimen</th><th>Result</th><th>Reference</th></tr></thead>
          <tbody>@for (t of o.tests; track t.id) {
            <tr>
              <td>{{ t.testName }}</td><td>{{ t.specimen }}</td>
              <td>
                @if (t.status === 'RESULTED') {
                  <b>{{ t.resultType === 'NUMERIC' ? t.resultValue : t.resultText }}{{ t.unit ? ' ' + t.unit : '' }}</b>
                  @if (t.flag) { <span class="pill {{ flagPill(t.flag) }}">{{ label(t.flag) }}</span> }
                  @if (t.comment) { <br /><small>{{ t.comment }}</small> }
                } @else { <span class="muted">Pending</span> }
              </td>
              <td>{{ range(t) }}</td>
            </tr>
          }</tbody>
        </table></div>

        @if (actions) {
          @if (panel()?.id === o.id && panel()?.kind === 'collect') {
            <form class="stack" [formGroup]="collectForm" (ngSubmit)="collect(o)">
              <label>Collection note<input formControlName="note" maxlength="200" placeholder="e.g. haemolysed sample, 2 mL" /></label>
              @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
              <div class="actions">
                <button class="mini" type="submit" [disabled]="busy()">Confirm collected</button>
                <button class="mini ghost" type="button" (click)="closePanel()">Cancel</button>
              </div>
            </form>
          } @else if (panel()?.id === o.id && panel()?.kind === 'results') {
            <form class="stack" [formGroup]="resultsForm" (ngSubmit)="saveResults(o)">
              @for (row of rows.controls; track row; let n = $index) {
                <fieldset class="grid-form compact" [formGroup]="row">
                  <legend>{{ pending()[n].testName }} <small>{{ range(pending()[n]) }}</small></legend>
                  <label>Result{{ pending()[n].unit ? ' (' + pending()[n].unit + ')' : '' }}
                    @if (pending()[n].options) {
                      <select formControlName="value"><option value="">Not ready</option>@for (op of pending()[n].options; track op) { <option [value]="op">{{ op }}</option> }</select>
                    } @else if (pending()[n].resultType === 'NUMERIC') {
                      <input type="number" step="any" formControlName="value" />
                    } @else { <input formControlName="value" maxlength="300" /> }
                  </label>
                  <div>
                    @if (preview(n); as f) { <span class="pill {{ flagPill(f) }}">{{ label(f) }}</span> }
                    <label class="check"><input type="checkbox" formControlName="critical" /> Critical value</label>
                  </div>
                  <label class="wide">Comment<input formControlName="comment" maxlength="300" /></label>
                </fieldset>
              }
              @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
              <div class="actions">
                <button class="mini" type="submit" [disabled]="busy()">Save results</button>
                <button class="mini ghost" type="button" (click)="closePanel()">Cancel</button>
              </div>
            </form>
          } @else if (panel()?.id === o.id && panel()?.kind === 'cancel') {
            <form class="stack" [formGroup]="cancelForm" (ngSubmit)="cancelOrder(o)">
              <label>Reason *<input formControlName="reason" maxlength="300" /></label>
              @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
              <div class="actions">
                <button class="mini" type="submit" [disabled]="cancelForm.invalid || busy()">Cancel order</button>
                <button class="mini ghost" type="button" (click)="closePanel()">Keep it</button>
              </div>
            </form>
          } @else {
            <div class="actions">
              @if (o.status === 'REQUESTED' && canCollect()) { <button class="mini" type="button" (click)="openPanel(o, 'collect')">Mark collected</button> }
              @if (o.status === 'COLLECTED' && canProcess()) { <button class="mini" type="button" (click)="openResults(o)">Enter results</button> }
              @if ((o.status === 'REQUESTED' || o.status === 'COLLECTED') && (canProcess() || canRequest())) { <button class="mini ghost" type="button" (click)="openPanel(o, 'cancel')">Cancel order</button> }
            </div>
          }
        }
      </article>
    </ng-template>

    @if (loading()) { <p class="loading-message" role="status">Loading laboratory data…</p> }

    @if (tab() === 'orders') {
      <section class="panel-block">
        <div class="form-row">
          <label>Show
            <select [formControl]="statusFilter">
              <option value="OPEN">Open orders</option><option value="REQUESTED">Awaiting collection</option><option value="COLLECTED">Awaiting results</option>
              <option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option><option value="ALL">All</option>
            </select>
          </label>
        </div>
        @if (!loading() && !visibleOrders().length) { <p class="muted">No lab orders found.</p> }
        @for (o of visibleOrders(); track o.id) { <ng-container [ngTemplateOutlet]="orderCard" [ngTemplateOutletContext]="{ $implicit: o, actions: true }" /> }
      </section>
    }

    @if (tab() === 'request' && canRequest()) {
      <section class="panel-block">
        <h2>Request laboratory tests</h2>
        <app-patient-picker [(patient)]="patient" />
        <form class="stack" [formGroup]="requestForm" (ngSubmit)="request()">
          <label>Priority
            <select formControlName="priority">@for (p of priorities; track p) { <option [value]="p">{{ label(p) }}</option> }</select>
          </label>
          <fieldset>
            <legend>Tests * <span class="muted">({{ selectedTests().size }} selected)</span></legend>
            @for (g of testGroups(); track g.category) {
              <p class="muted">{{ label(g.category) }}</p>
              @for (t of g.tests; track t.id) {
                <label class="check"><input type="checkbox" [checked]="selectedTests().has(t.id)" (change)="toggleTest(t.id)" /> {{ t.name }} <small class="muted">· {{ t.specimen }}</small></label>
              }
            }
          </fieldset>
          <label>Clinical notes<textarea rows="2" formControlName="clinicalNotes" maxlength="500"></textarea></label>
          @if (formError()) { <p class="form-alert" role="alert">{{ formError() }}</p> }
          <div><button class="primary-button inline-button" type="submit" [disabled]="busy() || !patient() || !selectedTests().size">{{ busy() ? 'Sending…' : 'Send to laboratory' }}</button></div>
        </form>
      </section>
    }

    @if (tab() === 'patient') {
      <section class="panel-block">
        <h2>Results for a patient</h2>
        <app-patient-picker [patient]="viewPatient()" (patientChange)="loadPatientOrders($event)" />
        @if (patientLoading()) { <p class="loading-message" role="status">Loading results…</p> }
        @if (viewPatient() && !patientLoading() && !patientOrders().length) { <p class="muted">This patient has no lab orders.</p> }
        @for (o of patientOrders(); track o.id) { <ng-container [ngTemplateOutlet]="orderCard" [ngTemplateOutletContext]="{ $implicit: o, actions: false }" /> }
      </section>
    }
  </section>`,
})
export class Laboratory implements OnInit {
  private readonly api = inject(HmsApi);
  private readonly auth = inject(AuthService);

  readonly mocked = MOCKED_MODULES.lab;
  readonly priorities = PRIORITIES;
  readonly canRequest = computed(() => this.auth.hasAnyRole('ADMIN', 'DOCTOR', 'PHYSICIAN'));
  readonly canProcess = computed(() => this.auth.hasAnyRole('ADMIN', 'LAB_TECHNICIAN'));
  readonly canCollect = computed(() => this.auth.hasAnyRole('ADMIN', 'LAB_TECHNICIAN', 'NURSE'));

  readonly tab = signal<Tab>('orders');
  readonly orders = signal<LabOrder[]>([]);
  readonly tests = signal<LabTest[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly formError = signal('');
  readonly panelError = signal('');

  readonly statusFilter = new FormControl<StatusFilter>('OPEN', { nonNullable: true });
  private readonly statusSig = signal<StatusFilter>('OPEN');
  readonly visibleOrders = computed(() => {
    const f = this.statusSig();
    return this.orders()
      .filter((o) => (f === 'ALL' ? true : f === 'OPEN' ? o.status === 'REQUESTED' || o.status === 'COLLECTED' : o.status === f))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt));
  });
  readonly urgentOpen = computed(() => this.orders().filter((o) => (o.status === 'REQUESTED' || o.status === 'COLLECTED') && o.priority !== 'ROUTINE').length);
  readonly abnormalCount = computed(() => this.orders().filter((o) => o.status === 'COMPLETED' && o.tests.some((t) => t.flag && t.flag !== 'NORMAL')).length);
  readonly testGroups = computed(() => {
    const m = new Map<string, LabTest[]>();
    for (const t of this.tests()) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m].map(([category, tests]) => ({ category, tests }));
  });

  // request
  readonly patient = signal<PatientFull | null>(null);
  readonly selectedTests = signal<Set<string>>(new Set());
  readonly requestForm = new FormGroup({
    priority: new FormControl<LabPriority>('ROUTINE', { nonNullable: true }),
    clinicalNotes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  // panels
  readonly panel = signal<{ id: string; kind: 'collect' | 'results' | 'cancel' } | null>(null);
  readonly pending = signal<LabOrderTest[]>([]);
  readonly collectForm = new FormGroup({ note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }) });
  readonly cancelForm = new FormGroup({ reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(300)] }) });
  readonly resultsForm = new FormGroup({ rows: new FormArray<ResultRow>([]) });
  get rows(): FormArray<ResultRow> { return this.resultsForm.controls.rows; }

  // patient results
  readonly viewPatient = signal<PatientFull | null>(null);
  readonly patientOrders = signal<LabOrder[]>([]);
  readonly patientLoading = signal(false);

  ngOnInit(): void {
    if (!this.canRequest() && this.tab() === 'request') this.tab.set('orders');
    this.statusFilter.valueChanges.subscribe((v) => this.statusSig.set(v));
    this.api.labTests().subscribe({ next: (t) => this.tests.set(t), error: (e: unknown) => this.error.set(errorMessage(e, 'Could not load the test catalogue.')) });
    this.reload();
  }

  label = (v?: string) => pretty(v);
  statusPill = (s: LabOrderStatus) => STATUS_PILL[s];
  priorityPill = (p: LabPriority) => PRIORITY_PILL[p];
  flagPill = (f: LabFlag) => FLAG_PILL[f];
  countStatus = (s: LabOrderStatus) => this.orders().filter((o) => o.status === s).length;
  range(t: Pick<LabTest, 'resultType' | 'refLow' | 'refHigh' | 'unit' | 'options'>): string {
    if (t.resultType === 'NUMERIC') {
      if (t.refLow !== undefined && t.refHigh !== undefined) return `${t.refLow} – ${t.refHigh} ${t.unit ?? ''}`.trim();
      return t.unit ?? '—';
    }
    return t.options ? t.options.join(' / ') : '—';
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.labOrders().subscribe({
      next: (o) => { this.orders.set(o); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not load lab orders.')); this.loading.set(false); },
    });
  }

  toggleTest(id: string): void {
    const next = new Set(this.selectedTests());
    if (!next.delete(id)) next.add(id);
    this.selectedTests.set(next);
  }

  request(): void {
    const p = this.patient();
    if (!p?.registrationNumber || !this.selectedTests().size) return;
    const v = this.requestForm.getRawValue();
    this.busy.set(true);
    this.formError.set('');
    this.api.requestLab({ registrationNumber: p.registrationNumber, testIds: [...this.selectedTests()], priority: v.priority, clinicalNotes: v.clinicalNotes.trim() || undefined }).subscribe({
      next: (o) => {
        this.busy.set(false);
        this.notice.set(`Lab order ${o.id} sent for ${o.patientName}.`);
        this.patient.set(null);
        this.selectedTests.set(new Set());
        this.requestForm.reset({ priority: 'ROUTINE', clinicalNotes: '' });
        this.tab.set('orders');
        this.reload();
      },
      error: (e: unknown) => { this.busy.set(false); this.formError.set(errorMessage(e, 'The lab request could not be saved.')); },
    });
  }

  openPanel(o: LabOrder, kind: 'collect' | 'cancel'): void {
    this.panel.set({ id: o.id, kind });
    this.panelError.set('');
    this.collectForm.reset({ note: '' });
    this.cancelForm.reset({ reason: '' });
  }
  openResults(o: LabOrder): void {
    this.panel.set({ id: o.id, kind: 'results' });
    this.panelError.set('');
    const pending = o.tests.filter((t) => t.status === 'PENDING');
    this.pending.set(pending);
    this.rows.clear();
    for (const _ of pending) {
      this.rows.push(new FormGroup({
        value: new FormControl('', { nonNullable: true }),
        critical: new FormControl(false, { nonNullable: true }),
        comment: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(300)] }),
      }));
    }
  }
  closePanel(): void { this.panel.set(null); this.panelError.set(''); }

  preview(n: number): LabFlag | undefined {
    const t = this.pending()[n];
    const row = this.rows.at(n);
    return t && row ? computeFlag(t, row.controls.value.value, row.controls.critical.value) : undefined;
  }

  collect(o: LabOrder): void {
    this.busy.set(true);
    this.api.collectSpecimen(o.id, { collectionNote: this.collectForm.getRawValue().note.trim() || undefined }).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`Specimen recorded as collected for ${o.id}.`); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Could not update the order.')); },
    });
  }

  saveResults(o: LabOrder): void {
    const entries = this.pending().flatMap((t, n) => {
      const r = this.rows.at(n).getRawValue();
      const raw = r.value.trim();
      if (!raw) return [];
      return [{ orderTestId: t.id, resultValue: t.resultType === 'NUMERIC' ? Number(raw) : undefined, resultText: t.resultType === 'TEXT' ? raw : undefined, critical: r.critical || undefined, comment: r.comment.trim() || undefined }];
    });
    if (!entries.length) { this.panelError.set('Enter at least one result.'); return; }
    if (entries.some((e) => e.resultValue !== undefined && !Number.isFinite(e.resultValue))) { this.panelError.set('Numeric tests need a valid number.'); return; }
    this.busy.set(true);
    this.panelError.set('');
    this.api.enterLabResults(o.id, { results: entries }).subscribe({
      next: (u) => {
        this.busy.set(false);
        this.notice.set(u.status === 'COMPLETED' ? `All results recorded for ${u.id}.` : `Results saved for ${u.id}; some tests are still pending.`);
        this.closePanel();
        this.reload();
      },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Could not save the results.')); },
    });
  }

  cancelOrder(o: LabOrder): void {
    if (this.cancelForm.invalid) return;
    this.busy.set(true);
    this.api.cancelLabOrder(o.id, { reason: this.cancelForm.getRawValue().reason.trim() }).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`Lab order ${o.id} cancelled.`); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Could not cancel the order.')); },
    });
  }

  loadPatientOrders(p: PatientFull | null): void {
    this.viewPatient.set(p);
    this.patientOrders.set([]);
    if (!p?.registrationNumber) return;
    this.patientLoading.set(true);
    this.api.labOrders({ registrationNumber: p.registrationNumber }).subscribe({
      next: (o) => { this.patientOrders.set(o); this.patientLoading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not load this patient\'s results.')); this.patientLoading.set(false); },
    });
  }
}
