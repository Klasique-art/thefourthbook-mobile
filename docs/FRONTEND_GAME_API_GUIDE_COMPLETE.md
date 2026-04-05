# Frontend API Guide (Complete)

## Base Information
1. Base URL (local): `http://localhost:8000`
2. API prefix: `/api/v1/`
3. Auth header for protected endpoints: `Authorization: Bearer <access_token>`

## Global Response Contract
1. Success responses are returned in this envelope:
   - `success`: boolean
   - `message`: string (present on many endpoints)
   - `data`: object or list payload
2. Error responses are returned in this envelope:
   - `success`: false
   - `error.code`: stable error code
   - `error.message`: human-readable message
   - `error.details`: validation or nested detail object
3. Priority user blocked endpoints return:
   - HTTP `403`
   - `error.code = USER_TYPE_NOT_ALLOWED`
   - message: `This feature is available to normal users only.`

## User Types
1. `normal`
2. `priority`

Rules:
1. Sent at signup.
2. Defaults to `normal` when omitted.
3. Immutable after account creation.
4. Exposed in:
   - register response user object
   - login response user object
   - profile response
   - JWT claim (`user_type`)

---

## Auth Endpoints

### `POST /api/v1/auth/register/`
Purpose:
1. Create account.

Payload fields:
1. `email` (required)
2. `password` (required)
3. `re_password` (required)
4. `first_name` (optional)
5. `last_name` (optional)
6. `phone` (optional)
7. `date_of_birth` (optional, `YYYY-MM-DD`)
8. `agree_to_terms` (required by product flow)
9. `referral_code` (optional)
10. `user_type` (optional; `normal` or `priority`)

Success data:
1. `user` object with `user_type`
2. `verification_required`
3. `verification_email_sent`

### `POST /api/v1/auth/login/`
Purpose:
1. Primary login endpoint with session tracking.

Payload fields:
1. `email`
2. `password`
3. `device_info` (optional object)
   - `device_id`
   - `device_name`
   - `platform`
   - `app_version`

Success data:
1. `user` (includes `user_type`)
2. `tokens.access`
3. `tokens.refresh`
4. `session.session_id`
5. `session.created_at`

Special behavior:
1. Unverified email returns `403` with verification-required metadata.

### `POST /api/v1/auth/refresh/`
Purpose:
1. Refresh access token.

Payload fields:
1. `refresh`

### `POST /api/v1/auth/google/`
Purpose:
1. Google login with ID token.

Payload fields:
1. `id_token`
2. `device_info` (optional)

Success data:
1. same shape as `/auth/login/`

### `POST /api/v1/auth/verify-email/`
Purpose:
1. Verify email using code.

Payload fields:
1. `email`
2. `code`

### `POST /api/v1/auth/resend-verification/`
Purpose:
1. Resend verification code email.

Payload fields:
1. `email`

### `POST /api/v1/auth/logout/`
Auth:
1. Required

Payload fields:
1. `session_id` (optional)
2. `logout_all_devices` (optional boolean)

### Fallback Djoser JWT
1. `POST /api/v1/auth/jwt/create/`
2. `POST /api/v1/auth/jwt/refresh/`
3. `POST /api/v1/auth/jwt/verify/`

Use:
1. Supported, but `/auth/login/` is recommended because it returns full app-ready payload.

---

## User/Profile Endpoints

### `GET /api/v1/users/profile/`
Auth:
1. Required
2. allowed for `normal` and `priority`

Success data highlights:
1. `user_id`
2. `email`
3. `first_name`, `last_name`, `phone`, `country`, `date_of_birth`
4. `user_type`
5. verification + KYC summary fields

### `PUT/PATCH /api/v1/users/profile/`
Auth:
1. Required
2. allowed for `normal` and `priority`

Writable fields:
1. standard profile fields (name/phone/country/date_of_birth/etc.)

### `POST /api/v1/users/kyc/submit/`
Auth:
1. Required
2. `normal` only

Payload:
1. multipart form fields for KYC docs and metadata

### `GET /api/v1/users/kyc/status/`
Auth:
1. Required
2. `normal` only

### `POST /api/v1/users/verify-phone/request/`
Auth:
1. Required
2. `normal` only

Payload fields:
1. `phone`

### `POST /api/v1/users/verify-phone/confirm/`
Auth:
1. Required
2. `normal` only

Payload fields:
1. `phone`
2. `verification_code`

