import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ENDPOINTS as E, HistoryKind } from './api.config';
import { ApiService } from './api.service';
import * as M from './api.models';
import * as H from './hospital.models';

/** Typed endpoint methods grouped by controller; admin user listing is a backend-pending placeholder. */
@Injectable({ providedIn: 'root' })
export class HmsApi {
  private readonly api = inject(ApiService);

  // ---- auth ----
  forgotPassword = (email: string) => this.api.post<M.ResponseMessage>(E.auth.forgotPassword, { email });
  resetPassword = (token: string, newPassword: string) => this.api.post<M.ResponseMessage>(E.auth.resetPassword, { token, newPassword });
  changePassword = (currentPassword: string, newPassword: string) => this.api.post<M.ResponseMessage>(E.auth.changePassword, { currentPassword, newPassword });

  // ---- admin ----
  listUsers = () => this.api.get<M.UserAccountResponse[]>(E.admin.users);
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

  // ---- wards & beds (pending backend) ----
  wards = () => this.api.get<H.Ward[]>(E.wards.list);
  createWard = (body: H.WardRequest) => this.api.post<H.Ward>(E.wards.create, body);
  addBed = (wardId: string, body: H.BedRequest) => this.api.post<H.Bed>(E.wards.addBed(wardId), body);
  beds = (query: { status?: H.BedStatus; wardId?: string } = {}) => this.api.get<H.Bed[]>(E.wards.beds, query);
  setBedStatus = (id: string, status: H.BedStatus) => this.api.patch<H.Bed>(E.wards.bedStatus(id), { status });

  // ---- admissions (pending backend) ----
  admissions = (query: { status?: H.AdmissionStatus; wardId?: string; page?: number; size?: number } = {}) =>
    this.api.get<H.AdmissionPage>(E.admissions.list, query);
  admit = (body: H.AdmissionRequest) => this.api.post<H.Admission>(E.admissions.create, body);
  admission = (id: string) => this.api.get<H.Admission>(E.admissions.byId(id));
  transferAdmission = (id: string, body: H.TransferRequest) => this.api.post<H.Admission>(E.admissions.transfer(id), body);
  dischargeAdmission = (id: string, body: H.DischargeRequest) => this.api.post<H.Admission>(E.admissions.discharge(id), body);
  admissionsForPatient = (reg: string) => this.api.get<H.Admission[]>(E.admissions.byPatient(reg));

  // ---- reports (pending backend) ----
  report = (type: H.ReportType, from: string, to: string) => this.api.get<H.ReportResponse>(E.reports.byType(type), { from, to });

  // ---- billing (pending backend) ----
  invoices = (query: { status?: H.InvoiceStatus; registrationNumber?: string } = {}) => this.api.get<H.Invoice[]>(E.billing.invoices, query);
  createInvoice = (body: H.InvoiceRequest) => this.api.post<H.Invoice>(E.billing.invoices, body);
  recordPayment = (id: string, body: H.PaymentRequest) => this.api.post<H.Invoice>(E.billing.payments(id), body);
  voidInvoice = (id: string, body: H.VoidInvoiceRequest) => this.api.post<H.Invoice>(E.billing.void(id), body);
  pendingCharges = (registrationNumber: string) => this.api.get<H.PendingCharge[]>(E.billing.pendingCharges, { registrationNumber });

  // ---- laboratory (pending backend) ----
  labTests = () => this.api.get<H.LabTest[]>(E.lab.tests);
  labOrders = (query: { status?: H.LabOrderStatus; priority?: H.LabPriority; registrationNumber?: string } = {}) =>
    this.api.get<H.LabOrder[]>(E.lab.orders, query);
  requestLab = (body: H.LabOrderRequest) => this.api.post<H.LabOrder>(E.lab.orders, body);
  collectSpecimen = (id: string, body: H.CollectRequest) => this.api.post<H.LabOrder>(E.lab.collect(id), body);
  enterLabResults = (id: string, body: H.LabResultsRequest) => this.api.post<H.LabOrder>(E.lab.results(id), body);
  cancelLabOrder = (id: string, body: H.CancelLabOrderRequest) => this.api.post<H.LabOrder>(E.lab.cancel(id), body);

  // ---- pharmacy (pending backend) ----
  prescriptions = (query: { status?: H.PrescriptionStatus; registrationNumber?: string } = {}) =>
    this.api.get<H.Prescription[]>(E.pharmacy.prescriptions, query);
  prescribe = (body: H.PrescriptionRequest) => this.api.post<H.Prescription>(E.pharmacy.prescriptions, body);
  dispense = (id: string, body: H.DispenseRequest) => this.api.post<H.Prescription>(E.pharmacy.dispense(id), body);
  cancelPrescription = (id: string, body: H.CancelPrescriptionRequest) => this.api.post<H.Prescription>(E.pharmacy.cancelPrescription(id), body);
  drugs = (query: { q?: string; lowStock?: boolean } = {}) => this.api.get<H.Drug[]>(E.pharmacy.drugs, query);
  addDrug = (body: H.DrugRequest) => this.api.post<H.Drug>(E.pharmacy.drugs, body);
  adjustStock = (id: string, body: H.StockAdjustmentRequest) => this.api.post<H.Drug>(E.pharmacy.drugStock(id), body);

  // ---- appointments (pending backend) ----
  appointments = (query: { date?: string; from?: string; to?: string; doctorId?: string; status?: H.AppointmentStatus; registrationNumber?: string } = {}) =>
    this.api.get<H.Appointment[]>(E.appointments.list, query);
  bookAppointment = (body: H.AppointmentRequest) => this.api.post<H.Appointment>(E.appointments.create, body);
  appointmentAvailability = (doctorId: string, date: string) =>
    this.api.get<H.AvailabilityResponse>(E.appointments.availability, { doctorId, date });
  rescheduleAppointment = (id: string, body: H.RescheduleRequest) => this.api.post<H.Appointment>(E.appointments.reschedule(id), body);
  cancelAppointment = (id: string, body: H.CancelAppointmentRequest) => this.api.post<H.Appointment>(E.appointments.cancel(id), body);
  markNoShow = (id: string) => this.api.post<H.Appointment>(E.appointments.noShow(id));
  appointmentArrived = (id: string, body: H.ArrivedRequest) => this.api.post<H.Appointment>(E.appointments.arrived(id), body);

  // ---- staff directory (pending backend) ----
  staff = (query: { role?: string; q?: string; department?: string; active?: boolean } = {}) => this.api.get<H.StaffMember[]>(E.staff.list, query);
  staffMember = (id: string) => this.api.get<H.StaffMember>(E.staff.byId(id));
}
