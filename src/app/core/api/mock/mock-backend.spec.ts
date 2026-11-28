import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { MOCKED_MODULES } from '../api.config';
import { Admission, Appointment, Bed, Invoice, PendingCharge, StaffMember } from '../hospital.models';
import { mockBackendInterceptor } from './mock-backend.interceptor';

const patientReply = { data: { id: 'p-1', firstName: 'Ama', lastName: 'Mensah', registrationNumber: 'REG-1' } };

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([mockBackendInterceptor])), provideHttpClientTesting()] });
  return { http: TestBed.inject(HttpClient), ctrl: TestBed.inject(HttpTestingController) };
}
/** Answers the mock's real patient lookup once it has been issued. */
async function answerLookup(ctrl: HttpTestingController) {
  for (let i = 0; i < 20; i++) {
    const open = ctrl.match((r) => r.url.includes('/api/patients/registration/'));
    if (open.length) { open[0].flush(patientReply); return; }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('patient lookup was never requested');
}
const reject = (p: Promise<unknown>) => p.then(() => 'ok', (e) => e.status as number);

describe('mock backend', () => {
  it('has every module mocked for the preview', () => expect(Object.values(MOCKED_MODULES).every(Boolean)).toBe(true));

  it('lists doctors including physicians and hides inactive staff when asked', async () => {
    const { http } = setup();
    const docs = await firstValueFrom(http.get<StaffMember[]>('/api/staff', { params: { role: 'DOCTOR', active: 'true' } }));
    expect(docs.map((d) => d.role)).toContain('PHYSICIAN');
    expect(docs.every((d) => d.active !== false)).toBe(true);
  });

  it('runs admit -> transfer -> discharge and keeps bed status consistent', async () => {
    const { http, ctrl } = setup();
    const free = await firstValueFrom(http.get<Bed[]>('/api/beds', { params: { status: 'AVAILABLE' } }));
    const admitted = firstValueFrom(http.post<Admission>('/api/admissions', { registrationNumber: 'REG-1', bedId: free[0].id, attendingDoctorId: 'mock-d1', admissionType: 'ELECTIVE', reason: 'Observation' }));
    await answerLookup(ctrl);
    const a = await admitted;
    expect(a.status).toBe('ADMITTED');
    expect((await firstValueFrom(http.get<Bed[]>('/api/beds'))).find((b) => b.id === free[0].id)?.status).toBe('OCCUPIED');
    expect(await reject(firstValueFrom(http.patch(`/api/beds/${free[0].id}/status`, { status: 'MAINTENANCE' })))).toBe(409);

    const moved = await firstValueFrom(http.post<Admission>(`/api/admissions/${a.id}/transfer`, { newBedId: free[1].id, reason: 'Isolation' }));
    expect(moved.bedId).toBe(free[1].id);
    const beds = await firstValueFrom(http.get<Bed[]>('/api/beds'));
    expect(beds.find((b) => b.id === free[0].id)?.status).toBe('CLEANING');

    const out = await firstValueFrom(http.post<Admission>(`/api/admissions/${a.id}/discharge`, { dischargeType: 'RECOVERED', summary: 'Well' }));
    expect(out.status).toBe('DISCHARGED');
    expect(await reject(firstValueFrom(http.post(`/api/admissions/${a.id}/discharge`, { dischargeType: 'RECOVERED', summary: 'x' })))).toBe(404);

    // billing picks up the discharged stay exactly once
    const pending = await firstValueFrom(http.get<PendingCharge[]>('/api/billing/pending-charges', { params: { registrationNumber: 'REG-1' } }));
    const stay = pending.find((c) => c.category === 'ADMISSION')!;
    expect(stay).toBeTruthy();
    const invoiced = firstValueFrom(http.post<Invoice>('/api/billing/invoices', { registrationNumber: 'REG-1', lines: [{ description: stay.description, category: stay.category, quantity: stay.quantity, unitPrice: stay.unitPrice, sourceId: stay.sourceId }] }));
    await answerLookup(ctrl);
    const inv = await invoiced;
    expect(inv.balance).toBe(inv.total);
    const again = await firstValueFrom(http.get<PendingCharge[]>('/api/billing/pending-charges', { params: { registrationNumber: 'REG-1' } }));
    expect(again.find((c) => c.sourceId === stay.sourceId)).toBeUndefined();

    expect(await reject(firstValueFrom(http.post(`/api/billing/invoices/${inv.id}/payments`, { amount: inv.total + 1, method: 'CASH' })))).toBe(409);
    const paid = await firstValueFrom(http.post<Invoice>(`/api/billing/invoices/${inv.id}/payments`, { amount: inv.total, method: 'CASH' }));
    expect(paid.status).toBe('PAID');
  });

  it('prevents double-booking a doctor slot', async () => {
    const { http, ctrl } = setup();
    const day = new Date(Date.now() + 2 * 86_400_000);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const body = { registrationNumber: 'REG-1', doctorId: 'mock-d2', scheduledAt: `${date}T10:00:00`, durationMinutes: 30, reason: 'Review' };
    const first = firstValueFrom(http.post<Appointment>('/api/appointments', body));
    await answerLookup(ctrl);
    await first;
    expect(await reject(firstValueFrom(http.post('/api/appointments', body)))).toBe(409);
    const slots = await firstValueFrom(http.get<{ slots: string[] }>('/api/appointments/availability', { params: { doctorId: 'mock-d2', date } }));
    expect(slots.slots).not.toContain('10:00');
  });
});
