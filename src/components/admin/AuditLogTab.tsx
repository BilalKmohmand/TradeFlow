import React, { useState } from 'react';
import {
  ScrollText,
  Search,
  Download,
  Trash2,
  Filter,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  Clock,
  User,
} from 'lucide-react';
import { AuditLogEntry, AuditCategory, AuditSeverity } from '../../types';
import { useTrading } from '../../context/TradingContext';

export const AuditLogTab: React.FC = () => {
  const { auditLogs, clearAuditLogs, can } = useTrading();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.details.toLowerCase().includes(search.toLowerCase()) ||
      (log.user && log.user.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      categoryFilter === 'all' || (log.category || 'system') === categoryFilter;

    const matchesSeverity =
      severityFilter === 'all' || log.severity === severityFilter;

    return matchesSearch && matchesCategory && matchesSeverity;
  });

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Severity', 'Category', 'User', 'Action', 'Details'];
    const rows = filteredLogs.map((l) => [
      `"${l.timestamp}"`,
      `"${l.severity}"`,
      `"${l.category || 'system'}"`,
      `"${(l.user || '').replace(/"/g, '""')}"`,
      `"${(l.action || '').replace(/"/g, '""')}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sarmaya-audit-log-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSeverityBadge = (sev: AuditSeverity) => {
    switch (sev) {
      case 'danger':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Danger
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Warning
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400 border border-teal-200 dark:border-teal-900">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> Info
          </span>
        );
    }
  };

  const getCategoryBadge = (cat?: AuditCategory) => {
    const c = cat || 'system';
    return (
      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase font-mono tracking-wider bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#4B5563] dark:text-[#CBD5E1]">
        {c}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF9F6] dark:bg-[#162436] p-4 rounded-3xl border border-[#E5E5E1] dark:border-[#203248]">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-4 h-4 text-[#8E9299] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search action, details, user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#111827] dark:text-white focus:outline-hidden"
          >
            <option value="all">All Categories</option>
            <option value="auth">Auth & Sessions</option>
            <option value="roles">Roles & RBAC</option>
            <option value="users">Users</option>
            <option value="visibility">Visibility Controls</option>
            <option value="data">Data & Transactions</option>
            <option value="system">System & Security</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#111827] dark:text-white focus:outline-hidden"
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="danger">Danger</option>
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {can('system:audit_clear') && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={auditLogs.length === 0}
              className="px-3.5 py-2 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-100 disabled:opacity-40 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Log</span>
            </button>
          )}
        </div>
      </div>

      {/* Audit Log Entries List */}
      <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] overflow-hidden shadow-xs">
        <div className="max-h-[560px] overflow-y-auto divide-y divide-[#F0F0EE] dark:divide-[#1E2E40]">
          {filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#8E9299]">
              No audit logs recorded for the selected search filters.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAF9F6]/50 dark:hover:bg-[#162436]/40 transition-colors"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {getSeverityBadge(log.severity)}
                    {getCategoryBadge(log.category)}
                    <span className="font-bold text-xs text-[#111827] dark:text-white">
                      {log.action}
                    </span>
                    {log.user && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-900">
                        <User className="w-2.5 h-2.5" />
                        <span>{log.user}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#4B5563] dark:text-[#CBD5E1] leading-relaxed break-words">
                    {log.details}
                  </p>
                </div>

                <div className="text-[11px] font-mono text-[#8E9299] dark:text-[#94A3B8] shrink-0 sm:text-right flex items-center sm:flex-col sm:items-end gap-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#8E9299]" />
                    {log.timestamp}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#101A26] rounded-3xl border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-900">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#111827] dark:text-white">
                  Clear Security Audit Log?
                </h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  This will erase all recorded security, authentication, and transaction entries.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-2xl text-xs font-semibold text-[#6B7280]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAuditLogs();
                  setShowClearConfirm(false);
                }}
                className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Erase Log History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
