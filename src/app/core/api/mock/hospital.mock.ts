import { HttpRequest, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';
import { ENDPOINTS as E } from '../api.config';
import {
  Admission, AdmissionRequest, Appointment, AppointmentRequest, Bed, BedStatus, DischargeRequest, Drug, Invoice, InvoiceRequest, LabOrder,
  LabOrderRequest, LabTest, PendingCharge, ReportResponse, ReportType,
  Prescription, PrescriptionRequest,
  StaffMember, TransferRequest, Ward,
} from '../hospital.models';
import { invoiceTotals, round2 } from '../billing-math';
import { computeFlag } from '../lab-flags';
import { addRoutes, MockHttpError } from './mock-routes';

// ---------------------------------------------------------------- in-memory data
const WARDS: { id: string; name: string; type: string; prefix: string; beds: number }[] = [
  { id: 'w-med', name: 'Medical Ward', type: 'GENERAL', prefix: 'M', beds: 8 },
  { id: 'w-surg', name: 'Surgical Ward', type: 'SURGICAL', prefix: 'S', beds: 6 },
  { id: 'w-mat', name: 'Maternity Ward', type: 'MATERNITY', prefix: 'P', beds: 6 },
  { id: 'w-ped', name: 'Paediatric Ward', type: 'PAEDIATRIC', prefix: 'C', beds: 4 },
];

const beds: Bed[] = WARDS.flatMap((w) =>
  Array.from({ length: w.beds }, (_, i) => ({
    id: `${w.id}-${i + 1}`, wardId: w.id, wardName: w.name,
    label: `${w.prefix}-${String(i + 1).padStart(2, '0')}`, status: 'AVAILABLE' as BedStatus, admissionId: null,
  })),
);
beds[6].status = 'MAINTENANCE';
const admissions: Admission[] = [];
let seq = 1;

const staff: StaffMember[] = [
  { id: 'mock-d1', staffNumber: 'D-001', firstName: 'Kwame', lastName: 'Mensah', role: 'DOCTOR', department: 'Medicine', specialty: 'Internal medicine', licenseNumber: 'MDC-10234', email: 'k.mensah@hospital.example', phoneNumber: '0240000001', joinedOn: '2019-03-04', active: true },
  { id: 'mock-d2', staffNumber: 'D-002', firstName: 'Ama', lastName: 'Boateng', role: 'DOCTOR', department: 'Surgery', specialty: 'General surgery', licenseNumber: 'MDC-11876', email: 'a.boateng@hospital.example', phoneNumber: '0240000002', joinedOn: '2020-08-17', active: true },
  { id: 'mock-d3', staffNumber: 'D-003', firstName: 'Yaw', lastName: 'Owusu', role: 'PHYSICIAN', department: 'Paediatrics', specialty: 'Paediatrics', licenseNumber: 'MDC-12990', email: 'y.owusu@hospital.example', phoneNumber: '0240000003', joinedOn: '2021-01-11', active: true },
  { id: 'mock-d4', staffNumber: 'D-004', firstName: 'Abena', lastName: 'Frimpong', role: 'DOCTOR', department: 'Maternity', specialty: 'Obstetrics', licenseNumber: 'MDC-09342', email: 'a.frimpong@hospital.example', phoneNumber: '0240000004', joinedOn: '2017-06-26', active: false },
  { id: 'mock-n1', staffNumber: 'N-001', firstName: 'Efua', lastName: 'Asante', role: 'NURSE', department: 'Medical Ward', licenseNumber: 'NMC-55120', email: 'e.asante@hospital.example', phoneNumber: '0240000011', joinedOn: '2018-02-05', active: true },
  { id: 'mock-n2', staffNumber: 'N-002', firstName: 'Kofi', lastName: 'Adjei', role: 'NURSE', department: 'Surgical Ward', licenseNumber: 'NMC-56481', email: 'k.adjei@hospital.example', phoneNumber: '0240000012', joinedOn: '2022-09-12', active: true },
  { id: 'mock-p1', staffNumber: 'P-001', firstName: 'Nana', lastName: 'Quaye', role: 'PHARMACIST', department: 'Pharmacy', licenseNumber: 'PCG-20871', email: 'n.quaye@hospital.example', phoneNumber: '0240000021', joinedOn: '2019-10-01', active: true },
  { id: 'mock-l1', staffNumber: 'L-001', firstName: 'Selorm', lastName: 'Agbeko', role: 'LAB_TECHNICIAN', department: 'Laboratory', email: 's.agbeko@hospital.example', phoneNumber: '0240000031', joinedOn: '2021-05-24', active: true },
  { id: 'mock-o1', staffNumber: 'O-001', firstName: 'Akosua', lastName: 'Darko', role: 'OPD', department: 'Front desk', email: 'a.darko@hospital.example', phoneNumber: '0240000041', joinedOn: '2023-02-13', active: true },
  { id: 'mock-a1', staffNumber: 'A-001', firstName: 'Mercy', lastName: 'Tetteh', role: 'ADMIN', department: 'Administration', email: 'm.tetteh@hospital.example', phoneNumber: '0240000051', joinedOn: '2016-11-07', active: true },
];
const staffName = (id?: string) => {
  const s = staff.find((x) => x.id === id);
  return s ? `${s.firstName} ${s.lastName}` : undefined;
};

/** Builds the REAL patient lookup request, keeping the same API base URL (absolute or relative) as the caller. */
function patientLookup(request: HttpRequest<unknown>, registrationNumber: string): HttpRequest<unknown> {
  const i = request.url.indexOf('/api/');
  const base = i > 0 ? request.url.slice(0, i) : '';
  return new HttpRequest('GET', base + E.patients.byReg(registrationNumber), { headers: request.headers });
}

const bad: (status: number, message: string) => never = (status, message) => { throw new MockHttpError(status, message); };
const ward = (w: (typeof WARDS)[number]): Ward => {
  const list = beds.filter((b) => b.wardId === w.id);
  return { id: w.id, name: w.name, type: w.type, capacity: list.length, occupied: list.filter((b) => b.status === 'OCCUPIED').length };
};

// ---------------------------------------------------------------- routes
addRoutes(
  { module: 'staff', method: 'GET', pattern: /^\/api\/staff$/, handle: ({ query }) =>
    staff.filter((s) => (!query['role'] || s.role === query['role'] || (query['role'] === 'DOCTOR' && s.role === 'PHYSICIAN'))
      && (!query['department'] || s.department === query['department'])
      && (query['active'] === undefined || String(s.active !== false) === query['active'])
      && (!query['q'] || `${s.firstName} ${s.lastName} ${s.staffNumber}`.toLowerCase().includes(query['q'].toLowerCase()))) },
  { module: 'staff', method: 'GET', pattern: /^\/api\/staff\/([^/]+)$/, handle: ({ params }) =>
    staff.find((s) => s.id === params[0]) ?? bad(404, 'Staff member not found.') },

  { module: 'wards', method: 'GET', pattern: /^\/api\/wards$/, handle: () =>
    WARDS.map((w) => ({ ...ward(w), beds: beds.filter((b) => b.wardId === w.id) })) },
  { module: 'wards', method: 'POST', pattern: /^\/api\/wards$/, handle: ({ body }) => {
    const name = String(body?.name ?? '').trim();
    if (!name) bad(400, 'Ward name is required.');
    if (WARDS.some((w) => w.name.toLowerCase() === name.toLowerCase())) bad(409, 'A ward with that name already exists.');
    const w = { id: `w-${Date.now().toString(36)}`, name, type: body.type || 'GENERAL', prefix: (body.bedPrefix || name[0]).toUpperCase(), beds: 0 };
    WARDS.push(w);
    const count = Math.min(Math.max(Number(body.bedCount) || 0, 0), 50);
    for (let i = 1; i <= count; i++) beds.push({ id: `${w.id}-${i}`, wardId: w.id, wardName: w.name, label: `${w.prefix}-${String(i).padStart(2, '0')}`, status: 'AVAILABLE', admissionId: null });
    return { ...ward(w), beds: beds.filter((b) => b.wardId === w.id) };
  } },
  { module: 'wards', method: 'POST', pattern: /^\/api\/wards\/([^/]+)\/beds$/, handle: ({ params, body }) => {
    const w = WARDS.find((x) => x.id === params[0]) ?? bad(404, 'Ward not found.');
    const label = String(body?.label ?? '').trim();
    if (!label) bad(400, 'Bed label is required.');
    if (beds.some((b) => b.wardId === w.id && b.label.toLowerCase() === label.toLowerCase())) bad(409, 'That bed label already exists in this ward.');
    const bed: Bed = { id: `${w.id}-${Date.now().toString(36)}`, wardId: w.id, wardName: w.name, label, status: 'AVAILABLE', admissionId: null };
    beds.push(bed);
    return bed;
  } },
  { module: 'wards', method: 'GET', pattern: /^\/api\/beds$/, handle: ({ query }) =>
    beds.filter((b) => (!query['status'] || b.status === query['status']) && (!query['wardId'] || b.wardId === query['wardId'])) },
  { module: 'wards', method: 'PATCH', pattern: /^\/api\/beds\/([^/]+)\/status$/, handle: ({ params, body }) => {
    const bed = beds.find((b) => b.id === params[0]) ?? bad(404, 'Bed not found.');
    if (bed.status === 'OCCUPIED') bad(409, 'An occupied bed cannot change status. Discharge or transfer the patient first.');
    if (body?.status === 'OCCUPIED') bad(400, 'Beds become occupied through an admission.');
    bed.status = body.status;
    return { ...bed };
  } },

  { module: 'admissions', method: 'GET', pattern: /^\/api\/admissions$/, handle: ({ query }) => {
    const rows = admissions.filter((a) => (!query['status'] || a.status === query['status']) && (!query['wardId'] || a.wardId === query['wardId']));
    return { content: rows, totalElements: rows.length, page: 0, size: rows.length };
  } },
  { module: 'admissions', method: 'GET', pattern: /^\/api\/admissions\/([^/]+)$/, handle: ({ params }) =>
    admissions.find((a) => a.id === params[0]) ?? bad(404, 'Admission not found.') },
  { module: 'admissions', method: 'GET', pattern: /^\/api\/patients\/registration\/([^/]+)\/admissions$/, handle: ({ params }) =>
    admissions.filter((a) => a.registrationNumber === params[0]) },

  { module: 'admissions', method: 'POST', pattern: /^\/api\/admissions$/, handle: ({ body, request, next }) => {
    const b = body as AdmissionRequest;
    if (!b?.registrationNumber || !b.bedId || !b.attendingDoctorId || !b.reason?.trim()) bad(400, 'Patient, bed, attending doctor and reason are required.');
    const bed = beds.find((x) => x.id === b.bedId) ?? bad(404, 'Bed not found.');
    if (bed.status !== 'AVAILABLE') bad(409, 'That bed is not available. Choose another bed.');
    if (admissions.some((a) => a.registrationNumber === b.registrationNumber && a.status === 'ADMITTED')) bad(409, 'This patient already has an active admission.');
    // Looks the patient up on the REAL backend so names and IDs are genuine.
    const lookup = patientLookup(request, b.registrationNumber);
    return next(lookup).pipe(map((event) => {
      if (!(event instanceof HttpResponse)) return null;
      const p = (event.body as { data?: { id: string; firstName?: string; otherNames?: string; lastName?: string } })?.data;
      if (!p?.id) bad(404, 'Patient not found.');
      const admission: Admission = {
        id: `ADM-${String(seq++).padStart(4, '0')}`, patientId: p!.id, registrationNumber: b.registrationNumber,
        patientName: [p!.firstName, p!.otherNames, p!.lastName].filter(Boolean).join(' '),
        wardId: bed.wardId, wardName: bed.wardName ?? '', bedId: bed.id, bedLabel: bed.label,
        attendingDoctorId: b.attendingDoctorId, attendingDoctorName: staffName(b.attendingDoctorId),
        assignedNurseId: b.assignedNurseId, assignedNurseName: staffName(b.assignedNurseId),
        admissionType: b.admissionType, reason: b.reason.trim(), status: 'ADMITTED', admittedAt: new Date().toISOString(),
      };
      admissions.unshift(admission);
      bed.status = 'OCCUPIED';
      bed.admissionId = admission.id;
      return admission;
    }));
  } },
  { module: 'admissions', method: 'POST', pattern: /^\/api\/admissions\/([^/]+)\/transfer$/, handle: ({ params, body }) => {
    const b = body as TransferRequest;
    const a = admissions.find((x) => x.id === params[0] && x.status === 'ADMITTED') ?? bad(404, 'No active admission with that ID.');
    const target = beds.find((x) => x.id === b?.newBedId) ?? bad(404, 'Bed not found.');
    if (target.status !== 'AVAILABLE') bad(409, 'The destination bed is not available.');
    if (!b.reason?.trim()) bad(400, 'A transfer reason is required.');
    const old = beds.find((x) => x.id === a.bedId)!;
    old.status = 'CLEANING'; old.admissionId = null;
    target.status = 'OCCUPIED'; target.admissionId = a.id;
    Object.assign(a, { bedId: target.id, bedLabel: target.label, wardId: target.wardId, wardName: target.wardName });
    return a;
  } },
  { module: 'admissions', method: 'POST', pattern: /^\/api\/admissions\/([^/]+)\/discharge$/, handle: ({ params, body }) => {
    const b = body as DischargeRequest;
    const a = admissions.find((x) => x.id === params[0] && x.status === 'ADMITTED') ?? bad(404, 'No active admission with that ID.');
    if (!b?.summary?.trim()) bad(400, 'A discharge summary is required.');
    Object.assign(a, {
      status: 'DISCHARGED', dischargedAt: new Date().toISOString(), dischargeType: b.dischargeType,
      dischargeSummary: b.summary.trim(), followUpInstructions: b.followUpInstructions?.trim() || undefined,
    });
    const bed = beds.find((x) => x.id === a.bedId);
    if (bed) { bed.status = 'CLEANING'; bed.admissionId = null; }
    return a;
  } },
);

// ---------------------------------------------------------------- appointments
const DAY_START = 8 * 60;
const DAY_END = 17 * 60;
const SLOT = 30;
const appointments: Appointment[] = [];
let apptSeq = 1;
const pad = (n: number) => String(n).padStart(2, '0');
const minutesOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const dateOf = (iso: string) => iso.slice(0, 10);
const live = (a: Appointment) => a.status === 'SCHEDULED' || a.status === 'CHECKED_IN';

function conflict(doctorId: string, iso: string, duration: number, ignoreId?: string): boolean {
  const start = minutesOf(iso);
  return appointments.some((a) => a.id !== ignoreId && live(a) && a.doctorId === doctorId && dateOf(a.scheduledAt) === dateOf(iso)
    && start < minutesOf(a.scheduledAt) + a.durationMinutes && minutesOf(a.scheduledAt) < start + duration);
}
function validateSlot(doctorId: string, iso: string, duration: number, ignoreId?: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso ?? '')) bad(400, 'A valid appointment date and time is required.');
  if (new Date(iso).getTime() < Date.now() - 60_000) bad(400, 'Appointments cannot be booked in the past.');
  const m = minutesOf(iso);
  if (m < DAY_START || m + duration > DAY_END) bad(400, 'Appointments must fall between 08:00 and 17:00.');
  if (conflict(doctorId, iso, duration, ignoreId)) bad(409, 'That doctor already has an appointment at this time.');
}
const getAppt = (id: string, status?: string): Appointment => {
  const a = appointments.find((x) => x.id === id) ?? bad(404, 'Appointment not found.');
  if (status && a.status !== status) bad(409, `Only ${status.toLowerCase().replace('_', ' ')} appointments can be changed this way.`);
  return a;
};

