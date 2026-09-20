import { addDays, toIsoDate } from '@rival/core';
import { closePool, one, query } from './index.ts';
import { acceptRequest, sendRequest } from '../modules/connections.ts';
import { register } from '../modules/auth.ts';
import { logCompleteWorkout } from '../modules/workouts.ts';
import { createChallenge } from '../modules/challenges.ts';
import { updateProfile } from '../modules/users.ts';
import { seedReferenceData } from './seed.ts';

/**
 * Demo data — for previews and screenshots only.
 *
 * Every account created here is marked: the email domain is `@demo.rival.app`
 * and the bio says so, so demo rows are trivially distinguishable from real
 * user data and can be removed with one delete. It is never run automatically;
 * `npm run seed:demo` is explicit.
 *
 * It goes through the real API modules rather than writing rows directly, so
 * the resulting PRs, attendance, rivalries and feed are exactly what the app
 * itself would have produced.
 */

export const DEMO_EMAIL_DOMAIN = 'demo.rival.app';
const DEMO_BIO_MARKER = '[demo account]';
const DEMO_PASSWORD = 'RivalDemo2026';

interface DemoLifter {
  username: string;
  displayName: string;
  bio: string;
  /** Multiplies the reference lifts — gives the group a believable spread. */
  strength: number;
  /** Gym days per fortnight; drives the consistency gaps. */
  sessionsPerFortnight: number;
}

const LIFTERS: ReadonlyArray<DemoLifter> = [
  { username: 'muzz', displayName: 'Muzz', bio: 'Chasing a 100 kg bench.', strength: 0.9, sessionsPerFortnight: 8 },
  { username: 'rahul', displayName: 'Rahul', bio: 'Deadlift day is every day.', strength: 1.0, sessionsPerFortnight: 10 },
  { username: 'arjun', displayName: 'Arjun', bio: 'Back in the gym after a year out.', strength: 0.78, sessionsPerFortnight: 7 },
  { username: 'sameer', displayName: 'Sameer', bio: 'Powerlifting, slowly.', strength: 1.08, sessionsPerFortnight: 6 },
  { username: 'ayaan', displayName: 'Ayaan', bio: 'First year of lifting.', strength: 0.62, sessionsPerFortnight: 9 },
];

/** Reference top sets in kg, before each lifter's strength multiplier. */
const PROGRAM: ReadonlyArray<{ slug: string; topSet: number; reps: number[] }> = [
  { slug: 'bench-press', topSet: 95, reps: [10, 8, 5] },
  { slug: 'squat', topSet: 115, reps: [8, 6, 5] },
  { slug: 'deadlift', topSet: 150, reps: [6, 5, 3] },
  { slug: 'overhead-press', topSet: 60, reps: [10, 8, 6] },
  { slug: 'barbell-row', topSet: 80, reps: [10, 8, 8] },
  { slug: 'dumbbell-bench-press', topSet: 35, reps: [12, 10, 8] },
];

const ROTATION = ['push', 'pull', 'legs'] as const;

/** Rounds to the nearest 2.5 kg, like real plates. */
function plateRound(kg: number): number {
  return Math.max(20, Math.round(kg / 2.5) * 2.5);
}

