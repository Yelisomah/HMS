import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserAccountResponse } from '../core/api/api.models';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';
import { clean } from '../shared/ui';

const req = (max: number) => new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(max)] });

/**
 * The backend has no "list users" endpoint, so this page acts on user IDs. Accounts invited in this
 * browser session are listed for convenience; any other user is reached by pasting their ID.
 */
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
      <label>Role *<input formControlName="role" list="roles" placeholder="e.g. DOCTOR" /><datalist id="roles"><option value="ADMIN"></option><option value="DOCTOR"></option><option value="NURSE"></option></datalist></label>
      <label>Staff number<input formControlName="staffNumber" placeholder="Leave blank to auto-generate" /></label>
      <div class="wide"><button class="primary-button inline-button" type="submit" [disabled]="busy()">{{ busy() ? 'Sending…' : 'Send invitation' }}</button></div>
    </form>

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

    @if (recent().length) {
      <section class="panel-block"><h2>Invited this session</h2>
        <div class="table-wrap" style="margin-top:0"><table>
          <thead><tr><th>Username</th><th>Staff no.</th><th>Role</th><th>User ID</th><th></th></tr></thead>
          <tbody>@for (u of recent(); track u.userId) {
            <tr><td>{{ u.username }}</td><td>{{ u.staffNumber || '—' }}</td><td>{{ u.role }}</td><td><code>{{ u.userId }}</code></td>
              <td><button class="text-button" type="button" (click)="manage.controls.userId.setValue(u.userId)">Manage</button></td></tr>
          }</tbody></table></div>
      </section>
    }
  </section>`,
})
export class Admin {
  private readonly api = inject(HmsApi);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly tempPassword = signal('');
  readonly recent = signal<UserAccountResponse[]>([]);
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

  private begin(): void { this.busy.set(true); this.error.set(''); this.notice.set(''); this.tempPassword.set(''); }
  private fail = (e: unknown) => { this.error.set(errorMessage(e)); this.busy.set(false); };

  sendInvite(): void {
    if (this.invite.invalid) return this.invite.markAllAsTouched();
    this.begin();
    this.api.invite(clean(this.invite.getRawValue())).subscribe({
      next: (u) => {
        this.recent.update((l) => [u, ...l]);
        this.notice.set(`Invitation sent to ${u.username ?? 'the new user'}.`);
        this.invite.reset();
        this.busy.set(false);
      },
      error: this.fail,
    });
  }

  act(kind: 'unlock' | 'reactivate' | 'deactivate'): void {
    if (kind === 'deactivate' && !window.confirm('Deactivate this user? They will no longer be able to sign in.')) return;
    this.begin();
    const call = { unlock: this.api.unlockUser, reactivate: this.api.reactivateUser, deactivate: this.api.deactivateUser }[kind];
    call(this.id()).subscribe({
      next: (r) => { this.notice.set(r?.message || 'Done.'); this.busy.set(false); },
      error: this.fail,
    });
  }

  changeRole(): void {
    this.begin();
    this.api.changeRole(this.id(), this.manage.controls.role.value.trim()).subscribe({
      next: (u) => { this.notice.set(`Role changed to ${u.role ?? 'the new role'}.`); this.busy.set(false); },
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
