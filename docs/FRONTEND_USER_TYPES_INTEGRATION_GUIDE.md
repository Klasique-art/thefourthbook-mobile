# Frontend Guide: Normal vs Priority User Types

## Overview
The backend now supports two permanent account types:
1. normal
2. priority

User type is selected at signup and cannot be changed afterward.

## What Changed
1. A new user field exists: user_type.
2. Signup accepts user_type from frontend.
3. Login and profile responses now include user_type.
4. JWT access token now includes user_type claim.
5. Priority users are hard-blocked from non-allowed APIs with HTTP 403 and error code USER_TYPE_NOT_ALLOWED.
6. Priority users can play distribution games without payment participation requirements.

## User Type Rules
1. Default user_type is normal.
2. If frontend sends user_type as priority during signup, account is created as priority.
3. user_type is immutable after account creation.
4. Priority user capabilities are restricted to:
   - auth flows
   - profile read/update
   - distribution game flow endpoints

## Signup Contract
Endpoint:
1. POST /api/v1/auth/register/

Frontend behavior:
1. Send user_type only when switch is available.
2. If switch is off, either omit user_type or send normal.
3. If switch is on, send priority.

Returned user object now includes:
1. user_type

## Login Contract
Primary endpoint:
1. POST /api/v1/auth/login/

Also supported:
1. POST /api/v1/auth/jwt/create/

Login success user object includes:
1. user_type

Token behavior:
1. Access token now includes user_type claim.
2. You can route app experience immediately from login response or token claim.

## Recommended FE Routing
1. If user_type is normal:
   - render current normal app experience.
2. If user_type is priority:
   - render priority app experience only (game + profile).

## Allowed Endpoints by User Type

### Normal users
1. Existing full experience endpoints remain available.

### Priority users
Allowed:
1. Auth endpoints under /api/v1/auth/
2. Profile endpoint:
   - GET /api/v1/users/profile/
   - PUT/PATCH /api/v1/users/profile/
3. Distribution game flow:
   - GET /api/v1/cycles/current/
   - GET /api/v1/distribution/cycle/current/
   - GET /api/v1/distribution-games/active/
   - POST /api/v1/distribution-games/{game_id}/submissions/
   - GET /api/v1/distribution-games/{game_id}/my-submission/

Blocked for priority:
1. All /api/v1/payments/* endpoints
2. All /api/v1/notifications/* endpoints
3. All /api/v1/alerts/* endpoints
4. Normal dashboard endpoints under /api/v1/dashboard/*
5. Non-priority user account flows:
   - /api/v1/users/kyc/submit/
   - /api/v1/users/kyc/status/
   - /api/v1/users/verify-phone/request/
   - /api/v1/users/verify-phone/confirm/
   - /api/v1/users/delete-account/
   - /api/v1/users/cancel-deletion/
6. Authenticated lottery endpoints for normal flow:
   - /api/v1/draws/current/
   - /api/v1/draws/history/
   - /api/v1/draws/my-participation/
   - /api/v1/draws/my-selection-history/
   - /api/v1/draws/{id}/

## Blocked Response Contract (Priority User on Normal-only API)
Status:
1. HTTP 403

Error code:
1. USER_TYPE_NOT_ALLOWED

Message:
1. This feature is available to normal users only.

Frontend handling:
1. In normal UX, you likely will not call blocked endpoints for priority users.
2. Still keep generic 403 handling in case of stale navigation/state.

## Priority Game Behavior
1. Priority users can submit game answers even without draw payment participation.
2. If no active game exists for cycle, backend returns existing no-game response behavior; frontend should show your “no game yet” UI state.

## Response Field Changes You Should Consume
Updated response user objects now include:
1. user_type in register response user payload
2. user_type in login response user payload
3. user_type in profile payload

## QA Checklist for Frontend
1. Signup as normal and confirm normal app experience.
2. Signup as priority and confirm priority app experience.
3. Login and verify routing uses returned user_type.
4. Confirm priority account can open active game and submit.
5. Confirm priority account profile updates still work.
6. Confirm no payment/dashboard/notification screens are reachable for priority.
7. Confirm blocked API fallback handles 403 USER_TYPE_NOT_ALLOWED safely.
