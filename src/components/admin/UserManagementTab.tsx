import React, { useId, useMemo, useState } from 'react';
import { UserPlus, Pencil, Trash2, Lock, Unlock, Key, Search, CheckCircle2, AlertTriangle, Shield, Clock, RefreshCw, KeyRound } from 'lucide-react';
import { AppUser, UserRole, UserAccountStatus } from '../../types';
import { useTrading } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn } from '../billing/ui';
import { PasswordInput } from '../AuthGate';
import { hasLegacyCredential, hasPassword, lockoutMinutesLeft, MIN_PASSWORD_LENGTH, normalizeUsername } from '../../lib/password';

/** A readable temporary password (no 0/O, 1/l/I) from the browser's secure random source. */
export const generateTempPassword = (length = 10): string => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

type Feedback = { ok: boolean; text: string } | null;

const FeedbackBox: React.FC<{ feedback: Feedback }> = ({ feedback }) =>
  feedback ? (
    <div
      role={feedback.ok ? 'status' : 'alert'}
      className={`p-3 rounded-2xl text-xs font-semibold flex items-start gap-2 border ${
        feedback.ok
          ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800'
          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900'
      }`}
    >
      {feedback.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
      <span>{feedback.text}</span>
    </div>
  ) : null;

const TempPasswordField: React.FC<{ value: string; onChange: (v: string) => void; label?: string }> = ({ value, onChange, label = 'Temporary password' }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <PasswordInput id={id} value={value} onChange={onChange} autoComplete="new-password" />
        </div>
        <button type="button" onClick={() => onChange(generateTempPassword())} className={`${secondaryBtn} shrink-0 !px-3`} title="Make a random password">
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">Generate</span>
        </button>
      </div>
      <p className="mt-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
        At least {MIN_PASSWORD_LENGTH} characters. Give it to the person; they must choose their own password when they first sign in.
      </p>
    </div>
  );
};

interface EditForm {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  status: UserAccountStatus;
}

