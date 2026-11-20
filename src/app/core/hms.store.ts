import { effect, Injectable, signal } from '@angular/core';
import { USE_MOCK_DATA } from './api/api.config';
export type Role = 'Admin' | 'Doctor' | 'Nurse' | 'Pharmacist' | 'Lab_Technician';
export interface Staff { id: string; name: string; role: string; dept: string; email: string; license: string; shift: string }
export interface Dept { id: string; name: string; head: string }
export interface Patient { id: string; mrn: string; name: string; sex: string; dob: string; phone: string; nhis: string; blood: string; allergies: string[]; doctorId: string; kin: string }
export interface Bed { id: string; ward: string; label: string; admissionId: string | null }
export interface Admission { id: string; patientId: string; bedId: string; doctorId: string; nurseId: string; reason: string; since: string; code: string }
export interface Vital { patientId: string; at: string; sys: number; dia: number; pulse: number; temp: number; spo2: number; rr: number; by: string }
export interface Order { id: string; patientId: string; doctorId: string; drug: string; dose: string; route: string; freq: string; dispensed?: boolean }
export interface Dose { id: string; orderId: string; patientId: string; time: string; status: 'Due' | 'Given' | 'Held'; by?: string }
export interface Note { patientId: string; nurseId: string; at: string; text: string }
export interface Plan { patientId: string; problem: string; goal: string; actions: string }
export interface Appt { id: string; patientId: string; doctorId: string; dept: string; at: string; type: string; status: string; reason: string }
export interface Lab { id: string; patientId: string; doctorId: string; test: string; status: string; result: string }
export interface Drug { id: string; name: string; stock: number; reorder: number; expiry: string; price: number }
export interface Invoice { id: string; patientId: string; amount: number; paid: number; payer: string; date: string }

