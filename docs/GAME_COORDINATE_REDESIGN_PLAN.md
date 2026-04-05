# Coordinate Game Redesign: Final Implementation Plan

## Goal
Redesign the cycle game from multiple-choice options to a coordinate-tap image game.

Users will tap where they think the hidden answer is on the image.  
Priority-user submissions define the accepted correct coordinate area.  
Normal users who tap near that accepted area are marked correct and can be selected randomly as beneficiaries.

## Agreed Product Rules
1. One game per cycle.
2. Game consists of:
   - one image
   - one question
3. Admin uploads image + question when cycle ends.
4. Image must be 4:3, but backend should auto-crop/resize (not reject).
5. Both priority and normal users can play anytime during the same open window (overlap allowed).
6. Each user can submit only once per game (locked after submit).
7. Priority submissions are used to compute accepted correct area.
8. Consensus is computed once at game close (not continuously).
9. Acceptance tolerance is fixed radius for every game.
10. If priority submissions are few/split, algorithm still selects accepted coordinate.
11. Result response should be correct/incorrect only.
12. Notifications for this phase: email only (push later).
13. All users should receive game-start notification email.

## Lifecycle States
1. `pending_admin_setup`
   - cycle ended, waiting for admin game upload.
2. `open`
   - game published/open; users can submit.
3. `closed`
   - submissions locked; consensus computed from priority data.
4. `selection_completed`
   - correct normal users identified and random beneficiary selection completed.

## End-to-End Flow
1. Cycle reaches game stage.
2. Backend sends email to admins: upload game now.
3. Admin uploads image + question.
4. Backend auto-normalizes image to 4:3.
5. Admin publishes game (status -> open).
6. Backend emails all users game is live.
7. Users submit single tap coordinates.
8. At close:
   - compute accepted coordinate from priority submissions only
   - apply fixed-radius tolerance
   - mark normal-user submissions as correct/incorrect
9. Run random selection from correct normal users.
10. Expose final result status in user-facing responses as correct/incorrect.

## Data Model Plan
### DistributionGame (updated)
1. Keep cycle link, title/question, start/end, status.
2. Add/keep image field with normalized 4:3 output.
3. Add accepted answer fields (written at close):
   - `accepted_x`
   - `accepted_y`
   - `acceptance_radius` (fixed global value or config value copied onto game)
   - `consensus_meta` (algorithm diagnostics/counts)

### DistributionGameSubmission (updated)
1. Keep game + member links.
2. Replace option answer with tap coordinate:
   - `tap_x` (normalized 0..1)
   - `tap_y` (normalized 0..1)
3. Keep `locked=True` behavior.
4. Keep `is_correct` for post-close evaluation.
5. Enforce one submission per user per game.

## Coordinate and Correctness Rules
1. Frontend sends normalized coordinates (`x`, `y`) in image-relative space.
2. Backend validates bounds: `0 <= x <= 1`, `0 <= y <= 1`.
3. Consensus engine:
   - input: priority-user coordinates
   - output: single accepted center point
   - if sparse/split data: use density/cluster fallback to still produce one center
4. Correctness:
   - normal submission is correct when distance from accepted center <= fixed radius.

## API Behavior Plan
## Admin
1. Create/update game with image + question.
2. Publish/open game.
3. Close game.
4. View summary (priority sample count, accepted center, counts).

## User
1. Fetch active game metadata.
2. Submit coordinate once.
3. Fetch my submission status.
4. After close, receive correct/incorrect outcome.

## Security + Fairness
1. Do not expose accepted coordinates while game is open.
2. Lock submission immediately after first submit.
3. Add rate limiting to submission endpoint.
4. Audit admin edits and close actions.
5. Keep deterministic/random-seeded selection logging for traceability.

## Notifications (Current Scope)
1. Email to admins when cycle moves to `pending_admin_setup`.
2. Email to all users when game is published/open.
3. Push notification integration is deferred.

## Configuration
1. Fixed acceptance radius (single configured value).
2. Optional minimum/maximum sanity checks for uploaded image processing.
3. Consensus algorithm parameters (if needed) kept server-side only.

## Testing Plan
1. Image upload auto-converts to 4:3.
2. Submission rejects out-of-bounds coordinates.
3. Duplicate submission is blocked.
4. Priority + normal overlap window works.
5. Consensus computed only at close.
6. Fixed-radius correctness works.
7. Winner selection uses only correct normal submissions.
8. Admin email trigger on cycle-end game stage.
9. All-users email trigger on game publish.

## Out of Scope (for this implementation)
1. Push notifications (Expo integration).
2. Distance/heatmap feedback in user response.
3. Multi-game-per-cycle support.
