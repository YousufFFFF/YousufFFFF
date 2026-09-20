# RIVAL API

Fastify + PostgreSQL. All the competition logic lives in [`@rival/core`](../../packages/core);
this service owns persistence, authentication and the privacy rules.

## Running it

```bash
cp .env.example .env          # then fill in DATABASE_URL and JWT_SECRET
npm run migrate -w @rival/api # forward-only SQL, safe to re-run
npm run seed    -w @rival/api # exercises, badges, challenge templates, plans
npm run dev     -w @rival/api
```

`npm run seed:demo -w @rival/api` adds five connected demo lifters with twelve
weeks of training. Every demo account uses the `@demo.rival.app` email domain and
is marked in its bio, so demo rows never mix with real users;
`npm run seed:demo -w @rival/api -- --clear` removes them.

## Tests

```bash
npm test -w @rival/api
```

Each run creates its own PostgreSQL database, applies the real migrations and
seed, and drives the real HTTP routes — so the tests exercise the schema that
ships, not a stand-in. They need a PostgreSQL that the connection string in
`TEST_DATABASE_URL` (default `postgres://rival:rival@127.0.0.1:5432`) can reach
with `CREATEDB` rights.

## Layout

| Path | What it holds |
| --- | --- |
| `migrations/` | Forward-only SQL, applied in filename order and recorded in `schema_migrations` |
| `src/auth/` | Password hashing (scrypt), access/refresh tokens, provider-agnostic OIDC |
| `src/lib/` | Errors, validation, rate limiting, mail, timezone helpers |
| `src/modules/` | One module per domain area; all SQL lives here |
| `src/routes/` | HTTP surface — validation in, module calls out, no SQL |

## Conventions

- **Weights are integer grams everywhere.** Conversion happens only at the
  display boundary, so a lifter logging in pounds and one logging in kilograms
  compare exactly.
- **Dates are the user's local calendar day.** Attendance, streaks and catch-up
  gaps are all computed against `todayInTimezone(profile.timezone)`.
- **Privacy is checked on the read path**, in `modules/users.ts` and
  `@rival/core`'s `canView` / `canCompare` — never assumed by the caller.
- **Multi-table writes go through `transaction()`.** Finishing a workout touches
  attendance, PRs, XP, badges, the feed and notifications; either all of it
  lands or none of it does.

## Endpoints

| Area | Routes |
| --- | --- |
| Auth | `POST /v1/auth/{register,login,refresh,logout,verify-email,forgot-password,reset-password,change-password}`, `POST /v1/auth/oauth/:provider`, `DELETE /v1/auth/account` |
| Profile | `GET /v1/me`, `PATCH /v1/me/profile`, `PUT /v1/me/{privacy,notifications,favorites}`, `POST /v1/me/competition`, `GET /v1/me/{stats,prs,achievements,analytics,improvement,referrals,subscription}` |
| Training | `POST /v1/workouts`, `POST /v1/workouts/complete`, `POST /v1/workouts/:id/sets`, `POST /v1/workouts/:id/finish`, `GET /v1/workouts`, `GET /v1/me/workouts/calendar` |
| Social | `GET /v1/users/search`, `GET /v1/users/:username`, `POST /v1/connections/requests`, `POST /v1/connections/requests/:id/{accept,reject,cancel}`, `POST /v1/{blocks,mutes,reports}` |
| Competition | `GET /v1/home`, `GET /v1/rivals`, `GET /v1/rivals/:id{,/timeline,/catch-up}`, `GET /v1/leaderboards/:board`, `GET /v1/leaderboards/exercise/:id` |
| Challenges | `GET/POST /v1/challenges`, `POST /v1/challenges/:id/{accept,decline,cancel}`, `GET /v1/challenges/{templates,suggest-target}` |
| Feed | `GET /v1/feed`, `POST /v1/feed/:id/{reactions,comments}`, `GET /v1/notifications` |
| Sharing | `GET /v1/share/pr/:id`, `GET /v1/share/pr/:id.svg?format=story\|square\|compact` |
| Admin | `GET /v1/admin/{metrics,users,reports,audit-log,scoring}`, `PUT /v1/admin/{exercises,challenge-templates,badges,plans,scoring}` |

## Deployment notes

- `JWT_SECRET` must be at least 32 characters in production; the server refuses
  to boot otherwise.
- The payment provider is configuration, not code. `PAYMENT_PROVIDER` picks
  between Stripe, RevenueCat, Apple IAP and Play Billing; until one is set, the
  checkout endpoint says so rather than pretending to have taken a payment, and
  the webhook endpoint refuses to grant entitlements it cannot verify.
- The in-memory rate limiter is per-process. A multi-instance deployment should
  swap `RateLimitStore` for a shared implementation — the interface is two
  methods wide for exactly that reason.
