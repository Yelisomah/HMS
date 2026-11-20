import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../Auth/auth.service';
import { age, Claim, HmsStore, ICD, risk } from '../core/hms.store';

const head = (t: string, i: string, store: HmsStore) => `<div class="page-heading"><div><p class="eyebrow">${store.hospital}</p><h1>${t}</h1><p class="dashboard-intro">${i}</p></div></div>`;

/* ---------- Doctor: consultation (SOAP) ---------- */
@Component({
  selector: 'app-consultation',
  imports: [DatePipe, RouterLink],
  template: `
  @if (appt(); as a) {
  <section class="dashboard-view">
    <a class="back-link" [routerLink]="base + '/appointments'">← Appointments</a>
    <header class="banner"><span class="user-avatar big">{{ pt()?.name?.[0] }}</span>
      <div class="banner-main"><h1>{{ pt()?.name }}</h1><p>{{ age(pt()!.dob) }} y · {{ pt()?.sex }} · {{ pt()?.mrn }} · {{ a.reason }}</p>
        @if (v(); as x) { <p>Last vitals {{ x.at | date: 'd MMM HH:mm' }}: BP {{ x.sys }}/{{ x.dia }} · pulse {{ x.pulse }} · temp {{ x.temp }} · SpO2 {{ x.spo2 }}%</p> }</div>
      <div class="banner-alerts">@if (pt()?.allergies?.length) { <span class="pill pill-red">Allergy: {{ pt()?.allergies?.join(', ') }}</span> } @else { <span class="pill pill-green">No known allergies</span> }</div></header>
    @if (msg()) { <p class="notice" role="alert">{{ msg() }}</p> }
    <div class="two-col">
      <section class="panel-block"><h2>SOAP note</h2><div class="stack">
        <label>Subjective: what the patient reports<textarea #s rows="3"></textarea></label>
        <label>Objective: examination findings<textarea #o rows="3"></textarea></label>
        <label>Assessment<textarea #asm rows="2"></textarea></label>
        <label>Plan<textarea #pl rows="2"></textarea></label></div></section>
      <section class="panel-block"><h2>Diagnosis, orders and follow-up</h2><div class="stack">
        <label>Diagnosis (ICD-10)<select #icd>@for (d of icd10; track d) { <option>{{ d }}</option> }</select></label>
        <label>Prescribe (optional)<input #drug placeholder="Drug name" /></label>
        <div class="form-row"><label>Dose<input #dose placeholder="500 mg" /></label><label>Frequency<select #freq><option>8-hourly</option><option>12-hourly</option><option>Daily</option><option>6-hourly</option></select></label></div>
        <label>Order a lab test (optional)<input #lab placeholder="e.g. Full blood count" /></label>
        <label>Follow-up date (optional)<input #fu type="date" /></label>
        <button class="primary-button inline-button" (click)="save(s.value, o.value, asm.value, pl.value, icd.value, drug.value, dose.value, freq.value, lab.value, fu.value)">Complete consultation</button></div></section>
    </div>
  </section>
  } @else { <section class="dashboard-view"><div class="panel-card empty-state"><p>Appointment not found.</p></div></section> }`,
})
export class Consultation {
  readonly store = inject(HmsStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly base = `/${this.auth.getUserId()}`;
  readonly me = this.store.me('Doctor');
  readonly icd10 = ICD;
  readonly age = age;
  readonly msg = signal('');
  readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((m) => m.get('apptId') ?? '')), { initialValue: '' });
  readonly appt = computed(() => this.store.appts().find((a) => a.id === this.id()));
  readonly pt = computed(() => this.store.patient(this.appt()?.patientId ?? ''));
  readonly v = computed(() => this.store.vitalsOf(this.appt()?.patientId ?? '').at(-1));
  save(s: string, o: string, a: string, p: string, icd: string, drug: string, dose: string, freq: string, lab: string, fu: string) {
    const ap = this.appt()!;
    if (!s.trim() || !a.trim()) { this.msg.set('Write the subjective history and the assessment before completing.'); return; }
    this.store.saveEncounter({ patientId: ap.patientId, doctorId: this.me.id, s, o, a, p, icd, followUp: fu }, ap.id);
    if (drug.trim() && dose.trim()) this.store.prescribe({ patientId: ap.patientId, doctorId: this.me.id, drug: drug.trim(), dose: dose.trim(), route: 'Oral', freq });
    if (lab.trim()) this.store.orderLab(ap.patientId, this.me.id, lab.trim());
    if (fu) this.store.addAppt({ patientId: ap.patientId, doctorId: this.me.id, dept: ap.dept, at: new Date(fu + 'T09:00').toISOString(), type: 'Follow-up', status: 'Booked', reason: 'Follow-up: ' + icd });
    void this.router.navigateByUrl(this.base + '/appointments');
  }
}

