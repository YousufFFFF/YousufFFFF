<div align="center">

# RIVAL

**Your friends. Your PRs. Your competition.**

A social fitness competition app for gym-goers. Connect with the people you
actually train with, log your workouts, and compete — with them, and nobody
else.

</div>

---

## The loop

```
CONNECT → TRAIN → TRACK → COMPARE → COMPETE → IMPROVE
```

You send a connection request. They accept. A rivalry starts. You log a
workout; RIVAL works out what you just beat, compares it against your rivals,
updates the gym-day gap, and tells whoever you just passed. They log theirs.

The one rule everything else follows from: **competition is private and
connection-based.** Until two people have both accepted, there is no
comparison, no shared leaderboard and no rivalry — and each person controls,
category by category, what their rivals can see even then.

## What's here

| Package | What it is |
| --- | --- |
| [`packages/core`](packages/core) | The domain logic: units, PR detection, rivalry scoring, consistency, safety, privacy. Pure TypeScript, no dependencies, 113 unit tests. |
| [`packages/api-client`](packages/api-client) | One typed client, shared by both front ends. |
| [`apps/api`](apps/api) | Fastify + PostgreSQL. 41 tables, 84 integration tests against a real database. |
| [`apps/mobile`](apps/mobile) | Expo + React Native. The app itself. |
| [`apps/web`](apps/web) | Next.js: the landing page and the admin dashboard. |

## Running it

Needs Node 20+ and a PostgreSQL 14+ you can create databases on.

```bash
npm install

# API
cp apps/api/.env.example apps/api/.env      # set DATABASE_URL and JWT_SECRET
npm run db:migrate
npm run db:seed                             # exercises, badges, templates, plans
npm run dev:api                             # → http://localhost:4000

# Mobile
cp apps/mobile/.env.example apps/mobile/.env
npm start -w @rival/mobile

# Web
cp apps/web/.env.example apps/web/.env.local
npm run dev:web                             # → http://localhost:3000
```

`npm run db:seed -- --seed:demo`, or `npm run seed:demo -w @rival/api`, adds
five connected demo lifters with twelve weeks of training so there is something
to look at. Demo accounts all use the `@demo.rival.app` email domain and say so
in their bio, so they never blur into real data;
`npm run seed:demo -w @rival/api -- --clear` removes them.

```bash
npm test         # core unit tests, then API integration tests
npm run typecheck
npm run build
```

## Decisions worth knowing

**Every weight is stored in integer grams.** Conversion happens only at the
display boundary, so someone logging 225 lb and someone logging 100 kg are
compared exactly rather than approximately, and switching units never changes
a record.

**Four kinds of personal record**, not one: heaviest lift, most reps at a given
weight, biggest session volume, and an estimated 1RM. A beginner adding reps is
making progress, and the app should say so. The estimate is always labelled as
an estimate and never presented as a lift that was performed.

**Rest days are not failures.** Streaks are measured against the user's own
weekly target, so a planned rest day never breaks one, and consistency is
capped at the target so piling on extra sessions cannot inflate it.

**One gym day per calendar day**, however many times you log. This is what
stops attendance being gamed, and it is why the catch-up screen says "tomorrow"
rather than "again" once you have already trained.

**The app will not push you into overtraining.** `catchUpCallToAction` refuses
to suggest a second session in a day however far behind you are, and a pattern
that looks like too much earns a neutral recovery note with no call to action
attached. Competition can be paused entirely from settings, without losing
anything.

**The improvement leaderboard ranks percentage gained, not weight lifted**, so
the newest person in the group has something they can actually win.

**Rivalry points come only from things you did** — leading a lift, showing up,
winning a challenge. Bodyweight, height and age are not inputs. The weights
live in the database so the competition can be retuned from the admin dashboard
without a release.

**Exercises are only compared when both people have logged them.** Comparing
someone's squat against a lift their rival has never done is noise, not
competition.

**The payment provider is configuration, not code.** Stripe, RevenueCat, Apple
IAP and Play Billing all fit the same entitlement path; until one is configured
the checkout endpoint says so plainly rather than pretending to have taken a
payment.

## Status

Phases 1–5 of the MVP are built and working end to end: authentication,
profiles and privacy; connections and rivalries; the exercise library and
workout logging; PR detection and history; attendance and consistency; private
leaderboards; challenges; notifications and the activity feed; shareable PR
cards; subscriptions, referrals, the admin dashboard and analytics.

What is deliberately left as per-deployment configuration: the native Google
and Apple sign-in flows that produce an ID token (server-side verification is
done), push delivery, and the payment provider integration.