export const UserManagementTab: React.FC = () => {
  const { users, roles, currentUser, addUser, updateUser, deleteUser, unlockUserAccount, resetUserPassword, can } = useTrading();
  const canCreate = can('users:create');
  const canEdit = can('users:edit');
  const canDelete = can('users:delete');
  const ids = { name: useId(), username: useId(), role: useId(), status: useId() };

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Create staff
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', username: '', role: 'operator' as UserRole, password: '' });
  const [created, setCreated] = useState<{ username: string; password: string; name: string } | null>(null);
  const [createFeedback, setCreateFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  // Edit / reset / delete
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editFeedback, setEditFeedback] = useState<Feedback>(null);
  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetFeedback, setResetFeedback] = useState<Feedback>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AppUser | null>(null);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name || id;
  const assignableRoles = useMemo(
    () => roles.filter((r) => r.id !== 'super_admin' || currentUser?.role === 'super_admin' || currentUser?.roles?.includes('super_admin')),
    [roles, currentUser]
  );

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || u.name.toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter || (u.roles && u.roles.includes(roleFilter));
    return matchesSearch && matchesRole;
  });

  const openCreate = () => {
    const firstStaffRole = (assignableRoles.find((r) => r.id === 'operator') || assignableRoles[0])?.id || 'operator';
    setCreateForm({ name: '', username: '', role: firstStaffRole, password: generateTempPassword() });
    setCreated(null);
    setCreateFeedback(null);
    setIsCreateOpen(true);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setCreateFeedback(null);
    try {
      const res = await addUser({ name: createForm.name, username: createForm.username, role: createForm.role, password: createForm.password });
      if (res.success) setCreated({ username: normalizeUsername(createForm.username), password: createForm.password, name: createForm.name.trim() });
      else setCreateFeedback({ ok: false, text: res.message });
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (u: AppUser) => {
    setEditForm({ id: u.id, name: u.name, username: u.username || '', role: u.role, status: u.status === 'locked' ? 'active' : u.status || (u.active ? 'active' : 'inactive') });
    setEditFeedback(null);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;
    if (!editForm.name.trim()) {
      setEditFeedback({ ok: false, text: 'Enter a name.' });
      return;
    }
    const existing = users.find((u) => u.id === editForm.id);
    const keepExtraRoles = existing?.roles?.filter((r) => r !== existing.role) || [];
    const res = updateUser(editForm.id, {
      name: editForm.name.trim(),
      username: editForm.username,
      role: editForm.role,
      roles: [editForm.role, ...keepExtraRoles.filter((r) => r !== editForm.role)],
      status: editForm.status,
      active: editForm.status === 'active',
    });
    if (res.success) setEditForm(null);
    else setEditFeedback({ ok: false, text: res.message });
  };

  const openReset = (u: AppUser) => {
    setResetUser(u);
    setResetPassword(generateTempPassword());
    setResetFeedback(null);
    setResetDone(null);
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser || busy) return;
    setBusy(true);
    try {
      const res = await resetUserPassword(resetUser.id, resetPassword);
      if (res.success) setResetDone(resetPassword);
      else setResetFeedback({ ok: false, text: res.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF9F6] dark:bg-[#162436] p-4 rounded-3xl border border-[#E5E5E1] dark:border-[#203248]">
        <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md">
          <div className="relative w-full min-w-0">
            <Search className="w-4 h-4 text-[#8E9299] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search users"
              placeholder="Search by name or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#111827] dark:text-white focus:outline-hidden min-w-0"
          >
            <option value="all">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2.5 rounded-2xl bg-[#111827] dark:bg-white hover:bg-black dark:hover:bg-slate-100 text-white dark:text-[#111827] text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0"
          >
            <UserPlus className="w-4 h-4 text-teal-400 dark:text-teal-700" />
            <span>Add staff</span>
          </button>
        )}
      </div>

      {/* Users table */}
      <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="users-table">
            <thead className="bg-[#FAF9F6] dark:bg-[#162436] border-b border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]">
              <tr>
                <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[10px]">Name &amp; username</th>
                <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-[10px]">Role</th>
                <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-[10px]">Status</th>
                <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-[10px]">Last sign-in</th>
                <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0EE] dark:divide-[#1E2E40]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-[#8E9299]">
                    No users match.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isLocked = lockoutMinutesLeft(user) > 0;
                  const isSelf = currentUser?.id === user.id;
                  const active = user.active !== false && user.status !== 'inactive' && user.status !== 'suspended';
                  return (
                    <tr key={user.id} data-testid={`user-row-${user.username}`} className="hover:bg-[#FAF9F6]/60 dark:hover:bg-[#162436]/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-900/60 text-teal-800 dark:text-teal-300 font-bold flex items-center justify-center text-sm shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-[#111827] dark:text-white flex items-center gap-1.5 truncate">
                              <span>{user.name}</span>
                              {isSelf && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">You</span>}
                            </div>
                            <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] font-mono truncate">@{user.username || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1 items-center">
                          {(user.roles && user.roles.length > 0 ? user.roles : [user.role]).map((rId) => (
                            <span
                              key={rId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#374151] dark:text-[#CBD5E1]"
                            >
                              <Shield className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400" />
                              <span>{roleName(rId)}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                              <Lock className="w-2.5 h-2.5" /> Locked out
                            </span>
                          ) : active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              Switched off
                            </span>
                          )}
                          {hasLegacyCredential(user) ? (
                            <span title="Signs in once with the old PIN, then chooses a password" className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                              Old PIN – password not set
                            </span>
                          ) : user.mustChangePassword ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                              Temporary password
                            </span>
                          ) : !hasPassword(user) ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              No password
                            </span>
                          ) : null}
                        </div>
                        {user.failedAttempts ? (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-1">{user.failedAttempts} wrong attempt(s)</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-[#8E9299] dark:text-[#94A3B8] font-mono whitespace-nowrap">
                        {user.lastLoginAt ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-teal-600" />
                            <span>
                              {new Date(user.lastLoginAt).toLocaleDateString()} {new Date(user.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ) : (
                          <span>Never</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isLocked && canEdit && (
                            <button
                              type="button"
                              onClick={() => unlockUserAccount(user.id)}
                              title="Unlock account now"
                              aria-label={`Unlock ${user.username}`}
                              className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 transition-colors"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEdit && !isSelf && (
                            <button
                              type="button"
                              onClick={() => openReset(user)}
                              title="Reset password"
                              aria-label={`Reset password for ${user.username}`}
                              className="p-1.5 rounded-xl bg-[#FAF9F6] dark:bg-[#162436] text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 border border-[#E5E5E1] dark:border-[#203248] transition-colors"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEdit(user)}
                              title="Edit user"
                              aria-label={`Edit ${user.username}`}
                              className="p-1.5 rounded-xl bg-[#FAF9F6] dark:bg-[#162436] text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 border border-[#E5E5E1] dark:border-[#203248] transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && !isSelf && (
                            <button
                              type="button"
                              onClick={() => setPendingDelete(user)}
                              title="Delete user"
                              aria-label={`Delete ${user.username}`}
                              className="p-1.5 rounded-xl bg-[#FAF9F6] dark:bg-[#162436] text-[#6B7280] dark:text-[#94A3B8] hover:text-rose-600 hover:bg-rose-50 border border-[#E5E5E1] dark:border-[#203248] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] leading-relaxed px-1">
        Staff sign in with their username and password. New accounts and reset passwords are temporary: the person must choose their own password at their next
        sign-in. People who used a PIN before sign in once with their username and old PIN, then choose a password.
      </p>

      {/* Create staff */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title={created ? 'Account created' : 'Add staff'} subtitle={created ? undefined : 'They sign in with this username and the temporary password.'}>
        {created ? (
          <div className="space-y-4" data-testid="staff-created">
            <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Give these sign-in details to {created.name}. They will choose their own password when they first sign in.</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm p-4 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248]">
              <dt className="text-[#6B7280] dark:text-[#94A3B8]">Username</dt>
              <dd className="font-mono font-bold text-[#111827] dark:text-white break-all">{created.username}</dd>
              <dt className="text-[#6B7280] dark:text-[#94A3B8]">Temporary password</dt>
              <dd className="font-mono font-bold text-[#111827] dark:text-white break-all">{created.password}</dd>
            </dl>
            <div className="flex justify-end">
              <button type="button" className={primaryBtn} onClick={() => setIsCreateOpen(false)}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitCreate} className="space-y-3.5" noValidate>
            <div>
              <label htmlFor={ids.name} className={labelCls}>
                Full name
              </label>
              <input id={ids.name} className={inputCls} value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. Zahid Khan" />
            </div>
            <div>
              <label htmlFor={ids.username} className={labelCls}>
                Username
              </label>
              <input
                id={ids.username}
                className={`${inputCls} font-mono`}
                value={createForm.username}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                placeholder="e.g. zahid"
              />
            </div>
            <div>
              <label htmlFor={ids.role} className={labelCls}>
                Role
              </label>
              <select id={ids.role} className={inputCls} value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <TempPasswordField value={createForm.password} onChange={(v) => setCreateForm({ ...createForm, password: v })} />
            <FeedbackBox feedback={createFeedback} />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <button type="button" className={secondaryBtn} onClick={() => setIsCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={primaryBtn} disabled={busy}>
                <UserPlus className="w-4 h-4" /> {busy ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit user */}
      <Modal isOpen={Boolean(editForm)} onClose={() => setEditForm(null)} title="Edit user" subtitle="Name, username, role and whether the account can sign in.">
        {editForm && (
          <form onSubmit={submitEdit} className="space-y-3.5" noValidate>
            <div>
              <label htmlFor={`${ids.name}-e`} className={labelCls}>
                Full name
              </label>
              <input id={`${ids.name}-e`} className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`${ids.username}-e`} className={labelCls}>
                Username
              </label>
              <input
                id={`${ids.username}-e`}
                className={`${inputCls} font-mono`}
                autoCapitalize="none"
                spellCheck={false}
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${ids.role}-e`} className={labelCls}>
                  Role
                </label>
                <select id={`${ids.role}-e`} className={inputCls} value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  {(assignableRoles.some((r) => r.id === editForm.role) ? assignableRoles : [...assignableRoles, ...roles.filter((r) => r.id === editForm.role)]).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${ids.status}-e`} className={labelCls}>
                  Can sign in?
                </label>
                <select
                  id={`${ids.status}-e`}
                  className={inputCls}
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as UserAccountStatus })}
                >
                  <option value="active">Yes (active)</option>
                  <option value="inactive">No (switched off)</option>
                </select>
              </div>
            </div>
            <FeedbackBox feedback={editFeedback} />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <button type="button" className={secondaryBtn} onClick={() => setEditForm(null)}>
                Cancel
              </button>
              <button type="submit" className={primaryBtn}>
                Save changes
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reset password */}
      <Modal isOpen={Boolean(resetUser)} onClose={() => setResetUser(null)} title={`Reset password for ${resetUser?.name || ''}`} subtitle={`@${resetUser?.username || ''}`}>
        {resetUser &&
          (resetDone ? (
            <div className="space-y-4" data-testid="reset-done">
              <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
                Give this temporary password to {resetUser.name}. They must choose a new password when they next sign in.
              </p>
              <div className="p-4 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] font-mono font-bold text-[#111827] dark:text-white break-all">
                {resetDone}
              </div>
              <div className="flex justify-end">
                <button type="button" className={primaryBtn} onClick={() => setResetUser(null)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submitReset} className="space-y-3.5" noValidate>
              <TempPasswordField value={resetPassword} onChange={setResetPassword} />
              <FeedbackBox feedback={resetFeedback} />
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                <button type="button" className={secondaryBtn} onClick={() => setResetUser(null)}>
                  Cancel
                </button>
                <button type="submit" className={primaryBtn} disabled={busy}>
                  <KeyRound className="w-4 h-4" /> {busy ? 'Saving…' : 'Set temporary password'}
                </button>
              </div>
            </form>
          ))}
      </Modal>

      {/* Delete */}
      <Modal isOpen={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title={`Remove ${pendingDelete?.name || ''}?`} subtitle="They will no longer be able to sign in. The audit log keeps their name.">
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={() => setPendingDelete(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={dangerBtn}
            onClick={() => {
              if (pendingDelete) deleteUser(pendingDelete.id);
              setPendingDelete(null);
            }}
          >
            <Trash2 className="w-4 h-4" /> Delete account
          </button>
        </div>
      </Modal>
    </div>
  );
};
