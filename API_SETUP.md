# HMS API integration

The Angular application calls the HMS backend at
`https://healthmanagementsystem-a1l5.onrender.com`. The root URL and all API paths are
centralized in `src/app/core/api/api.config.ts`. The current app does not have a mock-data
mode. Requests use bearer access tokens, with refresh handled by the HTTP interceptor.

The backend's published OpenAPI document is
<https://healthmanagementsystem-a1l5.onrender.com/v3/api-docs>. Authentication responses
must include a JWT access token with a user ID and one or more role claims. Supported claim
formats include `role`, `roles`, `authorities`, `scope`, `realm_access.roles`, and
`resource_access.*.roles`.

## Current frontend role access

| Role | Access |
| --- | --- |
| `ADMIN` | All configured pages, including user management and medical records |
| `DOCTOR`, `PHYSICIAN` | Patient flow, charts, notes, medical records, and account |
| `NURSE` | Patient flow, charts, notes, and account; medical records are restricted |
| `OPD` | Queue, patient search/registration, a summary-only patient chart, overview, and account |
| `PHARMACIST`, `LAB_TECHNICIAN` | Overview and account until role-specific APIs and screens are available |
| Other roles | Denied until explicitly mapped |

These are client-side navigation controls only. The backend must enforce authorization for
every API request and protect clinical data and administrative actions.

## Endpoint notes

- Login: `POST /api/auth/login`; refresh: `POST /api/auth/refresh`; logout:
  `POST /api/auth/logout`.
- Password flows: `POST /api/auth/forgot-password`, `/api/auth/reset-password`, and
  `/api/auth/change-password`.
- Patients, check-ins, vitals, medical history, SOAP notes, and medical records use the
  routes listed under `ENDPOINTS` in `api.config.ts`.
- `GET /api/checkin/active` does not return check-in IDs. The UI resolves IDs from the
  documented patient `checkIns` collection so all active visits can use vitals, notes, and
  checkout, regardless of which staff member checked the patient in.
- The backend OpenAPI document currently has no user-list endpoint. The admin directory is
  prepared to call `GET /api/admin/users`, returning an array of user-account objects. The
  backend must implement that endpoint before the directory can load all users; until then,
  the page reports the API error instead of presenting a partial list as complete.
- Pharmacy, laboratory, admissions, ward/bed, appointments, billing, and reporting workflows
  need backend API contracts and are not implemented by the current endpoint set.
