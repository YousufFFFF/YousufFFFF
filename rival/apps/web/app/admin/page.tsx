'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, type AdminDashboard, type Me } from '@rival/api-client';
import { TrendChart } from '@/components/TrendChart';
import { formatMinor, getClient, relativeTime } from '@/lib/client';
import styles from './admin.module.css';
import { LibraryPanel } from './LibraryPanel';
import { ReportsPanel } from './ReportsPanel';
import { ScoringPanel } from './ScoringPanel';
import { UsersPanel } from './UsersPanel';

/**
 * The admin dashboard.
 *
 * Authentication is the same API session everyone else uses; the `isAdmin`
 * claim decides what is shown, and the API enforces it independently — the UI
 * hiding a tab is a convenience, never the control.
 */

type Tab = 'overview' | 'users' | 'reports' | 'library' | 'scoring';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'reports', label: 'Reports' },
  { key: 'library', label: 'Library' },
  { key: 'scoring', label: 'Scoring' },
];

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const signOut = useCallback(() => {
    setMe(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getClient(signOut).me();
        if (!cancelled) setMe(profile);
      } catch {
        // Not signed in, or the session expired — fall through to the form.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  if (checking) {
    return (
      <div className={styles.centred}>
        <div style={{ width: 220, display: 'grid', gap: 10 }}>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} style={{ width: '70%' }} />
        </div>
      </div>
    );
  }

  if (!me) return <SignIn onSignedIn={setMe} />;

  if (!me.isAdmin) {
    return (
      <div className={styles.centred}>
        <div className={`card ${styles.signIn}`}>
          <h1 className="headline" style={{ fontSize: '1.4rem' }}>
            Not an admin
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            You are signed in as <strong>{me.profile.username}</strong>, which does not have dashboard access.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void getClient().logout().then(() => setMe(null));
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={`container ${styles.topbarInner}`}>
          <span className={styles.brand}>
            RIVAL<span className={styles.brandTag}>Admin</span>
          </span>
          <div className={styles.spacer} />
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{me.profile.username}</span>
          <button
            type="button"
            className={styles.btnSm}
            onClick={() => {
              void getClient().logout().then(() => setMe(null));
            }}
          >
            Sign out
          </button>
        </div>
        <div className="container">
          <nav className={styles.tabs} aria-label="Dashboard sections">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={tab === item.key ? styles.tabActive : styles.tab}
                aria-current={tab === item.key ? 'page' : undefined}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <div className="container">
          {tab === 'overview' && <Overview />}
          {tab === 'users' && <UsersPanel />}
          {tab === 'reports' && <ReportsPanel />}
          {tab === 'library' && <LibraryPanel />}
          {tab === 'scoring' && <ScoringPanel />}
        </div>
      </main>
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const client = getClient();
      await client.login(email.trim(), password);
      onSignedIn(await client.me());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.centred}>
      <form className={`card ${styles.signIn}`} onSubmit={submit}>
        <div>
          <span className={styles.brand}>RIVAL</span>
          <h1 className="headline" style={{ fontSize: '1.3rem', marginTop: 10 }}>
            Admin sign in
          </h1>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="admin-email">
            Email
          </label>
          <input
            id="admin-email"
            className={styles.input}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="admin-password">
            Password
          </label>
          <input
            id="admin-password"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function Overview() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const dashboard = await getClient().adminDashboard(30);
        if (!cancelled) setData(dashboard);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof ApiError ? cause.message : 'Could not load metrics.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className={styles.metrics}>
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className={`card ${styles.metric}`}>
            <div className={styles.skeleton} style={{ width: '60%' }} />
            <div className={styles.skeleton} style={{ height: 28 }} />
          </div>
        ))}
      </div>
    );
  }

  const { metrics, trends } = data;

  const tiles = [
    { label: 'Total users', value: metrics.users.total, hint: `+${metrics.users.newToday} today` },
    { label: 'New this week', value: metrics.users.newThisWeek, hint: `${metrics.users.newThisMonth} this month` },
    { label: 'Daily active', value: metrics.active.daily, hint: `${metrics.active.weekly} weekly` },
    { label: 'Monthly active', value: metrics.active.monthly, hint: 'seen in the last 30 days' },
    { label: 'Workouts logged', value: metrics.training.workoutsLogged, hint: `${metrics.training.workoutsToday} today` },
    { label: 'PRs achieved', value: metrics.training.prsAchieved, hint: `${metrics.training.prsToday} today` },
    { label: 'Connections', value: metrics.social.connections, hint: 'accepted, both ways' },
    {
      label: 'Challenges',
      value: metrics.social.challengesCreated,
      hint: `${metrics.social.challengesCompleted} completed`,
    },
    { label: 'Subscriptions', value: metrics.revenue.activeSubscriptions, hint: 'active or trialing' },
    {
      label: 'Revenue this month',
      value: formatMinor(metrics.revenue.revenueMinorThisMonth, metrics.revenue.currency),
      hint: 'succeeded payments',
    },
    { label: 'Open reports', value: metrics.moderation.openReports, hint: 'awaiting review' },
  ];

  return (
    <>
      <div className={styles.metrics}>
        {tiles.map((tile) => (
          <article key={tile.label} className={`card ${styles.metric}`}>
            <span className={styles.metricLabel}>{tile.label}</span>
            <span className={`stat-number ${styles.metricValue}`}>{tile.value}</span>
            <span className={styles.metricHint}>{tile.hint}</span>
          </article>
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Last 30 days</h2>
      <div className={`card ${styles.panel}`}>
        <TrendChart
          labels={trends.map((t) => t.day)}
          series={[
            { key: 'workouts', label: 'Workouts', colour: '#ff6a3d', values: trends.map((t) => t.workouts) },
            { key: 'prs', label: 'PRs', colour: '#ffc53d', values: trends.map((t) => t.prs) },
            { key: 'signups', label: 'Signups', colour: '#6f7bff', values: trends.map((t) => t.signups) },
          ]}
        />
      </div>

      <h2 className={styles.sectionTitle}>Recent signups</h2>
      <RecentUsers />
    </>
  );
}

function RecentUsers() {
  const [rows, setRows] = useState<Awaited<ReturnType<ReturnType<typeof getClient>['adminUsers']>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getClient()
      .adminUsers({ limit: 8 })
      .then((users) => {
        if (!cancelled) setRows(users);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows) {
    return (
      <div className={`card ${styles.panel}`}>
        <div className={styles.skeleton} style={{ marginBottom: 10 }} />
        <div className={styles.skeleton} style={{ width: '80%' }} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={`card ${styles.empty}`}>
        <p>No users yet.</p>
      </div>
    );
  }

  return (
    <div className={`card ${styles.tableWrap}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>User</th>
            <th>Joined</th>
            <th>Last seen</th>
            <th className={styles.numeric}>Workouts</th>
            <th>Plan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.display_name ?? '—'}</strong>
                <br />
                <span style={{ color: 'var(--text-tertiary)' }}>@{row.username ?? '—'}</span>
              </td>
              <td>{relativeTime(row.created_at)}</td>
              <td>{relativeTime(row.last_seen_at)}</td>
              <td className={styles.numeric}>{row.workouts}</td>
              <td>{row.is_pro ? <span className="pill pill-accent">Pro</span> : <span className="pill">Free</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
