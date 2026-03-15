# Frontend Guide: Bank-Only Payout Account Setup

Users can now save a preferred **bank payout account** (separate from pay-in method).

## Endpoints

1. `GET /api/v1/payments/payout-accounts/`
2. `POST /api/v1/payments/payout-accounts/`
3. `GET /api/v1/payments/payout-accounts/status/`
4. `PUT/PATCH/DELETE /api/v1/payments/payout-accounts/{id}/`
5. `POST /api/v1/payments/payout-accounts/{id}/verify/`
6. `POST /api/v1/payments/payout-accounts/{id}/default/`
7. `GET /api/v1/payments/payout-banks/?country=US`
8. `GET /api/v1/payments/payout-banks/search/?q=chase`

## Core behavior

1. Bank accounts only (no card/momo payout destination here).
2. User can save multiple payout accounts.
3. One default payout account per user.
4. `country_code` is required at API level.
5. `bank_code` is required at API level.
5. Do not ask user for `account_name`; backend resolves it after successful verification.
4. Verification states:
   - `unverified`
   - `verified`
   - `manual_review`
   - `failed`

## Country support logic

1. Auto verification is provider-limited (currently Paystack countries configured in backend).
2. Unsupported countries (including many US/EU users for now) are marked `manual_review`.
3. Frontend should show:
   - `verified`: ready for payout
   - `manual_review`: pending ops/provider verification
   - `failed`: user should edit details and retry verify

## Suggested UX flow

1. On winner flow, check if user has a default `verified` payout account.
2. If not, force payout setup screen.
3. Start with bank autocomplete: call `GET /payout-banks/search/?q={text}`.
4. Show matched banks; when user selects one, capture `bank_name`, `bank_code`, `country_code`.
5. If autocomplete has no results for user’s bank/country, fallback to country picker + `GET /payout-banks/?country={ISO2}`.
6. If country list still returns `source=manual`, allow typed bank name + bank_code (manual-review path).
7. User enters `account_number`.
8. Call `POST /payout-accounts/` then `POST /payout-accounts/{id}/verify/`.
9. If response is `manual_review`, show “We’ll verify and notify you” state.
10. Allow user to set another account as default with `/default/`.
11. After verify succeeds, read back `account_name` from response and display it as locked/verified account holder name.
