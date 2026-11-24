import { Component, Input } from '@angular/core';
import { __decorate } from "tslib";

const TONES: Record<string, string> = {
  WAITING: 'amber', IN_PROGRESS: 'blue', DISCHARGED: 'green',
  DRAFT: 'amber', COMPLETED: 'green', AMENDED: 'blue', FINAL: 'green',
  MILD: 'green', MODERATE: 'amber', SEVERE: 'red', ACTIVE: 'amber', RESOLVED: 'green',
};

export const tone = (status?: string): string => TONES[(status ?? '').toUpperCase()] ?? 'blue';

/** IN_PROGRESS -> "In progress" */
export function pretty(value?: string): string {
  if (!value) return '—';
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fullName(p?: { firstName?: string; otherNames?: string; lastName?: string } | null): string {
  return p ? [p.firstName, p.otherNames, p.lastName].filter(Boolean).join(' ') : '';
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Drops empty strings so optional fields are omitted from request bodies. */
export function clean<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ) as T;
}

@Component({
  selector: 'app-spark',
  template: `
    <div class="spark">
      <small>{{ label }}</small>
      <b>{{ last }}<small> {{ unit }}</small></b>
      @if (values.length > 1) {
        <svg viewBox="0 0 100 28" width="100%" height="34" preserveAspectRatio="none" aria-hidden="true">
          <polyline [attr.points]="points" vector-effect="non-scaling-stroke" />
        </svg>
      }
      <small>{{ values.length }} reading{{ values.length === 1 ? '' : 's' }}</small>
    </div>`,
})
export class Spark {
  @Input() label = '';
  @Input() unit = '';
  @Input() values: number[] = [];

  get last(): string {
    return this.values.length ? String(this.values[this.values.length - 1]) : '—';
  }

  get points(): string {
    const v = this.values;
    const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    return v.map((n, i) => `${(i / (v.length - 1)) * 100},${26 - ((n - min) / span) * 24}`).join(' ');
  }
}