/* ---------- Register patient ---------- */
@Component({
  selector: 'app-patient-register',
  imports: [RouterLink],
  template: `
  <section class="dashboard-view">
    <a class="back-link" [routerLink]="base + '/patients'">← All patients</a>
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Register a patient</h1><p class="dashboard-intro">A hospital number (MRN) is created when you save.</p></div></div>
    @if (msg()) { <p class="notice" role="alert">{{ msg() }}</p> }
    <section class="panel-block"><div class="form-row">
      <label>Full name<input #name /></label><label>Sex<select #sex><option value="F">Female</option><option value="M">Male</option></select></label>
      <label>Date of birth<input #dob type="date" /></label><label>Phone<input #phone placeholder="024 000 0000" /></label>
      <label>NHIS number<input #nhis placeholder="Leave blank for cash" /></label>
      <label>Blood group<select #blood><option>O+</option><option>O-</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option></select></label>
      <label>Allergies<input #allergy placeholder="Comma separated" /></label><label>Next of kin<input #kin placeholder="Name (relationship)" /></label>
      <label>Doctor<select #doc>@for (d of doctors; track d.id) { <option [value]="d.id">{{ d.name }}</option> }</select></label>
      <button class="primary-button inline-button" (click)="save(name.value, sex.value, dob.value, phone.value, nhis.value, blood.value, allergy.value, kin.value, doc.value)">Register patient</button></div></section>
  </section>`,
})
export class PatientRegister {
  readonly store = inject(HmsStore);
  private readonly router = inject(Router);
  readonly base = `/${inject(AuthService).getUserId()}`;
  readonly doctors = this.store.staff().filter((s) => s.role === 'Doctor');
  readonly msg = signal('');
  save(name: string, sex: string, dob: string, phone: string, nhis: string, blood: string, allergy: string, kin: string, doctorId: string) {
    if (!name.trim() || !dob || !phone.trim()) { this.msg.set('Name, date of birth and phone are required.'); return; }
    const id = this.store.register({ name: name.trim(), sex, dob, phone: phone.trim(), nhis: nhis.trim(), blood, allergies: allergy.split(',').map((a) => a.trim()).filter(Boolean), doctorId, kin: kin.trim() });
    void this.router.navigateByUrl(`${this.base}/patients/${id}`);
  }
}