addRoutes(
  { module: 'appointments', method: 'GET', pattern: /^\/api\/appointments$/, handle: ({ query }) =>
    appointments.filter((a) =>
      (!query['date'] || dateOf(a.scheduledAt) === query['date'])
      && (!query['from'] || dateOf(a.scheduledAt) >= query['from']) && (!query['to'] || dateOf(a.scheduledAt) <= query['to'])
      && (!query['doctorId'] || a.doctorId === query['doctorId']) && (!query['status'] || a.status === query['status'])
      && (!query['registrationNumber'] || a.registrationNumber === query['registrationNumber']))
      .sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt)) },
  { module: 'appointments', method: 'GET', pattern: /^\/api\/appointments\/availability$/, handle: ({ query }) => {
    const slots: string[] = [];
    for (let m = DAY_START; m + SLOT <= DAY_END; m += SLOT) {
      const iso = `${query['date']}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`;
      if (new Date(iso).getTime() >= Date.now() && !conflict(query['doctorId'], iso, SLOT)) slots.push(iso.slice(11, 16));
    }
    return { doctorId: query['doctorId'], date: query['date'], slots };
  } },
  { module: 'appointments', method: 'GET', pattern: /^\/api\/appointments\/([^/]+)$/, handle: ({ params }) => getAppt(params[0]) },
  { module: 'appointments', method: 'POST', pattern: /^\/api\/appointments$/, handle: ({ body, request, next }) => {
    const b = body as AppointmentRequest;
    if (!b?.registrationNumber || !b.doctorId || !b.reason?.trim()) bad(400, 'Patient, doctor and reason are required.');
    validateSlot(b.doctorId, b.scheduledAt, b.durationMinutes || SLOT);
    const lookup = patientLookup(request, b.registrationNumber);
    return next(lookup).pipe(map((event) => {
      if (!(event instanceof HttpResponse)) return null;
      const p = (event.body as { data?: { id: string; firstName?: string; otherNames?: string; lastName?: string } })?.data;
      if (!p?.id) bad(404, 'Patient not found.');
      const a: Appointment = {
        id: `APT-${String(apptSeq++).padStart(4, '0')}`, patientId: p!.id, registrationNumber: b.registrationNumber,
        patientName: [p!.firstName, p!.otherNames, p!.lastName].filter(Boolean).join(' '),
        doctorId: b.doctorId, doctorName: staffName(b.doctorId), scheduledAt: b.scheduledAt.slice(0, 16) + ':00',
        durationMinutes: b.durationMinutes || SLOT, reason: b.reason.trim(), status: 'SCHEDULED', createdAt: new Date().toISOString(),
      };
      appointments.push(a);
      return a;
    }));
  } },
  { module: 'appointments', method: 'POST', pattern: /^\/api\/appointments\/([^/]+)\/reschedule$/, handle: ({ params, body }) => {
    const a = getAppt(params[0], 'SCHEDULED');
    const doctorId = body?.doctorId || a.doctorId;
    const duration = body?.durationMinutes || a.durationMinutes;
    validateSlot(doctorId, body?.scheduledAt, duration, a.id);
    Object.assign(a, { doctorId, doctorName: staffName(doctorId), durationMinutes: duration, scheduledAt: body.scheduledAt.slice(0, 16) + ':00' });
    return a;
  } },
  { module: 'appointments', method: 'POST', pattern: /^\/api\/appointments\/([^/]+)\/cancel$/, handle: ({ params, body }) => {
    const a = getAppt(params[0], 'SCHEDULED');
    if (!body?.reason?.trim()) bad(400, 'A cancellation reason is required.');
    Object.assign(a, { status: 'CANCELLED', cancelReason: body.reason.trim() });
    return a;
  } },
  { module: 'appointments', method: 'POST', pattern: /^\/api\/appointments\/([^/]+)\/no-show$/, handle: ({ params }) => {
    const a = getAppt(params[0], 'SCHEDULED');
    a.status = 'NO_SHOW';
    return a;
  } },
  { module: 'appointments', method: 'POST', pattern: /^\/api\/appointments\/([^/]+)\/arrived$/, handle: ({ params, body }) => {
    const a = getAppt(params[0], 'SCHEDULED');
    if (body?.registrationNumber !== a.registrationNumber) bad(400, 'Registration number does not match this appointment.');
    Object.assign(a, { status: 'CHECKED_IN', checkedInAt: body.checkedInAt || new Date().toISOString() });
    return a;
  } },
);

