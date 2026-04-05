# Final Plan: Normal vs Priority Users (FE + BE)

## 1) Product Scope (Locked)
We will support exactly two user types:
1. `normal`
2. `priority`

Rules:
1. User chooses type during signup with a frontend switch.
2. Default signup type is `normal`.
3. If switch is on, FE sends `user_type="priority"`.
4. User type is permanent after account creation (no switching).
5. Priority users can only:
   - play game flow
   - edit profile
6. Priority users cannot access payments, lottery participation/payment flows, notifications, or normal dashboard flows.

## 2) Backend Changes I Will Implement

### A. User Model + Migration
1. Add `user_type` to `apps.users.models.User`:
   - choices: `normal`, `priority`
   - default: `normal`
   - indexed
2. Add migration to create the field.
3. Existing users get `normal` automatically via migration default.

### B. Signup/Auth Payloads
1. Allow `user_type` in registration serializer.
2. Validate `user_type` is one of allowed values.
3. Include `user_type` in:
   - register response user object
   - login response user object
   - profile response
4. Keep all existing response envelope format unchanged.

### C. JWT Claims
1. Add `user_type` claim into JWT token payload (recommended for FE fast routing).
2. FE can route immediately after login from token/user payload without extra call.

### D. Access Control Layer
1. Add reusable permission guard:
   - `NormalUserOnly` for endpoints priority users must not call
2. Apply this guard to:
   - all payments endpoints
   - normal dashboard/statistics endpoints
   - non-priority-only endpoints in lottery/distribution flow (where relevant)
3. Return consistent 403 payload for blocked requests with stable code:
   - `USER_TYPE_NOT_ALLOWED`
   - message: `This feature is available to normal users only.`

### E. Priority Game Access
1. Keep priority users able to access game endpoints needed for playing.
2. If no active game, backend should return success payload with explicit “no game yet” state (FE shows simple empty state UI).
3. No payment requirement checks should block priority game play.

### F. Immutability of User Type
1. Enforce user type cannot be changed after creation:
   - serializer-level protection on update
   - admin readonly behavior (except superuser override, optional safeguard)
2. No upgrade/downgrade endpoints.

## 3) Frontend Contract (What You Can Build Against)

### Signup
1. Send:
```json
{
  "email": "...",
  "password": "...",
  "user_type": "normal | priority"
}
```
2. If omitted, backend stores `normal`.

### Login Success
1. Response user object includes `user_type`.
2. JWT includes `user_type` claim.
3. FE routing:
   - `normal` => existing app experience
   - `priority` => priority app experience (game + profile only)

### Blocked Endpoint Behavior
1. If priority user calls normal-only endpoint:
   - HTTP `403`
   - error code `USER_TYPE_NOT_ALLOWED`

## 4) Endpoint Access Matrix (High Level)
1. Auth endpoints: both `normal` and `priority`
2. Profile read/update: both
3. KYC: blocked for priority (per your “only game + profile” rule)
4. Payments: blocked for priority
5. Notifications: blocked for priority
6. Normal dashboards/statistics: blocked for priority
7. Game play endpoints: allowed for priority

Note: When implementing, I’ll map this precisely to existing view classes so no accidental exposure remains.

## 5) Implementation Order
1. Add model field + migration.
2. Update serializers/auth responses/JWT claims.
3. Add permission class + apply guards to restricted endpoints.
4. Ensure priority game endpoints are reachable and return no-game state cleanly.
5. Add tests (model, auth payload, permission enforcement).
6. Run tests and smoke-check with Docker.

## 6) Tests I Will Add
1. New signup defaults to `normal`.
2. Signup with `priority` stores correctly.
3. Login payload includes `user_type`.
4. JWT contains `user_type`.
5. Priority user gets 403 on payments endpoints.
6. Priority user gets 403 on dashboard endpoints.
7. Priority user can access profile update.
8. Priority user can access game endpoint and gets valid no-game response when none exists.
9. User type update attempts are rejected.

## 7) Practical FE Notes
1. You don’t need to expose blocked features in UI for priority users.
2. Still handle 403 gracefully in case of stale client routes.
3. Priority empty state copy suggestion:
   - `No game is available right now. Check back after the current cycle ends.`

## 8) Optional Choices (I’ll Use Recommended Defaults Unless You Object)
1. JWT claim inclusion: **Yes** (recommended)
2. Analytics tagging by user type: **Yes**, add `user_type` in event context where available

---
If this plan looks good, send “go ahead” and I’ll implement it end-to-end in the backend with tests.
