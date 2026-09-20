'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@rival/api-client';
import { getClient } from '@/lib/client';
import styles from './admin.module.css';

/**
 * Rivalry scoring.
 *
 * These weights live in the database precisely so the competition can be
 * retuned without a release. Changing them takes effect on the next recompute,
 * which happens whenever either side of a rivalry trains.
 */

const FIELDS = [
  { key: 'prBattleWin', label: 'PR battle win', hint: 'Points for leading an exercise both have logged.' },
  { key: 'consistencyWin', label: 'Consistency win', hint: 'Points for more gym days in the window.' },
  { key: 'challengeWin', label: 'Challenge win', hint: 'Points per challenge won.' },
  { key: 'consistencyWindowDays', label: 'Consistency window (days)', hint: 'How far back gym days are counted.' },
  {
    key: 'minSessionsPerExercise',
    label: 'Minimum sessions per exercise',
    hint: 'How many times both users must have logged a lift before it is compared.',
  },
] as const;

export function ScoringPanel() {
  const [values, setValues] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getClient()
      .adminScoring()
      .then((config) => {
        if (!cancelled) setValues(config);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof ApiError ? cause.message : 'Could not load the scoring rules.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!values) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const payload = Object.fromEntries(FIELDS.map((field) => [field.key, values[field.key] ?? 0]));
      setValues(await getClient().adminUpdateScoring(payload));
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  if (!values) {
    return (
      <div className={`card ${styles.panel}`}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : (
          <div className={styles.skeleton} />
        )}
      </div>
    );
  }

  return (
    <form className={`card ${styles.panel}`} onSubmit={save}>
      <h2 className={styles.sectionTitle} style={{ marginTop: 0 }}>
        Rivalry scoring
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 22, maxWidth: '62ch' }}>
        Points come only from things a user did — leading a lift, showing up, winning a challenge. Body weight, height
        and age are deliberately not inputs, so nobody scores for being bigger.
      </p>

      {error && (
        <p className={styles.error} role="alert" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}
      {saved && (
        <p className={styles.notice} style={{ marginBottom: 16 }}>
          Saved. Scores recompute the next time either side of a rivalry trains.
        </p>
      )}

      <div className={styles.formRow}>
        {FIELDS.map((field) => (
          <div key={field.key} className={styles.field}>
            <label className={styles.label} htmlFor={`scoring-${field.key}`}>
              {field.label}
            </label>
            <input
              id={`scoring-${field.key}`}
              className={styles.input}
              type="number"
              min={field.key === 'consistencyWindowDays' ? 7 : field.key === 'minSessionsPerExercise' ? 1 : 0}
              max={field.key === 'consistencyWindowDays' ? 365 : 100}
              value={values[field.key] ?? 0}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: Number(event.target.value) }))
              }
            />
            <span className={styles.metricHint}>{field.hint}</span>
          </div>
        ))}
      </div>

      <button type="submit" className="btn btn-primary" style={{ marginTop: 22 }} disabled={busy}>
        {busy ? 'Saving…' : 'Save scoring rules'}
      </button>
    </form>
  );
}
