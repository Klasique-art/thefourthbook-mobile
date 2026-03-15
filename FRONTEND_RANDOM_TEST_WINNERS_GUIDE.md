# Frontend Guide: Random Test Winners (Cycle Completion)

This guide is for **testing mode behavior** where backend auto-selects random beneficiaries when a cycle completes.

## What backend does in testing mode

When `ENABLE_TEST_RANDOM_BENEFICIARY_WINNER=true`:

1. At cycle completion, backend randomly selects up to `number_of_winners` users from the database.
2. If total active users are fewer than `number_of_winners` (usually 10), backend selects all active users.
3. Selected users are marked as winners for that cycle.
4. Their payout status is set to `paid` (testing shortcut) so they appear immediately in beneficiaries/recent winners.

## Why this exists

To let frontend quickly validate winner UI flows without waiting for real eligibility distribution.

## Where frontend should read winners from

1. `GET /api/v1/public/draws/stats/{cycle_id}/`
2. `GET /api/v1/lottery/draws/{cycle_id}/` (authenticated)

Both expose beneficiaries based on:

- `is_winner=true`
- `payout_status='paid'`

## Expected frontend behavior

1. After cycle transitions to completed, refresh draw stats/details.
2. If beneficiaries are present, render winner list immediately.
3. Do not assume exactly 10 winners; show returned count.
4. If fewer than 10 users exist in test DB, expect fewer winners.

## Important note for production logic

Testing override is separate from real-world eligibility.

Real-world winner logic should use:

1. user paid/entered cycle
2. user answered game correctly

Testing mode bypasses that to speed QA.

## QA checklist

1. Complete a cycle in staging/dev.
2. Call public draw stats endpoint for completed cycle.
3. Verify `beneficiaries_count > 0`.
4. Verify each beneficiary has paid status.
5. Verify winner UI renders without manual data patching.


