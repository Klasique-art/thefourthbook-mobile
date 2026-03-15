# Cycle / Distribution Rollover Q&A (Backend Reality)

Source basis: current code in `apps/lottery`, `apps/payments`, `config/settings.py`, and `THRESHOLD_GAME_FRONTEND_ADMIN_GUIDE.md`.

1. **What exact state machine is implemented for cycle progression, including all states and allowed transitions?**
- Implemented `distribution_state` values are exactly:
  - `collecting`
  - `threshold_met_game_pending`
  - `threshold_met_game_open`
  - `threshold_met_game_closed`
  - `distribution_processing`
  - `distribution_completed`
- Resolution logic is computed, not persisted (derived from `Draw` + optional `DistributionGame`):
  - `draw.status == completed` -> `distribution_completed`
  - `draw.status == drawing` -> `distribution_processing`
  - `draw.total_pool < draw.target_pool` -> `collecting`
  - threshold met + no game -> `threshold_met_game_pending`
  - threshold met + game `open` -> `threshold_met_game_open`
  - threshold met + game `closed` -> `threshold_met_game_closed`
  - threshold met + game `draft/scheduled` -> `threshold_met_game_pending`

2. **Is cycle transition automated by scheduler/cron/worker, or manual admin action?**
- Mixed:
  - Draw processing (`open/closed` -> `drawing` -> `completed`) is automated by Celery beat task `execute_monthly_draw` (scheduled monthly).
  - Distribution game open/close by time is opportunistic on API access via `_sync_game_status` (not cron-driven).
  - Bonus selection is manual admin action (`POST /api/v1/admin/distribution-games/{game_id}/bonus-selection/`).
  - New open cycle creation is lazy/on-demand when `/api/v1/lottery/draws/current/` is called and no open draw exists.

3. **When game `ends_at` is reached, does backend auto-close the game, and how quickly (SLA)?**
- Yes, but only when `_sync_game_status` runs during API calls touching the game.
- No scheduler/SLA is implemented for immediate close at the exact timestamp.
- Effective close time is "on next relevant request".

4. **After game closure, does backend auto-run winner/bonus selection and payout processing, or is there a manual trigger?**
- No auto-run tied to game closure.
- Bonus selection is manual admin trigger.
- Draw winner selection is run by monthly Celery task, independent of distribution-game closure.
- Payout transfer processing is not auto-executed here; draw task marks winners/prizes and draw completion.

5. **What event marks cycle completion, and what condition triggers creation of the next cycle?**
- Completion marker: `Draw.status` set to `completed` in `execute_monthly_draw`.
- Next-cycle creation trigger: call to `/api/v1/lottery/draws/current/` when there is no open draw.

6. **Is next cycle created immediately at completion, or at a fixed calendar boundary?**
- Neither strictly. It is created on demand when `/draws/current/` is called and no open draw exists.
- Month value is derived from latest cycle month + 1 (or current month if no cycles exist).

7. **Which endpoint is the single source of truth for "current cycle" (`/distribution/cycle/current/`, `/draws/current/`, or other)?**
- There is no single unified source today.
- For contribution eligibility/current open participation cycle: use `/api/v1/lottery/draws/current/`.
- For threshold game UI state: use `/api/v1/distribution/cycle/current/`.
- Important mismatch: distribution endpoint selects latest non-cancelled draw, while draws endpoint guarantees/creates an open draw.

8. **What response should frontend expect during transition windows (e.g., no active draw yet, game closed but payout not started)?**
- `/api/v1/distribution/cycle/current/`:
  - `404` with message `No cycle found` if no draw exists.
  - `200` with `distribution_state` reflecting rollover phase otherwise.
- `/api/v1/distribution-games/active/`:
  - `404` with message `No active game found for cycle` when no game exists for cycle.
  - Returns game even when status is `scheduled` or `closed`.
- `/api/v1/lottery/draws/current/`:
  - Typically `200`; it auto-creates an open draw if missing.

9. **Are `distribution_state` values fixed to the 6 listed values?**
- Yes, in current code those 6 are the only emitted values.

10. **Can backend share sample responses for each state from production/staging?**
- Not from this codebase alone. No production/staging payload dump is present.
- We can generate synthetic examples locally, but not verified prod/staging captures.

11. **Is `game.status` (`draft/scheduled/open/closed`) guaranteed to match `distribution_state` consistently?**
- Not 1:1 guaranteed.
- `distribution_state` is draw-first logic; it can be `collecting` even if game exists.
- Also state freshness depends on `_sync_game_status` being invoked by endpoint access.

12. **Does backend return server time (or timezone) so frontend can show accurate countdowns to `starts_at`/`ends_at`?**
- No dedicated server-time field is returned on these cycle/game endpoints.
- Backend timezone config is UTC.

13. **Are `starts_at` and `ends_at` always UTC ISO strings?**
- They are Django `DateTimeField`s with `USE_TZ=True` and `TIME_ZONE='UTC'`; API serialization is ISO-8601.
- Practical expectation: UTC timestamps in ISO format.

14. **Can contributions reopen automatically once new cycle is created, with no manual flag needed?**
- Yes. Contributions depend on an `open` draw existing; no extra manual flag is checked.

15. **Are there cases where cycle is `completed` but contributions must remain blocked?**
- Yes, until an `open` draw exists.
- If no open draw is present, contribution attachment function exits without adding participation.

16. **If no cycle exists temporarily, what status code/body does `/distribution/cycle/current/` return?**
- `404` with `{ "success": false, "message": "No cycle found" }`.

17. **For `/draws/current/`, should frontend expect 404 when no open draw, and is that intentional long-term behavior?**
- Current implementation auto-creates an open draw, so expect `200` in normal flow.
- Existing test expecting `404` appears outdated relative to implementation.

18. **Are webhook/events available for cycle state changes, or should frontend keep polling?**
- No cycle-state webhook/event endpoint exists.
- Frontend should poll.

19. **What are expected polling intervals/rate limits for these endpoints?**
- Guide suggests polling current cycle every `10-20s` only on active screen.
- No explicit backend rate-limit policy is configured in this repo.

20. **Should frontend display any new backend message fields for user-facing status text during rollover?**
- No dedicated rollover message fields currently exist.
- Frontend should map `distribution_state` + game status to user-facing text.

21. **Are there idempotency guarantees to prevent double rollover/double selection in backend jobs?**
- Partial:
  - Bonus selection: guarded by one-to-one relation (`bonus_selection_run`) and pre-check; repeat call returns `409`.
  - Next-cycle creation via `get_or_create(month=...)` is largely idempotent.
- No explicit distributed lock/versioning strategy is implemented for rollover jobs.

22. **Is there a backfill/recovery job if scheduler fails at rollover time?**
- No dedicated recovery scheduler is defined.
- Operational fallback:
  - Manually run `execute_monthly_draw` task.
  - `/draws/current/` can lazily create missing open cycle.

23. **In staging, can backend provide a test cycle with short timers so we can validate full auto rollover end-to-end?**
- This repo includes demo seeded cycle/game examples in docs, but no guaranteed staging automation contract here.
- For true staging validation, backend team must seed short-window `starts_at/ends_at` game and confirm environment data.

24. **Are there additional fields we should add to UI now (e.g., `next_cycle_starts_at`, `rollover_in_progress`, `state_updated_at`)?**
- Yes, recommended UI readiness fields (currently not provided by backend):
  - `server_time`
  - `state_updated_at`
  - `next_cycle_month`
  - `next_cycle_starts_at`
  - `rollover_in_progress`
  - `expected_next_transition_at`
- Until added, frontend should infer state from existing fields and poll.
