import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HmsApi } from '../../core/api/hms-api';
import { errorMessage } from '../../core/api/errors';

export function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const a = group.get('newPassword')?.value;
  const b = group.get('confirm')?.value;
  return a && b && a !== b ? { mismatch: true } : null;
}

/** Without ?token= it asks for an email; with ?token= (from the emailed link) it sets a new password. */
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-reset-password',
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  private readonly api = inject(HmsApi);
  readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  readonly requestForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });
  readonly resetForm = new FormGroup(
    {
      newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: passwordsMatch },
  );
  readonly done = signal('');
  readonly error = signal('');
  readonly busy = signal(false);

  request(): void {
    if (this.requestForm.invalid) return this.requestForm.markAllAsTouched();
    this.run(this.api.forgotPassword(this.requestForm.controls.email.value.trim()), 'If an account exists for this address, reset instructions have been sent.');
  }

  reset(): void {
    if (this.resetForm.invalid) return this.resetForm.markAllAsTouched();
    this.run(this.api.resetPassword(this.token, this.resetForm.controls.newPassword.value), 'Your password has been reset. You can now sign in.');
  }

  private run(call: ReturnType<HmsApi['forgotPassword']>, success: string): void {
    this.busy.set(true);
    this.error.set('');
    call.subscribe({
      next: (res) => {
        this.done.set(res?.message || success);
        this.busy.set(false);
      },
      error: (e: unknown) => {
        this.error.set(errorMessage(e, 'We could not process your request. Please try again.'));
        this.busy.set(false);
      },
    });
  }
}