// ---------------------------------------------------------------- pharmacy
const nextWeeks = (w: number) => new Date(Date.now() + w * 7 * 86_400_000).toISOString().slice(0, 10);
const drugs: Drug[] = [
  { id: 'drg-1', name: 'Paracetamol', genericName: 'Acetaminophen', strength: '500 mg', form: 'TABLET', quantityInStock: 480, reorderLevel: 100, unitPrice: 0.5, expiryDate: nextWeeks(80) },
  { id: 'drg-2', name: 'Amoxicillin', genericName: 'Amoxicillin', strength: '500 mg', form: 'CAPSULE', quantityInStock: 60, reorderLevel: 80, unitPrice: 1.2, expiryDate: nextWeeks(40) },
  { id: 'drg-3', name: 'Artemether/Lumefantrine', genericName: 'Artemether', strength: '20/120 mg', form: 'TABLET', quantityInStock: 200, reorderLevel: 60, unitPrice: 6, expiryDate: nextWeeks(60) },
  { id: 'drg-4', name: 'Metformin', genericName: 'Metformin', strength: '500 mg', form: 'TABLET', quantityInStock: 25, reorderLevel: 50, unitPrice: 0.8, expiryDate: nextWeeks(3) },
  { id: 'drg-5', name: 'ORS Sachet', form: 'OTHER', quantityInStock: 150, reorderLevel: 40, unitPrice: 1, expiryDate: nextWeeks(100) },
];
const prescriptions: Prescription[] = [];
let rxSeq = 1;
const getRx = (id: string, status?: string): Prescription => {
  const r = prescriptions.find((x) => x.id === id) ?? bad(404, 'Prescription not found.');
  if (status && r.status !== status) bad(409, `This prescription is already ${r.status.toLowerCase()}.`);
  return r;
};

