-- Singleton rows that must exist before the app serves its first request.
-- Reference data that admins can edit (exercises, achievements, challenge
-- templates, plans) is seeded from src/db/seed.ts instead, so that it has one
-- definition shared with the client packages.

INSERT INTO rivalry_scoring_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
