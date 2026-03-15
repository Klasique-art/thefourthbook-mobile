# Frontend Guide: Winner Alert App-Open Flow

This guide explains how mobile/web frontend should integrate winner and payout alerts using backend-driven checks.

## Endpoints

1. `GET /api/v1/alerts/winner-latest/`
2. `POST /api/v1/alerts/{alert_id}/acknowledge/`

Both require authenticated user token.

## GET winner-latest response

Returns latest unresolved alert plus unresolved list sorted newest-first.

```json
{
  "success": true,
  "data": {
    "latest_alert": {
      "alert_id": "9d5ca2eb-605d-4ce4-aad8-d6b3811280df",
      "type": "winner_selected",
      "cycle_id": "cyc_000700",
      "cycle_number": 700,
      "selected_at": "2026-03-15T17:30:31.220000Z",
      "prize_amount": "100.00",
      "currency": "USD",
      "payout_status": "processing",
      "payout_reference": null,
      "headline": "You've Been Selected",
      "message": "You were selected in Cycle #700. Your payout is processing.",
      "requires_ack": true
    },
    "alerts": [],
    "unread_count": 1
  }
}
```

## POST acknowledge response

Idempotent: calling multiple times is safe.

```json
{
  "success": true,
  "message": "Alert acknowledged",
  "data": {
    "alert_id": "9d5ca2eb-605d-4ce4-aad8-d6b3811280df",
    "acknowledged_at": "2026-03-15T17:35:00.000000Z"
  }
}
```

## Alert types and meanings

1. `winner_selected`: user selected as winner; payout not completed yet.
2. `payout_sent`: payout completed/sent successfully.
3. `payout_failed`: payout transfer failed; include retry/support guidance.

## Trigger behavior (backend)

1. Winner is selected -> creates/updates `winner_selected`.
2. Payout status becomes completed/paid -> upgrades to `payout_sent`.
3. Payout status becomes failed -> creates/upgrades `payout_failed`.
4. Duplicate unresolved event alerts are prevented per user + cycle + type.

## Frontend app-open behavior

1. On app launch and foreground, call `GET /api/v1/alerts/winner-latest/`.
2. If `latest_alert` exists and `requires_ack=true`, show full-screen modal.
3. On CTA (`Claimed`/`Got it`), call `POST /api/v1/alerts/{alert_id}/acknowledge/`.
4. Only dismiss modal after successful acknowledge.
5. Optionally route to winner/payout detail using `cycle_id` and `cycle_number`.

## Rendering rules

1. Use `headline` and `message` directly for user-facing copy.
2. Show `prize_amount` with `currency`.
3. Show payout chip from `payout_status`: `pending`, `processing`, `completed`, `failed`.
4. Always key alert state by `alert_id` (not cycle alone).

## Polling guidance

1. Mandatory fallback: app-open + app-foreground polling.
2. Optional: push notifications can deep link to winner screen, but API remains source of truth.

## Data consistency guarantees

1. Alerts are user-scoped.
2. Alerts are tied to exact cycle (`cycle_id`, `cycle_number`).
3. Alert payout fields are synchronized from payout ledger state.
