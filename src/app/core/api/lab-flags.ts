import { LabFlag, LabOrderTest, LabTest } from './hospital.models';

type FlagInput = Pick<LabTest | LabOrderTest, 'resultType' | 'refLow' | 'refHigh' | 'abnormalOptions'>;

/**
 * Flags a result against its reference range / abnormal options. Returns undefined when there is
 * nothing to compare against (e.g. free-text results). The backend is expected to be the source of
 * truth once live; the UI uses this only for the live preview while a technician types.
 */
export function computeFlag(test: FlagInput, value: number | string | null | undefined, critical = false): LabFlag | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (critical) return 'CRITICAL';
  if (test.resultType === 'NUMERIC') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return undefined;
    if (test.refLow !== undefined && n < test.refLow) return 'LOW';
    if (test.refHigh !== undefined && n > test.refHigh) return 'HIGH';
    return test.refLow !== undefined || test.refHigh !== undefined ? 'NORMAL' : undefined;
  }
  if (!test.abnormalOptions) return undefined;
  return test.abnormalOptions.some((o) => o.toLowerCase() === String(value).trim().toLowerCase()) ? 'ABNORMAL' : 'NORMAL';
}
