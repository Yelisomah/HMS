import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ENDPOINTS as E, HistoryKind } from './api.config';
import { ApiService } from './api.service';
import * as M from './api.models';

/** One typed method per backend endpoint, grouped by controller. */
@Injectable({ providedIn: 'root' })
export class HmsApi {
  private readonly api = inject(ApiService);

  // ---- auth ----
  forgotPassword = (email: string) => this.api.post<M.ResponseMessage>(E.auth.forgotPassword, { email });
  resetPassword = (token: string, newPassword: string) => this.api.post<M.ResponseMessage>(E.auth.resetPassword, { token, newPassword });
  changePassword = (currentPassword: string, newPassword: string) => this.api.post<M.ResponseMessage>(E.auth.changePassword, { currentPassword, newPassword });

  // ---- admin ----
  invite = (body: M.InviteUserRequest) => this.api.post<M.UserAccountResponse>(E.admin.invite, body);
  unlockUser = (id: string) => this.api.post<M.ResponseMessage>(E.admin.unlock(id));
  reactivateUser = (id: string) => this.api.post<M.ResponseMessage>(E.admin.reactivate(id));
  deactivateUser = (id: string) => this.api.post<M.ResponseMessage>(E.admin.deactivate(id));
  changeRole = (id: string, role: string) => this.api.patch<M.UserAccountResponse>(E.admin.role(id), { role });
  adminResetPassword = (id: string) => this.api.post<M.AdminResetPasswordResponse>(E.auth.adminResetPassword(id));

  // ---- patients ----
  registerPatient = (body: M.PatientRegistrationRequest) => this.api.post<M.PatientRegistrationResponse>(E.patients.register, body);
  searchPatients = (query: string, page = 0, size = 20) => this.api.get<M.PatientSearchResponse>(E.patients.search, { query, page, size });
  patientById = (id: string) => this.api.get<M.PatientResponseMessage>(E.patients.byId(id));
  patientByReg = (reg: string) => this.api.get<M.PatientResponseMessage>(E.patients.byReg(reg));

  // ---- check-in ----
  checkIn = (reg: string) => this.api.post<M.CheckInResponse>(E.checkin.checkIn(reg));
  checkOut = (id: number | string) => this.api.post<M.CheckInEntity>(E.checkin.checkOut(id));
  activeCheckIns = () => this.api.get<M.CheckInResponse[]>(E.checkin.active);
  checkInsByStaff = (staffId: string) => this.api.get<M.CheckInEntity[]>(E.checkin.byStaff(staffId));

  // ---- vitals ----
  recordVitals = (checkInId: number | string, body: M.VitalsRequest) => this.api.post<M.RecordResult>(E.vitals.record(checkInId), body);
  vitalsTrend = (reg: string, from?: string, to?: string) => this.api.get<M.TrendResponse>(E.vitals.trend(reg), { from, to });
  latestVitals = (reg: string) => this.api.get<M.LatestVitals>(E.vitals.latest(reg));

  // ---- medical history ----
  history = (reg: string) => this.api.get<M.MedicalHistory>(E.history.all(reg));
  addHistory = <T>(reg: string, kind: HistoryKind, body: unknown): Observable<T> => this.api.post<T>(E.history.list(reg, kind), body);
  updateHistory = <T>(reg: string, kind: HistoryKind, id: string, body: unknown): Observable<T> => this.api.put<T>(E.history.item(reg, kind, id), body);

  // ---- SOAP notes ----
  noteForCheckIn = (checkInId: number | string) => this.api.get<M.NoteItem>(E.notes.forCheckIn(checkInId));
  startNote = (checkInId: number | string) => this.api.post<M.NoteItem>(E.notes.forCheckIn(checkInId));
  note = (id: string) => this.api.get<M.NoteItem>(E.notes.byId(id));
  saveDraft = (id: string, body: M.NoteContent) => this.api.put<M.NoteItem>(E.notes.draft(id), body);
  completeNote = (id: string, body: M.NoteContent) => this.api.post<M.NoteItem>(E.notes.complete(id), body);
  amendNote = (id: string, body: M.AmendRequest) => this.api.post<M.NoteItem>(E.notes.amend(id), body);
  reassignNote = (id: string, body: M.ReassignRequest) => this.api.post<M.NoteItem>(E.notes.reassign(id), body);
  revisions = (id: string) => this.api.get<M.RevisionItem[]>(E.notes.revisions(id));
  notesForPatient = (reg: string) => this.api.get<M.NoteList>(E.notes.forPatient(reg));

  // ---- medical records ----
  createRecord = (body: M.MedicalRecordRequest) => this.api.post<M.MedicalRecord>(E.records.create, body);
  record = (id: string) => this.api.get<M.MedicalRecord>(E.records.byId(id));
  updateRecord = (id: string, body: M.MedicalRecordRequest) => this.api.put<M.MedicalRecord>(E.records.byId(id), body);
  deleteRecord = (id: string) => this.api.delete<void>(E.records.byId(id));
  recordsByPatient = (patientId: string) => this.api.get<M.MedicalRecord[]>(E.records.byPatient(patientId));
  recordsByDoctor = (doctorId: string) => this.api.get<M.MedicalRecord[]>(E.records.byDoctor(doctorId));
}
