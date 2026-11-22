import { DatePipe, Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { NoteItem, RevisionItem } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { pretty, tone } from '../shared/ui';

const text = () => new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] });

@Component({
  selector: 'app-soap-note',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
  <section class="dashboard-view">
    <button class="text-button back-link" type="button" (click)="back()">← Back</button>
    @if (loading()) { <p class="loading-message" role="status">Loading note…</p> }
    @else if (loadError()) { <div class="form-alert dashboard-alert" role="alert">{{ loadError() }}</div> }
    @else if (note(); as n) {
      <div class="page-heading">
        <div>
          <p class="eyebrow">SOAP note</p>
          <h1>Visit note <span class="pill pill-{{ tone(n.status) }}">{{ pretty(n.status) }}</span></h1>
          <p class="dashboard-intro">
            {{ n.doctorName || 'Unassigned' }} · started {{ n.createdAt | date: 'd MMM y, HH:mm' }}
            @if (n.lastSavedAt) { · last saved {{ n.lastSavedAt | date: 'HH:mm' }} }
            @if (n.amendmentCount) { · amended {{ n.amendmentCount }}× }
          </p>
        </div>
      </div>

      @if (!n.ownedByCurrentUser) { <p class="notice">This note belongs to another clinician. You can read it, but only its owner can edit it.</p> }
      @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
      @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }

      <form class="panel-block stack" [formGroup]="form" (ngSubmit)="saveDraft()">
        <label>Subjective <small>what the patient reports</small><textarea rows="4" formControlName="subjective"></textarea></label>
        <label>Objective <small>examination and findings</small><textarea rows="4" formControlName="objective"></textarea></label>
        <label>Assessment <small>diagnosis and impression</small><textarea rows="4" formControlName="assessment"></textarea></label>
        <label>Plan <small>treatment and follow-up</small><textarea rows="4" formControlName="plan"></textarea></label>

        @if (isCompleted() && canEdit()) {
          <label>Reason for amendment *<input formControlName="reason" maxlength="500" /></label>
        }
        <div class="actions">
          @if (isDraft() && canEdit()) {
            <button class="mini ghost-btn" type="submit" [disabled]="busy()">Save draft</button>
            <button class="mini" type="button" [disabled]="busy()" (click)="complete()">Complete note</button>
          }
          @if (isCompleted() && canEdit()) {
            <button class="mini" type="button" [disabled]="busy() || !form.controls.reason.value.trim()" (click)="amend()">Save amendment</button>
          }
        </div>
      </form>

      @if (canEdit()) {
        <section class="panel-block">
          <h2>Reassign note</h2>
          <form class="form-row" [formGroup]="reassignForm" (ngSubmit)="reassign()">
            <label>New doctor ID<input formControlName="newDoctorId" /></label>
            <label>Reason<input formControlName="reason" maxlength="500" /></label>
            <button class="mini" type="submit" [disabled]="busy() || reassignForm.invalid">Reassign</button>
          </form>
        </section>
      }

      <section class="panel-block">
        <h2>Revision history</h2>
        @for (r of revisions(); track r.revisionNumber) {
          <div class="plan"><b>Revision {{ r.revisionNumber }} · {{ r.replacedAt | date: 'd MMM y, HH:mm' }} @if (r.replacedBy) { by {{ r.replacedBy }} }</b>
            <span>Reason: {{ r.reason || '—' }}@if (r.changedSections?.length) { · changed {{ r.changedSections!.join(', ') }} }</span>
            <details><summary>Show previous text</summary>
              <p class="note"><b>S:</b> {{ r.subjective || '—' }}<br /><b>O:</b> {{ r.objective || '—' }}<br /><b>A:</b> {{ r.assessment || '—' }}<br /><b>P:</b> {{ r.plan || '—' }}</p></details></div>
        } @empty { <p class="muted">This note has not been amended.</p> }
      </section>
    }
  </section>`,
})
export class SoapNote {
  private readonly api = inject(HmsApi);
  private readonly location = inject(Location);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('noteId') ?? '';

  readonly note = signal<NoteItem | null>(null);
  readonly revisions = signal<RevisionItem[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly tone = tone;
  readonly pretty = pretty;

  readonly form = new FormGroup({ subjective: text(), objective: text(), assessment: text(), plan: text(), reason: text() });
  readonly reassignForm = new FormGroup({
    newDoctorId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }),
  });

  readonly canEdit = computed(() => !!this.note()?.ownedByCurrentUser);
  readonly isDraft = computed(() => (this.note()?.status ?? '').toUpperCase().includes('DRAFT'));
  readonly isCompleted = computed(() => !!this.note() && !this.isDraft());

  constructor() {
    this.api.note(this.id).subscribe({
      next: (n) => { this.apply(n); this.loading.set(false); this.loadRevisions(); },
      error: (e: unknown) => { this.loadError.set(errorMessage(e, 'That note was not found.')); this.loading.set(false); },
    });
  }

  back(): void { this.location.back(); }

  private apply(n: NoteItem): void {
    this.note.set(n);
    this.form.patchValue({ subjective: n.subjective ?? '', objective: n.objective ?? '', assessment: n.assessment ?? '', plan: n.plan ?? '', reason: '' });
  }
  private loadRevisions(): void {
    this.api.revisions(this.id).subscribe({ next: (r) => this.revisions.set(r ?? []), error: () => this.revisions.set([]) });
  }
  private content() {
    const { subjective, objective, assessment, plan } = this.form.getRawValue();
    return { version: this.note()?.version, subjective, objective, assessment, plan };
  }

  private run(call: Observable<NoteItem>, done: string): void {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    call.subscribe({
      next: (n) => { this.apply(n); this.notice.set(done); this.busy.set(false); this.loadRevisions(); },
      error: (e: unknown) => { this.error.set(errorMessage(e)); this.busy.set(false); },
    });
  }

  saveDraft(): void { this.run(this.api.saveDraft(this.id, this.content()), 'Draft saved.'); }
  complete(): void {
    if (window.confirm('Complete this note? After this you can only amend it with a reason.')) this.run(this.api.completeNote(this.id, this.content()), 'Note completed.');
  }
  amend(): void { this.run(this.api.amendNote(this.id, { ...this.content(), reason: this.form.controls.reason.value.trim() }), 'Amendment saved.'); }
  reassign(): void {
    if (this.reassignForm.invalid) return;
    this.run(this.api.reassignNote(this.id, this.reassignForm.getRawValue()), 'Note reassigned.');
    this.reassignForm.reset();
  }
}