/* ---------- Admin: insurance claims ---------- */
@Component({
  selector: 'app-claims',
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Insurance and NHIS claims</h1><p class="dashboard-intro">Move each claim from draft to paid, and see what is still outstanding.</p></div></div>
    <div class="stat-grid">@for (t of totals(); track t.l) { <div class="stat-card"><span class="stat-label">{{ t.l }}</span><strong>GHS {{ t.v.toLocaleString() }}</strong></div> }</div>
    <div class="table-wrap"><table><thead><tr><th>Claim</th><th>Patient</th><th>Payer</th><th>Amount</th><th>Status</th><th>Next step</th></tr></thead><tbody>
      @for (c of store.claims(); track c.id) { <tr><td>{{ c.id }}</td><td>{{ patient(c) }}</td><td>{{ c.payer }}</td><td>GHS {{ c.amount.toLocaleString() }}</td>
        <td><span class="pill pill-{{ tone[c.status] }}">{{ c.status }}</span></td>
        <td class="actions">@switch (c.status) {
          @case ('Draft') { <button class="mini" (click)="store.setClaim(c.id, 'Submitted')">Submit</button> }
          @case ('Submitted') { <button class="mini" (click)="store.setClaim(c.id, 'Approved')">Approve</button><button class="mini ghost" (click)="store.setClaim(c.id, 'Rejected')">Reject</button> }
          @case ('Approved') { <button class="mini" (click)="store.setClaim(c.id, 'Paid')">Mark paid</button> }
          @case ('Rejected') { <button class="mini" (click)="store.setClaim(c.id, 'Draft')">Reopen</button> } }</td></tr> }
    </tbody></table></div>
  </section>`,
})
export class Claims {
  readonly store = inject(HmsStore);
  readonly tone: Record<string, string> = { Draft: 'blue', Submitted: 'amber', Approved: 'green', Rejected: 'red', Paid: 'green' };
  patient = (c: Claim) => { const i = this.store.invoices().find((x) => x.id === c.invoiceId); return this.store.patient(i?.patientId ?? '')?.name ?? '—'; };
  totals = computed(() => { const sum = (st: string[]) => this.store.claims().filter((c) => st.includes(c.status)).reduce((n, c) => n + c.amount, 0); return [{ l: 'Claimed (submitted)', v: sum(['Submitted']) }, { l: 'Approved, awaiting payment', v: sum(['Approved']) }, { l: 'Paid', v: sum(['Paid']) }, { l: 'Rejected', v: sum(['Rejected']) }]; });
}

/* ---------- Admin: reports ---------- */
@Component({
  selector: 'app-reports',
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Reports</h1><p class="dashboard-intro">Live figures from visits, billing, wards and consultations.</p></div>
      <button class="primary-button inline-button" (click)="exportCsv()">Export invoices (CSV)</button></div>
    <div class="two-col">
      @for (r of reports(); track r.title) {
        <section class="panel-block"><h2>{{ r.title }}</h2>
          @for (b of r.bars; track b.label) { <div class="occ"><span>{{ b.label }}</span><div class="bar"><i [style.width.%]="b.pct"></i></div><b>{{ b.value }}</b></div> } @empty { <p class="muted">No data yet.</p> }</section>
      }
    </div>
  </section>`,
})
export class Reports {
  readonly store = inject(HmsStore);
  private bars(m: Map<string, number>, fmt = (n: number) => String(n)) { const max = Math.max(1, ...m.values()); return [...m].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, value: fmt(n), pct: (n / max) * 100 })); }
  readonly reports = computed(() => {
    const s = this.store, count = <T>(l: T[], k: (x: T) => string) => { const m = new Map<string, number>(); l.forEach((x) => m.set(k(x), (m.get(k(x)) ?? 0) + 1)); return m; };
    const rev = new Map<string, number>(); s.invoices().forEach((i) => rev.set(i.payer, (rev.get(i.payer) ?? 0) + i.paid));
    const occ = new Map<string, number>(); s.beds().forEach((b) => occ.set(b.ward, (occ.get(b.ward) ?? 0) + (b.admissionId ? 1 : 0)));
    return [
      { title: 'Top diagnoses', bars: this.bars(count(s.encounters(), (e) => e.icd)) },
      { title: 'Revenue collected by payer (GHS)', bars: this.bars(rev, (n) => n.toLocaleString()) },
      { title: 'Visits by clinic', bars: this.bars(count(s.appts(), (a) => a.dept)) },
      { title: 'Occupied beds by ward', bars: this.bars(occ) },
      { title: 'Lab tests by status', bars: this.bars(count(s.labs(), (l) => l.status)) },
      { title: 'Patients seen per doctor', bars: this.bars(count(s.encounters(), (e) => s.staffById(e.doctorId)?.name ?? '—')) },
    ];
  });
  exportCsv() {
    const rows = [['Invoice', 'Patient', 'Payer', 'Amount', 'Paid'], ...this.store.invoices().map((i) => [i.id, this.store.patient(i.patientId)?.name ?? '', i.payer, i.amount, i.paid])];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'invoices.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
}

