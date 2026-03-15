# Frontend Migration Guide: Non-Month Cycle Model

This guide covers frontend updates after backend migration from month-based cycle identity to threshold/sequence-based cycles.

## What changed

Cycle progression is no longer month-dependent.

Use these as authoritative:

- `cycle_id`
- `cycle_number`
- `distribution_state`

`month` and `next_cycle_month` are now legacy display fields and may be `null`.

## Required frontend changes

## 1) Identity and routing

Replace any month-based cycle keys with:

- primary key: `cycle_id`
- secondary display/ordering key: `cycle_number`

Do not parse cycle identity from month strings.

## 2) Current cycle source

Use one source only:

- `GET /api/v1/cycles/current/`

Alias still works:

- `GET /api/v1/distribution/cycle/current/`

## 3) State rendering

Render UI from `distribution_state` only:

1. `collecting`
2. `threshold_met_game_pending`
3. `threshold_met_game_open`
4. `threshold_met_game_closed`
5. `distribution_processing`
6. `distribution_completed`

Do not infer state from calendar/month.

## 4) Countdown logic

Use server timestamps:

- `server_time`
- `expected_next_transition_at`

Compute countdown from server values, not device clock.

## 5) Rollover handling

Use:

- `rollover_in_progress`
- `next_cycle_id`
- `next_cycle_starts_at`

Flow:

1. If `distribution_completed` and `rollover_in_progress=true`, show preparing state.
2. When `next_cycle_id` is present, swap context to next cycle.

## 6) Legacy field handling

Treat as optional:

- `month`
- `next_cycle_month`

If missing/null, fallback display label:

- `Cycle #{cycle_number}`

## 7) Suggested payload contract usage

Minimum fields your frontend state/store should depend on:

- `cycle_id`
- `cycle_number`
- `distribution_state`
- `total_pool`
- `threshold_amount`
- `state_updated_at`
- `server_time`
- `expected_next_transition_at`
- `rollover_in_progress`
- `next_cycle_id`
- `next_cycle_starts_at`
- `game`

## 8) QA checks

1. App still works when `month=null`.
2. Cycle switching works via `next_cycle_id` only.
3. No month parsing in reducers/selectors/routes.
4. Countdown stays accurate with server time.
5. No mismatch between `/draws/current/` card and `/cycles/current/` state.

## 9) Backward compatibility

`/api/v1/lottery/draws/current/` includes `data.cycle` with the same authoritative cycle payload.

Prefer `/api/v1/cycles/current/` for cycle state and transitions.

## 10) Staging simulation endpoints (admin only)

These are enabled only when `ENABLE_STAGING_TEST_ENDPOINTS=true` (staging/dev intent) and require admin auth.

1. `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-threshold-met/`
- Sets pool to threshold
- Ensures threshold state is reached
- Ensures an active open game exists
- Returns full cycle payload (same shape as `GET /api/v1/cycles/current/`)

2. `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-game-close/`
- Forces game close flow
- Triggers post-game automation
- Returns full cycle payload

3. `POST /api/v1/admin/testing/cycles/{cycle_id}/simulate-rollover/`
- Forces completion/rollover path for testing
- Returns full cycle payload for current active cycle after rollover

All three are idempotent: repeated calls safely return current state.
