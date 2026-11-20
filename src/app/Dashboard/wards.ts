import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { Bed, HmsStore } from '../core/hms.store';

@Component({
  selector: 'app-wards',
  imports: [RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Wards and beds</h1><p class="dashboard-intro">Live bed board. Colour shows the latest NEWS2 early-warning score for each patient.</p></div></div>
    @if (role !== 'Doctor') {
      <section class="panel-block"><h2>Admit a patient</h2>
        <div class="form-row">
          <label>Patient<select #pat>@for (p of waiting(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select></label>
          <label>Bed<select #bed>@for (b of free(); track b.id) { <option [value]="b.id">{{ b.ward }} · {{ b.label }}</option> }</select></label>
          <label>Reason<input #why placeholder="Reason for admission" /></label>
          <button class="primary-button inline-button" (click)="admit(pat.value, bed.value, why)">Admit patient</button>
        </div>
        @if (msg()) { <p class="notice" role="status">{{ msg() }}</p> }
      </section>
    }
    @for (w of wards(); track w.name) {
      <h2 class="ward-title">{{ w.name }} <small>{{ w.beds.length - w.free }} of {{ w.beds.length }} occupied</small></h2>
      <div class="bed-grid">
        @for (b of w.beds; track b.id) {
          @if (b.admissionId) {
            <a class="bed bed-{{ tone(b.admissionId) }}" [routerLink]="base + '/patients/' + pid(b.admissionId)">
              <b>{{ b.label }}</b><span>{{ name(b.admissionId) }}</span><small>NEWS2 {{ store.latestNews(pid(b.admissionId)) ?? '—' }}</small>
            </a>
          } @else { <div class="bed bed-free"><b>{{ b.label }}</b><span>Available</span></div> }
        }
      </div>
    }
  </section>`,
})
export class Wards {
  readonly store = inject(HmsStore);
  private readonly auth = inject(AuthService);
  readonly role = this.auth.getRole() ?? 'Admin';
  readonly base = `/${this.auth.getUserId()}`;
  readonly msg = signal('');
  readonly free = computed(() => this.store.beds().filter((b) => !b.admissionId));
  readonly waiting = computed(() => this.store.patients().filter((p) => !this.store.admissionOf(p.id)));
  readonly wards = computed(() => { const m = new Map<string, Bed[]>(); this.store.beds().forEach((b) => m.set(b.ward, [...(m.get(b.ward) ?? []), b])); return [...m].map(([name, beds]) => ({ name, beds, free: beds.filter((b) => !b.admissionId).length })); });
  pid = (aid: string) => this.store.admissions().find((a) => a.id === aid)!.patientId;
  name = (aid: string) => this.store.patient(this.pid(aid))?.name;
  tone = (aid: string) => { const n = this.store.latestNews(this.pid(aid)) ?? 0; return n >= 7 ? 'red' : n >= 5 ? 'amber' : 'ok'; };
  admit(pid: string, bed: string, why: HTMLInputElement) {
    if (!pid || !bed || !why.value.trim()) { this.msg.set('Choose a patient and bed, and enter a reason.'); return; }
    const p = this.store.patient(pid)!, nurse = this.role === 'Nurse' ? this.store.me('Nurse').id : 'n1';
    this.store.admit(pid, bed, p.doctorId, nurse, why.value.trim()); why.value = ''; this.msg.set(`${p.name} admitted.`);
  }
}

@Component({
  selector: 'app-medications',
  imports: [RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Medication round</h1><p class="dashboard-intro">Doses for your patients. Give or hold each one, and the record updates on the patient chart.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Time</th><th>Patient</th><th>Drug</th><th>Dose · route</th><th>Status</th><th>Action</th></tr></thead><tbody>
      @for (d of rows(); track d.id) {
        <tr><td><b>{{ d.time }}</b> @if (d.status === 'Due' && overdue(d.time)) { <span class="pill pill-red">Overdue</span> }</td>
          <td><a class="cell-link" [routerLink]="base + '/patients/' + d.patientId">{{ store.patient(d.patientId)?.name }}</a>@if (store.patient(d.patientId)?.allergies?.length) { <small class="allergy"> Allergy: {{ store.patient(d.patientId)?.allergies?.join(', ') }}</small> }</td>
          <td>{{ store.drugName(d.orderId) }}</td><td>{{ info(d.orderId) }}</td>
          <td><span class="pill pill-{{ d.status === 'Given' ? 'green' : d.status === 'Held' ? 'red' : 'amber' }}">{{ d.status }}</span></td>
          <td class="actions">@if (d.status === 'Due') { <button class="mini" (click)="store.setDose(d.id, 'Given', me.id)">Give</button><button class="mini ghost" (click)="store.setDose(d.id, 'Held', me.id)">Hold</button> }</td></tr>
      }
    </tbody></table></div>
  </section>`,
})
export class Medications {
  readonly store = inject(HmsStore);
  private readonly auth = inject(AuthService);
  readonly me = this.store.me('Nurse');
  readonly base = `/${this.auth.getUserId()}`;
  readonly rows = computed(() => { const mine = this.store.admissions().filter((a) => a.nurseId === this.me.id).map((a) => a.patientId); return this.store.doses().filter((d) => mine.includes(d.patientId)).sort((a, b) => a.time.localeCompare(b.time)); });
  info = (id: string) => { const o = this.store.orders().find((x) => x.id === id); return o ? `${o.dose} · ${o.route}` : ''; };
  overdue = (t: string) => { const [h, m] = t.split(':').map(Number); const n = new Date(); return h * 60 + m < n.getHours() * 60 + n.getMinutes() - 30; };
}
