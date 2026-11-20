import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');

  get<T>(path: string, query?: Record<string, string | number | boolean>): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.params(query) });
  }

  post<TResponse, TBody = unknown>(path: string, body: TBody): Observable<TResponse> {
    return this.http.post<TResponse>(this.url(path), body);
  }

  put<TResponse, TBody = unknown>(path: string, body: TBody): Observable<TResponse> {
    return this.http.put<TResponse>(this.url(path), body);
  }

  patch<TResponse, TBody = unknown>(path: string, body: TBody): Observable<TResponse> {
    return this.http.patch<TResponse>(this.url(path), body);
  }

  delete<TResponse>(path: string): Observable<TResponse> {
    return this.http.delete<TResponse>(this.url(path));
  }

  private url(path: string): string {
    const normalizedPath = path.replace(/^\/+/, '');
    return `${this.baseUrl}/${normalizedPath}`;
  }

  private params(query?: Record<string, string | number | boolean>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      params = params.set(key, String(value));
    }
    return params;
  }
}