/* ---------- Admin: audit log ---------- */
@Component({
  selector: 'app-audit',
  imports: [DatePipe],
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Audit log</h1><p class="dashboard-intro">Who changed what, and when. Every save in the system is recorded here.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th></tr></thead><tbody>
      @for (a of store.audit(); track a.id) { <tr><td>{{ a.at | date: 'd MMM, HH:mm:ss' }}</td><td>{{ a.user }}</td><td>{{ a.action }}</td><td>{{ a.detail }}</td></tr> }
    </tbody></table></div>
  </section>`,
})
export class AuditLog { readonly store = inject(HmsStore); }

/* ---------- Admin: access control ---------- */
@Component({
  selector: 'app-access',
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Access control</h1><p class="dashboard-intro">What each role can open. The server must enforce the same rules on every request.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Module</th>@for (r of roles; track r) { <th>{{ r }}</th> }</tr></thead><tbody>
      @for (m of matrix; track m[0]) { <tr><td>{{ m[0] }}</td>@for (r of roles; track r) { <td>@if (m[1].includes(r)) { <span class="pill pill-green">Allowed</span> } @else { <span class="muted">No access</span> }</td> }</tr> }
    </tbody></table></div>
  </section>`,
})
export class AccessControl {
  readonly store = inject(HmsStore);
  readonly roles = ['Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician'];
  readonly matrix: [string, string[]][] = [
    ['Patient registry and charts', ['Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician']], ['Register patients', ['Admin', 'Nurse']],
    ['Consultations and prescribing', ['Doctor']], ['Vitals, medication round, nursing notes', ['Nurse']], ['Admit and transfer', ['Admin', 'Doctor', 'Nurse']], ['Discharge', ['Doctor']],
    ['Order lab tests', ['Doctor']], ['Collect samples', ['Nurse', 'Lab Technician']], ['Enter and release lab results', ['Lab Technician']], ['View lab results', ['Admin', 'Doctor', 'Nurse', 'Lab Technician']],
    ['Dispense medicines', ['Pharmacist']], ['Pharmacy stock and restocking', ['Admin', 'Pharmacist']], ['Book appointments, check in, cancel', ['Admin', 'Nurse']],
    ['Billing and claims', ['Admin']], ['Staff, departments, reports', ['Admin']], ['Audit log and access control', ['Admin']]];
}