export async function seedDemoData(log: (message: string) => void = console.log): Promise<void> {
  await seedReferenceData(() => undefined);

  const exercises = new Map<string, string>();
  const { rows } = await query<{ id: string; slug: string }>('SELECT id, slug FROM exercises WHERE created_by IS NULL');
  for (const row of rows) exercises.set(row.slug, row.id);

  const userIds = new Map<string, string>();

  for (const lifter of LIFTERS) {
    const email = `${lifter.username}@${DEMO_EMAIL_DOMAIN}`;
    const existing = await one<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      userIds.set(lifter.username, existing.id);
      continue;
    }

    const session = await register({
      email,
      password: DEMO_PASSWORD,
      displayName: lifter.displayName,
      username: lifter.username,
    });
    userIds.set(lifter.username, session.user.id);

    await updateProfile(session.user.id, {
      bio: `${lifter.bio} ${DEMO_BIO_MARKER}`,
      experienceLevel: lifter.strength > 1 ? 'advanced' : lifter.strength > 0.8 ? 'intermediate' : 'beginner',
      goals: ['strength', 'muscle_building'],
      weeklyTarget: Math.max(2, Math.min(6, Math.round(lifter.sessionsPerFortnight / 2))),
      onboardingStep: 'done',
    });
    await query('UPDATE users SET email_verified = true WHERE id = $1', [session.user.id]);
  }
  log(`lifters: ${userIds.size}`);

  // Everyone connects with Muzz; Rahul and Arjun also connect with each other,
  // so the demo has both a hub and a side rivalry.
  const pairs: [string, string][] = [
    ['rahul', 'muzz'],
    ['arjun', 'muzz'],
    ['sameer', 'muzz'],
    ['ayaan', 'muzz'],
    ['arjun', 'rahul'],
  ];
  for (const [from, to] of pairs) {
    const fromId = userIds.get(from)!;
    const toId = userIds.get(to)!;
    const connected = await one(
      'SELECT 1 FROM connections WHERE user_a_id = least($1::uuid,$2::uuid) AND user_b_id = greatest($1::uuid,$2::uuid)',
      [fromId, toId],
    );
    if (connected) continue;
    const request = await sendRequest(fromId, to);
    if ('rivalryId' in request) continue; // already resolved by a mutual request
    await acceptRequest(toId, request.id);
  }
  log(`connections: ${pairs.length}`);

  // Twelve weeks of training, with each lifter starting lighter and working up.
  const today = toIsoDate(new Date());
  const WEEKS = 12;
  let logged = 0;

  for (const lifter of LIFTERS) {
    const userId = userIds.get(lifter.username)!;
    const alreadyLogged = await one<{ count: number }>(
      'SELECT count(*)::int AS count FROM workout_sessions WHERE user_id = $1',
      [userId],
    );
    if ((alreadyLogged?.count ?? 0) > 0) continue;

    let sessionIndex = 0;
    for (let day = WEEKS * 7 - 1; day >= 0; day--) {
      // Spread the fortnightly target evenly rather than randomly, so the demo
      // is stable between runs.
      const trainsToday = Math.floor((day * lifter.sessionsPerFortnight) / 14) !==
        Math.floor(((day + 1) * lifter.sessionsPerFortnight) / 14);
      if (!trainsToday) continue;

      const sessionDate = addDays(today, -day);
      const split = ROTATION[sessionIndex % ROTATION.length]!;
      // Linear progression: 12 weeks takes them from ~78% to 100% of the top set.
      const progress = 0.78 + 0.22 * (1 - day / (WEEKS * 7));

      const chosen = PROGRAM.filter((_, index) => index % ROTATION.length === sessionIndex % ROTATION.length).concat(
        PROGRAM[(sessionIndex + 3) % PROGRAM.length]!,
      );

      await logCompleteWorkout(userId, {
        workoutType: split,
        sessionDate,
        durationSeconds: 60 * (55 + (sessionIndex % 4) * 5),
        exercises: chosen.map((movement) => {
          const top = plateRound(movement.topSet * lifter.strength * progress);
          return {
            exerciseId: exercises.get(movement.slug)!,
            sets: movement.reps.map((reps, setIndex) => ({
              // Ramp up to the top set: first sets lighter, last set heaviest.
              weight: plateRound(top * (0.75 + 0.125 * setIndex)),
              unit: 'kg' as const,
              reps,
            })),
          };
        }),
      });

      sessionIndex++;
      logged++;
    }
  }
  log(`workouts: ${logged}`);

  const muzz = userIds.get('muzz')!;
  const rahul = userIds.get('rahul')!;
  const openChallenge = await one('SELECT 1 FROM challenges WHERE creator_id = $1 AND opponent_id = $2', [rahul, muzz]);
  if (!openChallenge) {
    await createChallenge(rahul, {
      opponentId: muzz,
      type: 'pr',
      exerciseId: exercises.get('deadlift')!,
      title: 'Deadlift battle',
      target: 160,
      targetUnit: 'kg',
      deadline: addDays(today, 18),
    });
    log('challenge: Rahul vs Muzz on deadlift');
  }
}

/** Removes every demo account and everything that cascades from it. */
export async function clearDemoData(): Promise<number> {
  const result = await query('DELETE FROM users WHERE email LIKE $1', [`%@${DEMO_EMAIL_DOMAIN}`]);
  return result.rowCount ?? 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const run = process.argv.includes('--clear')
    ? clearDemoData().then((count) => console.log(`removed ${count} demo accounts`))
    : seedDemoData();

  run
    .then(() => closePool())
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
      return closePool();
    });
}
