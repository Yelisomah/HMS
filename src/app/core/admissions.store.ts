import { computed, Injectable, signal } from '@angular/core';

export type AdmissionStatus = 'ADMITTED' | 'DISCHARGED';

export interface AdmissionBed {
  id: string;
  wardId: string;
  wardName: string;
  label: string;
  admissionId: string | null;
}

export interface Admission {
  id: string;
  patientId: string;
  registrationNumber: string;
  patientName: string;
  dateOfBirth?: string;
  phoneNumber?: string;
  wardId: string;
  wardName: string;
  bedId: string;
  bedLabel: string;
  attendingDoctorId: string;
  assignedNurseId?: string;
  admittingStaffId: string;
  reason: string;
  admittedAt: string;
  status: AdmissionStatus;
  dischargeSummary?: string;
  dischargedAt?: string;
  dischargedBy?: string;
}

export interface AdmitPatientInput {
  patientId: string;
  registrationNumber: string;
  patientName: string;
  dateOfBirth?: string;
  phoneNumber?: string;
  bedId: string;
  attendingDoctorId: string;
  assignedNurseId?: string;
  admittingStaffId: string;
  reason: string;
}

function sampleBeds(): AdmissionBed[] {
  return [
    { id: 'demo-med-01', wardId: 'demo-medical', wardName: 'Demo Medical Ward', label: 'M-01', admissionId: null },
    { id: 'demo-med-02', wardId: 'demo-medical', wardName: 'Demo Medical Ward', label: 'M-02', admissionId: null },
    { id: 'demo-med-03', wardId: 'demo-medical', wardName: 'Demo Medical Ward', label: 'M-03', admissionId: null },
    { id: 'demo-surg-01', wardId: 'demo-surgical', wardName: 'Demo Surgical Ward', label: 'S-01', admissionId: null },
    { id: 'demo-surg-02', wardId: 'demo-surgical', wardName: 'Demo Surgical Ward', label: 'S-02', admissionId: null },
    { id: 'demo-mat-01', wardId: 'demo-maternity', wardName: 'Demo Maternity Ward', label: 'P-01', admissionId: null },
  ];
}

@Injectable({ providedIn: 'root' })
export class AdmissionsStore {
  readonly admissions = signal<Admission[]>([]);
  readonly beds = signal<AdmissionBed[]>(sampleBeds());
  readonly activeAdmissions = computed(() => this.admissions().filter((item) => item.status === 'ADMITTED'));
  readonly dischargedAdmissions = computed(() => this.admissions().filter((item) => item.status === 'DISCHARGED'));
  readonly availableBeds = computed(() => this.beds().filter((bed) => bed.admissionId === null));
  private nextAdmissionNumber = 1;

  admit(input: AdmitPatientInput): Admission {
    if (!input.patientId.trim() || !input.registrationNumber.trim() || !input.patientName.trim()) {
      throw new Error('Select a registered patient before creating an admission.');
    }
    if (!input.attendingDoctorId.trim() || !input.admittingStaffId.trim() || !input.reason.trim()) {
      throw new Error('An attending doctor, admitting staff member, and reason are required.');
    }
    if (this.activeAdmissions().some((item) => item.patientId === input.patientId)) {
      throw new Error('This patient already has an active admission.');
    }

    const bed = this.beds().find((item) => item.id === input.bedId);
    if (!bed) throw new Error('Select a bed from the available bed list.');
    if (bed.admissionId) throw new Error('That bed has already been assigned. Choose another bed.');

    const admission: Admission = {
      ...input,
      id: `ADM-${Date.now()}-${this.nextAdmissionNumber++}`,
      wardId: bed.wardId,
      wardName: bed.wardName,
      bedLabel: bed.label,
      admittedAt: new Date().toISOString(),
      status: 'ADMITTED',
    };

    this.admissions.update((items) => [admission, ...items]);
    this.beds.update((items) => items.map((item) =>
      item.id === bed.id ? { ...item, admissionId: admission.id } : item,
    ));
    return admission;
  }

  discharge(admissionId: string, summary: string, staffId: string): Admission {
    const current = this.activeAdmissions().find((item) => item.id === admissionId);
    if (!current) throw new Error('This admission is no longer active.');
    if (!summary.trim()) throw new Error('Enter a discharge summary before completing discharge.');

    const discharged: Admission = {
      ...current,
      status: 'DISCHARGED',
      dischargeSummary: summary.trim(),
      dischargedAt: new Date().toISOString(),
      dischargedBy: staffId,
    };

    this.admissions.update((items) => items.map((item) => item.id === admissionId ? discharged : item));
    this.beds.update((items) => items.map((item) =>
      item.admissionId === admissionId ? { ...item, admissionId: null } : item,
    ));
    return discharged;
  }
}
