import { inject, Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { errorMessage } from './errors';
import { CheckInEntity, CheckInResponse } from './api.models';
import { HmsApi } from './hms-api';

export interface ActiveCheckIn extends CheckInResponse {
  checkInId: number | null;
  checkInIdError?: string;
}

@Injectable({ providedIn: 'root' })
export class CheckInService {
  private readonly api = inject(HmsApi);

  active(): Observable<ActiveCheckIn[]> {
    return this.api.activeCheckIns().pipe(
      switchMap((active) => {
        const registrations = [...new Set((active ?? []).map((item) => item.registrationNumber).filter(Boolean))];
        if (!registrations.length) return of((active ?? []).map((item) => ({ ...item, checkInId: null })));

        return forkJoin(registrations.map((registrationNumber) =>
          this.api.patientByReg(registrationNumber).pipe(
            map((response) => ({
              registrationNumber,
              checkIns: response.data?.checkIns ?? [],
              error: response.data?.checkIns ? '' : 'The patient response did not include check-in IDs.',
            })),
            catchError((error: unknown) => of({
              registrationNumber,
              checkIns: [] as CheckInEntity[],
              error: errorMessage(error, 'Could not resolve this check-in ID.'),
            })),
          ),
        )).pipe(
          map((patientDetails) => {
            const byRegistration = new Map(patientDetails.map((details) => [details.registrationNumber, details]));
            return (active ?? []).map((item) => {
              const details = byRegistration.get(item.registrationNumber);
              const candidates = (details?.checkIns ?? []).filter((checkIn) =>
                checkIn.status === item.status &&
                (!checkIn.patient?.registrationNumber || checkIn.patient.registrationNumber === item.registrationNumber),
              );
              const match = matchingCheckIn(candidates, item.checkInTime);
              return {
                ...item,
                checkInId: match?.id ?? null,
                ...(match ? {} : {
                  checkInIdError: details?.error || (candidates.length > 1
                    ? 'More than one check-in matched this visit; the ID could not be resolved safely.'
                    : 'No matching check-in ID was returned for this active visit.'),
                }),
              };
            });
          }),
        );
      }),
    );
  }
}

function matchingCheckIn(candidates: CheckInEntity[], checkInTime?: string): CheckInEntity | undefined {
  if (!candidates.length) return undefined;
  if (checkInTime) {
    const activeTime = Date.parse(checkInTime);
    const exact = candidates.find((candidate) => {
      if (!candidate.checkInTime) return false;
      const candidateTime = Date.parse(candidate.checkInTime);
      return Number.isFinite(activeTime) && Number.isFinite(candidateTime) && Math.abs(candidateTime - activeTime) < 1000;
    });
    if (exact) return exact;
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
