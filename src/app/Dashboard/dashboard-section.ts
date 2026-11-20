import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../Auth/auth.service';
import { age, HmsStore } from '../core/hms.store';

interface Act { label: string; run: () => void; ghost?: boolean }
interface Row { cells: string[]; link?: string; acts?: Act[] }
interface View { title: string; intro: string; cols: string[]; rows: Row[]; actions?: boolean }
const TONES: Record<string, string> = { Critical: 'red', Low: 'red', Expiring: 'red', Unpaid: 'red', Waiting: 'amber', Cancelled: 'red', Ordered: 'amber', Collected: 'amber', Processing: 'amber', Booked: 'amber', 'Checked in': 'amber', Part: 'amber', Resulted: 'green', Completed: 'green', Paid: 'green', Admitted: 'green', OK: 'green', 'In consultation': 'blue', Outpatient: 'blue' };

@Component({
  selector: 'app-dashboard-section',
  imports: [RouterLink],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div><p class="eyebrow">{{ store.hospital }}</p><h1>{{ view().title }}</h1><p class="dashboard-intro">{{ view().intro }}</p></div>
      @if (action(); as a) { <a class="primary-button inline-button" [routerLink]="base + a.path">{{ a.label }}</a> }
      <input class="search" type="search" placeholder="Search this list" aria-label="Search this list" (input)="q.set($any($event.target).value)" />
    </div>
    @if (!view().cols.length) {
      <div class="panel-card empty-state"><p>This section is not available for your role.</p></div>
    } @else if (!rows().length) {
      <div class="panel-card empty-state"><p>No records match. Clear the search or add a new record.</p></div>
    } @else {
      <div class="table-wrap">
        <table>
          <thead><tr>@for (c of view().cols; track c) { <th>{{ c }}</th> }@if (view().actions) { <th>Actions</th> }</tr></thead>
          <tbody>
            @for (r of rows(); track $index) {
              <tr>
                @for (c of r.cells; track $index) {
                  <td>
                    @if ($first && r.link) { <a class="cell-link" [routerLink]="r.link">{{ c }}</a> }
                    @else if (tone(c); as t) { <span class="pill pill-{{ t }}">{{ c }}</span> }
                    @else { {{ c }} }
                  </td>
                }
                @if (view().actions) { <td class="actions">@for (a of r.acts ?? []; track a.label) { <button class="mini" [class.ghost]="a.ghost" (click)="a.run()">{{ a.label }}</button> }</td> }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </section>`,
})
export class DashboardSection {
  readonly store = inject(HmsStore);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly role = this.auth.getRole() ?? 'Admin';
  readonly me = this.store.me(this.role);
  readonly base = `/${this.auth.getUserId()}`;
  readonly q = signal('');
  readonly section = toSignal(this.route.paramMap.pipe(map((p) => p.get('section') ?? '')), { initialValue: '' });

  readonly action = computed(() => {
    const s = this.section();
    if (s === 'patients' && (this.role === 'Admin' || this.role === 'Nurse')) return { label: 'Register patient', path: '/patients/new' };
    if (s === 'appointments' && (this.role === 'Admin' || this.role === 'Nurse')) return { label: 'Book appointment', path: '/appointments/new' };
    if (s === 'staff' && this.role === 'Admin') return { label: 'Add staff member', path: '/staff/new' };
    return null;
  });
  tone(c: string) { const k = Object.keys(TONES).find((x) => c === x || c.startsWith(x + ' ')); return k ? TONES[k] : ''; }
  private t = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  private mine = <T extends { doctorId: string }>(l: T[]) => (this.role === 'Doctor' ? l.filter((x) => x.doctorId === this.me.id) : l);

  readonly view = computed<View>(() => {
    const s = this.store, name = (id: string) => s.patient(id)?.name ?? '—', doc = (id: string) => s.staffById(id)?.name ?? '—';
    switch (this.section()) {
      case 'patients':
        return { title: this.role === 'Doctor' ? 'My patients' : 'Patients', intro: 'Registry with allergies, payer and admission status. Open a patient to see their full chart.', cols: ['Patient', 'MRN', 'Age / sex', 'Payer', 'Status', 'Doctor', 'Allergies'],
          rows: this.mine(s.patients().map((p) => ({ ...p }))).map((p) => ({ link: `${this.base}/patients/${p.id}`, cells: [p.name, p.mrn, `${age(p.dob)} / ${p.sex}`, p.nhis ? 'NHIS' : 'Cash', s.bedOf(p.id) ? `Admitted · ${s.bedOf(p.id)!.label}` : 'Outpatient', doc(p.doctorId), p.allergies.join(', ') || 'None known'] })) };
      case 'appointments':
        return { title: 'Appointments', intro: this.role === 'Doctor' ? 'Your clinic list for today and tomorrow.' : 'Scheduled, walk-in and follow-up visits across all clinics.', cols: ['Patient', 'Time', 'Clinic', 'Type', 'Doctor', 'Reason', 'Status'],
          rows: this.mine(s.appts()).map((a) => ({ link: this.role === 'Doctor' && a.status !== 'Completed' && a.status !== 'Cancelled' ? `${this.base}/consult/${a.id}` : `${this.base}/patients/${a.patientId}`, cells: [name(a.patientId), this.t(a.at), a.dept, a.type, doc(a.doctorId), a.reason, a.status],
            acts: this.role === 'Admin' || this.role === 'Nurse' ? [...(a.status === 'Booked' ? [{ label: 'Check in', run: () => s.setAppt(a.id, 'Checked in') }] : []), ...(['Booked', 'Checked in', 'Waiting'].includes(a.status) ? [{ label: 'Cancel', ghost: true, run: () => s.setAppt(a.id, 'Cancelled') }] : [])] : [] })), actions: this.role === 'Admin' || this.role === 'Nurse' };
      case 'staff':
        return this.role !== 'Admin' ? this.none() : { title: 'Staff', intro: 'Clinical and support staff with licence numbers and current shift.', cols: ['Name', 'Role', 'Department', 'Licence', 'Shift', 'Email'], rows: s.staff().map((m) => ({ cells: [m.name, m.role, m.dept, m.license, m.shift, m.email] })) };
      case 'departments':
        return this.role !== 'Admin' ? this.none() : { title: 'Departments', intro: 'Each department with its head and number of staff.', cols: ['Department', 'Head', 'Staff'], rows: s.depts().map((d) => ({ cells: [d.name, doc(d.head), String(s.staff().filter((m) => m.dept === d.name).length)] })) };
      case 'laboratory':
        return { title: 'Laboratory', intro: 'Test orders from consultations and wards, with sample and result status.', cols: ['Patient', 'Test', 'Ordered by', 'Status', 'Result'],
          rows: this.mine(s.labs()).map((l) => ({ link: `${this.base}/patients/${l.patientId}`, cells: [name(l.patientId), l.test, doc(l.doctorId), l.status, l.result || 'Pending'] })) };
      case 'pharmacy':
        return this.role !== 'Admin' ? this.none() : { title: 'Pharmacy', intro: 'Stock against reorder level, with expiry and unit price in GHS.', cols: ['Drug', 'In stock', 'Reorder at', 'Expiry', 'Unit price', 'Status'],
          rows: s.drugs().map((d) => ({ cells: [d.name, String(d.stock), String(d.reorder), d.expiry, 'GHS ' + d.price.toFixed(2), d.stock < d.reorder ? 'Low stock' : d.expiry <= '2026-12' ? 'Expiring soon' : 'OK'] })) };
      case 'billing':
        return this.role !== 'Admin' ? this.none() : { title: 'Billing', intro: 'Invoices with payer, amount paid and balance in GHS.', cols: ['Invoice', 'Patient', 'Payer', 'Amount', 'Paid', 'Balance', 'Status'],
          rows: s.invoices().map((i) => ({ link: `${this.base}/patients/${i.patientId}`, cells: [i.id, name(i.patientId), i.payer, 'GHS ' + i.amount, 'GHS ' + i.paid, 'GHS ' + (i.amount - i.paid), i.paid >= i.amount ? 'Paid' : i.paid ? 'Part paid' : 'Unpaid'] })) };
      default: return this.none();
    }
  });
  private none = (): View => ({ title: 'Not available', intro: '', cols: [], rows: [] });
  readonly rows = computed(() => { const q = this.q().toLowerCase(); return this.view().rows.filter((r) => !q || r.cells.join(' ').toLowerCase().includes(q)); });
}
