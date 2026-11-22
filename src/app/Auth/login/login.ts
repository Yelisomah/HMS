import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api/errors';
import { AuthService } from '../auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-login',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup({
    mode: new FormControl<'staffNumber' | 'username'>('staffNumber', { nonNullable: true }),
    identifier: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly submitting = signal(false);
  readonly error = signal(typeof window.history.state?.['authNotice'] === 'string' ? (window.history.state['authNotice'] as string) : '');
  readonly showPassword = signal(false);

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { mode, identifier, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set('');
    this.auth.login({ [mode]: identifier.trim(), password }).subscribe({
      next: (user) => void this.router.navigateByUrl(user.mustChangePassword ? '/app/account' : '/app'),
      error: (e: unknown) => {
        this.error.set(errorMessage(e, 'Sign-in failed. Check your details and try again.'));
        this.submitting.set(false);
      },
    });
  }
}