/* ---------- Nurse: shift handover (SBAR) ---------- */
@Component({
  selector: 'app-handover',
  imports: [RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Shift handover</h1><p class="dashboard-intro">Situation, background, assessment and recommendation for each of your patients, built from the chart.</p></div>
      <button class="primary-button inline-button" (click)="copy()">Copy handover</button></div>
    @if (msg()) { <p class="notice" role="status">{{ msg() }}</p> }
    @for (h of items(); track h.id) {
      <section class="panel-block"><h2><a class="cell-link" [routerLink]="base + '/patients/' + h.id">{{ h.name }}</a> <small class="muted">{{ h.bed }}</small></h2>
        <dl class="kv"><dt>Situation</dt><dd>{{ h.s }}</dd><dt>Background</dt><dd>{{ h.b }}</dd><dt>Assessment</dt><dd>{{ h.a }}</dd><dt>Recommendation</dt><dd>{{ h.r }}</dd></dl>
        <div class="form-row"><label style="flex:1">Add handover note<input #n placeholder="Anything the next nurse must know" /></label><button class="mini" (click)="add(h.id, n)">Save note</button></div></section>
    } @empty { <div class="panel-card empty-state"><p>No patients are assigned to you.</p></div> }
  </section>`,
})
export class Handover {
  readonly store = inject(HmsStore);
  readonly base = `/${inject(AuthService).getUserId()}`;
  readonly me = this.store.me('Nurse');
  readonly msg = signal('');
  readonly items = computed(() => this.store.admissions().filter((a) => a.nurseId === this.me.id).map((a) => {
    const p = this.store.patient(a.patientId)!, v = this.store.vitalsOf(p.id).at(-1), n = this.store.latestNews(p.id) ?? 0, due = this.store.doses().filter((d) => d.patientId === p.id && d.status === 'Due').map((d) => `${d.time} ${this.store.drugName(d.orderId)}`);
    return { id: p.id, name: p.name, bed: `${this.store.bedOf(p.id)?.label}`, s: `${a.reason}. ${a.code}.`, b: `${age(p.dob)} y ${p.sex}. Allergies: ${p.allergies.join(', ') || 'none known'}. Doctor: ${this.store.staffById(a.doctorId)?.name}.`,
      a: v ? `BP ${v.sys}/${v.dia}, pulse ${v.pulse}, temp ${v.temp}, SpO2 ${v.spo2}%, RR ${v.rr}. NEWS2 ${n} (${risk(n)} risk).` : 'No vitals recorded.', r: (n >= 5 ? 'Review by doctor and repeat vitals every hour. ' : '') + (due.length ? 'Medicines still due: ' + due.join('; ') + '.' : 'No medicines outstanding.') };
  }));
  add(id: string, el: HTMLInputElement) { if (!el.value.trim()) return; this.store.addNote({ patientId: id, nurseId: this.me.id, text: 'Handover: ' + el.value.trim() }); el.value = ''; this.msg.set('Handover note saved to the patient chart.'); }
  copy() { const t = this.items().map((h) => `${h.name} (${h.bed})\nS: ${h.s}\nB: ${h.b}\nA: ${h.a}\nR: ${h.r}`).join('\n\n'); navigator.clipboard?.writeText(t).then(() => this.msg.set('Handover copied.'), () => this.msg.set('Could not copy. Select the text and copy it manually.')); }
}

/* ---------- Laboratory bench ---------- */
@Component({
  selector: 'app-lab-bench',
  imports: [RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Laboratory</h1><p class="dashboard-intro">{{ isLab ? 'Receive samples, run tests and release results to the doctor and the patient chart.' : 'Test orders with sample and result status.' }}</p></div></div>
    <div class="stat-grid">@for (s of stages; track s) { <div class="stat-card"><span class="stat-label">{{ s }}</span><strong>{{ count(s) }}</strong></div> }</div>
    @if (msg()) { <p class="notice" role="status">{{ msg() }}</p> }
    <div class="table-wrap"><table><thead><tr><th>Patient</th><th>Test</th><th>Ordered by</th><th>Status</th><th>Result</th>@if (canCollect || isLab) { <th>Action</th> }</tr></thead><tbody>
      @for (l of rows(); track l.id) {
        <tr><td><a class="cell-link" [routerLink]="base + '/patients/' + l.patientId">{{ store.patient(l.patientId)?.name }}</a></td>
          <td>{{ l.test }}@if (ranges[l.test]) { <small class="muted"> Normal: {{ ranges[l.test] }}</small> }</td><td>{{ store.staffById(l.doctorId)?.name }}</td>
          <td><span class="pill pill-{{ l.status === 'Resulted' ? 'green' : 'amber' }}">{{ l.status }}</span></td>
          <td>@if (l.result.includes('Critical')) { <span class="pill pill-red">{{ l.result }}</span> } @else if (l.result.includes('Abnormal')) { <span class="pill pill-amber">{{ l.result }}</span> } @else { {{ l.result || 'Pending' }} }</td>
          @if (canCollect || isLab) { <td>
            @if (l.status === 'Ordered' && canCollect) { <button class="mini" (click)="store.setLab(l.id, 'Collected')">{{ isLab ? 'Receive sample' : 'Mark collected' }}</button> }
            @else if (l.status === 'Collected' && isLab) { <button class="mini" (click)="store.setLab(l.id, 'Processing')">Start processing</button> }
            @else if (l.status === 'Processing' && isLab) { <div class="form-row"><input #v placeholder="Result with units" /><select #f><option>Normal</option><option>Abnormal</option><option>Critical</option></select><button class="mini" (click)="release(l.id, v, f.value)">Release result</button></div> }
          </td> }</tr>
      }
    </tbody></table></div>
  </section>`,
})
export class LabBench {
  readonly store = inject(HmsStore);
  private readonly auth = inject(AuthService);
  readonly role = this.auth.getRole() ?? 'Admin';
  readonly me = this.store.me(this.role);
  readonly base = `/${this.auth.getUserId()}`;
  readonly isLab = this.role === 'Lab_Technician';
  readonly canCollect = this.role === 'Nurse' || this.isLab;
  readonly msg = signal('');
  readonly stages = ['Ordered', 'Collected', 'Processing', 'Resulted'];
  readonly ranges: Record<string, string> = { 'Full blood count': 'WBC 4 to 11 ×10⁹/L', Haemoglobin: '12 to 16 g/dL', 'Troponin I': 'below 0.04 ng/mL', 'Renal function': 'Creatinine 60 to 110 µmol/L', 'Urine protein': 'Negative' };
  readonly rows = computed(() => (this.role === 'Doctor' ? this.store.labs().filter((l) => l.doctorId === this.me.id) : this.store.labs()));
  count = (s: string) => this.store.labs().filter((l) => l.status === s).length;
  release(id: string, el: HTMLInputElement, flag: string) { if (!el.value.trim()) { this.msg.set('Enter the result with its units before releasing.'); return; } this.store.setLabResult(id, el.value.trim(), flag); this.msg.set(flag === 'Critical' ? 'Critical result released. Call the doctor now.' : 'Result released to the doctor and patient chart.'); }
}

/* ---------- Pharmacy: dispensing and stock ---------- */
@Component({
  selector: 'app-pharmacy-desk',
  imports: [RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Pharmacy</h1><p class="dashboard-intro">Dispense prescriptions, receive stock and watch reorder levels and expiry dates.</p></div></div>
    <div class="stat-grid">@for (t of tiles(); track t.l) { <div class="stat-card"><span class="stat-label">{{ t.l }}</span><strong>{{ t.v }}</strong></div> }</div>
    @if (msg()) { <p class="notice" role="status">{{ msg() }}</p> }
    <h2 class="ward-title">Prescriptions to dispense</h2>
    <div class="table-wrap"><table><thead><tr><th>Patient</th><th>Drug</th><th>Dose · route</th><th>Frequency</th><th>Prescriber</th><th>Safety</th>@if (canDispense) { <th>Action</th> }</tr></thead><tbody>
      @for (o of queue(); track o.id) { <tr><td><a class="cell-link" [routerLink]="base + '/patients/' + o.patientId">{{ store.patient(o.patientId)?.name }}</a></td><td>{{ o.drug }}</td><td>{{ o.dose }} · {{ o.route }}</td><td>{{ o.freq }}</td><td>{{ store.staffById(o.doctorId)?.name }}</td>
        <td>@if (hit(o.id); as h) { <span class="pill pill-red">Allergy: {{ h }}</span> } @else { <span class="pill pill-green">No allergy match</span> }</td>
        @if (canDispense) { <td><button class="mini" (click)="dispense(o.id)">Dispense</button></td> }</tr> } @empty { <tr><td colspan="7" class="muted">Every prescription has been dispensed.</td></tr> }
    </tbody></table></div>
    <h2 class="ward-title">Stock</h2>
    <div class="table-wrap"><table><thead><tr><th>Drug</th><th>In stock</th><th>Reorder at</th><th>Expiry</th><th>Unit price</th><th>Status</th>@if (canStock) { <th>Receive stock</th> }</tr></thead><tbody>
      @for (d of store.drugs(); track d.id) { <tr><td>{{ d.name }}</td><td>{{ d.stock }}</td><td>{{ d.reorder }}</td><td>{{ d.expiry }}</td><td>GHS {{ d.price.toFixed(2) }}</td>
        <td><span class="pill pill-{{ d.stock < d.reorder ? 'red' : d.expiry <= soon ? 'amber' : 'green' }}">{{ d.stock < d.reorder ? 'Low stock' : d.expiry <= soon ? 'Expiring soon' : 'OK' }}</span></td>
        @if (canStock) { <td><div class="form-row"><input #q type="number" min="1" placeholder="Qty" style="width:80px" /><button class="mini" (click)="receive(d.id, q)">Receive</button></div></td> }</tr> }
    </tbody></table></div>
    @if (canStock) {
      <section class="panel-block"><h2>Add a drug</h2><div class="form-row">
        <label>Name and strength<input #n placeholder="e.g. Metformin 500 mg" /></label><label>Quantity<input #q type="number" /></label><label>Reorder at<input #r type="number" /></label>
        <label>Unit price (GHS)<input #p type="number" step="0.1" /></label><label>Expiry<input #e type="month" /></label>
        <button class="primary-button inline-button" (click)="add(n.value, q.value, r.value, p.value, e.value)">Add drug</button></div></section>
    }
  </section>`,
})
export class PharmacyDesk {
  readonly store = inject(HmsStore);
  private readonly auth = inject(AuthService);
  readonly role = this.auth.getRole() ?? 'Admin';
  readonly base = `/${this.auth.getUserId()}`;
  readonly canDispense = this.role === 'Pharmacist';
  readonly canStock = this.role === 'Pharmacist' || this.role === 'Admin';
  readonly msg = signal('');
  readonly soon = (() => { const d = new Date(); d.setMonth(d.getMonth() + 2); return d.toISOString().slice(0, 7); })();
  readonly queue = computed(() => this.store.orders().filter((o) => !o.dispensed));
  readonly tiles = computed(() => [{ l: 'To dispense', v: this.queue().length }, { l: 'Below reorder level', v: this.store.drugs().filter((d) => d.stock < d.reorder).length }, { l: 'Expiring within 2 months', v: this.store.drugs().filter((d) => d.expiry <= this.soon).length }, { l: 'Stock value (GHS)', v: Math.round(this.store.drugs().reduce((n, d) => n + d.stock * d.price, 0)).toLocaleString() }]);
  hit(orderId: string) { const o = this.store.orders().find((x) => x.id === orderId)!; return this.store.patient(o.patientId)?.allergies.find((a) => o.drug.toLowerCase().includes(a.toLowerCase())) ?? ''; }
  dispense(id: string) { const h = this.hit(id); this.msg.set(h ? `Blocked: the patient is allergic to ${h}. Contact the prescriber.` : this.store.dispense(id)); }
  receive(id: string, el: HTMLInputElement) { const n = Number(el.value); if (!(n > 0)) { this.msg.set('Enter a quantity greater than zero.'); return; } this.store.restock(id, n); el.value = ''; this.msg.set(`Received ${n} units.`); }
  add(name: string, qty: string, reorder: string, price: string, expiry: string) {
    if (!name.trim() || !qty || !price || !expiry) { this.msg.set('Name, quantity, price and expiry are required.'); return; }
    this.store.addDrug({ name: name.trim(), stock: +qty, reorder: +reorder || 0, price: +price, expiry }); this.msg.set(`${name.trim()} added to stock.`);
  }
}

/* ---------- Book an appointment ---------- */
@Component({
  selector: 'app-book-appointment',
  imports: [RouterLink],
  template: `
  <section class="dashboard-view">
    <a class="back-link" [routerLink]="base + '/appointments'">← Appointments</a>
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Book an appointment</h1><p class="dashboard-intro">Scheduled and follow-up visits need a date and time. Walk-ins join the queue now.</p></div></div>
    @if (msg()) { <p class="notice" role="alert">{{ msg() }}</p> }
    <section class="panel-block"><div class="form-row">
      <label>Patient<select #pat>@for (p of store.patients(); track p.id) { <option [value]="p.id">{{ p.name }} · {{ p.mrn }}</option> }</select></label>
      <label>Doctor<select #doc>@for (d of doctors; track d.id) { <option [value]="d.id">{{ d.name }}</option> }</select></label>
      <label>Clinic<select #dept>@for (d of clinics; track d) { <option>{{ d }}</option> }</select></label>
      <label>Visit type<select #type><option>Scheduled</option><option>Follow-up</option><option>Walk-in</option></select></label>
      <label>Date<input #date type="date" /></label><label>Time<input #time type="time" value="09:00" /></label>
      <label style="flex:1">Reason for visit<input #why placeholder="e.g. Blood pressure review" /></label>
      <button class="primary-button inline-button" (click)="save(pat.value, doc.value, dept.value, type.value, date.value, time.value, why.value)">Book appointment</button></div></section>
  </section>`,
})
export class BookAppointment {
  readonly store = inject(HmsStore);
  private readonly router = inject(Router);
  readonly base = `/${inject(AuthService).getUserId()}`;
  readonly doctors = this.store.staff().filter((s) => s.role === 'Doctor');
  readonly clinics = this.store.depts().map((d) => d.name).filter((n) => n !== 'Laboratory' && n !== 'Pharmacy');
  readonly msg = signal('');
  save(patientId: string, doctorId: string, dept: string, type: string, date: string, time: string, reason: string) {
    if (!reason.trim()) { this.msg.set('Enter a reason for the visit.'); return; }
    const walkIn = type === 'Walk-in';
    if (!walkIn && (!date || !time)) { this.msg.set('Choose a date and time.'); return; }
    const at = walkIn ? new Date().toISOString() : new Date(`${date}T${time}`).toISOString();
    if (!walkIn && new Date(at).getTime() < Date.now()) { this.msg.set('That time has passed. Choose a future time.'); return; }
    if (!walkIn && this.store.appts().some((a) => a.doctorId === doctorId && a.at === at && a.status !== 'Cancelled')) { this.msg.set(`${this.store.staffById(doctorId)?.name} already has a visit at that time. Choose another slot.`); return; }
    this.store.addAppt({ patientId, doctorId, dept, at, type, status: walkIn ? 'Waiting' : 'Booked', reason: reason.trim() });
    void this.router.navigateByUrl(this.base + '/appointments');
  }
}

/* ---------- Add a staff member ---------- */
@Component({
  selector: 'app-staff-form',
  imports: [RouterLink],
  template: `
  <section class="dashboard-view">
    <a class="back-link" [routerLink]="base + '/staff'">← Staff</a>
    <div class="page-heading"><div><p class="eyebrow">{{ store.hospital }}</p><h1>Add a staff member</h1><p class="dashboard-intro">Use the same email the person will sign in with, so their account opens their own work.</p></div></div>
    @if (msg()) { <p class="notice" role="alert">{{ msg() }}</p> }
    <section class="panel-block"><div class="form-row">
      <label>Full name<input #name /></label><label>Work email<input #email type="email" /></label>
      <label>Role<select #role>@for (r of roles; track r) { <option>{{ r }}</option> }</select></label>
      <label>Department<select #dept>@for (d of store.depts(); track d.id) { <option>{{ d.name }}</option> }<option>Administration</option></select></label>
      <label>Licence number<input #lic /></label><label>Shift<select #shift><option>Day</option><option>Night</option></select></label>
      <button class="primary-button inline-button" (click)="save(name.value, email.value, role.value, dept.value, lic.value, shift.value)">Add staff member</button></div></section>
  </section>`,
})
export class StaffForm {
  readonly store = inject(HmsStore);
  private readonly router = inject(Router);
  readonly base = `/${inject(AuthService).getUserId()}`;
  readonly roles = ['Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Admin'];
  readonly msg = signal('');
  save(name: string, email: string, role: string, dept: string, license: string, shift: string) {
    if (!name.trim() || !email.includes('.') || !email.includes('@')) { this.msg.set('Enter a name and a valid email.'); return; }
    if (this.store.staff().some((s) => s.email.toLowerCase() === email.trim().toLowerCase())) { this.msg.set('A staff member with that email already exists.'); return; }
    this.store.addStaff({ name: name.trim(), email: email.trim(), role, dept, license: license.trim() || '—', shift });
    void this.router.navigateByUrl(this.base + '/staff');
  }
}
