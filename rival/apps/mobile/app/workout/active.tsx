import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ApiError, type Exercise, type WeightUnit, type WorkoutSet } from '@rival/api-client';
import { fromGrams } from '@rival/core';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useMe } from '@/lib/session';
import { volume, workoutLabel } from '@/lib/format';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  Pill,
  Row,
  Screen,
  Spacer,
  Type,
} from '@/components/ui';
import { colors, MIN_TOUCH, radius, spacing } from '@/theme';

/**
 * The active workout.
 *
 * Optimised for one-handed use between sets: the weight and rep inputs stay on
 * screen, the last set is pre-filled (you usually repeat it), and adding a set
 * is a single tap once the numbers are right.
 */

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const unit = me.profile.preferredUnit;

  const workout = useAsync(() => api.workout(id), [id]);
  const [picking, setPicking] = useState(false);
  const [activeExercise, setActiveExercise] = useState<{ id: string; name: string } | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const totals = useMemo(() => {
    const session = workout.data?.session;
    return {
      sets: session?.set_count ?? 0,
      exercises: session?.exercise_count ?? 0,
      volumeGrams: Number(session?.total_volume_grams ?? 0),
    };
  }, [workout.data]);

  const chooseExercise = useCallback(
    (exercise: Exercise) => {
      setActiveExercise({ id: exercise.id, name: exercise.name });
      setPicking(false);

      // Pre-fill from the last set of this exercise: the common case is
      // repeating it, and the second most common is nudging it up.
      const existing = workout.data?.exercises.find((group) => group.exerciseId === exercise.id);
      const last = existing?.sets[existing.sets.length - 1];
      if (last) {
        setWeight(String(fromGrams(last.weight_grams, unit)));
        setReps(String(last.reps));
      } else {
        setWeight('');
        setReps('');
      }
    },
    [workout.data, unit],
  );

  async function addSet() {
    if (!activeExercise) return;
    const weightValue = Number.parseFloat(weight);
    const repsValue = Number.parseInt(reps, 10);

    if (!Number.isFinite(weightValue) || weightValue < 0) {
      setError('Enter a weight.');
      return;
    }
    if (!Number.isInteger(repsValue) || repsValue <= 0) {
      setError('Enter how many reps you did.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.addSet(id, { exerciseId: activeExercise.id, weight: weightValue, unit, reps: repsValue });
      await workout.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add that set.');
    } finally {
      setBusy(false);
    }
  }

  async function removeSet(set: WorkoutSet) {
    try {
      await api.deleteSet(id, set.id);
      await workout.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not remove that set.');
    }
  }

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      const result = await api.finishWorkout(id);
      // Hand the whole result to the celebration screen: it already contains
      // the PRs, XP, badges, recovery notices and any lead taken.
      router.replace({ pathname: '/pr-celebration', params: { payload: JSON.stringify(result) } });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not finish that workout.');
      setFinishing(false);
    }
  }

  if (workout.loading && !workout.data) return <LoadingState label="Loading your workout" />;
  if (workout.error && !workout.data) {
    return (
      <Screen>
        <ErrorState message={workout.error} onRetry={() => void workout.reload()} />
      </Screen>
    );
  }

  const session = workout.data!.session;
  const groups = workout.data!.exercises;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={96}
    >
      <Screen>
        <Row style={styles.summary}>
          <View style={{ flex: 1 }}>
            <Label>{workoutLabel(session.workout_type)}</Label>
            <Type variant="heading">
              {totals.sets} {totals.sets === 1 ? 'set' : 'sets'}
            </Type>
          </View>
          <Pill label={`${totals.exercises} ${totals.exercises === 1 ? 'exercise' : 'exercises'}`} />
          {totals.volumeGrams > 0 ? <Pill label={volume(totals.volumeGrams, unit)} tone="accent" /> : null}
        </Row>

        {error ? <ErrorState message={error} /> : null}

        {groups.length === 0 ? (
          <EmptyState
            icon="🏋️"
            title="No sets yet"
            body="Add your first exercise and start logging."
            actionLabel="Add exercise"
            onAction={() => setPicking(true)}
          />
        ) : (
          groups.map((group) => (
            <Card key={group.exerciseId} style={styles.exerciseCard}>
              <Row>
                <Type variant="heading" style={{ flex: 1 }}>
                  {group.exerciseName}
                </Type>
                <Pressable
                  onPress={() => chooseExercise({ id: group.exerciseId, name: group.exerciseName } as Exercise)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add a set to ${group.exerciseName}`}
                  style={styles.addSetButton}
                >
                  <Type variant="caption" colour={colors.flameLight} style={{ fontWeight: '800' }}>
                    + Set
                  </Type>
                </Pressable>
              </Row>

              <Divider />

              {group.sets.map((set) => (
                <Row key={set.id} style={styles.setRow}>
                  <Type variant="caption" colour={colors.textTertiary} style={styles.setNumber}>
                    {set.set_number}
                  </Type>
                  <Type variant="body" style={styles.setValue}>
                    {fromGrams(set.weight_grams, unit)} {unit} × {set.reps}
                  </Type>
                  <Pressable
                    onPress={() => void removeSet(set)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete set ${set.set_number} of ${group.exerciseName}`}
                    style={styles.deleteButton}
                  >
                    <Type variant="caption" colour={colors.textFaint}>
                      ✕
                    </Type>
                  </Pressable>
                </Row>
              ))}
            </Card>
          ))
        )}

        <Button label="+ Add exercise" tone="secondary" onPress={() => setPicking(true)} />
        <Spacer size={spacing.xs} />
        <Button
          label={totals.sets > 0 ? 'Finish workout' : 'Finish (nothing logged)'}
          onPress={() => void finish()}
          loading={finishing}
          tone={totals.sets > 0 ? 'primary' : 'ghost'}
          accessibilityHint={
            totals.sets > 0
              ? 'Saves your session, checks for personal records and updates your rivalries'
              : 'Closes this session without counting it as a gym day'
          }
        />
      </Screen>

      {/* The set entry bar sits above the keyboard once an exercise is chosen. */}
      {activeExercise ? (
        <View style={styles.entryBar}>
          <Row style={{ marginBottom: spacing.sm }}>
            <Type variant="caption" colour={colors.textSecondary} style={{ flex: 1 }}>
              {activeExercise.name}
            </Type>
            <Pressable onPress={() => setActiveExercise(null)} accessibilityRole="button" accessibilityLabel="Close set entry">
              <Type variant="caption" colour={colors.textFaint}>
                Done
              </Type>
            </Pressable>
          </Row>
          <Row gap={spacing.sm}>
            <View style={styles.inputWrap}>
              <Label>Weight ({unit})</Label>
              <TextInput
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textFaint}
                accessibilityLabel={`Weight in ${unit}`}
                returnKeyType="next"
              />
            </View>
            <View style={styles.inputWrap}>
              <Label>Reps</Label>
              <TextInput
                style={styles.input}
                value={reps}
                onChangeText={setReps}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.textFaint}
                accessibilityLabel="Reps"
                returnKeyType="done"
                onSubmitEditing={() => void addSet()}
              />
            </View>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Button label="Add set" onPress={() => void addSet()} loading={busy} small />
            </View>
          </Row>
        </View>
      ) : null}

      <ExercisePicker visible={picking} onClose={() => setPicking(false)} onPick={chooseExercise} />
    </KeyboardAvoidingView>
  );
}

