// Types mirror the OpenAPI document at /v3/api-docs of the HMS backend.

export interface LoginRequest { staffNumber?: string; username?: string; password: string }
export interface LoginResponse { status?: string; message?: string; accessToken?: string; refreshToken?: string }
export interface ResponseMessage {
  status?: string; message?: string; staffNumber?: string;
  patientDetails?: { registrationNumber?: string; fullName?: string; gender?: string; age?: number };
}
export interface AdminResetPasswordResponse { status?: string; message?: string; temporaryPassword?: string }
export interface InviteUserRequest {
  username: string; firstName: string; lastName: string; email: string;
  phoneNumber: string; role: string; staffNumber?: string;
}
export interface UserAccountResponse {
  userId: string; username?: string; staffNumber?: string; role?: string;
  email?: string; enabled?: boolean; deactivatedAt?: string;
}

export interface PatientRegistrationRequest {
  firstName: string; otherNames?: string; lastName: string; dateOfBirth: string;
  gender: string; phoneNumber: string; address?: string;
  nextOfKinName: string; nextOfKinRelationship?: string; nextOfKinPhoneNumber: string;
  nhisNumber?: string; confirmPossibleDuplicates?: boolean;
}
export interface PossibleDuplicate { patientId: string; fullName: string; dateOfBirth?: string; phoneNumber?: string }
export interface PatientRegistrationResponse {
  registered: boolean; message?: string;
  patient?: { patientId: string; firstName?: string; lastName?: string; registrationDate?: string; [k: string]: unknown };
  possibleMatches?: PossibleDuplicate[];
}
export interface PatientSearchResult { patientId: string; fullName: string; dateOfBirth?: string; phoneNumber?: string }
export interface PatientSearchResponse {
  found: boolean; message?: string; suggestedAction?: string; totalMatches: number;
  page: number; size: number; totalPages: number; results: PatientSearchResult[];
}
export interface PatientFull {
  id: string; registrationNumber?: string; registrationDate?: string; firstName?: string; lastName?: string;
  otherNames?: string; phoneNumber?: string; email?: string; gender?: string; dateOfBirth?: string; age?: number;
  maritalStatus?: string; occupation?: string; religion?: string; nationality?: string; address?: string;
  city?: string; town?: string; nextOfKinName?: string; nextOfKinRelationship?: string;
  nextOfKinPhoneNumber?: string; nhisNumber?: string; deceased?: boolean; admitted?: boolean;
  checkIns?: CheckInEntity[];
  [k: string]: unknown;
}
export interface PatientResponseMessage { status?: string; message?: string; data?: PatientFull }

export type CheckInStatus = 'WAITING' | 'IN_PROGRESS' | 'DISCHARGED';
export interface CheckInResponse {
  patientName: string; age?: number; status: CheckInStatus; registrationNumber: string;
  checkInTime?: string; queuePosition?: number;
}
export interface CheckInEntity {
  id: number; patient?: PatientFull; checkInTime?: string; checkOutTime?: string;
  status: CheckInStatus; priorityLevel?: number; queuePosition?: number;
}

export interface VitalsRequest {
  temperatureC?: number | null; pulseBpm?: number | null; spo2Percent?: number | null;
  systolicMmHg?: number | null; diastolicMmHg?: number | null; weightKg?: number | null;
  heightCm?: number | null; confirmOutOfRange?: boolean;
}
export interface VitalsItem {
  id: string; checkInId?: number; recordedAt?: string; recordedBy?: string; temperatureC?: number;
  pulseBpm?: number; spo2Percent?: number; systolicMmHg?: number; diastolicMmHg?: number;
  weightKg?: number; heightCm?: number; assessed?: boolean; assessmentNote?: string;
  abnormalFlags?: string[]; confirmedOutOfRange?: boolean;
}
export interface RecordResult { recorded: boolean; message?: string; warnings?: string[]; vitals?: VitalsItem }
export interface LatestVitals { found: boolean; message?: string; vitals?: VitalsItem }
export interface TrendPoint { recordedAt: string; checkInId?: number; value: number; abnormal?: boolean; flag?: string }
export interface BpPoint { recordedAt: string; checkInId?: number; systolicMmHg: number; diastolicMmHg: number; abnormal?: boolean; flags?: string[] }
export interface TrendResponse {
  patientId?: string; from?: string; to?: string; readingCount?: number; message?: string;
  temperature?: TrendPoint[]; bloodPressure?: BpPoint[]; pulse?: TrendPoint[];
  spo2?: TrendPoint[]; weight?: TrendPoint[]; height?: TrendPoint[];
}