### `POST /api/v1/users/delete-account/`
Auth:
1. Required
2. `normal` only

Payload fields:
1. `password`
2. `confirm_deletion`

### `POST /api/v1/users/cancel-deletion/`
Auth:
1. Required
2. `normal` only

---

## Dashboard Endpoints (`normal` only)

### `GET /api/v1/dashboard/overview/`
### `GET /api/v1/dashboard/summary/`
### `GET /api/v1/dashboard/statistics/`
### `GET /api/v1/dashboard/activity/`

Auth:
1. Required
2. `normal` only

Notes:
1. Priority users should not call these.

---

## Lottery/Cycle Read Endpoints

### Authenticated lottery endpoints (`normal` only)
1. `GET /api/v1/draws/current/`
2. `GET /api/v1/draws/history/`
3. `GET /api/v1/draws/my-participation/`
4. `GET /api/v1/draws/my-selection-history/`
5. `GET /api/v1/draws/{id}/`

### Public lottery endpoints (no auth required)
1. `GET /api/v1/draws/{id}/verify/`
2. `GET /api/v1/public/draws/stats/`
3. `GET /api/v1/public/draws/stats/{id}/`
4. `GET /api/v1/public/draws/{id}/stats/`
5. `GET /api/v1/public/statistics/`

---

## Distribution Game Endpoints (Coordinate Game)

## User-facing endpoints

### `GET /api/v1/cycles/current/`
### `GET /api/v1/distribution/cycle/current/`
Auth:
1. Required
2. allowed for `normal` and `priority`

Response data highlights:
1. cycle metadata
2. `distribution_state`
3. game summary block:
   - `exists`
   - `game_id`
   - `status`
   - `starts_at`
   - `ends_at`
   - `has_user_submitted`

### `GET /api/v1/distribution-games/active/`
Auth:
1. Required
2. allowed for `normal` and `priority`

Query params:
1. `cycle_id` (optional)

Response data highlights:
1. `game_id`
2. `cycle_id`
3. `title`
4. `question`
5. `image_url`
6. `status`
7. `starts_at`
8. `ends_at`
9. `accepted_coordinate_available` (boolean; do not depend on this during open game)
10. `submission` object:
    - `has_submitted`
    - `tap_x`
    - `tap_y`
    - `submitted_at`

### `POST /api/v1/distribution-games/{game_id}/submissions/`
Auth:
1. Required
2. allowed for `normal` and `priority`

Rules:
1. Game must be open and within window.
2. One submission only per user per game.
3. Submission is locked immediately.

Payload fields:
1. `tap_x` (required float, `0..1`)
2. `tap_y` (required float, `0..1`)
3. `client_submitted_at` (optional)

Success data:
1. `submission_id`
2. `game_id`
3. `member_id`
4. `tap_x`
5. `tap_y`
6. `submitted_at`
7. `locked`

### `GET /api/v1/distribution-games/{game_id}/my-submission/`
Auth:
1. Required
2. allowed for `normal` and `priority`

Response data:
1. `has_submitted`
2. `tap_x`
3. `tap_y`
4. `submitted_at`
5. `locked`

## Admin distribution endpoints

### `POST /api/v1/admin/distribution-games/`
Auth:
1. Admin only

Behavior:
1. Creates one game for cycle.
2. Auto starts game (`status=open`) at creation in current flow.
3. Auto 4:3 normalize image.
4. Triggers game-start email to users.

Payload fields:
1. `cycle_id` (required)
2. `question` or `prompt_text` (required)
3. `title` (optional)
4. `image` (required)
5. `ends_at` (required)
6. `acceptance_radius` (optional; defaults fixed backend value)

### `PATCH /api/v1/admin/distribution-games/{game_id}/`
Auth:
1. Admin only

Editable while status is `draft/open/scheduled`:
1. `title`
2. `prompt_text`
3. `starts_at`
4. `ends_at`
5. `acceptance_radius`
6. `image`

### `POST /api/v1/admin/distribution-games/{game_id}/publish/`
Auth:
1. Admin only

Behavior:
1. Publishes/opens game.
2. Sends game-start email to users when opened.

### `POST /api/v1/admin/distribution-games/{game_id}/close/`
Auth:
1. Admin only

Behavior:
1. Closes game.
2. Consensus coordinate computed from priority submissions.
3. Normal submissions evaluated as correct/incorrect using fixed radius.
4. Distribution completion pipeline continues.

