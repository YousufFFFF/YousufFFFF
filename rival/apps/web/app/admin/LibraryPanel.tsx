'use client';

import { useEffect, useState } from 'react';
import { ApiError, type ChallengeTemplate, type Exercise, type ExerciseCategory, type Plan } from '@rival/api-client';
import { formatMinor, getClient } from '@/lib/client';
import styles from './admin.module.css';

/**
 * Managed content: the exercise library, challenge templates and plans.
 *
 * All three are data rather than code, so an admin can extend the app without a
 * release — a new lift, a new challenge shape, a new price.
 */

type Section = 'exercises' | 'templates' | 'plans';

export function LibraryPanel() {
  const [section, setSection] = useState<Section>('exercises');

  return (
    <>
      <nav className={styles.tabs} style={{ borderBottom: 'none', marginBottom: 16 }} aria-label="Library sections">
        {(
          [
            ['exercises', 'Exercises'],
            ['templates', 'Challenge templates'],
            ['plans', 'Subscription plans'],
          ] as [Section, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={section === key ? styles.tabActive : styles.tab}
            aria-current={section === key ? 'true' : undefined}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {section === 'exercises' && <Exercises />}
      {section === 'templates' && <Templates />}
      {section === 'plans' && <Plans />}
    </>
  );
}

function Exercises() {
  const [rows, setRows] = useState<Exercise[] | null>(null);
  const [categories, setCategories] = useState<ExerciseCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', categorySlug: '', equipment: 'barbell', isCompound: false });

  async function load() {
    try {
      const [list, cats] = await Promise.all([getClient().exercises(), getClient().exerciseCategories()]);
      // Only the shared library is managed here; a user's own exercises are theirs.
      setRows(list.filter((exercise) => exercise.created_by === null));
      setCategories(cats);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load exercises.');
      setRows([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    try {
      await getClient().adminUpsertExercise({
        slug: form.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        name: form.name.trim(),
        categorySlug: form.categorySlug || undefined,
        equipment: form.equipment,
        isCompound: form.isCompound,
      });
      setSaved(`Added ${form.name.trim()}.`);
      setForm({ name: '', categorySlug: '', equipment: 'barbell', isCompound: false });
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that exercise.');
    }
  }

  return (
    <>
      <form className={`card ${styles.panel}`} onSubmit={add} style={{ marginBottom: 20 }}>
        <h3 className={styles.sectionTitle} style={{ marginTop: 0 }}>
          Add or update an exercise
        </h3>
        {error && (
          <p className={styles.error} role="alert" style={{ marginBottom: 14 }}>
            {error}
          </p>
        )}
        {saved && (
          <p className={styles.notice} style={{ marginBottom: 14 }}>
            {saved}
          </p>
        )}
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ex-name">
              Name
            </label>
            <input
              id="ex-name"
              className={styles.input}
              required
              minLength={2}
              value={form.name}
              placeholder="Zercher Squat"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ex-category">
              Category
            </label>
            <select
              id="ex-category"
              className={styles.input}
              value={form.categorySlug}
              onChange={(event) => setForm({ ...form, categorySlug: event.target.value })}
            >
              <option value="">—</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ex-equipment">
              Equipment
            </label>
            <select
              id="ex-equipment"
              className={styles.input}
              value={form.equipment}
              onChange={(event) => setForm({ ...form, equipment: event.target.value })}
            >
              {['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ex-compound">
              Compound lift
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: 'var(--text-secondary)' }}>
              <input
                id="ex-compound"
                type="checkbox"
                checked={form.isCompound}
                onChange={(event) => setForm({ ...form, isCompound: event.target.checked })}
              />
              Counts towards the strength board
            </label>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: 18 }}>
          Save exercise
        </button>
      </form>

      {!rows && <div className={`card ${styles.panel}`}><div className={styles.skeleton} /></div>}

      {rows && (
        <div className={`card ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Category</th>
                <th>Equipment</th>
                <th>Compound</th>
                <th>Popular</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.category_name ?? '—'}</td>
                  <td>{row.equipment ?? '—'}</td>
                  <td>{row.is_compound ? '✓' : '—'}</td>
                  <td>{row.is_popular ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Templates() {
  const [rows, setRows] = useState<ChallengeTemplate[] | null>(null);

  useEffect(() => {
    void getClient()
      .challengeTemplates()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <div className={`card ${styles.panel}`}><div className={styles.skeleton} /></div>;

  return (
    <div className={`card ${styles.tableWrap}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Template</th>
            <th>Type</th>
            <th>Description</th>
            <th className={styles.numeric}>Default days</th>
            <th className={styles.numeric}>Target %</th>
            <th>Tier</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.title}</strong>
                <br />
                <span style={{ color: 'var(--text-tertiary)' }}>{row.code}</span>
              </td>
              <td>{row.challenge_type.replace(/_/g, ' ')}</td>
              <td style={{ maxWidth: 320 }}>{row.description}</td>
              <td className={styles.numeric}>{row.default_duration_days}</td>
              <td className={styles.numeric}>{row.suggested_target_pct ?? '—'}</td>
              <td>
                {row.requires_pro ? <span className="pill pill-accent">Pro</span> : <span className="pill">Free</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Plans() {
  const [rows, setRows] = useState<Plan[] | null>(null);
  const [provider, setProvider] = useState<string>('none');

  useEffect(() => {
    void getClient()
      .plans()
      .then((result) => {
        setRows(result.plans);
        setProvider(result.provider);
      })
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <div className={`card ${styles.panel}`}><div className={styles.skeleton} /></div>;

  return (
    <>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
        Payment provider for this deployment: <strong>{provider}</strong>.
        {provider === 'none' && ' Checkout reports that it is unavailable rather than taking a payment it cannot process.'}
      </p>
      <div className={`card ${styles.tableWrap}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Plan</th>
              <th className={styles.numeric}>Price</th>
              <th>Interval</th>
              <th>Features</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <br />
                  <span style={{ color: 'var(--text-tertiary)' }}>{row.code}</span>
                </td>
                <td className={styles.numeric}>{formatMinor(row.price_minor, row.currency)}</td>
                <td>{row.interval}</td>
                <td style={{ maxWidth: 380 }}>{row.features.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