addRoutes(
  { module: 'pharmacy', method: 'GET', pattern: /^\/api\/pharmacy\/drugs$/, handle: ({ query }) =>
    drugs.filter((d) => (!query['q'] || `${d.name} ${d.genericName ?? ''}`.toLowerCase().includes(query['q'].toLowerCase()))
      && (query['lowStock'] !== 'true' || d.quantityInStock <= d.reorderLevel)) },
  { module: 'pharmacy', method: 'POST', pattern: /^\/api\/pharmacy\/drugs$/, handle: ({ body }) => {
    const name = String(body?.name ?? '').trim();
    if (!name) bad(400, 'Drug name is required.');
    if (drugs.some((d) => d.name.toLowerCase() === name.toLowerCase() && (d.strength ?? '') === (body.strength ?? ''))) bad(409, 'That drug and strength already exist in the catalogue.');
    if (!(body.quantityInStock >= 0) || !(body.reorderLevel >= 0)) bad(400, 'Quantity and reorder level cannot be negative.');
    const d: Drug = { ...body, name, id: `drg-${Date.now().toString(36)}` };
    drugs.push(d);
    return d;
  } },
  { module: 'pharmacy', method: 'POST', pattern: /^\/api\/pharmacy\/drugs\/([^/]+)\/stock$/, handle: ({ params, body }) => {
    const d = drugs.find((x) => x.id === params[0]) ?? bad(404, 'Drug not found.');
    const change = Number(body?.quantityChange);
    if (!Number.isInteger(change) || change === 0) bad(400, 'Enter a whole-number quantity change.');
    if (d.quantityInStock + change < 0) bad(409, `Only ${d.quantityInStock} in stock; the change would make it negative.`);
    if ((body.reason === 'RECEIVED') !== (change > 0)) bad(400, change > 0 ? 'Increases must be recorded as "Received".' : 'Reductions cannot be recorded as "Received".');
    d.quantityInStock += change;
    return d;
  } },

  { module: 'pharmacy', method: 'GET', pattern: /^\/api\/pharmacy\/prescriptions$/, handle: ({ query }) =>
    prescriptions.filter((r) => (!query['status'] || r.status === query['status']) && (!query['registrationNumber'] || r.registrationNumber === query['registrationNumber']))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) },
  { module: 'pharmacy', method: 'GET', pattern: /^\/api\/pharmacy\/prescriptions\/([^/]+)$/, handle: ({ params }) => getRx(params[0]) },
  { module: 'pharmacy', method: 'POST', pattern: /^\/api\/pharmacy\/prescriptions$/, handle: ({ body, request, next }) => {
    const b = body as PrescriptionRequest;
    if (!b?.registrationNumber || !b.items?.length) bad(400, 'A patient and at least one drug are required.');
    const items = b.items.map((i, n) => {
      const d = drugs.find((x) => x.id === i.drugId) ?? bad(404, 'A selected drug no longer exists.');
      if (!i.dose?.trim() || !i.frequency?.trim() || !(i.durationDays > 0) || !(i.quantity > 0)) bad(400, `Complete dose, frequency, duration and quantity for ${d.name}.`);
      return { ...i, id: `itm-${n + 1}`, drugName: `${d.name}${d.strength ? ' ' + d.strength : ''}` };
    });
    const lookup = patientLookup(request, b.registrationNumber);
    return next(lookup).pipe(map((event) => {
      if (!(event instanceof HttpResponse)) return null;
      const p = (event.body as { data?: { id: string; firstName?: string; otherNames?: string; lastName?: string } })?.data;
      if (!p?.id) bad(404, 'Patient not found.');
      const rx: Prescription = {
        id: `RX-${String(rxSeq++).padStart(4, '0')}`, patientId: p!.id, registrationNumber: b.registrationNumber,
        patientName: [p!.firstName, p!.otherNames, p!.lastName].filter(Boolean).join(' '),
        createdAt: new Date().toISOString(), status: 'PENDING', notes: b.notes?.trim() || undefined, items,
      };
      prescriptions.unshift(rx);
      return rx;
    }));
  } },
  { module: 'pharmacy', method: 'POST', pattern: /^\/api\/pharmacy\/prescriptions\/([^/]+)\/dispense$/, handle: ({ params, body }) => {
    const rx = getRx(params[0], 'PENDING');
    for (const i of rx.items) {
      const d = drugs.find((x) => x.id === i.drugId);
      if (!d || d.quantityInStock < i.quantity) bad(409, `Not enough stock of ${i.drugName}. Needed ${i.quantity}, have ${d?.quantityInStock ?? 0}.`);
      if (d.expiryDate && d.expiryDate < new Date().toISOString().slice(0, 10)) bad(409, `${i.drugName} is past its expiry date and cannot be dispensed.`);
    }
    for (const i of rx.items) drugs.find((x) => x.id === i.drugId)!.quantityInStock -= i.quantity;
    Object.assign(rx, { status: 'DISPENSED', dispensedAt: new Date().toISOString(), counsellingNote: body?.counsellingNote?.trim() || undefined });
    return rx;
  } },
  { module: 'pharmacy', method: 'POST', pattern: /^\/api\/pharmacy\/prescriptions\/([^/]+)\/cancel$/, handle: ({ params, body }) => {
    const rx = getRx(params[0], 'PENDING');
    if (!body?.reason?.trim()) bad(400, 'A cancellation reason is required.');
    Object.assign(rx, { status: 'CANCELLED', cancelReason: body.reason.trim() });
    return rx;
  } },
);

