import { Alert, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { fromGrams } from '@rival/core';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useMe } from '@/lib/session';
import { duration, volume, workoutLabel } from '@/lib/format';
import {
  Button,
  Card,
  Divider,
  ErrorState,
  Label,
  LoadingState,
  Pill,
  Row,
  Screen,
  Spacer,
  Type,
} from '@/components/ui';
import { colors, spacing } from '@/theme';

/** A logged workout, set by set. */

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const unit = me.profile.preferredUnit;
  const state = useAsync(() => api.workout(id), [id]);

  function confirmDelete() {
    Alert.alert(
      'Delete this workout?',
      'The gym day stops counting towards your streak and your rivalries. Any personal records it set stay — you really lifted them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void api.deleteWorkout(id).then(() => router.back()),
        },
      ],
    );
  }

  if (state.loading && !state.data) return <LoadingState label="Loading workout" />;
  if (state.error && !state.data) {
    return (
      <Screen>
        <ErrorState message={state.error} onRetry={() => void state.reload()} />
      </Screen>
    );
  }

  const { session, exercises } = state.data!;
  const isMine = session.user_id === me.id;

  return (
    <>
      <Stack.Screen options={{ title: workoutLabel(session.workout_type) }} />
      <Screen>
        <Card style={styles.card}>
          <Row>
            <View style={{ flex: 1 }}>
              <Label>{session.session_date}</Label>
              <Type variant="heading">{workoutLabel(session.workout_type)}</Type>
            </View>
            {session.is_counted ? <Pill label="Gym day" tone="ahead" icon="✓" /> : <Pill label="Not counted" />}
          </Row>
          <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
            <Pill label={`${session.set_count} sets`} />
            <Pill label={`${session.exercise_count} exercises`} />
            <Pill label={volume(Number(session.total_volume_grams), unit)} tone="accent" />
            {session.duration_seconds ? <Pill label={duration(session.duration_seconds)} /> : null}
          </Row>
        </Card>

        {exercises.map((group) => (
          <Card key={group.exerciseId} style={styles.card}>
            <Type variant="heading">{group.exerciseName}</Type>
            <Divider />
            {group.sets.map((set) => (
              <Row key={set.id} style={styles.setRow}>
                <Type variant="caption" colour={colors.textTertiary} style={styles.setNumber}>
                  {set.set_number}
                </Type>
                <Type variant="body" style={styles.setValue}>
                  {fromGrams(set.weight_grams, unit)} {unit} × {set.reps}
                </Type>
                {set.rpe ? (
                  <Type variant="caption" colour={colors.textFaint}>
                    RPE {set.rpe}
                  </Type>
                ) : null}
              </Row>
            ))}
          </Card>
        ))}

        {isMine ? (
          <>
            <Spacer />
            <Button label="Delete workout" tone="danger" onPress={confirmDelete} />
          </>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  setRow: { paddingVertical: 6, gap: spacing.md },
  setNumber: { width: 18 },
  setValue: { flex: 1, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
