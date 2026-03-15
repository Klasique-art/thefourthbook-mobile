# Frontend Guide: Block Login Until Email Verification

## Backend behavior

When a user tries to log in before completing email verification, `POST /api/v1/auth/login/` now returns:

- HTTP `403 Forbidden`
- Response body:

```json
{
  "success": false,
  "message": "Email not verified. Please complete verification to continue.",
  "data": {
    "verification_required": true,
    "verification_type": "email",
    "email": "user@example.com",
    "next_action": "verify_email"
  }
}
```

## Frontend handling requirements

1. On login submit, call `POST /api/v1/auth/login/`.
2. If response is `200`, continue normal auth flow.
3. If response is `403` and `data.verification_required === true`:
   - Show: `Please verify your email before logging in.`
   - Save `data.email` for the verification screen.
   - Redirect user back to the verification-code screen (`/(auth)/verify-code`) and pass `email` as a route param.
4. On verification screen:
   - Pre-fill email with the saved value.
   - Submit code to `POST /api/v1/auth/verify-email/` with `{ email, code }`.
5. If user requests another code, call `POST /api/v1/auth/resend-verification/` with `{ email }`.
6. After successful verification, route user back to login (or auto-login if your app supports it).

## Example UI flow (pseudo-code)

```ts
try {
  const res = await api.post("/api/v1/auth/login/", { email, password });
  // success: store tokens and continue
} catch (err: any) {
  const status = err?.response?.status;
  const payload = err?.response?.data;

  if (status === 403 && payload?.data?.verification_required) {
    const pendingEmail = payload.data.email || email;
    showToast("Please verify your email before logging in.");
    navigate("/verify-email-code", { state: { email: pendingEmail } });
    return;
  }

  // fallback: invalid credentials / network errors
  showToast(payload?.message || "Login failed. Please try again.");
}
```

## UX copy suggestions

- Login blocked message:
  - `Your email is not verified yet. Enter the verification code we sent to continue.`
- Verification screen hint:
  - `Check your inbox for the 6-digit code.`
- Resend success:
  - `A new verification code has been sent.`