### `GET /api/v1/admin/distribution-games/{game_id}/summary/`
Auth:
1. Admin only

Response data highlights:
1. submission counts
2. priority vs normal counts
3. correct submission count
4. accepted coordinate (`x`, `y`, `radius`)
5. consensus metadata

### `POST /api/v1/admin/distribution-games/{game_id}/bonus-selection/`
### `GET /api/v1/admin/distribution/cycles/{cycle_id}/bonus-members/`
Auth:
1. Admin only

Purpose:
1. Existing bonus-selection tooling around distribution.

### Admin testing endpoints
1. `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-threshold-met/`
2. `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-game-close/`
3. `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-rollover/`

Auth:
1. controlled by backend test settings.

---

## Payments Endpoints (`normal` only)

All endpoints under `/api/v1/payments/` require auth and are `normal`-only.

1. `POST /api/v1/payments/monthly/initialize/`
2. `GET /api/v1/payments/current-month/status/`
3. `GET /api/v1/payments/auto-renew/status/`
4. `GET /api/v1/payments/history/`
5. `GET /api/v1/payments/verify/{reference}/`
6. `POST|PUT /api/v1/payments/auto-renew/`
7. `GET /api/v1/payments/method/card/`
8. `GET /api/v1/payments/methods/user/`
9. `PUT /api/v1/payments/methods/{pk}/default/`
10. `DELETE /api/v1/payments/methods/{pk}/`
11. `GET /api/v1/payments/payout-banks/`
12. `GET /api/v1/payments/payout-banks/search/`
13. `GET|POST /api/v1/payments/payout-accounts/`
14. `GET /api/v1/payments/payout-accounts/status/`
15. `GET|PUT|PATCH|DELETE /api/v1/payments/payout-accounts/{pk}/`
16. `POST|PUT /api/v1/payments/payout-accounts/{pk}/default/`
17. `POST /api/v1/payments/payout-accounts/{pk}/verify/`
18. `GET /api/v1/payments/{pk}/`
19. `POST /api/v1/payments/{pk}/refund/`
20. `GET /api/v1/payments/refunds/{pk}/`

Frontend note:
1. Priority user UI should not expose payment routes/actions.

---

## Notifications Endpoints (`normal` only)

### Notifications
1. `GET /api/v1/notifications/`
2. `PUT /api/v1/notifications/{pk}/read/`
3. `PUT /api/v1/notifications/mark-all-read/`
4. `DELETE /api/v1/notifications/{pk}/`
5. `GET|PUT /api/v1/notifications/preferences/`

### Winner alerts
1. `GET /api/v1/alerts/winner-latest/`
2. `POST /api/v1/alerts/{alert_id}/acknowledge/`

Auth:
1. Required
2. `normal` only

---

## Webhook Endpoint (Not Frontend)
1. `POST /api/v1/webhooks/paystack/`

Purpose:
1. Provider callback only.

---

## Coordinate Game Frontend Rules (Important)
1. Use normalized coordinate system:
   - left edge = `x=0`
   - right edge = `x=1`
   - top edge = `y=0`
   - bottom edge = `y=1`
2. Send `tap_x/tap_y` with sufficient precision.
3. Do not allow second submit after success.
4. Treat submission lock as final.
5. Show “no game yet” when active game endpoint indicates no available game for cycle.
6. Do not expect accepted center while game is open.

---

## User Type Access Matrix
1. Auth + profile:
   - normal: allowed
   - priority: allowed
2. Distribution coordinate game endpoints:
   - normal: allowed
   - priority: allowed
3. Dashboard:
   - normal: allowed
   - priority: blocked
4. Payments:
   - normal: allowed
   - priority: blocked
5. Notifications/alerts:
   - normal: allowed
   - priority: blocked
6. KYC/phone verification/delete flows:
   - normal: allowed
   - priority: blocked

---

## Common Error Codes To Handle
1. `USER_TYPE_NOT_ALLOWED` (403)
2. `INVALID` (400 validation)
3. `AUTHENTICATION_FAILED` (401/403 depending endpoint)
4. `PARSE_ERROR` (400 malformed request)
5. `NOT_FOUND` style errors for missing game/cycle/entity

---

## Versioning Notes
1. This guide reflects current backend behavior after coordinate-game redesign.
2. Push-notification delivery is intentionally deferred; email delivery is active for game events.
