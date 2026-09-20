import { ACHIEVEMENTS, CHALLENGE_TEMPLATES, EXERCISE_CATEGORIES, SEED_EXERCISES } from '@rival/core';
import { closePool, transaction } from './index.ts';

/**
 * Reference data.
 *
 * Idempotent: every statement is an upsert keyed on a stable code or slug, so
 * this can be re-run on every deploy. The definitions come from `@rival/core`
 * so the app, the seed and the clients cannot drift apart.
 *
 * This is *not* demo data — see `seed-demo.ts` for that.
 */

export async function seedReferenceData(log: (message: string) => void = console.log): Promise<void> {
  await transaction(async (client) => {
    for (const [index, category] of EXERCISE_CATEGORIES.entries()) {
      await client.query(
        `INSERT INTO exercise_categories (slug, name, icon, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order`,
        [category.slug, category.name, category.icon, index],
      );
    }
    log(`categories: ${EXERCISE_CATEGORIES.length}`);

    for (const exercise of SEED_EXERCISES) {
      await client.query(
        `INSERT INTO exercises (slug, name, category_id, equipment, is_compound, is_popular)
         VALUES ($1, $2, (SELECT id FROM exercise_categories WHERE slug = $3), $4, $5, $6)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name, category_id = EXCLUDED.category_id, equipment = EXCLUDED.equipment,
           is_compound = EXCLUDED.is_compound, is_popular = EXCLUDED.is_popular`,
        [exercise.slug, exercise.name, exercise.category, exercise.equipment, exercise.isCompound, exercise.popular],
      );
    }
    log(`exercises: ${SEED_EXERCISES.length}`);

    for (const [index, achievement] of ACHIEVEMENTS.entries()) {
      await client.query(
        `INSERT INTO achievements (code, icon, title, description, threshold_stat, threshold_value, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (code) DO UPDATE SET
           icon = EXCLUDED.icon, title = EXCLUDED.title, description = EXCLUDED.description,
           threshold_stat = EXCLUDED.threshold_stat, threshold_value = EXCLUDED.threshold_value,
           sort_order = EXCLUDED.sort_order`,
        [
          achievement.code,
          achievement.icon,
          achievement.title,
          achievement.description,
          achievement.threshold.stat,
          achievement.threshold.value,
          index,
        ],
      );
    }
    log(`achievements: ${ACHIEVEMENTS.length}`);

    for (const template of CHALLENGE_TEMPLATES) {
      await client.query(
        `INSERT INTO challenge_templates
           (code, challenge_type, title, description, default_duration_days, suggested_target_pct)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO UPDATE SET
           challenge_type = EXCLUDED.challenge_type, title = EXCLUDED.title,
           description = EXCLUDED.description, default_duration_days = EXCLUDED.default_duration_days,
           suggested_target_pct = EXCLUDED.suggested_target_pct`,
        [
          template.code,
          template.type,
          template.title,
          template.description,
          template.defaultDurationDays,
          template.suggestedTargetPct ?? null,
        ],
      );
    }
    log(`challenge templates: ${CHALLENGE_TEMPLATES.length}`);

    // Placeholder pricing. Admins set real prices from the dashboard, and the
    // payment provider is configured per deployment.
    const plans = [
      {
        code: 'free',
        name: 'Free',
        description: 'Workout logging, PRs, connections, rivalries, leaderboards and challenges.',
        priceMinor: 0,
        currency: 'INR',
        interval: 'month',
        features: [
          'Workout logging',
          'Basic PR tracking',
          'Connections and rivalries',
          'Private leaderboards',
          'Up to 3 custom challenges',
        ],
        sortOrder: 0,
      },
      {
        code: 'pro_monthly',
        name: 'RIVAL PRO',
        description: 'Everything in Free, plus the full analytics and unlimited challenges.',
        priceMinor: 19_900, // ₹199.00
        currency: 'INR',
        interval: 'month',
        features: [
          'Advanced statistics',
          'Full PR history',
          'Advanced rivalry analytics',
          'Unlimited custom challenges',
          'Advanced leaderboards',
          'Detailed improvement analytics',
          'Custom rivalry settings',
        ],
        sortOrder: 1,
      },
      {
        code: 'pro_yearly',
        name: 'RIVAL PRO (yearly)',
        description: 'The same, billed once a year.',
        priceMinor: 149_900, // ₹1,499.00
        currency: 'INR',
        interval: 'year',
        features: [
          'Advanced statistics',
          'Full PR history',
          'Advanced rivalry analytics',
          'Unlimited custom challenges',
          'Advanced leaderboards',
          'Detailed improvement analytics',
          'Custom rivalry settings',
        ],
        sortOrder: 2,
      },
    ] as const;

    for (const plan of plans) {
      await client.query(
        `INSERT INTO subscription_plans (code, name, description, price_minor, currency, interval, features, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, price_minor = EXCLUDED.price_minor,
           currency = EXCLUDED.currency, interval = EXCLUDED.interval, features = EXCLUDED.features,
           sort_order = EXCLUDED.sort_order`,
        [
          plan.code,
          plan.name,
          plan.description,
          plan.priceMinor,
          plan.currency,
          plan.interval,
          JSON.stringify(plan.features),
          plan.sortOrder,
        ],
      );
    }
    log(`plans: ${plans.length}`);

    await client.query('INSERT INTO rivalry_scoring_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  seedReferenceData()
    .then(() => closePool())
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
      return closePool();
    });
}