const DEMO_KEY = 'hms-demo-data-v1';
const at = (h: number, m = 0, d = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

export function news2(v: Vital): number {
  let s = 0;
  s += v.rr <= 8 ? 3 : v.rr <= 11 ? 1 : v.rr <= 20 ? 0 : v.rr <= 24 ? 2 : 3;
  s += v.spo2 <= 91 ? 3 : v.spo2 <= 93 ? 2 : v.spo2 <= 95 ? 1 : 0;
  s += v.sys <= 90 ? 3 : v.sys <= 100 ? 2 : v.sys <= 110 ? 1 : v.sys <= 219 ? 0 : 3;
  s += v.pulse <= 40 ? 3 : v.pulse <= 50 ? 1 : v.pulse <= 90 ? 0 : v.pulse <= 110 ? 1 : v.pulse <= 130 ? 2 : 3;
  s += v.temp <= 35 ? 3 : v.temp <= 36 ? 1 : v.temp <= 38 ? 0 : v.temp <= 39 ? 1 : 2;
  return s;
}
export interface Encounter { id: string; patientId: string; doctorId: string; at: string; s: string; o: string; a: string; p: string; icd: string; followUp: string }
export interface Claim { id: string; invoiceId: string; payer: string; amount: number; status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Paid' }
export interface Audit { id: string; at: string; user: string; action: string; detail: string }
export interface Discharge { admissionId: string; patientId: string; doctorId: string; at: string; summary: string }
export const ICD = ['J18.9 Pneumonia', 'I10 Essential hypertension', 'E11.9 Type 2 diabetes', 'B50.9 Malaria', 'O14.1 Pre-eclampsia', 'K35.8 Appendicitis', 'I50.9 Heart failure', 'R50.9 Fever', 'Z34.9 Antenatal visit'];
export const risk = (n: number) => (n >= 7 ? 'High' : n >= 5 ? 'Medium' : 'Low');
export const age = (dob: string) => Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);

@Injectable({ providedIn: 'root' })
export class HmsStore {
  hospital = 'Nkwa Memorial Hospital';
  depts = signal<Dept[]>([
    { id: 'gen', name: 'General Medicine', head: 'd1' }, { id: 'ped', name: 'Paediatrics', head: 'd2' },
    { id: 'obg', name: 'Obstetrics & Gynaecology', head: 'd2' }, { id: 'sur', name: 'Surgery', head: 'd1' },
    { id: 'lab', name: 'Laboratory', head: 's7' }, { id: 'pha', name: 'Pharmacy', head: 's6' },
  ]);
  staff = signal<Staff[]>([
    { id: 'a1', name: 'Efua Mensah', role: 'Admin', dept: 'Administration', email: 'admin@nkwa.gh', license: '—', shift: 'Day' },
    { id: 'd1', name: 'Dr. Kwame Boateng', role: 'Doctor', dept: 'General Medicine', email: 'doctor@nkwa.gh', license: 'MDC/RN/4821', shift: 'Day' },
    { id: 'd2', name: 'Dr. Abena Owusu', role: 'Doctor', dept: 'Obstetrics & Gynaecology', email: 'a.owusu@nkwa.gh', license: 'MDC/RN/5190', shift: 'Day' },
    { id: 'n1', name: 'Nurse Akosua Darko', role: 'Nurse', dept: 'General Medicine', email: 'nurse@nkwa.gh', license: 'NMC/RN/10233', shift: 'Day' },
    { id: 'n2', name: 'Nurse Yaw Addo', role: 'Nurse', dept: 'Surgery', email: 'y.addo@nkwa.gh', license: 'NMC/RN/10871', shift: 'Night' },
    { id: 's6', name: 'Kofi Asare', role: 'Pharmacist', dept: 'Pharmacy', email: 'k.asare@nkwa.gh', license: 'PCG/4410', shift: 'Day' },
    { id: 's7', name: 'Adwoa Frimpong', role: 'Lab Technician', dept: 'Laboratory', email: 'a.frimpong@nkwa.gh', license: 'MLSC/2290', shift: 'Day' },
  ]);
  patients = signal<Patient[]>([
    { id: 'p1', mrn: 'NMH-00121', name: 'Ama Serwaa', sex: 'F', dob: '1968-04-11', phone: '024 410 2231', nhis: '0112233445', blood: 'O+', allergies: ['Penicillin'], doctorId: 'd1', kin: 'Kojo Serwaa (son)' },
    { id: 'p2', mrn: 'NMH-00122', name: 'Kofi Annan Jr.', sex: 'M', dob: '1954-09-02', phone: '020 551 8890', nhis: '0198877665', blood: 'A+', allergies: [], doctorId: 'd1', kin: 'Esi Annan (wife)' },
    { id: 'p3', mrn: 'NMH-00123', name: 'Esi Quaye', sex: 'F', dob: '1991-01-23', phone: '055 320 7712', nhis: '0145566778', blood: 'B+', allergies: ['Sulfa drugs'], doctorId: 'd2', kin: 'Nii Quaye (husband)' },
    { id: 'p4', mrn: 'NMH-00124', name: 'Yaa Asantewaa', sex: 'F', dob: '1947-06-30', phone: '027 604 1180', nhis: '0133322110', blood: 'O-', allergies: ['Aspirin', 'Latex'], doctorId: 'd1', kin: 'Adjoa Mensah (daughter)' },
    { id: 'p5', mrn: 'NMH-00125', name: 'Kwabena Ofori', sex: 'M', dob: '2016-12-05', phone: '050 118 4402', nhis: '0177788990', blood: 'A-', allergies: [], doctorId: 'd2', kin: 'Akua Ofori (mother)' },
    { id: 'p6', mrn: 'NMH-00126', name: 'Mohammed Issah', sex: 'M', dob: '1982-03-17', phone: '024 990 3317', nhis: '', blood: 'B-', allergies: [], doctorId: 'd1', kin: 'Aisha Issah (wife)' },
    { id: 'p7', mrn: 'NMH-00127', name: 'Abigail Tetteh', sex: 'F', dob: '1999-08-14', phone: '053 770 2216', nhis: '0166655443', blood: 'O+', allergies: [], doctorId: 'd2', kin: 'Naa Tetteh (mother)' },
    { id: 'p8', mrn: 'NMH-00128', name: 'Samuel Agyeman', sex: 'M', dob: '1975-11-29', phone: '026 345 9087', nhis: '0122211009', blood: 'AB+', allergies: ['Ibuprofen'], doctorId: 'd1', kin: 'Mary Agyeman (wife)' },
  ]);
  beds = signal<Bed[]>([
    ...['1', '2', '3', '4', '5', '6'].map((n) => ({ id: 'M' + n, ward: 'Male Medical', label: 'M-0' + n, admissionId: null as string | null })),
    ...['1', '2', '3', '4', '5', '6'].map((n) => ({ id: 'F' + n, ward: 'Female Medical', label: 'F-0' + n, admissionId: null as string | null })),
    ...['1', '2', '3', '4'].map((n) => ({ id: 'P' + n, ward: 'Maternity', label: 'P-0' + n, admissionId: null as string | null })),
  ].map((b) => ({ ...b, admissionId: ({ M2: 'ad1', F1: 'ad2', F4: 'ad3', M5: 'ad4', P2: 'ad5' } as Record<string, string>)[b.id] ?? null })));
  admissions = signal<Admission[]>([
    { id: 'ad1', patientId: 'p2', bedId: 'M2', doctorId: 'd1', nurseId: 'n1', reason: 'Community-acquired pneumonia', since: ago(52), code: 'Full code' },
    { id: 'ad2', patientId: 'p1', bedId: 'F1', doctorId: 'd1', nurseId: 'n1', reason: 'Uncontrolled hypertension, headache', since: ago(30), code: 'Full code' },
    { id: 'ad3', patientId: 'p4', bedId: 'F4', doctorId: 'd1', nurseId: 'n1', reason: 'Acute heart failure', since: ago(20), code: 'DNR discussed' },
    { id: 'ad4', patientId: 'p8', bedId: 'M5', doctorId: 'd1', nurseId: 'n2', reason: 'Post-operative care: appendectomy', since: ago(14), code: 'Full code' },
    { id: 'ad5', patientId: 'p3', bedId: 'P2', doctorId: 'd2', nurseId: 'n2', reason: 'Antenatal monitoring, pre-eclampsia', since: ago(9), code: 'Full code' },
  ]);
  vitals = signal<Vital[]>([
    ...[[130, 82, 98, 38.9, 91, 26], [124, 80, 96, 38.4, 93, 24], [118, 76, 92, 37.8, 94, 22], [116, 74, 90, 37.4, 95, 20]].map((v, i) => ({ patientId: 'p2', at: ago(40 - i * 10), sys: v[0], dia: v[1], pulse: v[2], temp: v[3], spo2: v[4], rr: v[5], by: 'n1' })),
    ...[[182, 108, 88, 36.8, 97, 18], [170, 100, 84, 36.7, 97, 18], [158, 94, 80, 36.7, 98, 16], [150, 90, 78, 36.6, 98, 16]].map((v, i) => ({ patientId: 'p1', at: ago(28 - i * 7), sys: v[0], dia: v[1], pulse: v[2], temp: v[3], spo2: v[4], rr: v[5], by: 'n1' })),
    ...[[102, 64, 112, 36.5, 90, 26], [98, 62, 116, 36.4, 89, 28], [96, 60, 122, 36.4, 88, 30]].map((v, i) => ({ patientId: 'p4', at: ago(14 - i * 5), sys: v[0], dia: v[1], pulse: v[2], temp: v[3], spo2: v[4], rr: v[5], by: 'n1' })),
    ...[[122, 78, 84, 37.2, 98, 16], [120, 76, 80, 37.0, 98, 16], [118, 74, 78, 36.9, 99, 14]].map((v, i) => ({ patientId: 'p8', at: ago(12 - i * 5), sys: v[0], dia: v[1], pulse: v[2], temp: v[3], spo2: v[4], rr: v[5], by: 'n2' })),
    ...[[148, 96, 90, 36.8, 98, 18], [152, 98, 92, 36.8, 98, 18]].map((v, i) => ({ patientId: 'p3', at: ago(8 - i * 4), sys: v[0], dia: v[1], pulse: v[2], temp: v[3], spo2: v[4], rr: v[5], by: 'n2' })),
  ]);
  orders = signal<Order[]>([
    { id: 'o1', patientId: 'p2', doctorId: 'd1', drug: 'Ceftriaxone IV', dose: '1 g', route: 'IV', freq: '12-hourly' },
    { id: 'o2', patientId: 'p2', doctorId: 'd1', drug: 'Paracetamol', dose: '1 g', route: 'Oral', freq: '6-hourly' },
    { id: 'o3', patientId: 'p1', doctorId: 'd1', drug: 'Amlodipine', dose: '10 mg', route: 'Oral', freq: 'Daily' },
    { id: 'o4', patientId: 'p4', doctorId: 'd1', drug: 'Furosemide', dose: '40 mg', route: 'IV', freq: '12-hourly' },
    { id: 'o5', patientId: 'p8', doctorId: 'd1', drug: 'Tramadol', dose: '50 mg', route: 'Oral', freq: '8-hourly' },
    { id: 'o6', patientId: 'p3', doctorId: 'd2', drug: 'Methyldopa', dose: '250 mg', route: 'Oral', freq: '8-hourly' },
  ]);
  doses = signal<Dose[]>([]);
  notes = signal<Note[]>([
    { patientId: 'p2', nurseId: 'n1', at: ago(6), text: 'Productive cough, takes sips of fluid. Oxygen 2 L/min via nasal prongs. Chest physio done.' },
    { patientId: 'p4', nurseId: 'n1', at: ago(3), text: 'Dyspnoeic on lying flat; propped up at 60°. Fluid balance charted. Doctor informed of SpO2 88%.' },
    { patientId: 'p1', nurseId: 'n1', at: ago(5), text: 'Headache improved (4/10). BP trending down. Educated on low-salt diet.' },
  ]);
  plans = signal<Plan[]>([
    { patientId: 'p2', problem: 'Impaired gas exchange', goal: 'SpO2 ≥ 94% on room air within 48 h', actions: 'Oxygen titration, 2-hourly SpO2, positioning, chest physiotherapy' },
    { patientId: 'p4', problem: 'Fluid volume excess', goal: 'Net negative balance of 1 L / 24 h', actions: 'Strict intake/output, daily weight, fluid restriction 1.2 L' },
    { patientId: 'p1', problem: 'Acute pain: headache', goal: 'Pain ≤ 3/10 by end of shift', actions: 'Pain scoring 4-hourly, quiet environment, give analgesia as ordered' },
    { patientId: 'p8', problem: 'Risk of surgical-site infection', goal: 'Wound clean and dry through discharge', actions: 'Dressing check each shift, hand hygiene, temperature 8-hourly' },
  ]);
  appts = signal<Appt[]>([
    { id: 'ap1', patientId: 'p6', doctorId: 'd1', dept: 'General Medicine', at: at(9, 0), type: 'Scheduled', status: 'Completed', reason: 'Diabetes review' },
    { id: 'ap2', patientId: 'p7', doctorId: 'd2', dept: 'Obstetrics & Gynaecology', at: at(9, 30), type: 'Follow-up', status: 'In consultation', reason: 'Antenatal visit, 28 weeks' },
    { id: 'ap3', patientId: 'p5', doctorId: 'd2', dept: 'Paediatrics', at: at(10, 15), type: 'Walk-in', status: 'Waiting', reason: 'Fever for 2 days' },
    { id: 'ap4', patientId: 'p6', doctorId: 'd1', dept: 'General Medicine', at: at(11, 0), type: 'Scheduled', status: 'Checked in', reason: 'Chest pain on exertion' },
    { id: 'ap5', patientId: 'p7', doctorId: 'd1', dept: 'General Medicine', at: at(14, 0), type: 'Scheduled', status: 'Booked', reason: 'Recurrent headaches' },
    { id: 'ap6', patientId: 'p5', doctorId: 'd2', dept: 'Paediatrics', at: at(9, 0, 1), type: 'Scheduled', status: 'Booked', reason: 'Immunisation' },
  ]);
  labs = signal<Lab[]>([
    { id: 'lb1', patientId: 'p2', doctorId: 'd1', test: 'Full blood count', status: 'Resulted', result: 'WBC 16.2 (High)' },
    { id: 'lb2', patientId: 'p4', doctorId: 'd1', test: 'Troponin I', status: 'Resulted', result: '0.9 ng/mL (Critical)' },
    { id: 'lb3', patientId: 'p1', doctorId: 'd1', test: 'Renal function', status: 'Processing', result: '' },
    { id: 'lb4', patientId: 'p3', doctorId: 'd2', test: 'Urine protein', status: 'Collected', result: '' },
    { id: 'lb5', patientId: 'p8', doctorId: 'd1', test: 'Haemoglobin', status: 'Ordered', result: '' },
  ]);
  drugs = signal<Drug[]>([
    { id: 'g1', name: 'Paracetamol 500 mg', stock: 1800, reorder: 500, expiry: '2027-08', price: 0.5 },
    { id: 'g2', name: 'Amoxicillin 500 mg', stock: 240, reorder: 400, expiry: '2027-02', price: 1.8 },
    { id: 'g3', name: 'Ceftriaxone 1 g inj', stock: 60, reorder: 80, expiry: '2026-12', price: 18 },
    { id: 'g4', name: 'Amlodipine 10 mg', stock: 620, reorder: 300, expiry: '2028-01', price: 1.2 },
    { id: 'g5', name: 'Artemether/Lumefantrine', stock: 900, reorder: 300, expiry: '2026-11', price: 9 },
    { id: 'g6', name: 'Furosemide 40 mg', stock: 150, reorder: 200, expiry: '2027-06', price: 0.9 },
  ]);
  invoices = signal<Invoice[]>([
    { id: 'INV-2041', patientId: 'p2', amount: 4820, paid: 1500, payer: 'NHIS', date: ago(30) },
    { id: 'INV-2042', patientId: 'p1', amount: 2260, paid: 0, payer: 'NHIS', date: ago(24) },
    { id: 'INV-2043', patientId: 'p6', amount: 380, paid: 380, payer: 'Cash', date: ago(5) },
    { id: 'INV-2044', patientId: 'p8', amount: 7350, paid: 2000, payer: 'Private insurance', date: ago(12) },
    { id: 'INV-2045', patientId: 'p7', amount: 210, paid: 210, payer: 'NHIS', date: ago(3) },
  ]);

  constructor() {
    const base = (f: string) => ({ 'Daily': ['08:00'], '6-hourly': ['06:00', '12:00', '18:00', '00:00'], '8-hourly': ['06:00', '14:00', '22:00'], '12-hourly': ['08:00', '20:00'] } as Record<string, string[]>)[f];
    const nowH = new Date().getHours();
    this.doses.set(this.orders().flatMap((o) => base(o.freq).map((t, i) => ({ id: `${o.id}-${i}`, orderId: o.id, patientId: o.patientId, time: t, status: (+t.slice(0, 2) < nowH - 1 && t !== '00:00' ? 'Given' : 'Due') as Dose['status'], by: +t.slice(0, 2) < nowH - 1 ? 'n1' : undefined }))));
    if (USE_MOCK_DATA) {
      try { const saved = localStorage.getItem(DEMO_KEY); if (saved) this.load(JSON.parse(saved)); } catch { /* ignore a corrupt demo save */ }
      effect(() => { const snap = Object.fromEntries(Object.entries(this.all()).map(([k, v]) => [k, v()])); try { localStorage.setItem(DEMO_KEY, JSON.stringify(snap)); } catch { /* storage full or blocked */ } });
    }
  }
  /** Demo mode only: forget saved changes and start again from the sample data. */
  resetDemo() { localStorage.removeItem(DEMO_KEY); location.reload(); }

  staffById = (id: string) => this.staff().find((s) => s.id === id);
  patient = (id: string) => this.patients().find((p) => p.id === id);
  admissionOf = (pid: string) => this.admissions().find((a) => a.patientId === pid);
  bedOf = (pid: string) => this.beds().find((b) => b.admissionId === this.admissionOf(pid)?.id);
  vitalsOf = (pid: string) => this.vitals().filter((v) => v.patientId === pid).sort((a, b) => a.at.localeCompare(b.at));
  latestNews = (pid: string) => { const v = this.vitalsOf(pid).at(-1); return v ? news2(v) : null; };
  session = { email: '', name: '' };
  /** The staff record for the signed-in user: matched by email, then name, then the first person in that role. */
  me(role: Role): Staff {
    const inRole = this.staff().filter((s) => s.role === role), e = this.session.email.toLowerCase(), n = this.session.name.toLowerCase();
    return inRole.find((s) => e && s.email.toLowerCase() === e) ?? inRole.find((s) => n && s.name.toLowerCase().includes(n)) ?? inRole[0] ?? this.staff()[0];
  }
  drugName = (id: string) => this.orders().find((o) => o.id === id)?.drug ?? '';

  addVital(v: Omit<Vital, 'at'>) { this.rec('Recorded vitals','vitals','create',v,this.patient(v.patientId)?.name); this.vitals.update((l) => [...l, { ...v, at: new Date().toISOString() }]); }
  setDose(id: string, status: Dose['status'], by: string) { this.rec('Marked dose '+status.toLowerCase(),'doses','update',{id,status,by},id); this.doses.update((l) => l.map((d) => (d.id === id ? { ...d, status, by } : d))); }
  addNote(n: Omit<Note, 'at'>) { this.rec('Added nursing note','notes','create',n,this.patient(n.patientId)?.name); this.notes.update((l) => [{ ...n, at: new Date().toISOString() }, ...l]); }
  addPlan(p: Plan) { this.rec('Added care plan','plans','create',p,this.patient(p.patientId)?.name); this.plans.update((l) => [...l, p]); }
  prescribe(o: Omit<Order, 'id'>) { this.rec('Prescribed '+o.drug,'orders','create',o,this.patient(o.patientId)?.name);
    const id = 'o' + (this.orders().length + 1);
    this.orders.update((l) => [...l, { ...o, id }]);
    const times = ({ 'Daily': ['08:00'], '8-hourly': ['06:00', '14:00', '22:00'], '12-hourly': ['08:00', '20:00'], '6-hourly': ['06:00', '12:00', '18:00', '00:00'] } as Record<string, string[]>)[o.freq] ?? ['08:00'];
    this.doses.update((l) => [...l, ...times.map((t, i) => ({ id: `${id}-${i}`, orderId: id, patientId: o.patientId, time: t, status: 'Due' as const }))]);
  }
  orderLab(pid: string, doctorId: string, test: string) { this.rec('Ordered '+test,'labs','create',{patientId:pid,doctorId,test},this.patient(pid)?.name); this.labs.update((l) => [...l, { id: 'lb' + (l.length + 1), patientId: pid, doctorId, test, status: 'Ordered', result: '' }]); }
  setLab(id: string, status: string) { this.rec('Updated lab status','labs','update',{id,status},id); this.labs.update((l) => l.map((x) => (x.id === id ? { ...x, status } : x))); }
  admit(pid: string, bedId: string, doctorId: string, nurseId: string, reason: string) { this.rec('Admitted patient','admissions','create',{patientId:pid,bedId,doctorId,nurseId,reason},this.patient(pid)?.name);
    const id = 'ad' + (this.admissions().length + 1);
    this.admissions.update((l) => [...l, { id, patientId: pid, bedId, doctorId, nurseId, reason, since: new Date().toISOString(), code: 'Full code' }]);
    this.beds.update((l) => l.map((b) => (b.id === bedId ? { ...b, admissionId: id } : b)));
  }
  register(p: Omit<Patient, 'id' | 'mrn'>) { this.rec('Registered patient','patients','create',p,p.name); const n = this.patients().length + 121; const id = 'p' + (this.patients().length + 1); this.patients.update((l) => [...l, { ...p, id, mrn: 'NMH-00' + n }]); return id; }

  actor = signal('System');
  sync: ((res: string, op: 'create' | 'update', payload: unknown) => void) | null = null;
  encounters = signal<Encounter[]>([
    { id: 'e1', patientId: 'p6', doctorId: 'd1', at: ago(5), s: 'Thirst, frequent urination', o: 'RBS 14.2 mmol/L', a: 'Type 2 diabetes, poorly controlled', p: 'Adjust metformin, diet review', icd: 'E11.9 Type 2 diabetes', followUp: '' },
    { id: 'e2', patientId: 'p7', doctorId: 'd2', at: ago(4), s: 'Routine antenatal visit', o: 'BP 118/74, FHR 140', a: 'Normal pregnancy, 28 weeks', p: 'Iron, folic acid, next visit in 2 weeks', icd: 'Z34.9 Antenatal visit', followUp: '' },
    { id: 'e3', patientId: 'p5', doctorId: 'd2', at: ago(60), s: 'Fever and chills', o: 'Temp 38.9, RDT positive', a: 'Uncomplicated malaria', p: 'Artemether/lumefantrine 3 days', icd: 'B50.9 Malaria', followUp: '' },
    { id: 'e4', patientId: 'p1', doctorId: 'd1', at: ago(72), s: 'Headache, dizziness', o: 'BP 176/104', a: 'Hypertension', p: 'Start amlodipine, review in 1 week', icd: 'I10 Essential hypertension', followUp: '' },
    { id: 'e5', patientId: 'p2', doctorId: 'd1', at: ago(55), s: 'Cough 5 days, fever', o: 'Crackles right base', a: 'Pneumonia', p: 'Admit, IV antibiotics', icd: 'J18.9 Pneumonia', followUp: '' },
  ]);
  claims = signal<Claim[]>([
    { id: 'CLM-301', invoiceId: 'INV-2041', payer: 'NHIS', amount: 3320, status: 'Submitted' },
    { id: 'CLM-302', invoiceId: 'INV-2042', payer: 'NHIS', amount: 2260, status: 'Draft' },
    { id: 'CLM-303', invoiceId: 'INV-2044', payer: 'Private insurance', amount: 5350, status: 'Approved' },
    { id: 'CLM-304', invoiceId: 'INV-2045', payer: 'NHIS', amount: 180, status: 'Rejected' },
  ]);
  audit = signal<Audit[]>([
    { id: 'au1', at: ago(26), user: 'Efua Mensah', action: 'Signed in', detail: 'Administrator' },
    { id: 'au2', at: ago(20), user: 'Dr. Kwame Boateng', action: 'Prescribed Furosemide IV', detail: 'Yaa Asantewaa' },
    { id: 'au3', at: ago(9), user: 'Nurse Yaw Addo', action: 'Admitted patient', detail: 'Esi Quaye' },
  ]);
  discharges = signal<Discharge[]>([]);

  rec(action: string, resource: string, op: 'create' | 'update', payload: unknown, detail = '') {
    this.audit.update((l) => [{ id: 'au' + (l.length + 1), at: new Date().toISOString(), user: this.actor(), action, detail }, ...l]);
    this.sync?.(resource, op, payload);
  }
  addAppt(a: Omit<Appt, 'id'>) { this.rec('Booked appointment', 'appts', 'create', a, this.patient(a.patientId)?.name); this.appts.update((l) => [...l, { ...a, id: 'ap' + (l.length + 1) }]); }
  setAppt(id: string, status: string) { this.rec('Updated appointment', 'appts', 'update', { id, status }, status); this.appts.update((l) => l.map((a) => (a.id === id ? { ...a, status } : a))); }
  saveEncounter(e: Omit<Encounter, 'id' | 'at'>, apptId: string) {
    this.rec('Completed consultation', 'encounters', 'create', e, this.patient(e.patientId)?.name);
    this.encounters.update((l) => [{ ...e, id: 'e' + (l.length + 1), at: new Date().toISOString() }, ...l]);
    this.appts.update((l) => l.map((a) => (a.id === apptId ? { ...a, status: 'Completed' } : a)));
  }
  setClaim(id: string, status: Claim['status']) { this.rec('Claim ' + status.toLowerCase(), 'claims', 'update', { id, status }, id); this.claims.update((l) => l.map((c) => (c.id === id ? { ...c, status } : c))); }
  transfer(admissionId: string, bedId: string) {
    this.rec('Transferred patient', 'admissions', 'update', { id: admissionId, bedId }, bedId);
    this.beds.update((l) => l.map((b) => (b.admissionId === admissionId ? { ...b, admissionId: null } : b.id === bedId ? { ...b, admissionId } : b)));
    this.admissions.update((l) => l.map((a) => (a.id === admissionId ? { ...a, bedId } : a)));
  }
  discharge(admissionId: string, summary: string, doctorId: string) {
    const a = this.admissions().find((x) => x.id === admissionId)!;
    this.rec('Discharged patient', 'discharges', 'create', { admissionId, patientId: a.patientId, doctorId, summary }, this.patient(a.patientId)?.name);
    this.discharges.update((l) => [...l, { admissionId, patientId: a.patientId, doctorId, summary, at: new Date().toISOString() }]);
    this.admissions.update((l) => l.filter((x) => x.id !== admissionId));
    this.beds.update((l) => l.map((b) => (b.admissionId === admissionId ? { ...b, admissionId: null } : b)));
  }
  private all() {
    return { patients: this.patients, staff: this.staff, depts: this.depts, beds: this.beds, admissions: this.admissions, vitals: this.vitals, orders: this.orders, doses: this.doses, notes: this.notes, plans: this.plans, appts: this.appts, labs: this.labs, drugs: this.drugs, invoices: this.invoices, claims: this.claims, encounters: this.encounters, discharges: this.discharges, audit: this.audit } as unknown as Record<string, { (): unknown; set: (v: never) => void }>;
  }
  load(d: Record<string, unknown[] | undefined>) {
    const m = this.all();
    for (const [k, v] of Object.entries(d)) if (v && m[k]) m[k].set(v as never);
  }

  addStaff(m: Omit<Staff, 'id'>) { this.rec('Added staff member', 'staff', 'create', m, m.name); this.staff.update((l) => [...l, { ...m, id: 's' + (l.length + 10) }]); }
  setLabResult(id: string, value: string, flag: string) {
    const result = `${value} (${flag})`;
    this.rec('Released lab result', 'labs', 'update', { id, status: 'Resulted', result }, flag);
    this.labs.update((l) => l.map((x) => (x.id === id ? { ...x, status: 'Resulted', result } : x)));
  }
  restock(id: string, qty: number) {
    this.rec('Received stock', 'drugs', 'update', { id, stock: (this.drugs().find((d) => d.id === id)?.stock ?? 0) + qty }, `+${qty}`);
    this.drugs.update((l) => l.map((d) => (d.id === id ? { ...d, stock: d.stock + qty } : d)));
  }
  addDrug(d: Omit<Drug, 'id'>) { this.rec('Added drug', 'drugs', 'create', d, d.name); this.drugs.update((l) => [...l, { ...d, id: 'g' + (l.length + 1) }]); }
  /** Dispenses one prescription and deducts stock. Returns a message for the pharmacist. */
  dispense(orderId: string): string {
    const o = this.orders().find((x) => x.id === orderId);
    if (!o) return 'Prescription not found.';
    const key = o.drug.split(' ')[0].toLowerCase(), qty = Math.max(1, this.doses().filter((x) => x.orderId === orderId).length);
    const d = this.drugs().find((x) => x.name.toLowerCase().startsWith(key));
    if (!d) return `${o.drug} is not in the stock list. Add it under Add a drug first.`;
    if (d.stock < qty) return `Only ${d.stock} of ${d.name} left. Receive stock before dispensing.`;
    this.rec('Dispensed ' + o.drug, 'orders', 'update', { id: orderId, dispensed: true }, this.patient(o.patientId)?.name);
    this.drugs.update((l) => l.map((x) => (x.id === d.id ? { ...x, stock: x.stock - qty } : x)));
    this.orders.update((l) => l.map((x) => (x.id === orderId ? { ...x, dispensed: true } : x)));
    return `Dispensed ${o.drug} for ${this.patient(o.patientId)?.name}. ${d.name} now at ${d.stock - qty}.`;
  }
}
