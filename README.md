# MAXWIN

MAXWIN is a React + TypeScript + Vite frontend with Cloudflare Pages Functions and D1.

## User profile

- `GET /api/profile` returns the authenticated user's profile photo and bonus records.
- `POST /api/profile` saves a resized JPEG, PNG, or WebP profile image.
- `POST /api/profile/bonus` moves an available bonus to `pending` for review. It does **not** credit wallet funds.
- Wallet balances and activity are read from `GET /api/wallet`.

## Admin-issued profile bonuses

The bonus issuance endpoint is `POST /api/admin/bonuses`. It requires the Cloudflare secret `MAXWIN_ADMIN_KEY` and the `X-MAXWIN-ADMIN-KEY` request header. Do not put this key in the frontend, repository, or public documentation.

Request body:

```json
{
  "username": "target_username",
  "title": "Welcome bonus",
  "amount": "10 free spins"
}
```

The endpoint creates an `available` bonus for an existing username. The bonus appears in that user's profile, where they can request it for review. A request becomes `pending`; it does not automatically credit SOL, TON, or any wallet balance. Any actual monetary bonus must be separately validated and posted through a secure, auditable ledger workflow.

To enable issuance, open the MAXWIN Pages project in Cloudflare, add `MAXWIN_ADMIN_KEY` as a secret under the Functions/runtime variables and secrets settings, and deploy the latest `main` revision. Use a long, randomly generated value and keep it private.

## Financial status

Deposits are not automatically credited, withdrawals remain disabled, and the game catalogue is not a certified real-money gaming provider. Do not send funds or represent bonus requests as paid wallet credit until the corresponding chain verification, ledger, withdrawal signer, and game integrations are implemented and tested.