// ---------------------------------------------------------------- laboratory
const labTests: LabTest[] = [
  { id: 'lt-hb', code: 'HB', name: 'Haemoglobin', category: 'HAEMATOLOGY', specimen: 'Whole blood (EDTA)', resultType: 'NUMERIC', unit: 'g/dL', refLow: 12, refHigh: 17 },
  { id: 'lt-wbc', code: 'WBC', name: 'White cell count', category: 'HAEMATOLOGY', specimen: 'Whole blood (EDTA)', resultType: 'NUMERIC', unit: '×10⁹/L', refLow: 4, refHigh: 11 },
  { id: 'lt-fbs', code: 'FBS', name: 'Fasting blood glucose', category: 'BIOCHEMISTRY', specimen: 'Plasma (fluoride)', resultType: 'NUMERIC', unit: 'mmol/L', refLow: 3.9, refHigh: 5.6 },
  { id: 'lt-rbs', code: 'RBS', name: 'Random blood glucose', category: 'BIOCHEMISTRY', specimen: 'Plasma (fluoride)', resultType: 'NUMERIC', unit: 'mmol/L', refLow: 3.9, refHigh: 7.8 },
  { id: 'lt-creat', code: 'CREAT', name: 'Creatinine', category: 'BIOCHEMISTRY', specimen: 'Serum', resultType: 'NUMERIC', unit: 'µmol/L', refLow: 60, refHigh: 110 },
  { id: 'lt-alt', code: 'ALT', name: 'Alanine aminotransferase (ALT)', category: 'BIOCHEMISTRY', specimen: 'Serum', resultType: 'NUMERIC', unit: 'U/L', refLow: 7, refHigh: 56 },
  { id: 'lt-mal', code: 'MRDT', name: 'Malaria rapid test', category: 'MICROBIOLOGY', specimen: 'Capillary blood', resultType: 'TEXT', options: ['Negative', 'Positive'], abnormalOptions: ['Positive'] },
  { id: 'lt-hiv', code: 'HIV', name: 'HIV screening', category: 'SEROLOGY', specimen: 'Serum', resultType: 'TEXT', options: ['Non-reactive', 'Reactive'], abnormalOptions: ['Reactive'] },
  { id: 'lt-preg', code: 'UPT', name: 'Urine pregnancy test', category: 'URINALYSIS', specimen: 'Urine', resultType: 'TEXT', options: ['Negative', 'Positive'] },
  { id: 'lt-urine', code: 'UA', name: 'Urinalysis (dipstick)', category: 'URINALYSIS', specimen: 'Urine', resultType: 'TEXT' },
];
const labOrders: LabOrder[] = [];
let labSeq = 1;
const getLab = (id: string, ...allowed: string[]): LabOrder => {
  const o = labOrders.find((x) => x.id === id) ?? bad(404, 'Lab order not found.');
  if (allowed.length && !allowed.includes(o.status)) bad(409, `This order is ${o.status.toLowerCase()} and cannot be changed this way.`);
  return o;
};

addRoutes(
  { module: 'lab', method: 'GET', pattern: /^\/api\/lab\/tests$/, handle: () => labTests },
  { module: 'lab', method: 'GET', pattern: /^\/api\/lab\/orders$/, handle: ({ query }) =>
    labOrders.filter((o) => (!query['status'] || o.status === query['status']) && (!query['priority'] || o.priority === query['priority'])
      && (!query['registrationNumber'] || o.registrationNumber === query['registrationNumber']))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) },
  { module: 'lab', method: 'GET', pattern: /^\/api\/lab\/orders\/([^/]+)$/, handle: ({ params }) => getLab(params[0]) },
  { module: 'lab', method: 'POST', pattern: /^\/api\/lab\/orders$/, handle: ({ body, request, next }) => {
    const b = body as LabOrderRequest;
    if (!b?.registrationNumber || !b.testIds?.length) bad(400, 'A patient and at least one test are required.');
    const tests = [...new Set(b.testIds)].map((tid, n) => {
      const t = labTests.find((x) => x.id === tid) ?? bad(404, 'A selected test no longer exists.');
      return { ...t, id: `ot-${n + 1}`, testId: t.id, testName: t.name, status: 'PENDING' as const };
    });
    const lookup = patientLookup(request, b.registrationNumber);
    return next(lookup).pipe(map((event) => {
      if (!(event instanceof HttpResponse)) return null;
      const p = (event.body as { data?: { id: string; firstName?: string; otherNames?: string; lastName?: string } })?.data;
      if (!p?.id) bad(404, 'Patient not found.');
      const order: LabOrder = {
        id: `LAB-${String(labSeq++).padStart(4, '0')}`, patientId: p!.id, registrationNumber: b.registrationNumber,
        patientName: [p!.firstName, p!.otherNames, p!.lastName].filter(Boolean).join(' '),
        createdAt: new Date().toISOString(), priority: b.priority || 'ROUTINE', clinicalNotes: b.clinicalNotes?.trim() || undefined,
        status: 'REQUESTED', tests: tests.map(({ id, testId, testName, specimen, resultType, unit, refLow, refHigh, options, abnormalOptions, status }) =>
          ({ id, testId, testName, specimen, resultType, unit, refLow, refHigh, options, abnormalOptions, status })),
      };
      labOrders.unshift(order);
      return order;
    }));
  } },
  { module: 'lab', method: 'POST', pattern: /^\/api\/lab\/orders\/([^/]+)\/collect$/, handle: ({ params, body }) => {
    const o = getLab(params[0], 'REQUESTED');
    Object.assign(o, { status: 'COLLECTED', collectedAt: new Date().toISOString(), collectionNote: body?.collectionNote?.trim() || undefined });
    return o;
  } },
  { module: 'lab', method: 'POST', pattern: /^\/api\/lab\/orders\/([^/]+)\/results$/, handle: ({ params, body }) => {
    const o = getLab(params[0], 'COLLECTED');
    const entries = (body?.results ?? []) as { orderTestId: string; resultValue?: number; resultText?: string; critical?: boolean; comment?: string }[];
    if (!entries.length) bad(400, 'Enter at least one result.');
    for (const e of entries) {
      const t = o.tests.find((x) => x.id === e.orderTestId) ?? bad(404, 'Unknown test in this order.');
      if (t.status === 'RESULTED') bad(409, `${t.testName} already has a result.`);
      if (t.resultType === 'NUMERIC' && !Number.isFinite(e.resultValue)) bad(400, `${t.testName} needs a numeric result.`);
      if (t.resultType === 'TEXT' && !e.resultText?.trim()) bad(400, `${t.testName} needs a result.`);
      if (t.options && !t.options.includes(e.resultText ?? '')) bad(400, `${t.testName}: choose one of ${t.options.join(', ')}.`);
    }
    for (const e of entries) {
      const t = o.tests.find((x) => x.id === e.orderTestId)!;
      Object.assign(t, {
        status: 'RESULTED', resultValue: e.resultValue, resultText: e.resultText?.trim(), comment: e.comment?.trim() || undefined,
        flag: computeFlag(t, t.resultType === 'NUMERIC' ? e.resultValue : e.resultText, !!e.critical), resultedAt: new Date().toISOString(),
      });
    }
    if (o.tests.every((t) => t.status === 'RESULTED')) { o.status = 'COMPLETED'; o.completedAt = new Date().toISOString(); }
    return o;
  } },
  { module: 'lab', method: 'POST', pattern: /^\/api\/lab\/orders\/([^/]+)\/cancel$/, handle: ({ params, body }) => {
    const o = getLab(params[0], 'REQUESTED', 'COLLECTED');
    if (!body?.reason?.trim()) bad(400, 'A cancellation reason is required.');
    if (o.tests.some((t) => t.status === 'RESULTED')) bad(409, 'An order with recorded results cannot be cancelled.');
    Object.assign(o, { status: 'CANCELLED', cancelReason: body.reason.trim() });
    return o;
  } },
);

