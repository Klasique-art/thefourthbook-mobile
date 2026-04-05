# Frontend Simulation API Guide

This document covers all backend simulation/testing endpoints for frontend integration.

## Base
1. Base path: `/api/v1/admin/testing/cycles/{cycle_id}/`
2. Auth: required (`Bearer` token)
3. Access control:
   - controlled by backend flag `ENABLE_SIMULATION_API`
   - optionally admin-only when `TESTING_ENDPOINTS_REQUIRE_ADMIN=true`
   - optional secret header when `SIMULATION_API_SECRET` is configured:
     - `X-Simulation-Secret: <secret>`

## Global Response Envelope
### Success
1. `success: true`
2. `message` (when provided)
3. `data` object

### Error
1. `success: false`
2. `error.code` (stable code)
3. `error.message`
4. `error.details`

---

## 1) Orchestration Endpoint

## `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-game-flow/`

Purpose:
1. Start end-to-end simulation from threshold hit through game scheduling/opening/closing and rollover flow.

Request body fields:
1. `pending_seconds` (optional, int >= 0, default `5`)
2. `open_seconds` (optional, int >= 0, default `90`)
3. `auto_create_game` (optional, bool, default `true`)
4. `auto_publish_game` (optional, bool, default `true`)
5. `auto_close_game` (optional, bool, default `true`)
6. `auto_rollover` (optional, bool, default `true`)

Behavior notes:
1. If no game exists and `auto_create_game=true`, backend creates temporary simulation game.
2. If `auto_publish_game=true`, backend schedules/open game per `pending_seconds`.
3. If `auto_close_game=true`, backend auto-closes after open window.
4. Current lifecycle enforces immediate rollover after game close/winner selection.

Success response data:
1. `cycle_id`
2. `initial_state`
3. `simulation_id`
4. `timeline.pending_seconds`
5. `timeline.open_seconds`
6. `game.game_id`
7. `game.status`
8. `game.starts_at`
9. `game.ends_at`

Possible error codes:
1. `SIMULATION_NOT_ENABLED` (403)
2. `SIMULATION_NOT_ALLOWED` (403)
3. `CYCLE_NOT_FOUND` (404)
4. `GAME_CREATION_FAILED` (500)
5. `INVALID_SIMULATION_STATE` (409)

---

## 2) Granular Endpoint: Simulate Threshold Met

## `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-threshold-met/`

Purpose:
1. Force cycle to threshold-met and open a short testing game window.

Success response data:
1. current cycle payload (same shape as current cycle endpoint)
2. includes `distribution_state`, `game`, transition timestamps

Possible error codes:
1. `SIMULATION_NOT_ENABLED`
2. `SIMULATION_NOT_ALLOWED`
3. `CYCLE_NOT_FOUND`

---

## 3) Granular Endpoint: Simulate Game Close

## `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-game-close/`

Purpose:
1. Force close the cycle game.

Success response data:
1. updated cycle payload
2. reflects closed game state

Possible error codes:
1. `SIMULATION_NOT_ENABLED`
2. `SIMULATION_NOT_ALLOWED`
3. `CYCLE_NOT_FOUND`

---

## 4) Granular Endpoint: Simulate Rollover

## `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-rollover/`

Purpose:
1. Force rollover/new-cycle creation for the completed cycle flow.

Success response data:
1. current cycle payload after rollover attempt

Possible error codes:
1. `SIMULATION_NOT_ENABLED`
2. `SIMULATION_NOT_ALLOWED`
3. `CYCLE_NOT_FOUND`

---

## Frontend Flow Recommendation
1. Trigger simulation with orchestration endpoint.
2. Poll cycle state endpoint:
   - `/api/v1/distribution/cycle/current/`
3. Observe UI states:
   - pending -> open -> closed -> new cycle
4. During open window, call game endpoints for coordinate submission.

## Frontend Error Handling Recommendations
1. `SIMULATION_NOT_ENABLED`: hide/disable simulate controls.
2. `SIMULATION_NOT_ALLOWED`: show permission message.
3. `CYCLE_NOT_FOUND`: refresh cycle list/context.
4. `GAME_CREATION_FAILED`: show retry option.
5. `INVALID_SIMULATION_STATE`: reset to current cycle state and retry later.
