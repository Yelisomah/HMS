// import { inject, Injectable } from '@angular/core';
// import { Observable, catchError, forkJoin, map, of, tap } from 'rxjs';
// import { API_ENDPOINTS, RESOURCES, ResourceKey, USE_MOCK_DATA } from './api.config';
// import { HmsStore } from '../hms.store';
// import {
//   Appointment,
//   DashboardSummary,
//   Department,
//   Patient,
//   StaffMember,
// } from './api.models';
// import { ApiService } from './api.service';

// @Injectable({ providedIn: 'root' })
// export class HospitalDataService {
//   private readonly api = inject(ApiService);
//   private readonly store = inject(HmsStore);

//   constructor() {
//     // Every store change is forwarded to the API once USE_MOCK_DATA is false.
//     if (!USE_MOCK_DATA) {
//       this.store.sync = (res, op, payload) => {
//         const path = RESOURCES[res as ResourceKey];
//         const id = (payload as { id?: string }).id;
//         const call = op === 'update' && id ? this.api.patch(`${path}/${encodeURIComponent(id)}`, payload) : this.api.post(path, payload);
//         call.subscribe({ error: (e) => console.error(`Could not save ${res}`, e) });
//       };
//     }
//   }

//   /** Loads every collection from the API into the store. No-op while demo data is on. */
//   hydrate(): Observable<void> {
//     if (USE_MOCK_DATA) return of(void 0);
//     const keys = Object.keys(RESOURCES) as ResourceKey[];
//     return forkJoin(keys.map((k) => this.api.get<unknown>(RESOURCES[k]).pipe(map((r) => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? []))), catchError(() => of(undefined))))).pipe(
//       tap((all) => this.store.load(Object.fromEntries(keys.map((k, i) => [k, all[i]])))),
//       map(() => void 0),
//     );
//   }

//   getDashboardSummary(): Observable<DashboardSummary> {
//     return this.api.get<DashboardSummary>(API_ENDPOINTS.dashboard);
//   }

//   getPatients(): Observable<Patient[]> {
//     return this.api.get<Patient[]>(API_ENDPOINTS.patients);
//   }

//   createPatient(patient: Omit<Patient, 'id'>): Observable<Patient> {
//     return this.api.post<Patient, Omit<Patient, 'id'>>(API_ENDPOINTS.patients, patient);
//   }

//   updatePatient(id: string, patient: Partial<Patient>): Observable<Patient> {
//     return this.api.patch<Patient, Partial<Patient>>(
//       `${API_ENDPOINTS.patients}/${encodeURIComponent(id)}`,
//       patient,
//     );
//   }

//   deletePatient(id: string): Observable<void> {
//     return this.api.delete<void>(`${API_ENDPOINTS.patients}/${encodeURIComponent(id)}`);
//   }

//   getAppointments(): Observable<Appointment[]> {
//     return this.api.get<Appointment[]>(API_ENDPOINTS.appointments);
//   }

//   createAppointment(appointment: Omit<Appointment, 'id'>): Observable<Appointment> {
//     return this.api.post<Appointment, Omit<Appointment, 'id'>>(
//       API_ENDPOINTS.appointments,
//       appointment,
//     );
//   }

//   updateAppointment(id: string, appointment: Partial<Appointment>): Observable<Appointment> {
//     return this.api.patch<Appointment, Partial<Appointment>>(
//       `${API_ENDPOINTS.appointments}/${encodeURIComponent(id)}`,
//       appointment,
//     );
//   }

//   cancelAppointment(id: string): Observable<void> {
//     return this.api.delete<void>(`${API_ENDPOINTS.appointments}/${encodeURIComponent(id)}`);
//   }

//   getStaff(): Observable<StaffMember[]> {
//     return this.api.get<StaffMember[]>(API_ENDPOINTS.staff);
//   }

//   createStaffMember(member: Omit<StaffMember, 'id'>): Observable<StaffMember> {
//     return this.api.post<StaffMember, Omit<StaffMember, 'id'>>(API_ENDPOINTS.staff, member);
//   }

//   updateStaffMember(id: string, member: Partial<StaffMember>): Observable<StaffMember> {
//     return this.api.patch<StaffMember, Partial<StaffMember>>(
//       `${API_ENDPOINTS.staff}/${encodeURIComponent(id)}`,
//       member,
//     );
//   }

//   deleteStaffMember(id: string): Observable<void> {
//     return this.api.delete<void>(`${API_ENDPOINTS.staff}/${encodeURIComponent(id)}`);
//   }

//   getDepartments(): Observable<Department[]> {
//     return this.api.get<Department[]>(API_ENDPOINTS.departments);
//   }

//   getPharmacyItems<T>(): Observable<T[]> {
//     return this.api.get<T[]>(API_ENDPOINTS.pharmacy);
//   }

//   getBillingRecords<T>(): Observable<T[]> {
//     return this.api.get<T[]>(API_ENDPOINTS.billing);
//   }

//   getReports<T>(): Observable<T[]> {
//     return this.api.get<T[]>(API_ENDPOINTS.reports);
//   }
// }
