'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@rival/api-client';
import { getClient, relativeTime } from '@/lib/client';
import styles from './admin.module.css';

type Report = Awaited<ReturnType<ReturnType<typeof getClient>['adminReports']>>[number];

const FILTERS = ['open', 'reviewing', 'resolved', 'dismissed', 'all'] as const;

/** Moderation queue. */
export function ReportsPanel() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('open');
  const [rows, setRows] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setRows(null);
    setError(null);
    try {
      setRows(await getClient().adminReports(status));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load reports.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function resolve(report: Report, status: 'reviewing' | 'resolved' | 'dismissed') {
    setBusyId(report.id);
    try {
      await getClient().adminResolveReport(report.id, status);
      await load(filter);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update that report.');
    } finally {
      setBusyId(null);
    }
  }

  async function suspend(report: Report) {
    setBusyId(report.id);
    try {
      await getClient().adminSetUserStatus(report.reported_id, 'suspended');
      await getClient().adminResolveReport(report.id, 'resolved', 'Account suspended.');
      await load(filter);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not suspend that account.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <nav className={styles.tabs} style={{ borderBottom: 'none', marginBottom: 12 }} aria-label="Report status">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            className={filter === option ? styles.tabActive : styles.tab}
            aria-current={filter === option ? 'true' : undefined}
            onClick={() => setFilter(option)}
          >
            {option}
          </button>
        ))}
      </nav>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!rows && (
        <div className={`card ${styles.panel}`}>
          <div className={styles.skeleton} style={{ marginBottom: 10 }} />
          <div className={styles.skeleton} style={{ width: '60%' }} />
        </div>
      )}

      {rows?.length === 0 && (
        <div className={`card ${styles.empty}`}>
          <p style={{ fontSize: '1.4rem', marginBottom: 8 }}>✅</p>
          <p>Nothing in the {filter} queue.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className={`card ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Reported</th>
                <th>Reason</th>
                <th>Details</th>
                <th>By</th>
                <th>Filed</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>@{row.reported_username ?? '—'}</strong>
                    {row.reported_count > 1 && (
                      <>
                        <br />
                        <span className="pill pill-behind" style={{ fontSize: '0.6rem', marginTop: 4 }}>
                          {row.reported_count} reports
                        </span>
                      </>
                    )}
                  </td>
                  <td>{row.reason.replace(/_/g, ' ')}</td>
                  <td style={{ maxWidth: 280 }}>{row.details ?? '—'}</td>
                  <td>@{row.reporter_username ?? 'deleted'}</td>
                  <td>{relativeTime(row.created_at)}</td>
                  <td>{row.status}</td>
                  <td style={{ whiteSpace: 'nowrap', display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={styles.btnSm}
                      disabled={busyId === row.id}
                      onClick={() => void resolve(row, 'dismissed')}
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      className={styles.btnSm}
                      disabled={busyId === row.id}
                      onClick={() => void resolve(row, 'resolved')}
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={busyId === row.id}
                      onClick={() => void suspend(row)}
                    >
                      Suspend
                    </button>
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
