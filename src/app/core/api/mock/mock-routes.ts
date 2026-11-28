import { HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MOCKED_MODULES } from '../api.config';

export interface MockCall {
  params: string[];
  query: Record<string, string>;
  body: any;
  request: HttpRequest<unknown>;
  /** Sends a request on to the real backend (used to look up real patients). */
  next: (req: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>;
}

export interface MockRoute {
  module: keyof typeof MOCKED_MODULES;
  method: string;
  pattern: RegExp;
  handle: (call: MockCall) => unknown;
}

// Registered by each module's mock file (side-effect import below).
export const adjustedRoutes: MockRoute[] = [];
export const addRoutes = (...routes: MockRoute[]) => adjustedRoutes.push(...routes);

export class MockHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