export interface AllergyRequest { allergen: string; reaction?: string; severity: 'MILD' | 'MODERATE' | 'SEVERE'; active?: boolean }
export interface ConditionRequest { conditionName: string; onsetDate?: string; status: 'ACTIVE' | 'RESOLVED'; notes?: string }
export interface SurgeryRequest { procedureName: string; surgeryDate: string; notes?: string }
interface Audited { id: string; recordedAt?: string; recordedBy?: string; lastUpdatedAt?: string; lastUpdatedBy?: string }
export interface AllergyItem extends Audited { allergen: string; reaction?: string; severity: string; active?: boolean }
export interface ConditionItem extends Audited { conditionName: string; onsetDate?: string; status: string; notes?: string }
export interface SurgeryItem extends Audited { procedureName: string; surgeryDate: string; notes?: string }
export interface FamilyHistoryItem { id: string; relationship?: string; conditionName?: string; notes?: string; recordedAt?: string; recordedBy?: string }
export interface VisitItem { visitId: string; dateOfVisit?: string; doctorName?: string; diagnosis?: string; recordPath?: string }
export interface HistorySection<T> { recorded: boolean; message?: string; items?: T[] }
export interface MedicalHistory {
  patientId?: string; patientName?: string; hasActiveAllergies?: boolean; allergyAlert?: string;
  allergies?: HistorySection<AllergyItem>; chronicConditions?: HistorySection<ConditionItem>;
  pastSurgeries?: HistorySection<SurgeryItem>; familyHistory?: HistorySection<FamilyHistoryItem>;
  visitHistory?: HistorySection<VisitItem>;
}

export interface NoteContent { version?: number; subjective?: string; objective?: string; assessment?: string; plan?: string }
export interface AmendRequest extends NoteContent { reason: string }
export interface ReassignRequest { newDoctorId: string; reason: string }
export interface NoteItem {
  id: string; checkInId?: number; patientId?: string; doctorId?: string; doctorName?: string;
  ownedByCurrentUser?: boolean; status?: string; subjective?: string; objective?: string;
  assessment?: string; plan?: string; createdAt?: string; lastSavedAt?: string; completedAt?: string;
  lastAmendedAt?: string; amendmentCount?: number; version?: number;
}
export interface RevisionItem {
  revisionNumber: number; subjective?: string; objective?: string; assessment?: string; plan?: string;
  replacedAt?: string; replacedBy?: string; reason?: string; changedSections?: string[];
}
export interface NoteSummary {
  noteId: string; checkInId?: number; visitDate?: string; doctorName?: string; status?: string;
  assessmentPreview?: string; amended?: boolean; notePath?: string;
}
export interface NoteList { patientId?: string; found: boolean; message?: string; notes?: NoteSummary[] }

export interface MedicalRecordRequest {
  patientId?: string; doctorId?: string; diagnosis?: string; treatmentNote?: string; dateOfVisit?: string;
  followUpRequired?: boolean; allergies?: string; labReport?: string; prescribedMedication?: string; followUpDate?: string;
}
export interface MedicalRecord {
  id: string; patient?: PatientFull; doctor?: { id?: string; firstName?: string; lastName?: string; username?: string };
  diagnosis?: string; treatmentNote?: string; dateOfVisit?: string; followUpRequired?: boolean;
  allergies?: string; labReport?: string; prescribedMedication?: string; followUpDate?: string;
}