// ---------------------------------------------------------------- billing
const LAB_PRICE: Record<string, number> = { HB: 25, WBC: 25, FBS: 20, RBS: 20, CREAT: 40, ALT: 40, MRDT: 30, HIV: 35, UPT: 15, UA: 15 };
const WARD_RATE: Record<string, number> = { GENERAL: 150, SURGICAL: 250, MATERNITY: 200, PAEDIATRIC: 150, ICU: 600 };
const CONSULT_FEE = 50;
const invoices: Invoice[] = [];
let invSeq = 1;
const billed = new Set<string>();

function pendingFor(reg: string): PendingCharge[] {
  const out: PendingCharge[] = [];
  for (const a of appointments) {
    if (a.registrationNumber === reg && (a.status === 'CHECKED_IN' || a.status === 'COMPLETED')) {
      out.push({ sourceId: `apt:${a.id}`, category: 'CONSULTATION', description: `Consultation · Dr. ${a.doctorName ?? a.doctorId}`, quantity: 1, unitPrice: CONSULT_FEE, occurredAt: a.scheduledAt });
    }
  }
  for (const a of admissions) {
    if (a.registrationNumber === reg && a.status === 'DISCHARGED') {
      const nights = Math.max(1, Math.ceil((new Date(a.dischargedAt!).getTime() - new Date(a.admittedAt).getTime()) / 86_400_000));
      const type = WARDS.find((w) => w.id === a.wardId)?.type ?? 'GENERAL';
      out.push({ sourceId: `adm:${a.id}`, category: 'ADMISSION', description: `${a.wardName} bed ${a.bedLabel} (${nights} night${nights === 1 ? '' : 's'})`, quantity: nights, unitPrice: WARD_RATE[type] ?? 150, occurredAt: a.dischargedAt });
    }
  }
  for (const r of prescriptions) {
    if (r.registrationNumber === reg && r.status === 'DISPENSED') {
      for (const i of r.items) out.push({ sourceId: `rx:${r.id}:${i.id}`, category: 'PHARMACY', description: i.drugName, quantity: i.quantity, unitPrice: drugs.find((d) => d.id === i.drugId)?.unitPrice ?? 0, occurredAt: r.dispensedAt });
    }
  }
  for (const o of labOrders) {
    if (o.registrationNumber === reg && o.status !== 'CANCELLED') {
      for (const t of o.tests.filter((x) => x.status === 'RESULTED')) {
        const code = labTests.find((x) => x.id === t.testId)?.code ?? '';
        out.push({ sourceId: `lab:${o.id}:${t.id}`, category: 'LABORATORY', description: t.testName, quantity: 1, unitPrice: LAB_PRICE[code] ?? 30, occurredAt: t.resultedAt });
      }
    }
  }
  return out.filter((c) => !billed.has(c.sourceId));
}
const getInv = (id: string): Invoice => invoices.find((x) => x.id === id) ?? bad(404, 'Invoice not found.');
function refresh(inv: Invoice): void {
  Object.assign(inv, invoiceTotals({ lines: inv.lines, discount: inv.discount, amountPaid: inv.payments.reduce((s, p) => s + p.amount, 0) }));
  if (inv.status !== 'VOID') inv.status = inv.balance <= 0 ? 'PAID' : inv.amountPaid > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
}

