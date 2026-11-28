import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { MOCKED_MODULES } from '../core/api/api.config';
import { PatientFull } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { Drug, DrugForm, Prescription, PrescriptionStatus, StockReason } from '../core/api/hospital.models';
import { PatientPicker } from '../shared/patient-picker';
import { pretty } from '../shared/ui';

type Tab = 'prescriptions' | 'stock' | 'new';
const FORMS: DrugForm[] = ['TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS', 'OTHER'];
const REASONS: StockReason[] = ['RECEIVED', 'ADJUSTMENT', 'EXPIRED', 'DAMAGED'];
const STATUS_PILL: Record<PrescriptionStatus, string> = { PENDING: 'pill-amber', DISPENSED: 'pill-green', CANCELLED: 'pill-red' };

// Allergy classes to common drug names. A safety AID only - it never replaces clinical judgement.
const ALLERGY_CLASSES: Record<string, string[]> = {
  penicillin: ['amoxicillin', 'ampicillin', 'flucloxacillin', 'penicillin', 'cloxacillin'],
  sulfa: ['sulfamethoxazole', 'co-trimoxazole', 'cotrimoxazole', 'sulfadoxine'],
  nsaid: ['ibuprofen', 'diclofenac', 'aspirin', 'naproxen'],
  aspirin: ['aspirin'],
};

/** Returns the active allergens that appear to match a drug. */
export function allergyMatches(allergens: string[], drug?: Pick<Drug, 'name' | 'genericName'>): string[] {
  if (!drug) return [];
  const names = [drug.name, drug.genericName].filter(Boolean).map((n) => n!.toLowerCase());
  return allergens.filter((a) => {
    const al = a.trim().toLowerCase();
    if (al.length < 3) return false;
    const group = Object.entries(ALLERGY_CLASSES).filter(([k]) => al.includes(k)).flatMap(([, v]) => v);
    return names.some((n) => n.includes(al) || (n.length >= 4 && al.includes(n)) || group.some((g) => n.includes(g)));
  });
}

