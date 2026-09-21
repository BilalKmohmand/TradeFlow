import React, { useEffect, useState } from 'react';
import { HardDriveDownload, RotateCcw, Trash2, Download, AlertTriangle, DatabaseBackup } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Notice, cardCls, secondaryBtn, primaryBtn, EmptyState, RowAction } from '../billing/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { formatDate } from '../../utils/formatters';
import { KEEP_AUTO_BACKUPS } from '../../lib/autoBackup';

const when = (iso: string) => `${formatDate(iso.slice(0, 10))} ${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
const size = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Admin → System & Backups: the automatic backups kept on this device, with restore. */
export const AutoBackupsPanel: React.FC = () => {
  const { autoBackups, refreshAutoBackups, backupNow, restoreAutoBackup, deleteAutoBackup, lastBackupDownloadAt, exportSystemBackup, can } = useTrading();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void refreshAutoBackups(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const canRestore = can('system:backup_restore');
  const run = async (fn: () => Promise<{ success: boolean; message: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    } finally {
      setBusy(false);
    }
  };
  const target = autoBackups.find((b) => b.id === pending);
  return (
    <section className={`${cardCls} p-4 sm:p-5 space-y-4`} data-testid="auto-backups">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-[#111827] dark:text-white flex items-center gap-2"><DatabaseBackup className="w-4 h-4 text-teal-700 dark:text-teal-300" /> Automatic backups on this device</h2>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mt-0.5">A backup is made every day when the app is open; the last {KEEP_AUTO_BACKUPS} are kept here. They stay on this phone / computer, so also download a backup now and then and keep it somewhere safe.</p>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1">Last downloaded backup: <strong>{lastBackupDownloadAt ? when(lastBackupDownloadAt) : 'never'}</strong></p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" disabled={busy} onClick={() => run(backupNow)} className={secondaryBtn}><HardDriveDownload className="w-4 h-4" /> Back up now</button>
          <button type="button" onClick={() => { exportSystemBackup(); setMsg({ kind: 'ok', text: 'Backup file downloaded.' }); }} className={primaryBtn}><Download className="w-4 h-4" /> Download backup</button>
        </div>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {autoBackups.length === 0 ? (
        <EmptyState compact icon={<DatabaseBackup className="w-5 h-5" />} text="No backups on this device yet. The first one is made a few seconds after you sign in, or tap “Back up now”." />
      ) : (
        <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]" aria-label="Backups on this device">
          {autoBackups.map((b) => (
            <li key={b.id} className="flex items-center gap-2 pl-3 pr-1.5 py-2" data-testid="auto-backup-row">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#111827] dark:text-white">{formatDate(b.date)} <span className="text-[11px] font-normal text-[#6B7280] dark:text-[#8E9299]">{b.kind === 'manual' ? 'made by hand' : 'daily'} • {when(b.createdAt)} • {size(b.size)}</span></div>
                {b.counts && <div className="text-[11px] text-[#6B7280] dark:text-[#8E9299] truncate">{b.counts.invoices ?? 0} bills • {b.counts.customers ?? 0} customers • {b.counts.products ?? 0} items • {b.counts.expenses ?? 0} expenses</div>}
              </div>
              {canRestore && <RowAction label={`Restore backup of ${formatDate(b.date)}`} text="Restore" tone="teal" icon={<RotateCcw className="w-4 h-4" />} onClick={() => setPending(b.id)} />}
              {canRestore && <RowAction label={`Remove backup of ${formatDate(b.date)}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => run(() => deleteAutoBackup(b.id))} />}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={Boolean(target)}
        title={`Restore the backup of ${target ? formatDate(target.date) : ''}?`}
        message="Everything in the app is replaced with this backup. Anything entered after it was made is lost (download a backup first if unsure)."
        confirmLabel="Restore backup"
        askReason={false}
        onCancel={() => setPending(null)}
        onConfirm={() => { const id = pending; setPending(null); if (id) void run(() => restoreAutoBackup(id)); }}
      />
    </section>
  );
};

/** Home: "No backup downloaded for 7 days" for whoever can download backups. */
export const BackupReminder: React.FC = () => {
  const { backupReminderDue, lastBackupDownloadAt, exportSystemBackup, can } = useTrading();
  const [hidden, setHidden] = useState(false);
  if (!backupReminderDue || hidden || !can('system:backup_restore')) return null;
  return (
    <div role="status" data-testid="backup-reminder" className="rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 hidden sm:block" />
      <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
        <strong>{lastBackupDownloadAt ? `No backup downloaded since ${formatDate(lastBackupDownloadAt.slice(0, 10))}.` : 'No backup downloaded yet.'}</strong> The app keeps daily backups on this device, but download one and keep it safe (e.g. on WhatsApp or a USB).
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setHidden(true)} className={secondaryBtn}>Later</button>
        <button type="button" onClick={() => exportSystemBackup()} className={primaryBtn}><Download className="w-4 h-4" /> Download backup</button>
      </div>
    </div>
  );
};
