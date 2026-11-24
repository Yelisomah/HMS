import { AdmissionsStore } from './admissions.store';

const admissionInput = (overrides: Partial<Parameters<AdmissionsStore['admit']>[0]> = {}) => ({
  patientId: 'patient-1',
  registrationNumber: 'HMS-001',
  patientName: 'Sample Patient',
  bedId: 'demo-med-01',
  attendingDoctorId: 'doctor-1',
  admittingStaffId: 'nurse-1',
  reason: 'Observation',
  ...overrides,
});

describe('AdmissionsStore', () => {
  it('reserves an available bed and blocks duplicate active admissions for one patient', () => {
    const store = new AdmissionsStore();
    store.admit(admissionInput());

    expect(store.activeAdmissions()).toHaveLength(1);
    expect(store.availableBeds().some((bed) => bed.id === 'demo-med-01')).toBe(false);
    expect(() => store.admit(admissionInput({ bedId: 'demo-med-02' }))).toThrow('already has an active admission');
  });

  it('releases the bed and retains the discharge record', () => {
    const store = new AdmissionsStore();
    const admission = store.admit(admissionInput());

    store.discharge(admission.id, 'Discharged with follow-up instructions.', 'doctor-1');

    expect(store.activeAdmissions()).toHaveLength(0);
    expect(store.availableBeds().some((bed) => bed.id === admission.bedId)).toBe(true);
    expect(store.dischargedAdmissions()[0].dischargeSummary).toBe('Discharged with follow-up instructions.');
  });

  it('does not discharge without a summary', () => {
    const store = new AdmissionsStore();
    const admission = store.admit(admissionInput());

    expect(() => store.discharge(admission.id, '  ', 'doctor-1')).toThrow('discharge summary');
    expect(store.activeAdmissions()).toHaveLength(1);
  });
});
