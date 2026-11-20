import type { UserRole } from '../../Auth/auth.service';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    name?: string;
    email: string;
    role: string;
  } | null;
}

export interface DashboardSummary {
  patients: number;
  appointments: number;
  staff: number;
  departments: number;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  status?: string;
}

export interface Appointment {
  id: string;
  patientName: string;
  providerName: string;
  startsAt: string;
  status: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
}
