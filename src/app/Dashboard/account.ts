import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../Auth/auth.service';
import { passwordsMatch } from '../Auth/reset-password/reset-password';
import { errorMessage } from '../core/api/errors';
import { HmsApi } from '../core/api/hms-api';

@Component({
  selector: 'app-account',
  imports: [ReactiveFormsModule],
  template: `
  <section class="dashboard-view">
    <div class="page-heading"><div><p class="eyebrow">Hospital workspace</p><h1>My account</h1><p class="dashboard-intro">Your sign-in details and password.</p></div></div>
    @if (user(); as u) {
      @if (u.mustChangePassword) { <p class="notice warn" role="alert">You are using a temporary password. Please choose a new one now.</p> }
      <section class="panel-block"><h2>Profile</h2>
        <dl class="kv">
          <dt>Name</dt><dd>{{ u.name || '—' }}</dd><dt>Username</dt><dd>{{ u.username || '—' }}</dd>
          <dt>Staff number</dt><dd>{{ u.staffNumber || '—' }}</dd><dt>Role</dt><dd>{{ u.role || '—' }}</dd>
        </dl></section>
    }
    <form class="panel-block grid-form compact" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h2>Change password</h2>
      <label class="wide">Current password<input type="password" formControlName="currentPassword" autocomplete="current-password" /></label>
      <label>New password<input type="password" formControlName="newPassword" autocomplete="new-password" /></label>
      <label>Confirm new password<input type="password" formControlName="confirm" autocomplete="new-password" /></label>
      @if (form.touched && form.controls.newPassword.invalid) { <p class="field-error wide">The new password must be at least 8 characters.</p> }
      @if (form.touched && form.hasError('mismatch')) { <p class="field-error wide">The new passwords do not match.</p> }
      @if (done()) { <p class="notice wide" role="status">{{ done() }}</p> }
      @if (error()) { <p class="form-alert wide" role="alert">{{ error() }}</p> }
      <div class="wide"><button class="mini" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Change password' }}</button></div>
    </form>
  </section>`,
})
export class Account {
  private readonly api = inject(HmsApi);
  readonly user = inject(AuthService).user;
  readonly busy = signal(false);
  readonly done = signal('');
  readonly error = signal('');
  readonly form = new FormGroup(
    {
      currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: passwordsMatch },
  );

  submit(): void {
    if (this.form.invalid) return this.form.markAllAsTouched();
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.busy.set(true);
    this.done.set('');
    this.error.set('');
    this.api.changePassword(currentPassword, newPassword).subscribe({
      next: (r) => { this.done.set(r?.message || 'Password changed.'); this.form.reset(); this.busy.set(false); },
      error: (e: unknown) => { this.error.set(errorMessage(e, 'Could not change the password.')); this.busy.set(false); },
    });
  }
}
