import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { HmsApi } from './hms-api';
import { CheckInService } from './checkin.service';

describe('CheckInService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('resolves an active visit ID from the patient check-in collection for any staff member', () => {
    const active = [{
      patientName: 'Ada Mensah',
      registrationNumber: 'HMS-42',
      status: 'IN_PROGRESS' as const,
      checkInTime: '2026-11-24T10:00:00Z',
    }];
    const api = {
      activeCheckIns: () => of(active),
      patientByReg: () => of({
        data: {
          checkIns: [
            { id: 8, status: 'IN_PROGRESS', checkInTime: '2026-11-24T09:00:00Z' },
            { id: 42, status: 'IN_PROGRESS', checkInTime: '2026-11-24T10:00:00Z' },
          ],
        },
      }),
    };
    TestBed.configureTestingModule({ providers: [CheckInService, { provide: HmsApi, useValue: api }] });

    let result: unknown;
    TestBed.inject(CheckInService).active().subscribe((items) => (result = items));

    expect(result).toEqual([{ ...active[0], checkInId: 42 }]);
  });

  it('explains when the patient API does not include a matching check-in ID', () => {
    const api = {
      activeCheckIns: () => of([{
        patientName: 'Ada Mensah',
        registrationNumber: 'HMS-42',
        status: 'WAITING' as const,
      }]),
      patientByReg: () => of({ data: { checkIns: [] } }),
    };
    TestBed.configureTestingModule({ providers: [CheckInService, { provide: HmsApi, useValue: api }] });

    let result: unknown;
    TestBed.inject(CheckInService).active().subscribe((items) => (result = items));

    expect(result).toEqual([expect.objectContaining({
      checkInId: null,
      checkInIdError: 'No matching check-in ID was returned for this active visit.',
    })]);
  });
});