/** Exercise picker: favourites first, then the library, with a search box. */
function ExercisePicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  const [search, setSearch] = useState('');
  const exercises = useAsync(() => api.exercises(), []);
  const favorites = useAsync(() => api.favorites(), []);

  const list = useMemo(() => {
    const all = exercises.data ?? [];
    const needle = search.trim().toLowerCase();
    const filtered = needle ? all.filter((item) => item.name.toLowerCase().includes(needle)) : all;
    const favoriteIds = new Set((favorites.data ?? []).map((item) => item.id));
    // Favourites float to the top so the lifts you actually do are one tap away.
    return [...filtered].sort((a, b) => {
      const aFav = favoriteIds.has(a.id) ? 0 : 1;
      const bFav = favoriteIds.has(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.name.localeCompare(b.name);
    });
  }, [exercises.data, favorites.data, search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={styles.modal}>
        <Row style={styles.modalHead}>
          <Type variant="heading" style={{ flex: 1 }}>
            Choose an exercise
          </Type>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Type variant="body" colour={colors.textTertiary}>
              Close
            </Type>
          </Pressable>
        </Row>

        <TextInput
          style={[styles.input, styles.search]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Search exercises"
          autoCorrect={false}
        />

        {exercises.loading ? (
          <LoadingState />
        ) : (
          <ScrollView contentContainerStyle={styles.modalList} keyboardShouldPersistTaps="handled">
            {list.length === 0 ? (
              <EmptyState
                icon="🔍"
                title="No matches"
                body={`Nothing in the library matches “${search}”.`}
              />
            ) : (
              list.map((exercise) => (
                <Pressable
                  key={exercise.id}
                  onPress={() => onPick(exercise)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.pickRow, pressed && { backgroundColor: colors.ink700 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Type variant="body" style={{ fontWeight: '700' }}>
                      {exercise.name}
                    </Type>
                    <Type variant="caption" colour={colors.textTertiary}>
                      {exercise.category_name ?? 'Other'}
                      {exercise.equipment ? ` · ${exercise.equipment}` : ''}
                    </Type>
                  </View>
                  {exercise.is_compound ? <Pill label="Compound" tone="accent" /> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  summary: { gap: spacing.sm },
  exerciseCard: { gap: spacing.xs },
  addSetButton: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.md, justifyContent: 'center' },
  setRow: { paddingVertical: 6, gap: spacing.md },
  setNumber: { width: 18 },
  setValue: { flex: 1, fontWeight: '700', fontVariant: ['tabular-nums'] },
  deleteButton: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },

  entryBar: {
    backgroundColor: colors.ink850,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  inputWrap: { flex: 1, gap: 6 },
  input: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.ink900,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '700',
  },

  modal: { flex: 1, backgroundColor: colors.ink900, padding: spacing.lg },
  modalHead: { marginBottom: spacing.md },
  search: { marginBottom: spacing.md },
  modalList: { gap: spacing.xs, paddingBottom: spacing.xxl },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
});
