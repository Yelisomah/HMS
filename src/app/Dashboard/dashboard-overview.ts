import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../Auth/auth.service';
import { HmsStore, risk } from '../core/hms.store';

@Component({
  selector: 'app-dashboard-overview',
  imports: [DatePipe, RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div><p class="eyebrow">{{ store.hospital }}</p><h1>Good day, {{ me.name }}</h1><p class="dashboard-intro">{{ intro[role] }}</p></div>
      <span class="today-label">{{ today | date: 'EEEE, MMMM d' }}</span>
    </div>
    <div class="stat-grid">
      @for (t of tiles(); track t.label) {
        <a class="stat-card" [routerLink]="base + '/' + t.to"><span class="stat-label">{{ t.label }}</span><strong>{{ t.value }}</strong><span class="stat-link">{{ t.hint }}</span></a>
      }
    </div>
    <div class="two-col">
      <section class="panel-block">
        <h2>{{ leftTitle[role] }}</h2>
        @if (role === 'Admin') {
          @for (w of wards(); track w.name) { <div class="occ"><span>{{ w.name }}</span><div class="bar"><i [style.width.%]="w.pct"></i></div><b>{{ w.used }}/{{ w.total }}</b></div> }
        } @else if (role === 'Doctor') {
          @for (a of clinic(); track a.id) { <a class="list-row" [routerLink]="base + '/patients/' + a.patientId"><b>{{ a.at | date: 'HH:mm' }}</b><span>{{ store.patient(a.patientId)?.name }} <small>{{ a.reason }}</small></span><span class="pill pill-blue">{{ a.status }}</span></a> }
        } @else if (role === 'Nurse') {
          @for (p of assigned(); track p.id) { <a class="list-row" [routerLink]="base + '/patients/' + p.id"><b>{{ store.bedOf(p.id)?.label }}</b><span>{{ p.name }} <small>{{ store.admissionOf(p.id)?.reason }}</small></span><span class="pill pill-{{ tone(p.id) }}">NEWS2 {{ store.latestNews(p.id) ?? '—' }}</span></a> }
        } @else {
          @for (x of work(); track $index) { <a class="list-row" [routerLink]="x.link"><span class="dot dot-{{ x.tone }}"></span><span>{{ x.text }}</span></a> } @empty { <p class="muted">The worklist is clear.</p> }
        }
      </section>
      <section class="panel-block">
        <h2>{{ role === 'Nurse' ? 'Medicines due' : 'Needs attention' }}</h2>
        @for (x of attention(); track $index) { <a class="list-row" [routerLink]="x.link"><span class="dot dot-{{ x.tone }}"></span><span>{{ x.text }}</span></a> } @empty { <p class="muted">Nothing needs attention right now.</p> }
      </section>
    </div>
  </section>`,
})
export class DashboardOverview {
  readonly store = inject(HmsStore);
  private readonly auth = inject(AuthService);
  readonly role = this.auth.getRole() ?? 'Admin';
  readonly me = this.store.me(this.role);
  readonly base = `/${this.auth.getUserId()}`;
  readonly today = new Date();
  readonly leftTitle: Record<string, string> = { Admin: 'Ward occupancy', Doctor: 'Today’s clinic', Nurse: 'My patients this shift', Pharmacist: 'Dispense queue', 'Lab Technician': 'Lab worklist' };
  readonly intro: Record<string, string> = { Pharmacist: 'Prescriptions waiting, stock and expiry.', 'Lab Technician': 'Samples to receive, tests to run and results to release.', Admin: 'Hospital-wide activity, beds, stock and money owed.', Doctor: 'Your clinic, your inpatients and results waiting for you.', Nurse: 'Your assigned patients, vitals and medicine rounds.' };
  private sameDay = (iso: string) => new Date(iso).toDateString() === this.today.toDateString();
  tone = (id: string) => ({ High: 'red', Medium: 'amber', Low: 'green' } as Record<string, string>)[risk(this.store.latestNews(id) ?? 0)];
  readonly clinic = computed(() => this.store.appts().filter((a) => a.doctorId === this.me.id && this.sameDay(a.at)));
  readonly assigned = computed(() => this.store.admissions().filter((a) => a.nurseId === this.me.id).map((a) => this.store.patient(a.patientId)!));
  readonly wards = computed(() => { const m = new Map<string, [number, number]>(); this.store.beds().forEach((b) => { const v = m.get(b.ward) ?? [0, 0]; m.set(b.ward, [v[0] + (b.admissionId ? 1 : 0), v[1] + 1]); }); return [...m].map(([name, [used, total]]) => ({ name, used, total, pct: (used / total) * 100 })); });
  readonly tiles = computed(() => {
    const s = this.store, b = this.base, dueMeds = s.doses().filter((d) => d.status === 'Due' && this.assigned().some((p) => p.id === d.patientId)).length;
    const high = s.admissions().filter((a) => (s.latestNews(a.patientId) ?? 0) >= 5).length;
    if (this.role === 'Admin') return [
      { label: 'Registered patients', value: s.patients().length, to: 'patients', hint: 'Open registry' },
      { label: 'Beds occupied', value: `${s.admissions().length}/${s.beds().length}`, to: 'wards', hint: 'Open bed board' },
      { label: 'Visits today', value: s.appts().filter((a) => this.sameDay(a.at)).length, to: 'appointments', hint: 'View schedule' },
      { label: 'Drugs below reorder', value: s.drugs().filter((d) => d.stock < d.reorder).length, to: 'pharmacy', hint: 'Open pharmacy' },
      { label: 'Owed (GHS)', value: s.invoices().reduce((n, i) => n + i.amount - i.paid, 0).toLocaleString(), to: 'billing', hint: 'Open billing' } ];
    if (this.role === 'Doctor') return [
      { label: 'Clinic today', value: this.clinic().length, to: 'appointments', hint: 'Open schedule' },
      { label: 'My inpatients', value: s.admissions().filter((a) => a.doctorId === this.me.id).length, to: 'wards', hint: 'Ward rounds' },
      { label: 'Results to review', value: s.labs().filter((l) => l.doctorId === this.me.id && l.status === 'Resulted').length, to: 'laboratory', hint: 'Open results' },
      { label: 'Deteriorating', value: high, to: 'wards', hint: 'NEWS2 5 or more' } ];
    if (this.role === 'Pharmacist') return [
      { label: 'To dispense', value: s.orders().filter((o) => !o.dispensed).length, to: 'pharmacy', hint: 'Open dispensing' },
      { label: 'Below reorder level', value: s.drugs().filter((d) => d.stock < d.reorder).length, to: 'pharmacy', hint: 'Receive stock' },
      { label: 'Drugs in stock list', value: s.drugs().length, to: 'pharmacy', hint: 'View stock' } ];
    if (this.role === 'Lab_Technician') return [
      { label: 'Samples to receive', value: s.labs().filter((l) => l.status === 'Ordered').length, to: 'laboratory', hint: 'Open worklist' },
      { label: 'Ready to process', value: s.labs().filter((l) => l.status === 'Collected').length, to: 'laboratory', hint: 'Start tests' },
      { label: 'Results to release', value: s.labs().filter((l) => l.status === 'Processing').length, to: 'laboratory', hint: 'Enter results' } ];
    return [
      { label: 'My patients', value: this.assigned().length, to: 'wards', hint: 'Open bed board' },
      { label: 'Medicines due', value: dueMeds, to: 'medications', hint: 'Start round' },
      { label: 'Vitals overdue', value: s.admissions().filter((a) => { const v = s.vitalsOf(a.patientId).at(-1); return !v || Date.now() - new Date(v.at).getTime() > 4 * 3600000; }).length, to: 'wards', hint: 'Over 4 h since last set' },
      { label: 'High risk', value: high, to: 'wards', hint: 'NEWS2 5 or more' } ];
  });
  readonly work = computed(() => {
    const s = this.store, b = this.base;
    if (this.role === 'Pharmacist') return s.orders().filter((o) => !o.dispensed).map((o) => ({ text: `${o.drug} ${o.dose} for ${s.patient(o.patientId)?.name}`, link: b + '/pharmacy', tone: 'amber' }));
    return s.labs().filter((l) => l.status !== 'Resulted').map((l) => ({ text: `${l.test} for ${s.patient(l.patientId)?.name}: ${l.status.toLowerCase()}`, link: b + '/laboratory', tone: 'amber' }));
  });
  readonly attention = computed(() => {
    const s = this.store, b = this.base, out: { text: string; link: string; tone: string }[] = [];
    if (this.role === 'Pharmacist') { s.drugs().filter((d) => d.stock < d.reorder).forEach((d) => out.push({ text: `${d.name}: ${d.stock} left, reorder at ${d.reorder}`, link: b + '/pharmacy', tone: 'red' })); return out; }
    if (this.role === 'Lab_Technician') { s.labs().filter((l) => l.result.includes('Critical')).forEach((l) => out.push({ text: `Critical result released: ${l.test} for ${s.patient(l.patientId)?.name}`, link: b + '/laboratory', tone: 'red' })); return out; }
    if (this.role === 'Nurse') { s.doses().filter((d) => d.status === 'Due' && this.assigned().some((p) => p.id === d.patientId)).slice(0, 7).forEach((d) => out.push({ text: `${d.time} · ${s.patient(d.patientId)?.name}: ${s.drugName(d.orderId)}`, link: b + '/medications', tone: 'amber' })); return out; }
    s.labs().filter((l) => l.result.includes('Critical')).forEach((l) => out.push({ text: `Critical result: ${l.test} for ${s.patient(l.patientId)?.name}`, link: `${b}/patients/${l.patientId}`, tone: 'red' }));
    s.admissions().filter((a) => (s.latestNews(a.patientId) ?? 0) >= 5).forEach((a) => out.push({ text: `${s.patient(a.patientId)?.name} is deteriorating (NEWS2 ${s.latestNews(a.patientId)})`, link: `${b}/patients/${a.patientId}`, tone: 'red' }));
    if (this.role === 'Admin') s.drugs().filter((d) => d.stock < d.reorder).forEach((d) => out.push({ text: `${d.name}: ${d.stock} left, reorder at ${d.reorder}`, link: b + '/pharmacy', tone: 'amber' }));
    return out;
  });
}
