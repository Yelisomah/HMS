import { inject, Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../Auth/auth.service';
import { CheckInEntity, CheckInResponse } from './api.models';
import { HmsApi } from './hms-api';

export interface ActiveCheckIn extends CheckInResponse {
  /** Database ID of the check-in. null when the API did not expose it (see below). */
  checkInId: number | null;
}

/**
 * GET /api/checkin/active returns CheckInResponseDto, which has no check-in ID, yet vitals, SOAP notes
 * and check-out all need one. GET /api/checkin/staff/{staffId} does include IDs, so IDs are matched in
 * from the signed-in user's own check-ins. Anything left unmatched can be entered by hand in the UI.
 * Adding `id` to CheckInResponseDto on the backend would make this lookup unnecessary.
 */
@Injectable({ providedIn: 'root' })
export class CheckInService {
  private readonly api = inject(HmsApi);
  private readonly auth = inject(AuthService);

  active(): Observable<ActiveCheckIn[]> {
    const staffId = this.auth.user()?.id;
    const mine$: Observable<CheckInEntity[]> = staffId
      ? this.api.checkInsByStaff(staffId).pipe(catchError(() => of([] as CheckInEntity[])))
      : of([]);

    return forkJoin([this.api.activeCheckIns(), mine$]).pipe(
      map(([active, mine]) =>
        (active ?? []).map((a) => {
          const match = mine.find(
            (m) => m.patient?.registrationNumber === a.registrationNumber && m.status === a.status,
          ) ?? mine.find((m) => m.patient?.registrationNumber === a.registrationNumber);
          return { ...a, checkInId: match?.id ?? null };
        }),
      ),
    );
  }
}
