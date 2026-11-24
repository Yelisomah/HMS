import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NoteList } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { pretty, tone } from '../shared/ui';

@Component({
  selector: 'app-notes-panel',
  imports: [DatePipe, RouterLink],
  template: `
  <section class="panel-block">
    <div class="section-head">
      <h2>SOAP notes</h2>
      <div class="actions">
        <button class="mini" type="button" [disabled]="!checkInId() || busy()" (click)="openForCheckIn()">{{ busy() ? 'Opening…' : 'Open / start note for current visit' }}</button>
      </div>
    </div>
    @if (!checkInId()) { <p class="muted">Check the patient in to start a note for the current visit.</p> }
    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
    @if (loading()) { <p class="loading-message" role="status">Loading notes…</p> }
    @else if (!list()?.notes?.length) { <p class="muted">{{ list()?.message || 'No SOAP notes for this patient yet.' }}</p> }
    @else {
      <div class="table-wrap" style="margin-top:0"><table>
        <thead><tr><th>Visit</th><th>Doctor</th><th>Status</th><th>Assessment</th><th></th></tr></thead>
        <tbody>@for (n of list()!.notes; track n.noteId) {
          <tr><td>{{ n.visitDate | date: 'd MMM y' }}</td><td>{{ n.doctorName || '—' }}</td>
            <td><span class="pill pill-{{ tone(n.status) }}">{{ pretty(n.status) }}</span> @if (n.amended) { <span class="pill pill-blue">Amended</span> }</td>
            <td>{{ n.assessmentPreview || '—' }}</td>
            <td><a class="cell-link" [routerLink]="['/app/notes', n.noteId]">Open →</a></td></tr>
        }</tbody></table></div>
    }
  </section>`,
})
export class NotesPanel {
  private readonly api = inject(HmsApi);
  private readonly router = inject(Router);
  readonly reg = input.required<string>();
  readonly checkInId = input<number | null>(null);
  readonly list = signal<NoteList | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly tone = tone;
  readonly pretty = pretty;

  constructor() {
    effect(() => {
      const r = this.reg();
      if (!r) return;
      this.api.notesForPatient(r).subscribe({
        next: (l) => { this.list.set(l); this.loading.set(false); },
        error: (e: unknown) => { this.error.set(errorMessage(e)); this.loading.set(false); },
      });
    });
  }

  /** Opens the visit's note, creating it first if there is none yet. */
  openForCheckIn(): void {
    const id = this.checkInId();
    if (!id) return;
    this.busy.set(true);
    this.error.set('');
    const go = (noteId: string) => void this.router.navigate(['/app/notes', noteId]);
    const fail = (e: unknown) => { this.error.set(errorMessage(e, 'Could not open the note.')); this.busy.set(false); };
    this.api.noteForCheckIn(id).subscribe({
      next: (n) => n?.id ? go(n.id) : this.start(id, go, fail),
      error: (e: unknown) => {
        if (e instanceof HttpErrorResponse && e.status === 404) this.start(id, go, fail);
        else fail(e);
      },
    });
  }

  private start(id: number, go: (n: string) => void, fail: (e: unknown) => void): void {
    this.api.startNote(id).subscribe({
      next: (n) => n?.id ? go(n.id) : fail(new Error('The server did not return the new note ID.')),
      error: fail,
    });
  }
}
