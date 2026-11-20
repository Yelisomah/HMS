import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { USE_MOCK_DATA } from '../../core/api/api.config';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-login',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });
  isSubmitting = false;
  errorMessage = '';
  readonly mockMode = USE_MOCK_DATA;

  constructor() {
    const notice = window.history.state['authNotice'];
    if (typeof notice === 'string') {
      this.errorMessage = notice;
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.isSubmitting = true;
    this.errorMessage = '';
    this.auth.authenticate(email, password).subscribe({
      next: (user) => {
        void this.router.navigateByUrl(this.auth.dashboardPathFor(user.id));
      },
      error: (error: unknown) => {
        this.errorMessage = getLoginError(error);
        this.isSubmitting = false;
      },
    });
  }
}

function getLoginError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection and try again.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'The email or password is incorrect.';
    }
    return error.error?.message ?? 'Sign-in failed. Please try again.';
  }

  return error instanceof Error ? error.message : 'Sign-in failed. Please try again.';
}
