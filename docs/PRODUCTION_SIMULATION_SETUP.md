# Production Simulation Setup

Use this only when you intentionally want simulation endpoints available in production for controlled stakeholder testing.

## 1) Required Environment Variables

Set these on production `web`, `celery`, and `celery-beat`:

- `ENABLE_SIMULATION_API=1`
- `TESTING_ENDPOINTS_REQUIRE_ADMIN=1`
- `SIMULATION_API_SECRET=<strong-random-secret>`

Keep `ENABLE_STAGING_TEST_ENDPOINTS=0` in production.

## 2) Access Rules (Recommended)

Simulation endpoints should require:

1. Valid authenticated user token
2. Admin/staff account (`is_staff=true`)
3. Secret header:
   - `X-Simulation-Secret: <SIMULATION_API_SECRET>`

If any check fails, backend returns `403`.

## 3) Endpoint Base

- Base: `/api/v1/admin/testing/cycles/{cycle_id}/...`
- `cycle_id` can be like `cyc_000034`

## 4) Main Orchestration Endpoint

- `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-game-flow/`

Request JSON:

- `pending_seconds` (int, default `5`)
- `open_seconds` (int, default `90`)
- `auto_create_game` (bool, default `true`)
- `auto_publish_game` (bool, default `true`)
- `auto_close_game` (bool, default `true`)
- `auto_rollover` (bool, must be `true`)

Expected success response includes:

- `data.simulation_id`
- `data.timeline.pending_seconds`
- `data.timeline.open_seconds`
- `data.game.game_id`
- `data.game.status`
- `data.game.starts_at`
- `data.game.ends_at`

## 5) cURL Examples

Set these first:

- `BASE_URL=https://<your-domain>`
- `ACCESS_TOKEN=<admin-jwt>`
- `SIM_SECRET=<simulation-secret>`
- `CYCLE_ID=cyc_000034`

Run simulation flow:

```bash
curl -X POST "$BASE_URL/api/v1/admin/testing/cycles/$CYCLE_ID/simulate-game-flow/" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Simulation-Secret: $SIM_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "pending_seconds": 5,
    "open_seconds": 120,
    "auto_create_game": true,
    "auto_publish_game": true,
    "auto_close_game": true,
    "auto_rollover": true
  }'
```

Check current cycle:

```bash
curl "$BASE_URL/api/v1/distribution/cycle/current/" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Check active game for cycle:

```bash
curl "$BASE_URL/api/v1/distribution-games/active/?cycle_id=$CYCLE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## 6) Demo Runbook (Boss Testing)

1. Login as admin user.
2. Trigger `simulate-game-flow` on target cycle.
3. Confirm state transitions:
   - `threshold_met_game_pending`
   - `threshold_met_game_open`
4. Confirm game payload has:
   - `game.exists=true`
   - non-null `game.game_id`
   - valid `image_url`
5. Let game close and verify rollover to next cycle.

## 7) Safety Notes

- Do not expose simulation secret in frontend app code.
- Rotate `SIMULATION_API_SECRET` after demo/testing windows.
- Restrict admin accounts that can run simulation endpoints.
- Consider IP allowlist at reverse proxy/WAF level for extra protection.