addRoutes(
  { module: 'billing', method: 'GET', pattern: /^\/api\/billing\/pending-charges$/, handle: ({ query }) => {
    if (!query['registrationNumber']) bad(400, 'registrationNumber is required.');
    return pendingFor(query['registrationNumber']);
  } },
  { module: 'billing', method: 'GET', pattern: /^\/api\/billing\/invoices$/, handle: ({ query }) =>
    invoices.filter((i) => (!query['status'] || i.status === query['status']) && (!query['registrationNumber'] || i.registrationNumber === query['registrationNumber']))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) },
  { module: 'billing', method: 'GET', pattern: /^\/api\/billing\/invoices\/([^/]+)$/, handle: ({ params }) => getInv(params[0]) },
  { module: 'billing', method: 'POST', pattern: /^\/api\/billing\/invoices$/, handle: ({ body, request, next }) => {
    const b = body as InvoiceRequest;
    if (!b?.registrationNumber || !b.lines?.length) bad(400, 'A patient and at least one charge are required.');
    for (const l of b.lines) {
      if (!l.description?.trim()) bad(400, 'Every charge needs a description.');
      if (!(l.quantity > 0) || !(l.unitPrice >= 0)) bad(400, `Check the quantity and price for "${l.description}".`);
      if (l.sourceId && billed.has(l.sourceId)) bad(409, `"${l.description}" has already been invoiced.`);
    }
    if (b.discount !== undefined && b.discount < 0) bad(400, 'Discount cannot be negative.');
    const lookup = patientLookup(request, b.registrationNumber);
    return next(lookup).pipe(map((event) => {
      if (!(event instanceof HttpResponse)) return null;
      const p = (event.body as { data?: { id: string; firstName?: string; otherNames?: string; lastName?: string } })?.data;
      if (!p?.id) bad(404, 'Patient not found.');
      const lines = b.lines.map((l, n) => ({ ...l, description: l.description.trim(), id: `ln-${n + 1}`, total: round2(l.quantity * l.unitPrice) }));
      const inv: Invoice = {
        id: `INV-${String(invSeq).padStart(4, '0')}`, invoiceNumber: `INV-${String(invSeq++).padStart(4, '0')}`, patientId: p!.id, registrationNumber: b.registrationNumber,
        patientName: [p!.firstName, p!.otherNames, p!.lastName].filter(Boolean).join(' '), createdAt: new Date().toISOString(), status: 'ISSUED',
        notes: b.notes?.trim() || undefined, lines, discount: b.discount ?? 0, payments: [], subtotal: 0, total: 0, amountPaid: 0, balance: 0,
      };
      refresh(inv);
      lines.forEach((l) => l.sourceId && billed.add(l.sourceId));
      invoices.unshift(inv);
      return inv;
    }));
  } },
  { module: 'billing', method: 'POST', pattern: /^\/api\/billing\/invoices\/([^/]+)\/payments$/, handle: ({ params, body }) => {
    const inv = getInv(params[0]);
    if (inv.status === 'VOID') bad(409, 'A voided invoice cannot receive payments.');
    if (inv.status === 'PAID') bad(409, 'This invoice is already fully paid.');
    const amount = round2(Number(body?.amount));
    if (!(amount > 0)) bad(400, 'Enter a payment amount greater than zero.');
    if (amount > inv.balance) bad(409, `The payment exceeds the balance of ${inv.balance.toFixed(2)}.`);
    if (body.method !== 'CASH' && !body.reference?.trim()) bad(400, 'A reference is required for non-cash payments.');
    inv.payments.push({ id: `pay-${inv.payments.length + 1}`, amount, method: body.method, reference: body.reference?.trim() || undefined, receivedAt: new Date().toISOString() });
    refresh(inv);
    return inv;
  } },
  { module: 'billing', method: 'POST', pattern: /^\/api\/billing\/invoices\/([^/]+)\/void$/, handle: ({ params, body }) => {
    const inv = getInv(params[0]);
    if (inv.status === 'VOID') bad(409, 'This invoice is already void.');
    if (inv.payments.length) bad(409, 'An invoice with payments cannot be voided. Refund the payments first.');
    if (!body?.reason?.trim()) bad(400, 'A reason is required.');
    inv.status = 'VOID'; inv.voidReason = body.reason.trim();
    inv.lines.forEach((l) => l.sourceId && billed.delete(l.sourceId));
    return inv;
  } },
);

