import { Component, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-reset-password',
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  private readonly auth = inject(AuthService);
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
  });
  submitted = false;
  isSubmitting = false;
  errorMessage = '';

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.auth.requestPasswordReset(this.form.controls.email.value.trim()).subscribe({
      next: () => {
        this.submitted = true;
        this.isSubmitting = false;
      },
      error: (error: unknown) => {
        this.errorMessage =
          error instanceof HttpErrorResponse && error.status === 0
            ? 'Unable to connect to the server. Please try again.'
            : error instanceof HttpErrorResponse
              ? error.error?.message ?? 'We could not process your request. Please try again.'
              : error instanceof Error
                ? error.message
                : 'We could not process your request. Please try again.';
        this.isSubmitting = false;
      },
    });
  }
}
