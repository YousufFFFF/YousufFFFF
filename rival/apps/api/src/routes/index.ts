import type { FastifyInstance } from 'fastify';
import { adminRoutes } from './admin.ts';
import { authRoutes } from './auth.ts';
import { billingRoutes } from './billing.ts';
import { competeRoutes } from './compete.ts';
import { meRoutes } from './me.ts';
import { socialRoutes } from './social.ts';
import { workoutRoutes } from './workouts.ts';

export function registerRoutes(app: FastifyInstance): void {
  authRoutes(app);
  meRoutes(app);
  workoutRoutes(app);
  socialRoutes(app);
  competeRoutes(app);
  billingRoutes(app);
  adminRoutes(app);
}
