# Frontend Guide: Enforced Cycle Flow Update

This guide explains the backend enforcement you requested:

1. Cycle collects contributions.
2. Threshold met -> that cycle ends.
3. Game phase starts (`pending` until admin uploads/publishes game).
4. Game window opens and users submit coordinates.
5. Game closes -> winners selected.
6. New cycle starts immediately.
7. Payout transactions for previous cycle proceed after winner selection.

## What Changed in Backend Behavior

## 1) Lifecycle Enforcement
Backend now enforces this order strictly at game close:
1. close game
2. compute correctness and select winners
3. mark cycle completed
4. create/open next cycle immediately
5. process payout bookkeeping for previous cycle

Meaning for frontend:
1. You should expect the next cycle to be available immediately after game close.
2. Previous cycle payout completion may lag behind while new cycle is already active.

## 2) Payout Status Timing
For a completed cycle:
1. `draw.status` becomes `completed` once winners are finalized.
2. `draw.payout_status` can remain `processing` while payout work continues.
3. In test override mode it may move quickly to `completed`.

Frontend implication:
1. Do not block next-cycle UX on previous-cycle payout completion.
2. Show payout status independently from cycle availability.

## 3) Admin Upload Pending Phase
When threshold is met and no game exists:
1. cycle enters `threshold_met_game_pending`.
2. admin receives email to upload game.

Frontend implication:
1. If current cycle state is pending and no game exists, show “waiting for game setup”.

## 4) Immediate Next-Cycle Availability
After game closes:
1. backend rollover creates next cycle in collecting state immediately.

Frontend implication:
1. refresh cycle endpoints right after game close actions.
2. route users to the new active cycle context without waiting for payout results.

---

## Frontend Changes You Must Make

## A. State Handling
Handle cycle and payout as separate tracks:
1. Cycle track: collecting -> game pending -> game open -> completed/rolled over.
2. Payout track: processing -> completed/failed for previous cycle winners.

## B. Screen Logic
1. During `threshold_met_game_pending`: show waiting state.
2. During `threshold_met_game_open`: show active game.
3. After game close:
   - fetch current cycle again (expect new cycle)
   - if user needs previous-cycle results, read previous-cycle status/payout separately.

## C. Polling/Refresh
After submitting game answer or when game timer expires:
1. refresh `/api/v1/distribution/cycle/current/` (or `/api/v1/cycles/current/`)
2. if cycle id changes, switch UI to new cycle immediately.

## D. Messaging Recommendations
1. New cycle started: “A new cycle is now open.”
2. Previous payout processing: “Winner payouts for previous cycle are being processed.”

---

## Endpoint Usage Pattern (Recommended)
1. App launch:
   - fetch current cycle endpoint
2. If game exists and open:
   - load active game endpoint
3. On game close boundary:
   - refetch current cycle endpoint
4. For payout/progress views:
   - query previous-cycle stats/history endpoints (normal users only)

---

## No Breaking Changes to Core Endpoint Paths
This enforcement update changes backend sequencing, not route names.
Your main frontend work is lifecycle/state handling, not endpoint migration.
