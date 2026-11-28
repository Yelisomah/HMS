import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MOCKED_MODULES } from '../core/api/api.config';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { StaffMember } from '../core/api/hospital.models';
import { pretty } from '../shared/ui';

type StatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

@Component({
  selector: 'app-staff',
  imports: [DatePipe, ReactiveFormsModule],
  template: `
  <section class="dashboard-view">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Hospital workspace</p>
        <h1>Staff directory</h1>
        <p class="dashboard-intro">Find colleagues by name, role or department.</p>
      </div>
      <button class="mini ghost" type="button" (click)="reload()" [disabled]="loading()">Refresh</button>
    </div>

    @if (mocked) {
      <p class="notice warn" role="status">
        Preview mode: the staff endpoints are not live yet, so this page shows sample staff. The Admissions and
        Appointments doctor and nurse lists use the same source.
      </p>
    }

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-label">Active staff</span><strong>{{ activeCount() }}</strong></div>
      @for (r of roleCounts(); track r.role) {
        <div class="stat-card"><span class="stat-label">{{ label(r.role) }}</span><strong>{{ r.count }}</strong></div>
      }
    </div>

    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }

    <section class="panel-block">
      <div class="form-row">
        <label>Search<input [formControl]="search" placeholder="Name or staff number" /></label>
        <label>Role
          <select [formControl]="role">
            <option value="">All roles</option>
            @for (r of roles(); track r) { <option [value]="r">{{ label(r) }}</option> }
          </select>
        </label>
        <label>Department
          <select [formControl]="department">
            <option value="">All departments</option>
            @for (d of departments(); track d) { <option [value]="d">{{ d }}</option> }
          </select>
        </label>
        <label>Status
          <select [formControl]="status">
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ALL">All</option>
          </select>
        </label>
      </div>

      @if (loading()) { <p class="loading-message" role="status">Loading staff…</p> }
      @else if (!visible().length) { <p class="muted">No staff match these filters.</p> }
      @else {
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Staff no.</th><th>Role</th><th>Department</th><th>Status</th><th></th></tr></thead>
          <tbody>@for (s of visible(); track s.id) {
            <tr>
              <td>{{ s.firstName }} {{ s.lastName }}</td><td>{{ s.staffNumber || '—' }}</td><td>{{ label(s.role) }}</td>
              <td>{{ s.department || '—' }}</td>
              <td><span class="pill {{ s.active === false ? 'pill-red' : 'pill-green' }}">{{ s.active === false ? 'Inactive' : 'Active' }}</span></td>
              <td><button class="text-button" type="button" [attr.aria-expanded]="open()?.id === s.id" (click)="toggle(s)">{{ open()?.id === s.id ? 'Hide' : 'Profile' }}</button></td>
            </tr>
            @if (open()?.id === s.id) {
              <tr><td [attr.colspan]="6">
                @if (profileLoading()) { <p class="loading-message" role="status">Loading profile…</p> }
                @else if (profile(); as p) {
                  <dl class="profile">
                    <div><dt>Role</dt><dd>{{ label(p.role) }}</dd></div>
                    <div><dt>Department</dt><dd>{{ p.department || '—' }}</dd></div>
                    @if (p.specialty) { <div><dt>Specialty</dt><dd>{{ p.specialty }}</dd></div> }
                    @if (p.licenseNumber) { <div><dt>Licence no.</dt><dd>{{ p.licenseNumber }}</dd></div> }
                    <div><dt>Email</dt><dd>@if (p.email) { <a class="cell-link" [href]="'mailto:' + p.email">{{ p.email }}</a> } @else { — }</dd></div>
                    <div><dt>Phone</dt><dd>@if (p.phoneNumber) { <a class="cell-link" [href]="'tel:' + p.phoneNumber">{{ p.phoneNumber }}</a> } @else { — }</dd></div>
                    @if (p.joinedOn) { <div><dt>Joined</dt><dd>{{ p.joinedOn | date: 'd MMM y' }}</dd></div> }
                  </dl>
                }
                @if (profileError()) { <p class="form-alert" role="alert">{{ profileError() }}</p> }
              </td></tr>
            }
          }</tbody>
        </table></div>
        <p class="muted">{{ visible().length }} of {{ staff().length }} staff shown</p>
      }
    </section>
  </section>`,
  styles: [`
    .profile{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:0}
    .profile dt{font-size:12px;color:var(--muted)} .profile dd{margin:2px 0 0;font-weight:600;color:var(--navy)}
  `],
})
export class Staff implements OnInit {
  private readonly api = inject(HmsApi);

  readonly mocked = MOCKED_MODULES.staff;
  readonly staff = signal<StaffMember[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly search = new FormControl('', { nonNullable: true });
  readonly role = new FormControl('', { nonNullable: true });
  readonly department = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<StatusFilter>('ACTIVE', { nonNullable: true });
  private readonly filters = signal({ q: '', role: '', department: '', status: 'ACTIVE' as StatusFilter });

  readonly roles = computed(() => [...new Set(this.staff().map((s) => s.role))].sort());
  readonly departments = computed(() => [...new Set(this.staff().map((s) => s.department).filter((d): d is string => !!d))].sort());
  readonly activeCount = computed(() => this.staff().filter((s) => s.active !== false).length);
  readonly roleCounts = computed(() => this.roles().map((role) => ({ role, count: this.staff().filter((s) => s.role === role && s.active !== false).length })));
  readonly visible = computed(() => {
    const f = this.filters();
    const q = f.q.trim().toLowerCase();
    return this.staff()
      .filter((s) => (!f.role || s.role === f.role) && (!f.department || s.department === f.department)
        && (f.status === 'ALL' || (f.status === 'ACTIVE') === (s.active !== false))
        && (!q || `${s.firstName} ${s.lastName} ${s.staffNumber ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  });

  readonly open = signal<StaffMember | null>(null);
  readonly profile = signal<StaffMember | null>(null);
  readonly profileLoading = signal(false);
  readonly profileError = signal('');

  ngOnInit(): void {
    const sync = () => this.filters.set({ q: this.search.value, role: this.role.value, department: this.department.value, status: this.status.value });
    for (const c of [this.search, this.role, this.department, this.status]) c.valueChanges.subscribe(sync);
    this.reload();
  }

  label = (v?: string) => pretty(v);

  // The full list is loaded once and filtered here; switch to server-side filtering if the backend paginates.
  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.staff().subscribe({
      next: (s) => { this.staff.set(s); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not load the staff directory.')); this.loading.set(false); },
    });
  }

  toggle(s: StaffMember): void {
    if (this.open()?.id === s.id) { this.open.set(null); return; }
    this.open.set(s);
    this.profile.set(s);
    this.profileError.set('');
    this.profileLoading.set(true);
    this.api.staffMember(s.id).subscribe({
      next: (p) => { if (this.open()?.id === s.id) this.profile.set(p); this.profileLoading.set(false); },
      // Fall back to the row data already loaded.
      error: (e: unknown) => { this.profileError.set(errorMessage(e, 'Showing basic details only.')); this.profileLoading.set(false); },
    });
  }
}
