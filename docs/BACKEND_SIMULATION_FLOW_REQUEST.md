# Backend Request: End-to-End Game Flow Simulation API

## Context
Frontend needs reliable simulation endpoints to test and demo the full cycle-to-game flow quickly.

Current simulation call:
- `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-threshold-met/`

Current issue:
- Returns `500` on our environment, so frontend cannot progress through game states consistently.

---

## Goal
When frontend presses **"Update Threshold / Simulate Flow"**, backend should allow us to simulate the full lifecycle:

1. `collecting` -> threshold met instantly
2. cycle enters game pending/setup state
3. game opens after short delay (or immediately depending request)
4. users (normal + priority) can submit coordinate
5. game closes
6. winners selected
7. next cycle opens immediately
8. previous cycle payout processing can continue in background

---

## Required Behavior

## 1) User eligibility during simulation
Both user types must be able to use game endpoints during open window:
- `normal`
- `priority`

Game endpoints should work for both in the same game window.

## 2) Frontend-visible state progression
Frontend should be able to observe:
- `threshold_met_game_pending` (for admin setup wait UX)
- `threshold_met_game_open`
- `threshold_met_game_closed`
- rollover/new cycle available

## 3) Deterministic timing for demos
Need controllable timing so demos are reproducible:
- optional pending duration (example: 5 seconds)
- optional open duration/countdown (example: 60/120 seconds)

---

## Endpoint Proposal (Preferred)

## A) Single orchestration endpoint
`POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-game-flow/`

Purpose:
- Trigger full simulated lifecycle from threshold hit to rollover.

Request body (proposal):
```json
{
  "pending_seconds": 5,
  "open_seconds": 90,
  "auto_create_game": true,
  "auto_publish_game": true,
  "auto_close_game": true,
  "auto_rollover": true
}
```

Response:
```json
{
  "success": true,
  "message": "Simulation flow started.",
  "data": {
    "cycle_id": "cyc_000033",
    "initial_state": "threshold_met_game_pending",
    "simulation_id": "sim_abc123",
    "timeline": {
      "pending_seconds": 5,
      "open_seconds": 90
    }
  }
}
```

## B) Keep existing granular endpoints too
Please ensure these all work (no 500):
- `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-threshold-met/`
- `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-game-close/`
- `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-rollover/`

---

## Game Auto-Creation Requirement
If no admin-created game exists during simulation, backend should support one of:

1. `auto_create_game=true` creates a temporary game automatically for the cycle
2. or return a structured error code that frontend can handle cleanly (not 500)

Preferred: auto-create game in testing mode.

---

## Production Testing Requirement
We need simulation to be testable in production builds for stakeholder demo (boss testing), but safely restricted.

Please support one of these controls:

1. Allow only staff/admin accounts with explicit permission.
2. Require backend feature flag (e.g. `ENABLE_SIMULATION_API=true`).
3. Optional signed token/secret header for simulation calls.
4. Log every simulation request with actor, cycle, and timestamp.

Important:
- Frontend can hide the button for normal users.
- Backend must enforce authorization regardless of frontend.

---

## Error Contract (Important)
Please avoid raw HTML 500 responses for API calls.

Return structured JSON envelope on failure:
```json
{
  "success": false,
  "error": {
    "code": "SIMULATION_FAILED",
    "message": "Human-readable reason",
    "details": {}
  }
}
```

Useful stable error codes requested:
- `SIMULATION_NOT_ENABLED`
- `SIMULATION_NOT_ALLOWED`
- `CYCLE_NOT_FOUND`
- `GAME_CREATION_FAILED`
- `INVALID_SIMULATION_STATE`

---

## Frontend Acceptance Criteria
Simulation is considered ready when:

1. Clicking simulate from `collecting` reliably transitions to pending/open flow.
2. Frontend can show pending state for ~5s.
3. Frontend can show open game + countdown and submit coordinates.
4. Both normal and priority users can submit once in open window.
5. Game closes and new cycle appears without manual backend intervention.
6. No 500 HTML responses on simulation endpoints.

---

## Current Failure Example
Observed today:
- `POST /api/v1/admin/testing/cycles/cyc_000033/simulate-threshold-met/`
- response: HTTP 500 with HTML error page

This blocks full frontend flow testing and stakeholder demo.

