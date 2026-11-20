# API integration

## Demo mode

The app starts with `USE_MOCK_DATA` enabled in
`src/app/core/api/api.config.ts`. In this mode, the dashboard uses its seeded
local data and sign-in/sign-out do not call the ticketing API. Sign in with an
email from the seeded staff list in `src/app/core/hms.store.ts` and any password
of at least eight characters. Demo changes are stored in browser local storage.

Set `USE_MOCK_DATA` to `false` only when you want to use the configured API.

The authentication service is configured for the Support Ticket API described at
<https://ticketing.stakcloud.com/docs/api>. The API base URL and endpoints are
centralized in `src/app/core/api/api.config.ts`.

## Authentication endpoints

| Feature | Method and path | Contract |
| --- | --- | --- |
| Sign in | `POST /login` | Request `{ "email": "...", "password": "..." }`; response `{ "access_token": "...", "user": { "id": "...", "name": "...", "email": "...", "role": "..." } }` |
| Current user | `GET /user` | Response `{ "user": { ... } }` |
| Sign out | `POST /logout` | Response `{ "message": "Logged out successfully" }` |

The login endpoint requires passwords to contain at least eight characters.
The returned `access_token` is sent as a bearer token on authenticated
requests. The application maps the API's `admin` role to its Administrator
dashboard. Other roles must have a matching HMS dashboard; unknown roles are
rejected rather than assigned another role's access.
After login, the dashboard URL uses the authenticated user's ID as its path,
for example `https://app.example.com/42`. Dashboard sections remain nested
under that ID (for example `/42/patients`), and the route guard redirects
requests for a different user's ID back to the signed-in user's dashboard.

The documented API does not provide a password-reset endpoint. The reset page
displays that limitation instead of calling an undocumented URL.

The dashboard and hospital-resource URLs in `api.config.ts` are placeholders
until the hospital data API contract is available. `ApiService` provides
typed `get`, `post`, `put`, `patch`, and `delete` methods, and
`HospitalDataService` provides the initial hospital-resource methods. The
backend must authenticate and authorize every protected request; Angular
route guards are only client-side navigation controls.
