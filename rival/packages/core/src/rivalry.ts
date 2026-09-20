import type { Uuid, WeightUnit } from './types.ts';
import { weightDelta } from './units.ts';

/**
 * The rivalry system.
 *
 * A rivalry exists only between two mutually connected users. Its score is a
 * deliberately small, legible tally — points come from things the user actually
 * did, never from bodyweight, height, age or any other attribute they can't
 * train. The weights are config, not constants, so they can be tuned from the
 * admin dashboard without a release.
 */

export interface RivalryScoringConfig {
  prBattleWin: number;
  consistencyWin: number;
  challengeWin: number;
  /** Window used for the consistency leg of the score. */
  consistencyWindowDays: number;
  /** An exercise only counts once both users have logged it this many times. */
  minSessionsPerExercise: number;
}

export const DEFAULT_SCORING: RivalryScoringConfig = {
  prBattleWin: 1,
  consistencyWin: 1,
  challengeWin: 1,
  consistencyWindowDays: 30,
  minSessionsPerExercise: 1,
};

export interface PrBattle {
  exerciseId: Uuid;
  exerciseName: string;
  /** Best weight PR in grams; `null` when the user has never logged it. */
  youGrams: number | null;
  rivalGrams: number | null;
  /** How many times each side has logged the exercise — gates comparability. */
  yourEntries: number;
  rivalEntries: number;
}

export type BattleOutcome = 'you' | 'rival' | 'tie' | 'not_comparable';

export interface PrBattleResult {
  exerciseId: Uuid;
  exerciseName: string;
  youGrams: number | null;
  rivalGrams: number | null;
  outcome: BattleOutcome;
  /** Signed difference in the viewer's unit; positive means you lead. */
  deltaDisplay: number | null;
  status: string;
}

/**
 * Compare one exercise. Per the smart-competition rule, an exercise is only
 * compared when *both* users have logged it enough to mean something.
 */
export function resolveBattle(
  battle: PrBattle,
  unit: WeightUnit,
  config: RivalryScoringConfig = DEFAULT_SCORING,
  names: { you: string; rival: string } = { you: 'You', rival: 'Your rival' },
): PrBattleResult {
  const comparable =
    battle.youGrams !== null &&
    battle.rivalGrams !== null &&
    battle.yourEntries >= config.minSessionsPerExercise &&
    battle.rivalEntries >= config.minSessionsPerExercise;

  if (!comparable) {
    return {
      exerciseId: battle.exerciseId,
      exerciseName: battle.exerciseName,
      youGrams: battle.youGrams,
      rivalGrams: battle.rivalGrams,
      outcome: 'not_comparable',
      deltaDisplay: null,
      status:
        battle.youGrams === null
          ? `Log ${battle.exerciseName} to open this battle.`
          : `${names.rival} hasn't logged ${battle.exerciseName} yet.`,
    };
  }

  const you = battle.youGrams!;
  const rival = battle.rivalGrams!;
  const delta = weightDelta(you, rival, unit);
  const outcome: BattleOutcome = delta > 0 ? 'you' : delta < 0 ? 'rival' : 'tie';
  const magnitude = Math.abs(delta);

  const status =
    outcome === 'you'
      ? `You lead by ${magnitude} ${unit}`
      : outcome === 'rival'
        ? `${names.rival} leads by ${magnitude} ${unit}`
        : 'Dead level';

  return {
    exerciseId: battle.exerciseId,
    exerciseName: battle.exerciseName,
    youGrams: you,
    rivalGrams: rival,
    outcome,
    deltaDisplay: delta,
    status,
  };
}

export interface RivalryInputs {
  battles: ReadonlyArray<PrBattleResult>;
  consistency: { you: number; rival: number };
  challenges: { youWon: number; rivalWon: number };
}

export interface RivalryScore {
  you: number;
  rival: number;
  leader: 'you' | 'rival' | 'tie';
  headline: string;
  breakdown: {
    prBattles: { you: number; rival: number; comparable: number };
    consistency: { you: number; rival: number; winner: 'you' | 'rival' | 'tie' };
    challenges: { you: number; rival: number };
  };
}

export function computeRivalryScore(
  inputs: RivalryInputs,
  config: RivalryScoringConfig = DEFAULT_SCORING,
  names: { you: string; rival: string } = { you: 'You', rival: 'Your rival' },
): RivalryScore {
  let youPoints = 0;
  let rivalPoints = 0;

  let youBattleWins = 0;
  let rivalBattleWins = 0;
  let comparable = 0;
  for (const battle of inputs.battles) {
    if (battle.outcome === 'not_comparable') continue;
    comparable++;
    if (battle.outcome === 'you') youBattleWins++;
    else if (battle.outcome === 'rival') rivalBattleWins++;
  }
  youPoints += youBattleWins * config.prBattleWin;
  rivalPoints += rivalBattleWins * config.prBattleWin;

  const consistencyWinner: 'you' | 'rival' | 'tie' =
    inputs.consistency.you > inputs.consistency.rival
      ? 'you'
      : inputs.consistency.you < inputs.consistency.rival
        ? 'rival'
        : 'tie';
  if (consistencyWinner === 'you') youPoints += config.consistencyWin;
  else if (consistencyWinner === 'rival') rivalPoints += config.consistencyWin;

  youPoints += inputs.challenges.youWon * config.challengeWin;
  rivalPoints += inputs.challenges.rivalWon * config.challengeWin;

  const leader: RivalryScore['leader'] =
    youPoints > rivalPoints ? 'you' : youPoints < rivalPoints ? 'rival' : 'tie';

  const headline =
    leader === 'tie'
      ? `Draw ${youPoints}–${rivalPoints}`
      : leader === 'you'
        ? `${names.you} lead ${youPoints}–${rivalPoints}`
        : `${names.rival} leads ${rivalPoints}–${youPoints}`;

  return {
    you: youPoints,
    rival: rivalPoints,
    leader,
    headline,
    breakdown: {
      prBattles: { you: youBattleWins, rival: rivalBattleWins, comparable },
      consistency: { you: inputs.consistency.you, rival: inputs.consistency.rival, winner: consistencyWinner },
      challenges: { you: inputs.challenges.youWon, rival: inputs.challenges.rivalWon },
    },
  };
}

/** Canonical ordering so a rivalry row is the same whichever side created it. */
export function rivalryPair(a: Uuid, b: Uuid): [Uuid, Uuid] {
  return a < b ? [a, b] : [b, a];
}
