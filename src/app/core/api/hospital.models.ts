// Types for modules the backend has NOT shipped yet (admissions, wards/beds, staff directory).
// They describe the PROPOSED contract. When the backend team publishes the real schemas,
// adjust these interfaces and the paths in api.config.ts (PENDING section) - the UI keeps working.

export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE';
export type AdmissionStatus = 'ADMITTED' | 'DISCHARGED';
export type AdmissionType = 'EMERGENCY' | 'ELECTIVE' | 'TRANSFER_IN' | 'MATERNITY';
export type DischargeType = 'RECOVERED' | 'REFERRED' | 'AGAINST_MEDICAL_ADVICE' | 'DECEASED';

export interface Bed {
  id: string;
  wardId: string;
  wardName?: string;
  label: string;
  status: BedStatus;
  admissionId?: string | null;
}

export interface Ward {
  id: string;
  name: string;
  type?: string;
  capacity: number;
  occupied: number;
  beds?: Bed[];
}

export interface WardRequest { name: string; type?: string; bedPrefix?: string; bedCount?: number }
export interface BedRequest { label: string }

export interface AdmissionRequest {
  registrationNumber: string;
  bedId: string;
  attendingDoctorId: string;
  assignedNurseId?: string;
  admissionType: AdmissionType;
  reason: string;
}

export interface Admission {
  id: string;
  patientId: string;
  registrationNumber: string;
  patientName: string;
  wardId: string;
  wardName: string;
  bedId: string;
  bedLabel: string;
  attendingDoctorId: string;
  attendingDoctorName?: string;
  assignedNurseId?: string;
  assignedNurseName?: string;
  admissionType: AdmissionType;
  reason: string;
  status: AdmissionStatus;
  admittedAt: string;
  admittedBy?: string;
  dischargedAt?: string;
  dischargedBy?: string;
  dischargeType?: DischargeType;
  dischargeSummary?: string;
  followUpInstructions?: string;
}

export interface TransferRequest { newBedId: string; reason: string }
export interface DischargeRequest { dischargeType: DischargeType; summary: string; followUpInstructions?: string }

export interface AdmissionPage {
  content: Admission[];
  totalElements: number;
  page: number;
  size: number;
}

export interface StaffMember {
  id: string;
  staffNumber?: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  email?: string;
  phoneNumber?: string;
  active?: boolean;
  specialty?: string;
  licenseNumber?: string;
  joinedOn?: string;
}

// ---- appointments (pending backend) ----
export type AppointmentStatus = 'SCHEDULED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Appointment {
  id: string;
  patientId: string;
  registrationNumber: string;
  patientName: string;
  doctorId: string;
  doctorName?: string;
  /** ISO local date-time, e.g. 2026-11-30T09:30:00 */
  scheduledAt: string;
  durationMinutes: number;
  reason: string;
  status: AppointmentStatus;
  cancelReason?: string;
  checkedInAt?: string;
  createdAt?: string;
}

export interface AppointmentRequest {
  registrationNumber: string;
  doctorId: string;
  scheduledAt: string;
  durationMinutes: number;
  reason: string;
}
export interface RescheduleRequest { scheduledAt: string; doctorId?: string; durationMinutes?: number }
export interface CancelAppointmentRequest { reason: string }
export interface ArrivedRequest { registrationNumber: string; checkedInAt?: string }
export interface AvailabilityResponse { doctorId: string; date: string; slots: string[] }

// ---- pharmacy (pending backend) ----
export type PrescriptionStatus = 'PENDING' | 'DISPENSED' | 'CANCELLED';
export type DrugForm = 'TABLET' | 'CAPSULE' | 'SYRUP' | 'INJECTION' | 'CREAM' | 'DROPS' | 'OTHER';
export type StockReason = 'RECEIVED' | 'ADJUSTMENT' | 'EXPIRED' | 'DAMAGED';

export interface Drug {
  id: string;
  name: string;
  genericName?: string;
  strength?: string;
  form: DrugForm;
  quantityInStock: number;
  reorderLevel: number;
  unitPrice?: number;
  expiryDate?: string;
}
export interface DrugRequest {
  name: string; genericName?: string; strength?: string; form: DrugForm;
  quantityInStock: number; reorderLevel: number; unitPrice?: number; expiryDate?: string;
}
export interface StockAdjustmentRequest { quantityChange: number; reason: StockReason; note?: string }

export interface PrescriptionItemRequest {
  drugId: string; dose: string; frequency: string; durationDays: number; quantity: number; instructions?: string;
}
export interface PrescriptionItem extends PrescriptionItemRequest { id: string; drugName: string }
export interface PrescriptionRequest { registrationNumber: string; notes?: string; items: PrescriptionItemRequest[] }
export interface Prescription {
  id: string;
  patientId: string;
  registrationNumber: string;
  patientName: string;
  prescribedById?: string;
  prescribedByName?: string;
  createdAt: string;
  status: PrescriptionStatus;
  notes?: string;
  items: PrescriptionItem[];
  dispensedAt?: string;
  dispensedBy?: string;
  counsellingNote?: string;
  cancelReason?: string;
}
export interface DispenseRequest { counsellingNote?: string; allergyOverrideAcknowledged?: boolean }
export interface CancelPrescriptionRequest { reason: string }

