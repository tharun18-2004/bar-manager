'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import PageHeader from '@/components/PageHeader';
import { authFetch } from '@/lib/auth-fetch';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';

interface AuditEntry {
  id?: string | number;
  actor_email: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  outcome: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AuditPage {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export default function OwnerAuditPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner'], { unauthorizedRedirect: '/pos' });
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditActor, setAuditActor] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditNextCursor, setAuditNextCursor] = useState<string | null>(null);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditPageStack, setAuditPageStack] = useState<Array<string | null>>([]);
  const auditLimit = 50;

  useEffect(() => {
    if (!isAuthorized) return;

    const fetchAuditLogs = async () => {
      setAuditLoading(true);
      setAuditError('');
      try {
        const params = new URLSearchParams();
        if (auditActor.trim()) params.set('actor', auditActor.trim());
        if (auditAction.trim()) params.set('action', auditAction.trim());
        if (auditDateFrom) params.set('date_from', auditDateFrom);
        if (auditDateTo) params.set('date_to', auditDateTo);
        params.set('limit', String(auditLimit));
        if (auditCursor) params.set('cursor', auditCursor);

        const query = params.toString();
        const res = await authFetch(`/api/audit${query ? `?${query}` : ''}`);
        const payload = await res.json();
        if (typeof payload.warning === 'string' && payload.warning.trim()) {
          setAuditError(payload.warning);
        }
        setAuditLogs(payload.data || []);
        const page = (payload.page || {
          limit: auditLimit,
          nextCursor: null,
          hasMore: false,
        }) as AuditPage;
        setAuditNextCursor(page.nextCursor ?? null);
        setAuditHasMore(Boolean(page.hasMore));
      } catch (error) {
        console.error('Failed to fetch audit logs:', error);
        setAuditError(formatError(error));
        setAuditNextCursor(null);
        setAuditHasMore(false);
      } finally {
        setAuditLoading(false);
      }
    };

    fetchAuditLogs();
  }, [isAuthorized, auditActor, auditAction, auditDateFrom, auditDateTo, auditCursor]);

  const resetAuditPagination = () => {
    setAuditCursor(null);
    setAuditNextCursor(null);
    setAuditHasMore(false);
    setAuditPageStack([]);
  };

  const handleAuditPrevious = () => {
    if (auditPageStack.length === 0) return;
    setAuditPageStack((prev) => {
      const next = [...prev];
      const previousCursor = next.pop() ?? null;
      setAuditCursor(previousCursor);
      return next;
    });
  };

  const handleAuditNext = () => {
    if (!auditHasMore || !auditNextCursor) return;
    setAuditPageStack((prev) => [...prev, auditCursor]);
    setAuditCursor(auditNextCursor);
  };

  if (isChecking) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <Sidebar role={role} />

      <div className="flex-1 flex flex-col">
        <PageHeader title="OWNER AUDIT LOG" role={role} />

        <div className="bg-slate-900 border-b border-slate-800 flex gap-6 px-6">
          <Link
            href="/owner"
            className="px-6 py-4 font-semibold uppercase text-sm transition border-b-2 border-transparent text-slate-300 hover:text-white"
          >
            Owner Dashboard
          </Link>
          <span className="px-6 py-4 font-semibold uppercase text-sm transition border-b-2 border-amber-400 text-amber-300">
            Audit Log
          </span>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-2xl font-bold mb-6">Audit Log</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                value={auditActor}
                onChange={(e) => {
                  setAuditActor(e.target.value);
                  resetAuditPagination();
                }}
                placeholder="Actor email contains..."
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
              />
              <input
                type="text"
                value={auditAction}
                onChange={(e) => {
                  setAuditAction(e.target.value);
                  resetAuditPagination();
                }}
                placeholder="Action (e.g. staff.update)"
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
              />
              <input
                type="date"
                value={auditDateFrom}
                onChange={(e) => {
                  setAuditDateFrom(e.target.value);
                  resetAuditPagination();
                }}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
              />
              <input
                type="date"
                value={auditDateTo}
                onChange={(e) => {
                  setAuditDateTo(e.target.value);
                  resetAuditPagination();
                }}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
              />
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-400">Showing up to {auditLimit} records per page.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleAuditPrevious}
                  disabled={auditLoading || auditPageStack.length === 0}
                  className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={handleAuditNext}
                  disabled={auditLoading || !auditHasMore || !auditNextCursor}
                  className="px-3 py-1.5 rounded bg-amber-500 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <div className="space-y-4">
              {auditLoading && <p className="text-slate-400 text-center py-8">Loading audit logs...</p>}
              {auditError && <p className="text-rose-300 text-center py-8">{auditError}</p>}
              {!auditLoading && !auditError && auditLogs.length === 0 && (
                <p className="text-slate-400 text-center py-8">No audit records found</p>
              )}
              {!auditLoading &&
                !auditError &&
                auditLogs.map((entry, index) => (
                  <div
                    key={`${entry.created_at}-${entry.action}-${entry.resource_id ?? 'none'}-${index}`}
                    className="border-l-4 border-amber-400 pl-4 py-2 bg-blue-900 bg-opacity-20 rounded px-4"
                  >
                    <p className="font-bold text-amber-300">{entry.action}</p>
                    <p className="text-slate-200 text-sm">
                      Actor: <span className="font-semibold">{entry.actor_email ?? 'unknown'}</span> | Resource:{' '}
                      <span className="font-semibold">{entry.resource}</span> | ID:{' '}
                      <span className="font-semibold">{entry.resource_id ?? 'n/a'}</span> | Outcome:{' '}
                      <span className="font-semibold">{entry.outcome}</span>
                    </p>
                    <p className="text-slate-400 text-xs">Time: {new Date(entry.created_at).toLocaleString()}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
