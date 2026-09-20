'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@rival/api-client';
import { getClient, relativeTime } from '@/lib/client';
import styles from './admin.module.css';

type AdminUser = Awaited<ReturnType<ReturnType<typeof getClient>['adminUsers']>>[number];

/** User management: search, inspect, suspend and reinstate. */
export function UsersPanel() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setError(null);
    try {
      setRows(await getClient().adminUsers({ search: term || undefined, limit: 50 }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load users.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    // Debounced so typing a name does not fire a request per keystroke.
    const timer = setTimeout(() => void load(search.trim()), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  async function setStatus(user: AdminUser, status: 'active' | 'suspended') {
    setBusyId(user.id);
    try {
      await getClient().adminSetUserStatus(user.id, status);
      setRows((current) => current?.map((row) => (row.id === user.id ? { ...row, status } : row)) ?? null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update that user.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className={styles.formRow} style={{ marginBottom: 20 }}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="user-search">
            Search by username, name or email
          </label>
          <input
            id="user-search"
            className={styles.input}
            type="search"
            value={search}
            placeholder="rahul"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!rows && (
        <div className={`card ${styles.panel}`}>
          <div className={styles.skeleton} style={{ marginBottom: 10 }} />
          <div className={styles.skeleton} style={{ width: '70%' }} />
        </div>
      )}

      {rows?.length === 0 && (
        <div className={`card ${styles.empty}`}>
          <p>No users match “{search}”.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className={`card ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Last seen</th>
                <th className={styles.numeric}>Workouts</th>
                <th>Plan</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.display_name ?? '—'}</strong>
                    <br />
                    <span style={{ color: 'var(--text-tertiary)' }}>@{row.username ?? '—'}</span>
                    {row.is_admin && (
                      <span className="pill pill-accent" style={{ marginLeft: 8, fontSize: '0.6rem' }}>
                        Admin
                      </span>
                    )}
                  </td>
                  <td>{row.email ?? '—'}</td>
                  <td>
                    <span className={row.status === 'active' ? styles.statusActive : styles.statusSuspended}>
                      {row.status}
                    </span>
                  </td>
                  <td>{relativeTime(row.created_at)}</td>
                  <td>{relativeTime(row.last_seen_at)}</td>
                  <td className={styles.numeric}>{row.workouts}</td>
                  <td>{row.is_pro ? <span className="pill pill-accent">Pro</span> : <span className="pill">Free</span>}</td>
                  <td>
                    {row.status === 'active' ? (
                      <button
                        type="button"
                        className={styles.btnDanger}
                        disabled={busyId === row.id}
                        onClick={() => void setStatus(row, 'suspended')}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.btnSm}
                        disabled={busyId === row.id}
                        onClick={() => void setStatus(row, 'active')}
                      >
                        Reinstate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