// ---- laboratory (pending backend) ----
export type LabCategory = 'HAEMATOLOGY' | 'BIOCHEMISTRY' | 'MICROBIOLOGY' | 'URINALYSIS' | 'SEROLOGY';
export type LabPriority = 'ROUTINE' | 'URGENT' | 'STAT';
export type LabOrderStatus = 'REQUESTED' | 'COLLECTED' | 'COMPLETED' | 'CANCELLED';
export type LabFlag = 'NORMAL' | 'LOW' | 'HIGH' | 'ABNORMAL' | 'CRITICAL';

export interface LabTest {
  id: string;
  code: string;
  name: string;
  category: LabCategory;
  specimen: string;
  /** NUMERIC tests use unit + refLow/refHigh; TEXT tests may offer options. */
  resultType: 'NUMERIC' | 'TEXT';
  unit?: string;
  refLow?: number;
  refHigh?: number;
  options?: string[];
  abnormalOptions?: string[];
}

export interface LabOrderTest {
  id: string;
  testId: string;
  testName: string;
  specimen: string;
  resultType: 'NUMERIC' | 'TEXT';
  unit?: string;
  refLow?: number;
  refHigh?: number;
  options?: string[];
  abnormalOptions?: string[];
  status: 'PENDING' | 'RESULTED';
  resultValue?: number;
  resultText?: string;
  flag?: LabFlag;
  comment?: string;
  resultedAt?: string;
  resultedBy?: string;
}

export interface LabOrder {
  id: string;
  patientId: string;
  registrationNumber: string;
  patientName: string;
  requestedByName?: string;
  createdAt: string;
  priority: LabPriority;
  clinicalNotes?: string;
  status: LabOrderStatus;
  tests: LabOrderTest[];
  collectedAt?: string;
  collectionNote?: string;
  completedAt?: string;
  cancelReason?: string;
}

export interface LabOrderRequest { registrationNumber: string; testIds: string[]; priority: LabPriority; clinicalNotes?: string }
export interface CollectRequest { collectionNote?: string }
export interface LabResultEntry { orderTestId: string; resultValue?: number; resultText?: string; critical?: boolean; comment?: string }
export interface LabResultsRequest { results: LabResultEntry[] }
export interface CancelLabOrderRequest { reason: string }

// ---- billing (pending backend) ----
export type ChargeCategory = 'CONSULTATION' | 'ADMISSION' | 'PHARMACY' | 'LABORATORY' | 'PROCEDURE' | 'OTHER';
export type InvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
export type PaymentMethod = 'CASH' | 'MOBILE_MONEY' | 'CARD' | 'INSURANCE';

/** A charge raised by another module (dispensed prescription, completed lab test, discharged stay, attended appointment) not yet invoiced. */
export interface PendingCharge {
  sourceId: string;
  category: ChargeCategory;
  description: string;
  quantity: number;
  unitPrice: number;
  occurredAt?: string;
}
export interface InvoiceLineRequest {
  description: string; category: ChargeCategory; quantity: number; unitPrice: number;
  /** Set when the line comes from a pending charge so the backend can mark it billed. */
  sourceId?: string;
}
export interface InvoiceLine extends InvoiceLineRequest { id: string; total: number }
export interface Payment {
  id: string; amount: number; method: PaymentMethod; reference?: string; receivedAt: string; receivedBy?: string;
}
export interface Invoice {
  id: string;
  invoiceNumber: string;
  patientId: string;
  registrationNumber: string;
  patientName: string;
  createdAt: string;
  createdBy?: string;
  status: InvoiceStatus;
  notes?: string;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  balance: number;
  payments: Payment[];
  voidReason?: string;
}
export interface InvoiceRequest { registrationNumber: string; lines: InvoiceLineRequest[]; discount?: number; notes?: string }
export interface PaymentRequest { amount: number; method: PaymentMethod; reference?: string }
export interface VoidInvoiceRequest { reason: string }

// ---- reports (pending backend) ----
export type ReportType = 'admissions' | 'occupancy' | 'appointments' | 'pharmacy' | 'laboratory' | 'revenue';
export type KpiFormat = 'number' | 'currency' | 'percent' | 'days' | 'hours';

/**
 * One generic shape for every report so the UI can render any of them and the backend can add new ones
 * without a UI release: headline numbers, an optional bar chart, and a table (also used for CSV export).
 */
export interface ReportResponse {
  type: ReportType;
  from: string;
  to: string;
  generatedAt: string;
  kpis: { label: string; value: number; format?: KpiFormat }[];
  chart?: { title: string; labels: string[]; series: { name: string; values: number[] }[] };
  table: { title?: string; columns: string[]; rows: (string | number | null)[][] };
}
