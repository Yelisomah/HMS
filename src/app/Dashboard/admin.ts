import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserAccountResponse } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { clean } from '../shared/ui';

const req = (max: number) => new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(max)] });

@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule],
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">Administration</p><h1>User management</h1><p class="dashboard-intro">Invite staff and manage their access.</p></div></div>
    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
    @if (error()) { <p class="form-alert" role="alert">{{ error() }}</p> }
    @if (tempPassword()) { <p class="notice warn" role="alert"><b>Temporary password:</b> <code>{{ tempPassword() }}</code> — share it securely; the user must change it at first sign-in.</p> }

    <form class="panel-block grid-form" [formGroup]="invite" (ngSubmit)="sendInvite()" novalidate>
      <h2>Invite a user</h2>
      <label>Username *<input formControlName="username" autocomplete="off" /></label>
      <label>First name *<input formControlName="firstName" /></label>
      <label>Last name *<input formControlName="lastName" /></label>
      <label>Email *<input type="email" formControlName="email" /></label>
      <label>Phone number *<input type="tel" formControlName="phoneNumber" /></label>
      <label>Role *<input formControlName="role" list="roles" placeholder="e.g. DOCTOR" /><datalist id="roles"><option value="ADMIN"></option><option value="DOCTOR"></option><option value="NURSE"></option><option value="PHARMACIST"></option><option value="LAB_TECHNICIAN"></option><option value="OPD"></option></datalist></label>
      <label>Staff number<input formControlName="staffNumber" placeholder="Leave blank to auto-generate" /></label>
      <div class="wide"><button class="primary-button inline-button" type="submit" [disabled]="busy()">{{ busy() ? 'Sending…' : 'Send invitation' }}</button></div>
    </form>

    <section class="panel-block">
      <div class="section-head">
        <h2>Staff directory</h2>
        <button class="mini ghost-btn" type="button" (click)="loadUsers()" [disabled]="loadingUsers()">
          {{ loadingUsers() ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
      <p class="muted">The directory uses the configured GET /api/admin/users endpoint.</p>
      @if (usersError()) { <p class="form-alert" role="alert">{{ usersError() }}</p> }
      @else if (loadingUsers()) { <p class="loading-message" role="status">Loading staff accounts…</p> }
      @else if (!users().length) { <p class="muted">No staff accounts were returned.</p> }
      @else {
        <label>Filter accounts<input type="search" [value]="userSearch()" (input)="setUserSearch($any($event.target).value)" placeholder="Name, staff number, role, or ID" /></label>
        @if (!filteredUsers().length) { <p class="muted">No accounts match this filter.</p> }
        @else {
          <div class="table-wrap">
            <table>
              <thead><tr><th>Username</th><th>Email</th><th>Staff no.</th><th>Role</th><th>Status</th><th>User ID</th><th></th></tr></thead>
              <tbody>@for (u of filteredUsers(); track u.userId) {
                <tr>
                  <td>{{ u.username || '—' }}</td><td>{{ u.email || '—' }}</td><td>{{ u.staffNumber || '—' }}</td>
                  <td>{{ u.role || '—' }}</td><td>{{ u.enabled === undefined ? 'Unknown' : u.enabled ? 'Enabled' : 'Disabled' }}</td>
                  <td><code>{{ u.userId }}</code></td>
                  <td><button class="text-button" type="button" (click)="selectUser(u)">Manage</button></td>
                </tr>
              }</tbody>
            </table>
          </div>
        }
      }
    </section>

    <section class="panel-block">
      <h2>Manage an existing user</h2>
      <form class="form-row" [formGroup]="manage" (submit)="$event.preventDefault()">
        <label>User ID<input formControlName="userId" placeholder="Paste the user ID" /></label>
        <label>New role<input formControlName="role" list="roles" /></label>
      </form>
      <div class="actions wrap" style="margin-top:12px">
        <button class="mini" type="button" [disabled]="!id() || busy() || !manage.controls.role.value.trim()" (click)="changeRole()">Change role</button>
        <button class="mini" type="button" [disabled]="!id() || busy()" (click)="act('unlock')">Unlock</button>
        <button class="mini" type="button" [disabled]="!id() || busy()" (click)="act('reactivate')">Reactivate</button>
        <button class="mini ghost" type="button" [disabled]="!id() || busy()" (click)="act('deactivate')">Deactivate</button>
        <button class="mini ghost" type="button" [disabled]="!id() || busy()" (click)="resetPassword()">Reset password</button>
      </div>
    </section>

  </section>`,
})
export class Admin {
  private readonly api = inject(HmsApi);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly tempPassword = signal('');
  readonly users = signal<UserAccountResponse[]>([]);
  readonly loadingUsers = signal(true);
  readonly usersError = signal('');
  readonly userSearch = signal('');
  readonly filteredUsers = computed(() => {
    const query = this.userSearch().trim().toLowerCase();
    if (!query) return this.users();
    return this.users().filter((user) =>
      [user.username, user.email, user.staffNumber, user.role, user.userId]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  });
  readonly invite = new FormGroup({
    username: req(50), firstName: req(100), lastName: req(100),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(255)] }),
    phoneNumber: req(50), role: req(50), staffNumber: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
  });
  readonly manage = new FormGroup({
    userId: new FormControl('', { nonNullable: true }),
    role: new FormControl('', { nonNullable: true }),
  });
  readonly id = () => this.manage.controls.userId.value.trim();

  constructor() { this.loadUsers(); }

  private begin(): void { this.busy.set(true); this.error.set(''); this.notice.set(''); this.tempPassword.set(''); }
  private fail = (e: unknown) => { this.error.set(errorMessage(e)); this.busy.set(false); };

  setUserSearch(value: string): void { this.userSearch.set(value); }

  selectUser(user: UserAccountResponse): void {
    this.manage.patchValue({ userId: user.userId, role: user.role ?? '' });
  }

  loadUsers(): void {
    this.loadingUsers.set(true);
    this.usersError.set('');
    this.api.listUsers().subscribe({
      next: (users) => {
        if (!Array.isArray(users)) {
          this.usersError.set('The staff directory endpoint must return an array of user accounts.');
          this.loadingUsers.set(false);
          return;
        }
        this.users.set(users);
        this.loadingUsers.set(false);
      },
      error: (e: unknown) => {
        this.usersError.set(`Could not load the staff directory. The backend must implement GET /api/admin/users. ${errorMessage(e)}`);
        this.loadingUsers.set(false);
      },
    });
  }

  sendInvite(): void {
    if (this.invite.invalid) return this.invite.markAllAsTouched();
    this.begin();
    this.api.invite(clean(this.invite.getRawValue())).subscribe({
      next: (u) => {
        this.notice.set(`Invitation sent to ${u.username ?? 'the new user'}.`);
        this.invite.reset();
        this.busy.set(false);
        this.loadUsers();
      },
      error: this.fail,
    });
  }

  act(kind: 'unlock' | 'reactivate' | 'deactivate'): void {
    if (kind === 'deactivate' && !window.confirm('Deactivate this user? They will no longer be able to sign in.')) return;
    this.begin();
    const call = { unlock: this.api.unlockUser, reactivate: this.api.reactivateUser, deactivate: this.api.deactivateUser }[kind];
    call(this.id()).subscribe({
      next: (r) => { this.notice.set(r?.message || 'Done.'); this.busy.set(false); this.loadUsers(); },
      error: this.fail,
    });
  }

  changeRole(): void {
    this.begin();
    this.api.changeRole(this.id(), this.manage.controls.role.value.trim()).subscribe({
      next: (u) => { this.notice.set(`Role changed to ${u.role ?? 'the new role'}.`); this.busy.set(false); this.loadUsers(); },
      error: this.fail,
    });
  }

  resetPassword(): void {
    if (!window.confirm('Reset this user’s password? A temporary password will be generated.')) return;
    this.begin();
    this.api.adminResetPassword(this.id()).subscribe({
      next: (r) => { this.notice.set(r?.message || 'Password reset.'); this.tempPassword.set(r?.temporaryPassword ?? ''); this.busy.set(false); },
      error: this.fail,
    });
  }
}
