import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../Auth/auth.service';
import { age, HmsStore, news2, risk } from '../core/hms.store';

const TABS = ['Summary', 'Vitals', 'Medications', 'Nursing care', 'Labs'] as const;

@Component({
  selector: 'app-patient-chart',
  imports: [DatePipe, RouterLink],
  template: `
  @if (p(); as pt) {
  <section class="dashboard-view">
    <a class="back-link" [routerLink]="base + '/patients'">← All patients</a>
    <header class="banner">
      <span class="user-avatar big">{{ pt.name[0] }}</span>
      <div class="banner-main">
        <h1>{{ pt.name }}</h1>
        <p>{{ age(pt.dob) }} y · {{ pt.sex === 'F' ? 'Female' : 'Male' }} · {{ pt.mrn }} · Blood {{ pt.blood }} · {{ pt.nhis ? 'NHIS ' + pt.nhis : 'Cash patient' }}</p>
        <p>{{ bed() ? bed()!.ward + ', bed ' + bed()!.label + ' · ' + adm()!.code : 'Outpatient' }} · Doctor: {{ store.staffById(pt.doctorId)?.name }}@if (adm()) { · Nurse: {{ store.staffById(adm()!.nurseId)?.name }} }</p>
      </div>
      <div class="banner-alerts">
        @if (pt.allergies.length) { <span class="pill pill-red">Allergy: {{ pt.allergies.join(', ') }}</span> } @else { <span class="pill pill-green">No known allergies</span> }
        @if (score() !== null) { <span class="pill pill-{{ tone() }}">NEWS2 {{ score() }} · {{ riskName() }}</span> }
      </div>
    </header>
    <nav class="tabs" role="tablist">@for (t of tabs; track t) { <button role="tab" [class.on]="tab() === t" [attr.aria-selected]="tab() === t" (click)="tab.set(t)">{{ t }}</button> }</nav>
    @if (msg()) { <p class="notice" role="status">{{ msg() }}</p> }

    @switch (tab()) {
      @case ('Summary') {
        <div class="two-col">
          <section class="panel-block"><h2>Details</h2>
            <dl class="kv"><dt>Date of birth</dt><dd>{{ pt.dob }}</dd><dt>Phone</dt><dd>{{ pt.phone }}</dd><dt>Next of kin</dt><dd>{{ pt.kin }}</dd>
              @if (adm(); as a) { <dt>Admitted for</dt><dd>{{ a.reason }}</dd><dt>Since</dt><dd>{{ a.since | date: 'd MMM, HH:mm' }}</dd> }</dl></section>
          @if (adm(); as a) { <section class="panel-block"><h2>Ward actions</h2>
            <div class="form-row"><label>Transfer to bed<select #tb>@for (b of freeBeds(); track b.id) { <option [value]="b.id">{{ b.ward }} · {{ b.label }}</option> }</select></label>
              <button class="mini" (click)="transfer(a.id, tb.value)">Transfer</button></div>
            @if (role === 'Doctor') { <div class="stack" style="margin-top:14px"><label>Discharge summary<textarea #ds rows="3" placeholder="Diagnosis, treatment given, medicines to take home, follow-up"></textarea></label>
              <button class="primary-button inline-button" (click)="discharge(a.id, ds)">Discharge patient</button></div> }</section> }
          @for (d of discharged(); track d.at) { <section class="panel-block"><h2>Discharge summary</h2><p class="note"><small>{{ d.at | date: 'd MMM HH:mm' }} · {{ store.staffById(d.doctorId)?.name }}</small>{{ d.summary }}</p></section> }
          <section class="panel-block"><h2>Latest nursing notes</h2>
            @for (n of notes().slice(0, 3); track n.at) { <p class="note"><small>{{ n.at | date: 'd MMM HH:mm' }} · {{ store.staffById(n.nurseId)?.name }}</small>{{ n.text }}</p> } @empty { <p class="muted">No notes yet.</p> }</section>
        </div>
      }
      @case ('Vitals') {
        <div class="spark-row">
          @for (s of sparks(); track s.label) { <div class="spark"><small>{{ s.label }}</small><b>{{ s.last }}</b><svg viewBox="0 0 140 36" aria-hidden="true"><polyline [attr.points]="s.pts" /></svg></div> }
        </div>
        @if (role === 'Nurse') {
          <section class="panel-block"><h2>Record vitals</h2>
            <div class="form-row">
              <label>Systolic<input #sys type="number" placeholder="120" /></label><label>Diastolic<input #dia type="number" placeholder="80" /></label>
              <label>Pulse<input #pul type="number" placeholder="80" /></label><label>Temp °C<input #tmp type="number" step="0.1" placeholder="36.8" /></label>
              <label>SpO2 %<input #spo type="number" placeholder="98" /></label><label>Resp. rate<input #rr type="number" placeholder="16" /></label>
              <button class="primary-button inline-button" (click)="saveVitals(sys.value, dia.value, pul.value, tmp.value, spo.value, rr.value)">Save vitals</button>
            </div></section>
        }
        <div class="table-wrap"><table><thead><tr><th>Time</th><th>BP</th><th>Pulse</th><th>Temp</th><th>SpO2</th><th>Resp.</th><th>NEWS2</th><th>By</th></tr></thead><tbody>
          @for (v of vitalsDesc(); track v.at) { <tr><td>{{ v.at | date: 'd MMM HH:mm' }}</td><td>{{ v.sys }}/{{ v.dia }}</td><td>{{ v.pulse }}</td><td>{{ v.temp }}</td><td>{{ v.spo2 }}%</td><td>{{ v.rr }}</td><td><span class="pill pill-{{ toneOf(news(v)) }}">{{ news(v) }}</span></td><td>{{ store.staffById(v.by)?.name }}</td></tr> }
        </tbody></table></div>
      }
      @case ('Medications') {
        @if (role === 'Doctor') {
          <section class="panel-block"><h2>Prescribe</h2>
            <div class="form-row"><label>Drug<input #drug placeholder="e.g. Amoxicillin" /></label><label>Dose<input #dose placeholder="500 mg" /></label>
              <label>Route<select #route><option>Oral</option><option>IV</option><option>IM</option></select></label>
              <label>Frequency<select #freq><option>Daily</option><option>12-hourly</option><option>8-hourly</option><option>6-hourly</option></select></label>
              <button class="primary-button inline-button" (click)="prescribe(drug.value, dose.value, route.value, freq.value)">Prescribe</button></div>
            @if (pt.allergies.length) { <p class="muted">Check allergies before prescribing: {{ pt.allergies.join(', ') }}.</p> }</section>
        }
        <div class="table-wrap"><table><thead><tr><th>Time</th><th>Drug</th><th>Dose · route</th><th>Frequency</th><th>Status</th>@if (role === 'Nurse') { <th>Action</th> }</tr></thead><tbody>
          @for (d of doses(); track d.id) { <tr><td>{{ d.time }}</td><td>{{ store.drugName(d.orderId) }}</td><td>{{ order(d.orderId)?.dose }} · {{ order(d.orderId)?.route }}</td><td>{{ order(d.orderId)?.freq }}</td>
            <td><span class="pill pill-{{ d.status === 'Given' ? 'green' : d.status === 'Held' ? 'red' : 'amber' }}">{{ d.status }}@if (d.by) { · {{ store.staffById(d.by)?.name?.split(' ')?.pop() }} }</span></td>
            @if (role === 'Nurse') { <td class="actions">@if (d.status === 'Due') { <button class="mini" (click)="store.setDose(d.id, 'Given', me.id)">Give</button><button class="mini ghost" (click)="store.setDose(d.id, 'Held', me.id)">Hold</button> }</td> }</tr> }
        </tbody></table></div>
      }
      @case ('Nursing care') {
        @if (role === 'Nurse') {
          <div class="two-col">
            <section class="panel-block"><h2>Add nursing note</h2><textarea #note rows="3" placeholder="Assessment, intervention or observation"></textarea>
              <button class="primary-button inline-button" (click)="addNote(note)">Save note</button></section>
            <section class="panel-block"><h2>Add care plan item</h2><div class="stack"><input #prob placeholder="Problem" /><input #goal placeholder="Goal" /><input #acts placeholder="Nursing actions" />
              <button class="primary-button inline-button" (click)="addPlan(prob, goal, acts)">Save care plan</button></div></section>
          </div>
        }
        <div class="two-col">
          <section class="panel-block"><h2>Care plan</h2>
            @for (c of plans(); track $index) { <div class="plan"><b>{{ c.problem }}</b><span>Goal: {{ c.goal }}</span><span>Actions: {{ c.actions }}</span></div> } @empty { <p class="muted">No care plan yet.</p> }</section>
          <section class="panel-block"><h2>Notes</h2>
            @for (n of notes(); track n.at) { <p class="note"><small>{{ n.at | date: 'd MMM HH:mm' }} · {{ store.staffById(n.nurseId)?.name }}</small>{{ n.text }}</p> } @empty { <p class="muted">No notes yet.</p> }</section>
        </div>
      }
      @case ('Labs') {
        @if (role === 'Doctor') {
          <section class="panel-block"><h2>Order a test</h2><div class="form-row"><label>Test<input #test placeholder="e.g. Malaria RDT" /></label>
            <button class="primary-button inline-button" (click)="orderLab(test)">Order test</button></div></section>
        }
        <div class="table-wrap"><table><thead><tr><th>Test</th><th>Ordered by</th><th>Status</th><th>Result</th>@if (role === 'Nurse') { <th>Action</th> }</tr></thead><tbody>
          @for (l of labs(); track l.id) { <tr><td>{{ l.test }}</td><td>{{ store.staffById(l.doctorId)?.name }}</td><td><span class="pill pill-{{ l.status === 'Resulted' ? 'green' : 'amber' }}">{{ l.status }}</span></td><td>{{ l.result || 'Pending' }}</td>
            @if (role === 'Nurse') { <td>@if (l.status === 'Ordered') { <button class="mini" (click)="store.setLab(l.id, 'Collected')">Mark collected</button> }</td> }</tr> }
        </tbody></table></div>
      }
    }
  </section>
  } @else { <section class="dashboard-view"><div class="panel-card empty-state"><p>Patient not found. Return to the patient list.</p></div></section> }`,
})
export class PatientChart {
  readonly store = inject(HmsStore);
  private readonly auth = inject(AuthService);
  readonly role = this.auth.getRole() ?? 'Admin';
  readonly me = this.store.me(this.role);
  readonly base = `/${this.auth.getUserId()}`;
  readonly tabs: readonly string[] = this.role === 'Admin' || this.role === 'Lab_Technician' ? ['Summary', 'Labs'] : this.role === 'Pharmacist' ? ['Summary', 'Medications'] : TABS;
  readonly tab = signal<string>('Summary');
  readonly msg = signal('');
  readonly age = age;
  readonly news = news2;
  readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((m) => m.get('id') ?? '')), { initialValue: '' });
  readonly p = computed(() => this.store.patient(this.id()));
  readonly adm = computed(() => this.store.admissionOf(this.id()));
  readonly bed = computed(() => this.store.bedOf(this.id()));
  readonly score = computed(() => this.store.latestNews(this.id()));
  readonly riskName = computed(() => risk(this.score() ?? 0));
  readonly tone = computed(() => this.toneOf(this.score() ?? 0));
  readonly vitalsDesc = computed(() => [...this.store.vitalsOf(this.id())].reverse());
  readonly doses = computed(() => this.store.doses().filter((d) => d.patientId === this.id()).sort((a, b) => a.time.localeCompare(b.time)));
  readonly notes = computed(() => this.store.notes().filter((n) => n.patientId === this.id()));
  readonly plans = computed(() => this.store.plans().filter((n) => n.patientId === this.id()));
  readonly labs = computed(() => this.store.labs().filter((n) => n.patientId === this.id()));
  readonly sparks = computed(() => {
    const v = this.store.vitalsOf(this.id());
    const mk = (label: string, f: (x: (typeof v)[0]) => number) => { const a = v.map(f); const lo = Math.min(...a), hi = Math.max(...a) || 1;
      return { label, last: a.at(-1) ?? '—', pts: a.map((n, i) => `${a.length > 1 ? (i / (a.length - 1)) * 140 : 70},${34 - ((n - lo) / (hi - lo || 1)) * 30}`).join(' ') }; };
    return [mk('Systolic BP', (x) => x.sys), mk('Pulse', (x) => x.pulse), mk('SpO2 %', (x) => x.spo2), mk('Temp °C', (x) => x.temp)];
  });
  readonly freeBeds = computed(() => this.store.beds().filter((b) => !b.admissionId));
  readonly discharged = computed(() => this.store.discharges().filter((d) => d.patientId === this.id()));
  transfer(aid: string, bed: string) { if (!bed) return this.say('No free bed to transfer to.'); this.store.transfer(aid, bed); this.say('Patient transferred.'); }
  discharge(aid: string, el: HTMLTextAreaElement) { if (!el.value.trim()) return this.say('Write the discharge summary first.'); this.store.discharge(aid, el.value.trim(), this.me.id); this.say('Patient discharged and bed released.'); }
  toneOf = (n: number) => (n >= 7 ? 'red' : n >= 5 ? 'amber' : 'green');
  order = (id: string) => this.store.orders().find((o) => o.id === id);
  private say(t: string) { this.msg.set(t); setTimeout(() => this.msg.set(''), 4000); }

  saveVitals(...f: string[]) {
    const [sys, dia, pulse, temp, spo2, rr] = f.map(Number);
    if (f.some((x) => !x) || [sys, dia, pulse, temp, spo2, rr].some(isNaN)) return this.say('Enter all six readings before saving.');
    this.store.addVital({ patientId: this.id(), sys, dia, pulse, temp, spo2, rr, by: this.me.id });
    const s = this.store.latestNews(this.id())!;
    this.say(`Vitals saved. NEWS2 is ${s} (${risk(s)} risk).${s >= 5 ? ' Escalate to the doctor now.' : ''}`);
  }
  prescribe(drug: string, dose: string, route: string, freq: string) {
    if (!drug.trim() || !dose.trim()) return this.say('Enter the drug and dose.');
    this.store.prescribe({ patientId: this.id(), doctorId: this.me.id, drug: drug.trim(), dose: dose.trim(), route, freq });
    this.say('Prescription saved. Doses now appear on the nurse medication round.');
  }
  addNote(el: HTMLTextAreaElement) { if (!el.value.trim()) return this.say('Write a note first.'); this.store.addNote({ patientId: this.id(), nurseId: this.me.id, text: el.value.trim() }); el.value = ''; this.say('Note saved.'); }
  addPlan(a: HTMLInputElement, b: HTMLInputElement, c: HTMLInputElement) { if (!a.value.trim() || !b.value.trim()) return this.say('Enter a problem and a goal.'); this.store.addPlan({ patientId: this.id(), problem: a.value, goal: b.value, actions: c.value }); a.value = b.value = c.value = ''; this.say('Care plan saved.'); }
  orderLab(el: HTMLInputElement) { if (!el.value.trim()) return this.say('Enter a test name.'); this.store.orderLab(this.id(), this.me.id, el.value.trim()); el.value = ''; this.say('Test ordered. The nurse and lab will see it.'); }
}
