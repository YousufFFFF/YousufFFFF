import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ApiError, type SearchResult } from '@rival/api-client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import {
  Avatar,
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
 * Find and manage connections.
 *
 * Search is by username or display name only — never email — and a result
 * shows a name and nothing else until you are connected.
 */

export default function ConnectionsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const requests = useAsync(() => api.connectionRequests(), []);
  const connections = useAsync(() => api.connections(), []);

  useFocusEffect(
    useCallback(() => {
      void requests.refresh();
      void connections.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  async function search(term: string) {
    setQuery(term);
    if (term.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      setResults(await api.searchUsers(term.trim()));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not search right now.');
    } finally {
      setSearching(false);
    }
  }

  async function sendRequest(user: SearchResult) {
    setBusyId(user.id);
    setError(null);
    try {
      await api.sendConnectionRequest(user.username);
      setResults((current) =>
        current?.map((row) =>
          row.id === user.id ? { ...row, requestStatus: 'pending', requestDirection: 'outgoing' } : row,
        ) ?? null,
      );
      await requests.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send that request.');
    } finally {
      setBusyId(null);
    }
  }

  async function respond(requestId: string, accept: boolean) {
    setBusyId(requestId);
    setError(null);
    try {
      if (accept) await api.acceptConnectionRequest(requestId);
      else await api.rejectConnectionRequest(requestId);
      await requests.reload();
      await connections.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not respond to that request.');
    } finally {
      setBusyId(null);
    }
  }

  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];
  const friends = connections.data ?? [];

  return (
    <Screen>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={(value) => void search(value)}
        placeholder="Search by username or name"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search for gym friends"
      />

      {error ? <ErrorState message={error} /> : null}

      {searching ? <LoadingState label="Searching" /> : null}

      {results !== null && !searching ? (
        results.length === 0 ? (
          <EmptyState icon="🔍" title="Nobody found" body={`No one matches “${query}”. Check the spelling of their username.`} />
        ) : (
          <Card style={styles.card}>
            <Label>Results</Label>
            <Divider />
            {results.map((user) => (
              <Row key={user.id} style={styles.personRow} gap={spacing.md}>
                <Avatar name={user.displayName} />
                <View style={{ flex: 1 }}>
                  <Type variant="body" style={{ fontWeight: '700' }}>
                    {user.displayName}
                  </Type>
                  <Type variant="caption" colour={colors.textTertiary}>
                    @{user.username}
                  </Type>
                </View>
                {user.connected ? (
                  <Pill label="Rivals" tone="ahead" icon="⚔️" />
                ) : user.requestStatus === 'pending' ? (
                  <Pill label={user.requestDirection === 'incoming' ? 'Asked you' : 'Pending'} />
                ) : (
                  <Button
                    label="Connect"
                    small
                    full={false}
                    loading={busyId === user.id}
                    onPress={() => void sendRequest(user)}
                  />
                )}
              </Row>
            ))}
          </Card>
        )
      ) : null}

      {incoming.length > 0 ? (
        <Card style={styles.card}>
          <Label colour={colors.flameLight}>Requests for you</Label>
          <Divider />
          {incoming.map((request) => (
            <View key={request.id} style={styles.requestRow}>
              <Row gap={spacing.md}>
                <Avatar name={request.user.displayName} />
                <View style={{ flex: 1 }}>
                  <Type variant="body" style={{ fontWeight: '700' }}>
                    {request.user.displayName}
                  </Type>
                  <Type variant="caption" colour={colors.textTertiary}>
                    @{request.user.username}
                  </Type>
                </View>
              </Row>
              {request.message ? (
                <Type variant="caption" colour={colors.textSecondary} style={{ marginTop: 6 }}>
                  “{request.message}”
                </Type>
              ) : null}
              <Row gap={spacing.sm} style={{ marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label="Accept" small loading={busyId === request.id} onPress={() => void respond(request.id, true)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Decline" tone="ghost" small onPress={() => void respond(request.id, false)} />
                </View>
              </Row>
            </View>
          ))}
        </Card>
      ) : null}

      {outgoing.length > 0 ? (
        <Card style={styles.card}>
          <Label>Waiting on them</Label>
          <Divider />
          {outgoing.map((request) => (
            <Row key={request.id} style={styles.personRow} gap={spacing.md}>
              <Avatar name={request.user.displayName} size={32} />
              <Type variant="body" style={{ flex: 1 }}>
                {request.user.displayName}
              </Type>
              <Pill label="Pending" />
            </Row>
          ))}
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Label>⚔️ My rivals</Label>
        <Divider />
        {connections.loading && !connections.data ? (
          <LoadingState />
        ) : friends.length === 0 ? (
          <Type variant="caption" colour={colors.textTertiary}>
            Nobody yet. Search for a friend&rsquo;s username above — a rivalry starts the moment you both accept.
          </Type>
        ) : (
          friends.map((friend) => (
            <Pressable
              key={friend.user_id}
              onPress={() => router.push({ pathname: '/rival/[id]', params: { id: friend.user_id } })}
              accessibilityRole="button"
              accessibilityLabel={`Open your rivalry with ${friend.display_name}`}
            >
              <Row style={styles.personRow} gap={spacing.md}>
                <Avatar name={friend.display_name} />
                <View style={{ flex: 1 }}>
                  <Type variant="body" style={{ fontWeight: '700' }}>
                    {friend.display_name}
                  </Type>
                  <Type variant="caption" colour={colors.textTertiary}>
                    @{friend.username}
                  </Type>
                </View>
                <Type variant="body" colour={colors.textFaint}>
                  ›
                </Type>
              </Row>
            </Pressable>
          ))
        )}
      </Card>

      <Spacer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.ink800,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  card: { gap: spacing.xs },
  personRow: { paddingVertical: spacing.sm },
  requestRow: { paddingVertical: spacing.sm },
});