@Component({
  selector: 'app-pharmacy',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, PatientPicker],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Pharmacy</h1>
        <p class="dashboard-intro">Prescriptions, dispensing and medicine stock.</p>
      </div>
      <button class="mini ghost" type="button" (click)="reload()" [disabled]="loading()">Refresh</button>
    </div>

    @if (mocked) {
      <p class="notice warn" role="status">
        Preview mode: the pharmacy endpoints are not live yet, so this page uses temporary in-memory data that
        resets on reload. Patient search and allergy lookups are real.
      </p>
    }

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-label">Pending prescriptions</span><strong>{{ pendingCount() }}</strong></div>
      <div class="stat-card"><span class="stat-label">Low or out of stock</span><strong>{{ lowStock().length }}</strong></div>
      <div class="stat-card"><span class="stat-label">Expiring within 30 days</span><strong>{{ expiring().length }}</strong></div>
    </div>

    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }

    <div class="tabs" role="tablist">
      <button type="button" role="tab" [class.on]="tab() === 'prescriptions'" (click)="tab.set('prescriptions')">Prescriptions</button>
      <button type="button" role="tab" [class.on]="tab() === 'stock'" (click)="tab.set('stock')">Stock</button>
      @if (canPrescribe()) { <button type="button" role="tab" [class.on]="tab() === 'new'" (click)="tab.set('new')">New prescription</button> }
    </div>

    @if (loading()) { <p class="loading-message" role="status">Loading pharmacy data…</p> }

    @if (tab() === 'prescriptions') {
      <section class="panel-block">
        <div class="form-row">
          <label>Status
            <select [formControl]="statusFilter">
              <option value="">All</option><option value="PENDING">Pending</option>
              <option value="DISPENSED">Dispensed</option><option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        </div>
        @if (!loading() && !visibleRx().length) { <p class="muted">No prescriptions found.</p> }
        @for (r of visibleRx(); track r.id) {
          <article class="plan">
            <b>
              <a class="cell-link" [routerLink]="['/app/patients', r.registrationNumber]">{{ r.patientName }}</a>
              <span class="pill {{ pill(r.status) }}">{{ label(r.status) }}</span>
            </b>
            <span>{{ r.id }} · Reg. {{ r.registrationNumber }} · {{ r.createdAt | date: 'd MMM y, HH:mm' }}
              @if (r.prescribedByName) { · Dr. {{ r.prescribedByName }} }</span>
            @for (i of r.items; track i.id) {
              <span>• {{ i.drugName }} — {{ i.dose }}, {{ i.frequency }} for {{ i.durationDays }} day{{ i.durationDays === 1 ? '' : 's' }} (qty {{ i.quantity }})
                @if (i.instructions) { · {{ i.instructions }} }</span>
            }
            @if (r.notes) { <span>Notes: {{ r.notes }}</span> }
            @if (r.status === 'DISPENSED') { <span>Dispensed {{ r.dispensedAt | date: 'd MMM y, HH:mm' }}@if (r.counsellingNote) { · {{ r.counsellingNote }} }</span> }
            @if (r.cancelReason) { <span>Cancelled: {{ r.cancelReason }}</span> }

            @if (panel()?.id === r.id && panel()?.kind === 'dispense') {
              <form class="stack" [formGroup]="dispenseForm" (ngSubmit)="dispense(r)">
                @if (allergyState() === 'loading') { <p class="muted">Checking allergies…</p> }
                @if (allergyState() === 'unavailable') { <p class="notice warn">Allergy information could not be loaded. Confirm allergies with the patient before dispensing.</p> }
                @if (allergyState() === 'ready') {
                  @if (allergens().length) { <p class="notice warn" role="alert">Active allergies: <b>{{ allergens().join(', ') }}</b></p> }
                  @else { <p class="muted">No active allergies on record.</p> }
                }
                @if (rxHits(r).length) {
                  <p class="form-alert" role="alert">Possible allergy conflict: {{ rxHits(r).join('; ') }}</p>
                  <label class="check"><input type="checkbox" formControlName="override" /> I have reviewed this conflict with the prescriber and want to proceed.</label>
                }
                @for (i of r.items; track i.id) {
                  @if (stockOf(i.drugId) < i.quantity) { <p class="form-alert" role="alert">Insufficient stock: {{ i.drugName }} (need {{ i.quantity }}, have {{ stockOf(i.drugId) }}).</p> }
                }
                <label>Counselling note<input formControlName="counsellingNote" maxlength="500" placeholder="e.g. take with food" /></label>
                @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
                <div class="actions">
                  <button class="mini" type="submit" [disabled]="busy() || allergyState() === 'loading' || (rxHits(r).length > 0 && !dispenseForm.controls.override.value)">Confirm dispense</button>
                  <button class="mini ghost" type="button" (click)="closePanel()">Cancel</button>
                </div>
              </form>
            } @else if (panel()?.id === r.id && panel()?.kind === 'cancel') {
              <form class="stack" [formGroup]="cancelForm" (ngSubmit)="cancelRx(r)">
                <label>Reason *<input formControlName="reason" maxlength="300" /></label>
                @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
                <div class="actions">
                  <button class="mini" type="submit" [disabled]="cancelForm.invalid || busy()">Cancel prescription</button>
                  <button class="mini ghost" type="button" (click)="closePanel()">Keep it</button>
                </div>
              </form>
            } @else if (r.status === 'PENDING') {
              <div class="actions">
                @if (canDispense()) { <button class="mini" type="button" (click)="openDispense(r)">Dispense</button> }
                @if (canDispense() || canPrescribe()) { <button class="mini ghost" type="button" (click)="openCancel(r)">Cancel</button> }
              </div>
            }
          </article>
        }
      </section>
    }

    @if (tab() === 'stock') {
      <section class="panel-block">
        <div class="form-row">
          <label>Search medicines<input [formControl]="stockSearch" placeholder="Name or generic name" /></label>
          <label class="check"><input type="checkbox" [formControl]="lowOnly" /> Low or out of stock only</label>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Medicine</th><th>Form</th><th>In stock</th><th>Reorder at</th><th>Expiry</th><th>Status</th>@if (canManageStock()) { <th></th> }</tr></thead>
          <tbody>
            @for (d of visibleDrugs(); track d.id) {
              <tr>
                <td>{{ d.name }}{{ d.strength ? ' ' + d.strength : '' }}</td><td>{{ label(d.form) }}</td>
                <td>{{ d.quantityInStock }}</td><td>{{ d.reorderLevel }}</td><td>{{ d.expiryDate || '—' }}</td>
                <td><span class="pill {{ stockTone(d) }}">{{ stockLabel(d) }}</span></td>
                @if (canManageStock()) { <td><button class="text-button" type="button" (click)="openStock(d)">Adjust</button></td> }
              </tr>
              @if (stockPanel()?.id === d.id) {
                <tr><td [attr.colspan]="7">
                  <form class="form-row" [formGroup]="stockForm" (ngSubmit)="adjust(d)">
                    <label>Reason
                      <select formControlName="reason">@for (r of reasons; track r) { <option [value]="r">{{ label(r) }}</option> }</select>
                    </label>
                    <label>Quantity *<input type="number" min="1" formControlName="quantity" /></label>
                    <label>Note<input formControlName="note" maxlength="200" /></label>
                    <button class="mini" type="submit" [disabled]="stockForm.invalid || busy()">Save</button>
                    <button class="mini ghost" type="button" (click)="stockPanel.set(null)">Cancel</button>
                  </form>
                  <p class="muted">"Received" adds stock; "Adjustment", "Expired" and "Damaged" remove the quantity entered.</p>
                  @if (panelError()) { <p class="form-alert" role="alert">{{ panelError() }}</p> }
                </td></tr>
              }
            } @empty { <tr><td [attr.colspan]="7" class="muted">No medicines match.</td></tr> }
          </tbody>
        </table></div>
      </section>

      @if (canManageStock()) {
        <section class="panel-block">
          <h2>Add a medicine</h2>
          <form class="grid-form compact" [formGroup]="drugForm" (ngSubmit)="addDrug()">
            <label>Name *<input formControlName="name" maxlength="120" /></label>
            <label>Generic name<input formControlName="genericName" maxlength="120" /></label>
            <label>Strength<input formControlName="strength" maxlength="40" placeholder="e.g. 500 mg" /></label>
            <label>Form *<select formControlName="form">@for (f of forms; track f) { <option [value]="f">{{ label(f) }}</option> }</select></label>
            <label>Opening stock *<input type="number" min="0" formControlName="quantityInStock" /></label>
            <label>Reorder level *<input type="number" min="0" formControlName="reorderLevel" /></label>
            <label>Unit price<input type="number" min="0" step="0.01" formControlName="unitPrice" /></label>
            <label>Expiry date<input type="date" formControlName="expiryDate" /></label>
            @if (formError()) { <p class="form-alert wide" role="alert">{{ formError() }}</p> }
            <div class="wide"><button class="primary-button inline-button" type="submit" [disabled]="drugForm.invalid || busy()">Add medicine</button></div>
          </form>
        </section>
      }
    }

    @if (tab() === 'new' && canPrescribe()) {
      <section class="panel-block">
        <h2>New prescription</h2>
        <app-patient-picker [patient]="rxPatient()" (patientChange)="onRxPatient($event)" />
        @if (rxPatient()) {
          @if (newAllergyState() === 'ready' && newAllergens().length) { <p class="notice warn" role="alert">Active allergies: <b>{{ newAllergens().join(', ') }}</b></p> }
          @if (newAllergyState() === 'unavailable') { <p class="notice warn">Allergy information could not be loaded. Check allergies manually.</p> }
        }
        <form class="stack" [formGroup]="rxForm" (ngSubmit)="prescribe()">
          @for (row of items.controls; track row; let n = $index) {
            <fieldset class="grid-form compact" [formGroup]="row">
              <legend>Medicine {{ n + 1 }}</legend>
              <label>Medicine *
                <select formControlName="drugId">
                  <option value="">Choose…</option>
                  @for (d of drugs(); track d.id) { <option [value]="d.id">{{ d.name }}{{ d.strength ? ' ' + d.strength : '' }} ({{ d.quantityInStock }} in stock)</option> }
                </select>
              </label>
              <label>Dose *<input formControlName="dose" placeholder="e.g. 1 tablet" maxlength="60" /></label>
              <label>Frequency *<input formControlName="frequency" placeholder="e.g. three times daily" maxlength="60" /></label>
              <label>Days *<input type="number" min="1" max="365" formControlName="durationDays" /></label>
              <label>Total quantity *<input type="number" min="1" formControlName="quantity" /></label>
              <label>Instructions<input formControlName="instructions" maxlength="200" /></label>
              @if (rowHits(drugIdOf(row)).length) { <p class="form-alert wide" role="alert">Possible allergy conflict: {{ rowHits(drugIdOf(row)).join(', ') }}. Review before prescribing.</p> }
              @if (items.length > 1) { <div class="wide"><button class="mini ghost" type="button" (click)="removeRow(n)">Remove medicine</button></div> }
            </fieldset>
          }
          <div><button class="mini ghost" type="button" (click)="addRow()">+ Add another medicine</button></div>
          <label>Notes<textarea rows="2" formControlName="notes" maxlength="500"></textarea></label>
          @if (formError()) { <p class="form-alert" role="alert">{{ formError() }}</p> }
          <div><button class="primary-button inline-button" type="submit" [disabled]="busy() || !rxPatient() || rxForm.invalid">{{ busy() ? 'Saving…' : 'Send to pharmacy' }}</button></div>
        </form>
      </section>
    }
  </section>`,
})
export class Pharmacy implements OnInit {
  private readonly api = inject(HmsApi);
  private readonly auth = inject(AuthService);

  readonly mocked = MOCKED_MODULES.pharmacy;
  readonly forms = FORMS;
  readonly reasons = REASONS;
  readonly canPrescribe = computed(() => this.auth.hasAnyRole('ADMIN', 'DOCTOR', 'PHYSICIAN'));
  readonly canDispense = computed(() => this.auth.hasAnyRole('ADMIN', 'PHARMACIST'));
  readonly canManageStock = this.canDispense;

  readonly tab = signal<Tab>('prescriptions');
  readonly prescriptions = signal<Prescription[]>([]);
  readonly drugs = signal<Drug[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly formError = signal('');
  readonly panelError = signal('');

  readonly statusFilter = new FormControl<'' | PrescriptionStatus>('PENDING', { nonNullable: true });
  private readonly statusSig = signal<string>('PENDING');
  readonly stockSearch = new FormControl('', { nonNullable: true });
  readonly lowOnly = new FormControl(false, { nonNullable: true });
  private readonly searchSig = signal('');
  private readonly lowSig = signal(false);

  readonly visibleRx = computed(() => this.prescriptions().filter((r) => !this.statusSig() || r.status === this.statusSig()));
  readonly pendingCount = computed(() => this.prescriptions().filter((r) => r.status === 'PENDING').length);
  readonly lowStock = computed(() => this.drugs().filter((d) => d.quantityInStock <= d.reorderLevel));
  readonly expiring = computed(() => this.drugs().filter((d) => this.daysToExpiry(d) !== null && this.daysToExpiry(d)! <= 30));
  readonly visibleDrugs = computed(() => this.drugs().filter((d) =>
    (!this.searchSig() || `${d.name} ${d.genericName ?? ''}`.toLowerCase().includes(this.searchSig().toLowerCase()))
    && (!this.lowSig() || d.quantityInStock <= d.reorderLevel)));

  // dispense / cancel panels
  readonly panel = signal<{ id: string; kind: 'dispense' | 'cancel' } | null>(null);
  readonly allergens = signal<string[]>([]);
  readonly allergyState = signal<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  readonly dispenseForm = new FormGroup({
    counsellingNote: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    override: new FormControl(false, { nonNullable: true }),
  });
  readonly cancelForm = new FormGroup({ reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(300)] }) });

  // stock panels
  readonly stockPanel = signal<Drug | null>(null);
  readonly stockForm = new FormGroup({
    reason: new FormControl<StockReason>('RECEIVED', { nonNullable: true }),
    quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
  });
  readonly drugForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    genericName: new FormControl('', { nonNullable: true }),
    strength: new FormControl('', { nonNullable: true }),
    form: new FormControl<DrugForm>('TABLET', { nonNullable: true }),
    quantityInStock: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    reorderLevel: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    unitPrice: new FormControl<number | null>(null, { validators: [Validators.min(0)] }),
    expiryDate: new FormControl('', { nonNullable: true }),
  });

  // new prescription
  readonly rxPatient = signal<PatientFull | null>(null);
  readonly newAllergens = signal<string[]>([]);
  readonly newAllergyState = signal<'idle' | 'ready' | 'unavailable'>('idle');
  readonly rxForm = new FormGroup({
    items: new FormArray<FormGroup>([this.newRow()]),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  get items(): FormArray<FormGroup> { return this.rxForm.controls.items; }

  ngOnInit(): void {
    if (!this.canPrescribe() && !this.canDispense()) this.tab.set('prescriptions');
    this.statusFilter.valueChanges.subscribe((v) => this.statusSig.set(v));
    this.stockSearch.valueChanges.subscribe((v) => this.searchSig.set(v));
    this.lowOnly.valueChanges.subscribe((v) => this.lowSig.set(v));
    this.reload();
  }

  label = (v?: string) => pretty(v);
  pill = (s: PrescriptionStatus) => STATUS_PILL[s];
  stockOf = (id: string) => this.drugs().find((d) => d.id === id)?.quantityInStock ?? 0;
  private drugById = (id: string) => this.drugs().find((d) => d.id === id);
  private daysToExpiry(d: Drug): number | null {
    return d.expiryDate ? Math.ceil((new Date(d.expiryDate).getTime() - Date.now()) / 86_400_000) : null;
  }
  stockLabel(d: Drug): string {
    const days = this.daysToExpiry(d);
    if (days !== null && days < 0) return 'Expired';
    if (d.quantityInStock === 0) return 'Out of stock';
    if (d.quantityInStock <= d.reorderLevel) return 'Low stock';
    if (days !== null && days <= 30) return 'Expiring soon';
    return 'OK';
  }
  stockTone(d: Drug): string {
    const l = this.stockLabel(d);
    return l === 'OK' ? 'pill-green' : l === 'Low stock' || l === 'Expiring soon' ? 'pill-amber' : 'pill-red';
  }

  private newRow(): FormGroup {
    return new FormGroup({
      drugId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      dose: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
      frequency: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
      durationDays: new FormControl(5, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(365)] }),
      quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
      instructions: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    });
  }
  addRow(): void { this.items.push(this.newRow()); }
  removeRow(i: number): void { if (this.items.length > 1) this.items.removeAt(i); }
  // Typed accessor for the template: each row is a FormGroup of string/number controls.
  drugIdOf = (row: FormGroup): string => row.controls['drugId'].value;
  rowHits = (drugId: string) => allergyMatches(this.newAllergens(), this.drugById(drugId));
  rxHits = (r: Prescription) => r.items.flatMap((i) => allergyMatches(this.allergens(), this.drugById(i.drugId)).map((a) => `${i.drugName} (allergy: ${a})`));

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    let pending = 2;
    const done = () => { if (--pending === 0) this.loading.set(false); };
    this.api.prescriptions().subscribe({
      next: (r) => { this.prescriptions.set(r); done(); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not load prescriptions.')); done(); },
    });
    this.api.drugs().subscribe({
      next: (d) => { this.drugs.set(d); done(); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not load the medicine list.')); done(); },
    });
  }

  private loadAllergies(reg: string, into: 'dispense' | 'new'): void {
    if (into === 'dispense') { this.allergyState.set('loading'); this.allergens.set([]); }
    this.api.history(reg).subscribe({
      next: (h) => {
        const list = (h.allergies?.items ?? []).filter((a) => a.active !== false).map((a) => a.allergen);
        if (into === 'dispense') { this.allergens.set(list); this.allergyState.set('ready'); }
        else { this.newAllergens.set(list); this.newAllergyState.set('ready'); }
      },
      error: () => { if (into === 'dispense') this.allergyState.set('unavailable'); else this.newAllergyState.set('unavailable'); },
    });
  }

  openDispense(r: Prescription): void {
    this.panel.set({ id: r.id, kind: 'dispense' });
    this.panelError.set('');
    this.dispenseForm.reset({ counsellingNote: '', override: false });
    this.loadAllergies(r.registrationNumber, 'dispense');
  }
  openCancel(r: Prescription): void { this.panel.set({ id: r.id, kind: 'cancel' }); this.panelError.set(''); this.cancelForm.reset({ reason: '' }); }
  closePanel(): void { this.panel.set(null); this.panelError.set(''); }

  dispense(r: Prescription): void {
    if (this.dispenseForm.invalid || this.allergyState() === 'loading') return;
    const v = this.dispenseForm.getRawValue();
    this.busy.set(true);
    this.api.dispense(r.id, { counsellingNote: v.counsellingNote.trim() || undefined, allergyOverrideAcknowledged: v.override || undefined }).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`Prescription ${r.id} dispensed for ${r.patientName}.`); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Dispensing failed.')); },
    });
  }

  cancelRx(r: Prescription): void {
    if (this.cancelForm.invalid) return;
    this.busy.set(true);
    this.api.cancelPrescription(r.id, { reason: this.cancelForm.getRawValue().reason.trim() }).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`Prescription ${r.id} cancelled.`); this.closePanel(); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Could not cancel.')); },
    });
  }

  openStock(d: Drug): void { this.stockPanel.set(this.stockPanel()?.id === d.id ? null : d); this.panelError.set(''); this.stockForm.reset({ reason: 'RECEIVED', quantity: 1, note: '' }); }
  adjust(d: Drug): void {
    if (this.stockForm.invalid) return;
    const v = this.stockForm.getRawValue();
    this.busy.set(true);
    this.panelError.set('');
    this.api.adjustStock(d.id, { quantityChange: v.reason === 'RECEIVED' ? v.quantity : -v.quantity, reason: v.reason, note: v.note.trim() || undefined }).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`Stock updated for ${d.name}.`); this.stockPanel.set(null); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.panelError.set(errorMessage(e, 'Could not update stock.')); },
    });
  }

  addDrug(): void {
    if (this.drugForm.invalid) return;
    const v = this.drugForm.getRawValue();
    this.busy.set(true);
    this.formError.set('');
    this.api.addDrug({
      name: v.name.trim(), genericName: v.genericName.trim() || undefined, strength: v.strength.trim() || undefined, form: v.form,
      quantityInStock: v.quantityInStock, reorderLevel: v.reorderLevel, unitPrice: v.unitPrice ?? undefined, expiryDate: v.expiryDate || undefined,
    }).subscribe({
      next: (d) => { this.busy.set(false); this.notice.set(`${d.name} added to the catalogue.`); this.drugForm.reset({ form: 'TABLET', quantityInStock: 0, reorderLevel: 0, name: '', genericName: '', strength: '', unitPrice: null, expiryDate: '' }); this.reload(); },
      error: (e: unknown) => { this.busy.set(false); this.formError.set(errorMessage(e, 'Could not add the medicine.')); },
    });
  }

  onRxPatient(p: PatientFull | null): void {
    this.rxPatient.set(p);
    this.newAllergens.set([]);
    this.newAllergyState.set('idle');
    if (p?.registrationNumber) this.loadAllergies(p.registrationNumber, 'new');
  }

  prescribe(): void {
    const p = this.rxPatient();
    if (!p?.registrationNumber || this.rxForm.invalid) return;
    const hits = this.items.controls.flatMap((g) => this.rowHits(g.controls['drugId'].value));
    if (hits.length && !window.confirm(`Possible allergy conflict (${[...new Set(hits)].join(', ')}). Prescribe anyway?`)) return;
    const v = this.rxForm.getRawValue();
    this.busy.set(true);
    this.formError.set('');
    this.api.prescribe({
      registrationNumber: p.registrationNumber, notes: v.notes.trim() || undefined,
      items: v.items.map((i) => ({ drugId: i['drugId'], dose: i['dose'].trim(), frequency: i['frequency'].trim(), durationDays: Number(i['durationDays']), quantity: Number(i['quantity']), instructions: i['instructions'].trim() || undefined })),
    }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.notice.set(`Prescription ${r.id} sent to the pharmacy for ${r.patientName}.`);
        this.onRxPatient(null);
        this.items.clear(); this.addRow(); this.rxForm.controls.notes.reset('');
        this.statusFilter.setValue('PENDING');
        this.tab.set('prescriptions');
        this.reload();
      },
      error: (e: unknown) => { this.busy.set(false); this.formError.set(errorMessage(e, 'The prescription could not be saved.')); },
    });
  }
}
