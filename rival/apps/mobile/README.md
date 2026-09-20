# RIVAL mobile

Expo + React Native, with expo-router for navigation.

```bash
cp .env.example .env         # EXPO_PUBLIC_API_URL
npm start -w @rival/mobile   # then press i / a, or scan the QR code
```

On a device, `localhost` is the device itself — point `EXPO_PUBLIC_API_URL` at
your machine's LAN address.

## Screens

| Route | What it is |
| --- | --- |
| `onboarding/` | Welcome, sign up / sign in, profile, experience, goals, favourite lifts |
| `(tabs)/index` | Home — the ranked competition feed |
| `(tabs)/log` | Start a workout |
| `(tabs)/rivals` | Every rivalry, with score and gym-day gap |
| `(tabs)/challenges` | Challenges waiting, running and finished |
| `(tabs)/profile` | Stats, attendance calendar, PRs, achievements |
| `workout/active` | The live session: add sets, finish |
| `pr-celebration` | What you just beat, and who you just passed |
| `rival/[id]` | The rivalry in full |
| `rival/catch-up` | Catch-up mode |
| `challenge/[id]`, `challenge/new` | One challenge; creating one |
| `connections`, `notifications`, `leaderboards`, `settings` | The rest |

## Notes

- **Tokens go in the device keychain** (`expo-secure-store`), never in plain
  storage. The web build falls back to `localStorage`, which is only used for
  development previews.
- **The home screen renders what the API ranks.** The "what matters most right
  now" judgement lives in `@rival/core`'s `buildHomeFeed`, where it is unit
  tested, rather than being spread through the UI.
- **Every screen has a loading, error and empty state.** `useAsync` provides the
  three, plus pull-to-refresh.
- **`theme.ts` mirrors `apps/web/app/globals.css`.** Change one, change both.
- **Metro pins React to this app's copy** (see `metro.config.js`). The web app
  in the workspace uses React 19, which npm hoists to the root; React Native
  0.76 needs React 18, and mixing them fails at runtime rather than at build.

## Native integrations left as configuration

Google and Apple sign-in are verified server-side already (`apps/api`'s
`auth/oauth.ts` checks the ID token against the provider's JWKS). The app shows
those buttons only when `/v1/auth/providers` reports them configured; wiring the
native flow that produces the ID token is a per-deployment step, as is
registering for push with `expo-notifications` and posting the token to
`/v1/me/push-tokens`.
