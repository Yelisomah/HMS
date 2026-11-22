import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HistoryKind } from '../core/api/api.config';
import { AllergyItem, ConditionItem, MedicalHistory, SurgeryItem } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { clean, pretty, tone } from '../shared/ui';

type Editing = { kind: HistoryKind; id: string | null } | null;

@Component({
  selector: 'app-history-panel',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
  @if (loading()) { <p class="loading-message" role="status">Loading medical history…</p> }
  @else if (error() && !history()) { <div class="form-alert dashboard-alert" role="alert">{{ error() }}</div> }
  @else if (history(); as h) {
    @if (h.hasActiveAllergies) { <div class="notice warn" role="alert"><b>Allergy alert:</b> {{ h.allergyAlert || 'This patient has active allergies.' }}</div> }
    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }

    <!-- Allergies -->
    <section class="panel-block">
      <div class="section-head"><h2>Allergies</h2><button class="mini" type="button" (click)="start('allergies', null)">Add allergy</button></div>
      @if (editing()?.kind === 'allergies') {
        <form class="grid-form compact" [formGroup]="allergyForm" (ngSubmit)="save()">
          <label>Allergen *<input formControlName="allergen" /></label>
          <label>Reaction<input formControlName="reaction" /></label>
          <label>Severity *<select formControlName="severity"><option>MILD</option><option>MODERATE</option><option>SEVERE</option></select></label>
          <label class="inline-check"><input type="checkbox" formControlName="active" /> Currently active</label>
          <div class="wide actions"><button class="mini" type="submit" [disabled]="busy() || allergyForm.invalid">Save</button><button class="mini ghost-btn" type="button" (click)="editing.set(null)">Cancel</button></div>
        </form>
      }
      @for (a of h.allergies?.items ?? []; track a.id) {
        <div class="plan"><b>{{ a.allergen }} <span class="pill pill-{{ tone(a.severity) }}">{{ pretty(a.severity) }}</span> @if (a.active === false) { <span class="pill pill-blue">Inactive</span> }</b>
          <span>{{ a.reaction || 'No reaction recorded' }} · recorded {{ a.recordedAt | date: 'd MMM y' }} @if (a.recordedBy) { by {{ a.recordedBy }} }</span>
          <button class="text-button" type="button" (click)="startAllergy(a)">Edit</button></div>
      } @empty { <p class="muted">{{ h.allergies?.message || 'No allergies recorded.' }}</p> }
    </section>

    <!-- Conditions -->
    <section class="panel-block">
      <div class="section-head"><h2>Chronic conditions</h2><button class="mini" type="button" (click)="start('conditions', null)">Add condition</button></div>
      @if (editing()?.kind === 'conditions') {
        <form class="grid-form compact" [formGroup]="conditionForm" (ngSubmit)="save()">
          <label>Condition *<input formControlName="conditionName" /></label>
          <label>Onset date<input type="date" formControlName="onsetDate" /></label>
          <label>Status *<select formControlName="status"><option>ACTIVE</option><option>RESOLVED</option></select></label>
          <label class="wide">Notes<input formControlName="notes" /></label>
          <div class="wide actions"><button class="mini" type="submit" [disabled]="busy() || conditionForm.invalid">Save</button><button class="mini ghost-btn" type="button" (click)="editing.set(null)">Cancel</button></div>
        </form>
      }
      @for (c of h.chronicConditions?.items ?? []; track c.id) {
        <div class="plan"><b>{{ c.conditionName }} <span class="pill pill-{{ tone(c.status) }}">{{ pretty(c.status) }}</span></b>
          <span>@if (c.onsetDate) { Since {{ c.onsetDate }} · } {{ c.notes || 'No notes' }}</span>
          <button class="text-button" type="button" (click)="startCondition(c)">Edit</button></div>
      } @empty { <p class="muted">{{ h.chronicConditions?.message || 'No chronic conditions recorded.' }}</p> }
    </section>

    <!-- Surgeries -->
    <section class="panel-block">
      <div class="section-head"><h2>Past surgeries</h2><button class="mini" type="button" (click)="start('surgeries', null)">Add surgery</button></div>
      @if (editing()?.kind === 'surgeries') {
        <form class="grid-form compact" [formGroup]="surgeryForm" (ngSubmit)="save()">
          <label>Procedure *<input formControlName="procedureName" /></label>
          <label>Date *<input type="date" formControlName="surgeryDate" /></label>
          <label class="wide">Notes<input formControlName="notes" /></label>
          <div class="wide actions"><button class="mini" type="submit" [disabled]="busy() || surgeryForm.invalid">Save</button><button class="mini ghost-btn" type="button" (click)="editing.set(null)">Cancel</button></div>
        </form>
      }
      @for (s of h.pastSurgeries?.items ?? []; track s.id) {
        <div class="plan"><b>{{ s.procedureName }}</b><span>{{ s.surgeryDate }} · {{ s.notes || 'No notes' }}</span>
          <button class="text-button" type="button" (click)="startSurgery(s)">Edit</button></div>
      } @empty { <p class="muted">{{ h.pastSurgeries?.message || 'No surgeries recorded.' }}</p> }
    </section>

    <div class="two-col">
      <section class="panel-block"><h2>Family history</h2>
        @for (f of h.familyHistory?.items ?? []; track f.id) { <div class="plan"><b>{{ f.conditionName }}</b><span>{{ f.relationship }} {{ f.notes ? '· ' + f.notes : '' }}</span></div> }
        @empty { <p class="muted">{{ h.familyHistory?.message || 'No family history recorded.' }}</p> }
      </section>
      <section class="panel-block"><h2>Visit history</h2>
        @for (v of h.visitHistory?.items ?? []; track v.visitId) { <div class="plan"><b>{{ v.dateOfVisit }} · {{ v.diagnosis || 'No diagnosis' }}</b><span>{{ v.doctorName }}</span></div> }
        @empty { <p class="muted">{{ h.visitHistory?.message || 'No visits recorded.' }}</p> }
      </section>
    </div>
  }`,
})
export class HistoryPanel {
  private readonly api = inject(HmsApi);
  readonly reg = input.required<string>();
  readonly history = signal<MedicalHistory | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editing = signal<Editing>(null);
  readonly tone = tone;
  readonly pretty = pretty;

  readonly allergyForm = new FormGroup({
    allergen: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    reaction: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    severity: new FormControl<'MILD' | 'MODERATE' | 'SEVERE'>('MILD', { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true }),
  });
  readonly conditionForm = new FormGroup({
    conditionName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    onsetDate: new FormControl('', { nonNullable: true }),
    status: new FormControl<'ACTIVE' | 'RESOLVED'>('ACTIVE', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  readonly surgeryForm = new FormGroup({
    procedureName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    surgeryDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  constructor() {
    effect(() => { const r = this.reg(); if (r) this.load(r); });
  }

  private load(reg: string): void {
    this.api.history(reg).subscribe({
      next: (h) => { this.history.set(h); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  start(kind: HistoryKind, id: string | null): void {
    this.allergyForm.reset({ severity: 'MILD', active: true });
    this.conditionForm.reset({ status: 'ACTIVE' });
    this.surgeryForm.reset();
    this.notice.set('');
    this.error.set('');
    this.editing.set({ kind, id });
  }
  startAllergy(a: AllergyItem): void {
    this.start('allergies', a.id);
    this.allergyForm.patchValue({ allergen: a.allergen, reaction: a.reaction ?? '', severity: a.severity as 'MILD', active: a.active ?? true });
  }
  startCondition(c: ConditionItem): void {
    this.start('conditions', c.id);
    this.conditionForm.patchValue({ conditionName: c.conditionName, onsetDate: c.onsetDate ?? '', status: c.status as 'ACTIVE', notes: c.notes ?? '' });
  }
  startSurgery(s: SurgeryItem): void {
    this.start('surgeries', s.id);
    this.surgeryForm.patchValue({ procedureName: s.procedureName, surgeryDate: s.surgeryDate, notes: s.notes ?? '' });
  }

  save(): void {
    const e = this.editing();
    if (!e) return;
    const body = clean(
      e.kind === 'allergies' ? this.allergyForm.getRawValue()
      : e.kind === 'conditions' ? this.conditionForm.getRawValue()
      : this.surgeryForm.getRawValue(),
    );
    const call = e.id ? this.api.updateHistory(this.reg(), e.kind, e.id, body) : this.api.addHistory(this.reg(), e.kind, body);
    this.busy.set(true);
    this.error.set('');
    call.subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.notice.set('Saved.'); this.load(this.reg()); },
      error: (err: unknown) => { this.error.set(errorMessage(err, 'Could not save this entry.')); this.busy.set(false); },
    });
  }
}