// ---------------------------------------------------------------- reports
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (ts?: string) => (ts ? isoDay(new Date(ts)) : '');
const daysBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00`);
  for (let d = new Date(`${from}T00:00:00`); d <= end && out.length < 366; d.setDate(d.getDate() + 1)) out.push(isoDay(d));
  return out;
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
const perDay = (days: string[], stamps: (string | undefined)[]) => days.map((d) => stamps.filter((s) => dayOf(s) === d).length);

function buildReport(type: ReportType, from: string, to: string): ReportResponse {
  const days = daysBetween(from, to);
  const within = (ts?: string) => !!ts && dayOf(ts) >= from && dayOf(ts) <= to;
  const base = { type, from, to, generatedAt: new Date().toISOString() };

  switch (type) {
    case 'admissions': {
      const admitted = admissions.filter((a) => within(a.admittedAt));
      const discharged = admissions.filter((a) => a.status === 'DISCHARGED' && within(a.dischargedAt));
      const stays = discharged.map((a) => (new Date(a.dischargedAt!).getTime() - new Date(a.admittedAt).getTime()) / 86_400_000);
      return { ...base,
        kpis: [
          { label: 'Admissions', value: admitted.length }, { label: 'Discharges', value: discharged.length },
          { label: 'Currently admitted', value: admissions.filter((a) => a.status === 'ADMITTED').length },
          { label: 'Average stay', value: avg(stays), format: 'days' },
        ],
        chart: { title: 'Admissions and discharges per day', labels: days, series: [
          { name: 'Admitted', values: perDay(days, admitted.map((a) => a.admittedAt)) },
          { name: 'Discharged', values: perDay(days, discharged.map((a) => a.dischargedAt)) } ] },
        table: { columns: ['Admission', 'Patient', 'Ward', 'Bed', 'Type', 'Admitted', 'Discharged', 'Status'],
          rows: admitted.map((a) => [a.id, a.patientName, a.wardName, a.bedLabel, a.admissionType, a.admittedAt.slice(0, 16).replace('T', ' '), a.dischargedAt?.slice(0, 16).replace('T', ' ') ?? '', a.status]) } };
    }
    case 'occupancy': {
      const usable = beds.filter((b) => b.status !== 'MAINTENANCE');
      const occ = beds.filter((b) => b.status === 'OCCUPIED');
      return { ...base,
        kpis: [
          { label: 'Total beds', value: beds.length }, { label: 'Occupied', value: occ.length },
          { label: 'Available', value: beds.filter((b) => b.status === 'AVAILABLE').length },
          { label: 'Occupancy', value: pct(occ.length, usable.length), format: 'percent' },
        ],
        chart: { title: 'Beds by ward (current)', labels: WARDS.map((w) => w.name), series: [
          { name: 'Occupied', values: WARDS.map((w) => beds.filter((b) => b.wardId === w.id && b.status === 'OCCUPIED').length) },
          { name: 'Available', values: WARDS.map((w) => beds.filter((b) => b.wardId === w.id && b.status === 'AVAILABLE').length) } ] },
        table: { title: 'Current bed status by ward (not date-bound)', columns: ['Ward', 'Beds', 'Occupied', 'Available', 'Cleaning', 'Maintenance', 'Occupancy %'],
          rows: WARDS.map((w) => {
            const list = beds.filter((b) => b.wardId === w.id);
            const o = list.filter((b) => b.status === 'OCCUPIED').length;
            return [w.name, list.length, o, list.filter((b) => b.status === 'AVAILABLE').length, list.filter((b) => b.status === 'CLEANING').length,
              list.filter((b) => b.status === 'MAINTENANCE').length, pct(o, list.filter((b) => b.status !== 'MAINTENANCE').length)];
          }) } };
    }
    case 'appointments': {
      const list = appointments.filter((a) => within(a.scheduledAt));
      const count = (s: string) => list.filter((a) => a.status === s).length;
      const doctorsIn = [...new Set(list.map((a) => a.doctorId))];
      return { ...base,
        kpis: [
          { label: 'Appointments', value: list.length }, { label: 'Checked in / completed', value: count('CHECKED_IN') + count('COMPLETED') },
          { label: 'Cancelled', value: count('CANCELLED') }, { label: 'No-show rate', value: pct(count('NO_SHOW'), list.length), format: 'percent' },
        ],
        chart: { title: 'Appointments per day', labels: days, series: [{ name: 'Appointments', values: perDay(days, list.map((a) => a.scheduledAt)) }] },
        table: { columns: ['Doctor', 'Appointments', 'Checked in / completed', 'Cancelled', 'No-show'],
          rows: doctorsIn.map((id) => {
            const mine = list.filter((a) => a.doctorId === id);
            return [staffName(id) ?? id, mine.length, mine.filter((a) => a.status === 'CHECKED_IN' || a.status === 'COMPLETED').length, mine.filter((a) => a.status === 'CANCELLED').length, mine.filter((a) => a.status === 'NO_SHOW').length];
          }) } };
    }
    case 'pharmacy': {
      const done = prescriptions.filter((r) => r.status === 'DISPENSED' && within(r.dispensedAt));
      const byDrug = new Map<string, { qty: number; rx: number }>();
      for (const r of done) for (const i of r.items) { const c = byDrug.get(i.drugName) ?? { qty: 0, rx: 0 }; byDrug.set(i.drugName, { qty: c.qty + i.quantity, rx: c.rx + 1 }); }
      return { ...base,
        kpis: [
          { label: 'Prescriptions dispensed', value: done.length }, { label: 'Items dispensed', value: done.reduce((s, r) => s + r.items.length, 0) },
          { label: 'Pending prescriptions', value: prescriptions.filter((r) => r.status === 'PENDING').length },
          { label: 'Low or out of stock', value: drugs.filter((d) => d.quantityInStock <= d.reorderLevel).length },
        ],
        chart: { title: 'Prescriptions dispensed per day', labels: days, series: [{ name: 'Dispensed', values: perDay(days, done.map((r) => r.dispensedAt)) }] },
        table: { title: 'Most dispensed medicines', columns: ['Medicine', 'Quantity dispensed', 'Prescriptions'],
          rows: [...byDrug].sort((a, b) => b[1].qty - a[1].qty).map(([n, v]) => [n, v.qty, v.rx]) } };
    }
    case 'laboratory': {
      const orders = labOrders.filter((o) => within(o.createdAt));
      const resulted = orders.flatMap((o) => o.tests).filter((t) => t.status === 'RESULTED');
      const abnormal = resulted.filter((t) => t.flag && t.flag !== 'NORMAL');
      const hours = orders.filter((o) => o.completedAt).map((o) => (new Date(o.completedAt!).getTime() - new Date(o.createdAt).getTime()) / 3_600_000);
      const byTest = new Map<string, { n: number; ab: number }>();
      for (const t of resulted) { const c = byTest.get(t.testName) ?? { n: 0, ab: 0 }; byTest.set(t.testName, { n: c.n + 1, ab: c.ab + (t.flag && t.flag !== 'NORMAL' ? 1 : 0) }); }
      return { ...base,
        kpis: [
          { label: 'Orders', value: orders.length }, { label: 'Tests resulted', value: resulted.length },
          { label: 'Abnormal results', value: pct(abnormal.length, resulted.length), format: 'percent' }, { label: 'Average turnaround', value: avg(hours), format: 'hours' },
        ],
        chart: { title: 'Lab orders per day', labels: days, series: [{ name: 'Orders', values: perDay(days, orders.map((o) => o.createdAt)) }] },
        table: { title: 'Results by test', columns: ['Test', 'Resulted', 'Abnormal', 'Abnormal %'],
          rows: [...byTest].sort((a, b) => b[1].n - a[1].n).map(([n, v]) => [n, v.n, v.ab, pct(v.ab, v.n)]) } };
    }
    case 'revenue': {
      const live = invoices.filter((i) => i.status !== 'VOID' && within(i.createdAt));
      const payments = invoices.flatMap((i) => i.payments).filter((p) => within(p.receivedAt));
      const byCat = new Map<string, { n: number; amt: number }>();
      for (const i of live) for (const l of i.lines) { const c = byCat.get(l.category) ?? { n: 0, amt: 0 }; byCat.set(l.category, { n: c.n + 1, amt: round2(c.amt + l.total) }); }
      return { ...base,
        kpis: [
          { label: 'Invoiced', value: round2(live.reduce((s, i) => s + i.total, 0)), format: 'currency' },
          { label: 'Collected', value: round2(payments.reduce((s, p) => s + p.amount, 0)), format: 'currency' },
          { label: 'Outstanding (period invoices)', value: round2(live.reduce((s, i) => s + i.balance, 0)), format: 'currency' },
          { label: 'Voided invoices', value: invoices.filter((i) => i.status === 'VOID' && within(i.createdAt)).length },
        ],
        chart: { title: 'Invoiced and collected per day', labels: days, series: [
          { name: 'Invoiced', values: days.map((d) => round2(live.filter((i) => dayOf(i.createdAt) === d).reduce((s, i) => s + i.total, 0))) },
          { name: 'Collected', values: days.map((d) => round2(payments.filter((p) => dayOf(p.receivedAt) === d).reduce((s, p) => s + p.amount, 0))) } ] },
        table: { title: 'Revenue by category', columns: ['Category', 'Lines', 'Amount'], rows: [...byCat].sort((a, b) => b[1].amt - a[1].amt).map(([c, v]) => [c, v.n, v.amt]) } };
    }
  }
}

addRoutes({ module: 'reports', method: 'GET', pattern: /^\/api\/reports\/([^/]+)$/, handle: ({ params, query }) => {
  const types: ReportType[] = ['admissions', 'occupancy', 'appointments', 'pharmacy', 'laboratory', 'revenue'];
  const type = types.find((t) => t === params[0]) ?? bad(404, 'Unknown report.');
  const { from, to } = query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) bad(400, 'Provide from and to dates (YYYY-MM-DD).');
  if (from > to) bad(400, 'The start date must not be after the end date.');
  if (daysBetween(from, to).length >= 366) bad(400, 'Choose a range of at most 366 days.');
  return buildReport(type, from, to);
} });
