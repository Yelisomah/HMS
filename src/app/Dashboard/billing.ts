import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { MOCKED_MODULES } from '../core/api/api.config';
import { PatientFull } from '../core/api/api.models';
import { CURRENCY, invoiceTotals } from '../core/api/billing-math';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import {
  ChargeCategory, Invoice, InvoiceLineRequest, InvoiceStatus, PaymentMethod, PendingCharge,
} from '../core/api/hospital.models';
import { PatientPicker } from '../shared/patient-picker';
import { pretty } from '../shared/ui';

type Tab = 'invoices' | 'new';
type StatusFilter = 'OUTSTANDING' | 'ALL' | InvoiceStatus;

const CATEGORIES: ChargeCategory[] = ['CONSULTATION', 'ADMISSION', 'PHARMACY', 'LABORATORY', 'PROCEDURE', 'OTHER'];
const METHODS: PaymentMethod[] = ['CASH', 'MOBILE_MONEY', 'CARD', 'INSURANCE'];
const STATUS_PILL: Record<InvoiceStatus, string> = { ISSUED: 'pill-amber', PARTIALLY_PAID: 'pill-blue', PAID: 'pill-green', VOID: 'pill-red' };

@Component({
  selector: 'app-billing',
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink, PatientPicker],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Billing</h1>
        <p class="dashboard-intro">Invoice charges raised by consultations, admissions, pharmacy and the laboratory, and record payments.</p>
      </div>
      <button class="mini ghost" type="button" (click)="reload()" [disabled]="loading()">Refresh</button>
    </div>

    @if (mocked) {
      <p class="notice warn" role="status">
        Preview mode: the billing endpoints are not live yet, so this page uses temporary in-memory data that
        resets on reload. Prices shown are sample values. Patient search is real.
      </p>
    }

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-label">Outstanding balance</span><strong>{{ outstanding() | currency: currency }}</strong></div>
      <div class="stat-card"><span class="stat-label">Unpaid invoices</span><strong>{{ unpaidCount() }}</strong></div>
      <div class="stat-card"><span class="stat-label">Collected today</span><strong>{{ collectedToday() | currency: currency }}</strong></div>
    </div>

    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }

    <div class="tabs" role="tablist">
      <button type="button" role="tab" [class.on]="tab() === 'invoices'" (click)="tab.set('invoices')">Invoices</button>
      <button type="button" role="tab" [class.on]="tab() === 'new'" (click)="tab.set('new')">New invoice</button>
    </div>

    @if (loading()) { <p class="loading-message" role="status">Loading invoices…</p> }

    @if (tab() === 'invoices') {
      <section class="panel-block">
        <div class="form-row">
          <label>Show
            <select [formControl]="statusFilter">
              <option value="OUTSTANDING">Outstanding</option><option value="PAID">Paid</option><option value="VOID">Void</option><option value="ALL">All</option>
            </select>
          </label>
          <label>Search patient or invoice<input [formControl]="search" placeholder="Name, registration no. or INV-…" /></label>
        </div>
        @if (!loading() && !visible().length) { <p class="muted">No invoices found.</p> }
        @for (i of visible(); track i.id) {
          <article class="plan">
            <b>
              {{ i.invoiceNumber }} ·
              <a class="cell-link" [routerLink]="['/app/patients', i.registrationNumber]">{{ i.patientName }}</a>
              <span class="pill {{ pill(i.status) }}">{{ label(i.status) }}</span>
            </b>
            <span>Reg. {{ i.registrationNumber }} · {{ i.createdAt | date: 'd MMM y, HH:mm' }}@if (i.notes) { · {{ i.notes }} }</span>
            <div class="table-wrap"><table>
              <thead><tr><th>Description</th><th>Category</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
              <tbody>@for (l of i.lines; track l.id) {
                <tr><td>{{ l.description }}</td><td>{{ label(l.category) }}</td><td>{{ l.quantity }}</td>
                  <td>{{ l.unitPrice | currency: currency }}</td><td>{{ l.total | currency: currency }}</td></tr>
              }</tbody>
            </table></div>
            <span>Subtotal {{ i.subtotal | currency: currency }}@if (i.discount) { · Discount −{{ i.discount | currency: currency }} }
              · <b>Total {{ i.total | currency: currency }}</b> · Paid {{ i.amountPaid | currency: currency }}
              · <b>Balance {{ i.balance | currency: currency }}</b></span>
            @for (p of i.payments; track p.id) {
              <span>• {{ p.receivedAt | date: 'd MMM y, HH:mm' }} — {{ p.amount | currency: currency }} by {{ label(p.method) }}@if (p.reference) { (ref {{ p.reference }}) }</span>
            }
            @if (i.voidReason) { <span>Voided: {{ i.voidReason }}</span> }

            @if (panel()?.id === i.id && panel()?.kind === 'pay') {
              <form class="stack" [formGroup]="payForm" (ngSubmit)="pay(i)">
                <label>Amount ({{ currency }}) *<input type="number" step="0.01" min="0.01" [max]="i.balance" formControlName="amount" /></label>
                <label>Method
                  <select formControlName="method">@for (m of methods; track m) { <option [value]="m">{{ label(m) }}</option> }</select>
                </label>
                @if (payForm.controls.method.value !== 'CASH') { <label>Reference *<input formControlName="reference" maxlength="60" placeholder="Transaction or claim number" /></label> }
                @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
                <div class="actions">
                  <button class="mini" type="submit" [disabled]="busy()">Record payment</button>
                  <button class="mini ghost" type="button" (click)="closePanel()">Cancel</button>
                </div>
              </form>
            } @else if (panel()?.id === i.id && panel()?.kind === 'void') {
              <form class="stack" [formGroup]="voidForm" (ngSubmit)="voidInvoice(i)">
                <label>Reason *<input formControlName="reason" maxlength="300" /></label>
                @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
                <div class="actions">
                  <button class="mini" type="submit" [disabled]="voidForm.invalid || busy()">Void invoice</button>
                  <button class="mini ghost" type="button" (click)="closePanel()">Keep it</button>
                </div>
              </form>
            } @else if (i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID') {
              <div class="actions">
                <button class="mini" type="button" (click)="openPay(i)">Record payment</button>
                @if (i.status === 'ISSUED' && isAdmin()) { <button class="mini ghost" type="button" (click)="openVoid(i)">Void</button> }
              </div>
            }
          </article>
        }
      </section>
    }

    @if (tab() === 'new') {
      <section class="panel-block">
        <h2>Create an invoice</h2>
        <app-patient-picker [patient]="patient()" (patientChange)="onPatient($event)" />

        @if (patient()) {
          <h3>Charges awaiting invoice</h3>
          @if (chargesLoading()) { <p class="loading-message" role="status">Loading charges…</p> }
          @else if (!pending().length) { <p class="muted">No uninvoiced charges for this patient. You can add manual charges below.</p> }
          @else {
            <div class="table-wrap"><table>
              <thead><tr><th></th><th>Charge</th><th>Category</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
              <tbody>@for (c of pending(); track c.sourceId) {
                <tr>
                  <td><input type="checkbox" [checked]="selected().has(c.sourceId)" (change)="toggle(c.sourceId)" [attr.aria-label]="'Include ' + c.description" /></td>
                  <td>{{ c.description }}</td><td>{{ label(c.category) }}</td><td>{{ c.quantity }}</td>
                  <td>{{ c.unitPrice | currency: currency }}</td><td>{{ c.quantity * c.unitPrice | currency: currency }}</td>
                </tr>
              }</tbody>
            </table></div>
          }

          <h3>Manual charges</h3>
          <form class="form-row" [formGroup]="lineForm" (ngSubmit)="addLine()">
            <label>Description *<input formControlName="description" maxlength="150" /></label>
            <label>Category
              <select formControlName="category">@for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }</select>
            </label>
            <label>Qty *<input type="number" min="1" formControlName="quantity" /></label>
            <label>Unit price *<input type="number" min="0" step="0.01" formControlName="unitPrice" /></label>
            <button class="mini" type="submit" [disabled]="lineForm.invalid">Add</button>
          </form>
          @for (l of manual(); track $index) {
            <p>{{ l.description }} · {{ l.quantity }} × {{ l.unitPrice | currency: currency }}
              <button class="text-button" type="button" (click)="removeLine($index)">Remove</button></p>
          }

          <form class="stack" [formGroup]="invoiceForm" (ngSubmit)="create()">
            <label>Discount ({{ currency }})<input type="number" min="0" step="0.01" formControlName="discount" /></label>
            <label>Notes<input formControlName="notes" maxlength="300" /></label>
            <p><b>Subtotal {{ totals().subtotal | currency: currency }}</b> · Discount −{{ totals().discount | currency: currency }} ·
              <b>Total {{ totals().total | currency: currency }}</b></p>
            @if (formError()) { <p class="form-alert" role="alert">{{ formError() }}</p> }
            <div><button class="primary-button inline-button" type="submit" [disabled]="busy() || !lines().length || invoiceForm.invalid">{{ busy() ? 'Creating…' : 'Create invoice' }}</button></div>
          </form>
        }
      </section>
    }
  </section>`,
})
export class Billing implements OnInit {
  private readonly api = inject(HmsApi);
  private readonly auth = inject(AuthService);

  readonly mocked = MOCKED_MODULES.billing;
  readonly currency = CURRENCY;
  readonly categories = CATEGORIES;
  readonly methods = METHODS;
  readonly isAdmin = computed(() => this.auth.hasAnyRole('ADMIN'));

  readonly tab = signal<Tab>('invoices');
  readonly invoices = signal<Invoice[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly formError = signal('');
  readonly panelError = signal('');

  readonly statusFilter = new FormControl<StatusFilter>('OUTSTANDING', { nonNullable: true });
  readonly search = new FormControl('', { nonNullable: true });
  private readonly statusSig = signal<StatusFilter>('OUTSTANDING');
  private readonly searchSig = signal('');
  readonly visible = computed(() => {
    const f = this.statusSig();
    const q = this.searchSig().trim().toLowerCase();
    return this.invoices().filter((i) =>
      (f === 'ALL' ? true : f === 'OUTSTANDING' ? i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID' : i.status === f)
      && (!q || `${i.patientName} ${i.registrationNumber} ${i.invoiceNumber}`.toLowerCase().includes(q)));
  });
  readonly outstanding = computed(() => this.invoices().filter((i) => i.status !== 'VOID').reduce((s, i) => s + i.balance, 0));
  readonly unpaidCount = computed(() => this.invoices().filter((i) => i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID').length);
  readonly collectedToday = computed(() => {
    const today = new Date().toDateString();
    return this.invoices().flatMap((i) => i.payments).filter((p) => new Date(p.receivedAt).toDateString() === today).reduce((s, p) => s + p.amount, 0);
  });

  readonly panel = signal<{ id: string; kind: 'pay' | 'void' } | null>(null);
  readonly payForm = new FormGroup({
    amount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    method: new FormControl<PaymentMethod>('CASH', { nonNullable: true }),
    reference: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(60)] }),
  });
  readonly voidForm = new FormGroup({ reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(300)] }) });

  // new invoice
  readonly patient = signal<PatientFull | null>(null);
  readonly pending = signal<PendingCharge[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly chargesLoading = signal(false);
  readonly manual = signal<InvoiceLineRequest[]>([]);
  readonly lineForm = new FormGroup({
    description: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    category: new FormControl<ChargeCategory>('PROCEDURE', { nonNullable: true }),
    quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    unitPrice: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
  });
  readonly invoiceForm = new FormGroup({
    discount: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(300)] }),
  });
  private readonly discountSig = signal(0);
  readonly lines = computed<InvoiceLineRequest[]>(() => [
    ...this.pending().filter((c) => this.selected().has(c.sourceId)).map((c) => ({ description: c.description, category: c.category, quantity: c.quantity, unitPrice: c.unitPrice, sourceId: c.sourceId })),
    ...this.manual(),
  ]);
  readonly totals = computed(() => invoiceTotals({ lines: this.lines(), discount: this.discountSig() }));

  ngOnInit(): void {
    this.statusFilter.valueChanges.subscribe((v) => this.statusSig.set(v));
    this.search.valueChanges.subscribe((v) => this.searchSig.set(v));
    this.invoiceForm.controls.discount.valueChanges.subscribe((v) => this.discountSig.set(Number(v) || 0));
    this.reload();
  }

  label = (v?: string) => pretty(v);
  pill = (s: InvoiceStatus) => STATUS_PILL[s];

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.invoices().subscribe({
      next: (i) => { this.invoices.set(i); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not load invoices.')); this.loading.set(false); },
    });
  }

  openPay(i: Invoice): void { this.panel.set({ id: i.id, kind: 'pay' }); this.panelError.set(''); this.payForm.reset({ amount: i.balance, method: 'CASH', reference: '' }); }
  openVoid(i: Invoice): void { this.panel.set({ id: i.id, kind: 'void' }); this.panelError.set(''); this.voidForm.reset({ reason: '' }); }
  closePanel(): void { this.panel.set(null); this.panelError.set(''); }

  pay(i: Invoice): void {
    const v = this.payForm.getRawValue();
    if (this.payForm.invalid) { this.panelError.set('Enter a payment amount greater than zero.'); return; }
    if (v.amount > i.balance) { this.panelError.set(`The payment cannot exceed the balance of ${i.balance.toFixed(2)}.`); return; }
    if (v.method !== 'CASH' && !v.reference.trim()) { this.panelError.set('A reference is required for non-cash payments.'); return; }
    this.busy.set(true);
    this.panelError.set('');
    this.api.recordPayment(i.id, { amount: v.amount, method: v.method, reference: v.reference.trim() || undefined }).subscribe({
      next: (u) => { this.busy.set(false); this.notice.set(`Payment recorded on ${u.invoiceNumber}. Balance: ${u.balance.toFixed(2)} ${CURRENCY}.`); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Could not record the payment.')); },
    });
  }

  voidInvoice(i: Invoice): void {
    if (this.voidForm.invalid) return;
    this.busy.set(true);
    this.api.voidInvoice(i.id, { reason: this.voidForm.getRawValue().reason.trim() }).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`${i.invoiceNumber} voided.`); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Could not void the invoice.')); },
    });
  }

  onPatient(p: PatientFull | null): void {
    this.patient.set(p);
    this.pending.set([]);
    this.selected.set(new Set());
    this.manual.set([]);
    this.formError.set('');
    if (!p?.registrationNumber) return;
    this.chargesLoading.set(true);
    this.api.pendingCharges(p.registrationNumber).subscribe({
      next: (c) => { this.pending.set(c); this.selected.set(new Set(c.map((x) => x.sourceId))); this.chargesLoading.set(false); },
      error: (e: unknown) => { this.formError.set(errorMessage(e, 'Could not load this patient\'s charges.')); this.chargesLoading.set(false); },
    });
  }

  toggle(id: string): void {
    const next = new Set(this.selected());
    if (!next.delete(id)) next.add(id);
    this.selected.set(next);
  }

  addLine(): void {
    if (this.lineForm.invalid) return;
    const v = this.lineForm.getRawValue();
    this.manual.update((m) => [...m, { description: v.description.trim(), category: v.category, quantity: v.quantity, unitPrice: v.unitPrice }]);
    this.lineForm.reset({ description: '', category: 'PROCEDURE', quantity: 1, unitPrice: 0 });
  }
  removeLine(i: number): void { this.manual.update((m) => m.filter((_, n) => n !== i)); }

  create(): void {
    const p = this.patient();
    if (!p?.registrationNumber || !this.lines().length || this.invoiceForm.invalid) return;
    const v = this.invoiceForm.getRawValue();
    this.busy.set(true);
    this.formError.set('');
    this.api.createInvoice({ registrationNumber: p.registrationNumber, lines: this.lines(), discount: v.discount || undefined, notes: v.notes.trim() || undefined }).subscribe({
      next: (i) => {
        this.busy.set(false);
        this.notice.set(`${i.invoiceNumber} created for ${i.patientName}: ${i.total.toFixed(2)} ${CURRENCY}.`);
        this.onPatient(null);
        this.invoiceForm.reset({ discount: 0, notes: '' });
        this.statusFilter.setValue('OUTSTANDING');
        this.tab.set('invoices');
        this.reload();
      },
      error: (e: unknown) => { this.busy.set(false); this.formError.set(errorMessage(e, 'The invoice could not be created.')); },
    });
  }
}
