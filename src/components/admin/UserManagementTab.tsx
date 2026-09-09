import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  LogOut,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Shield,
  Clock,
  Sparkles,
  Key,
} from 'lucide-react';
import { AppUser, UserRole, UserAccountStatus } from '../../types';
import { useTrading } from '../../context/TradingContext';

interface UserFormData {
  id: string | null;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  pin: string;
  password?: string;
  status: UserAccountStatus;
  twoFactorEnabled: boolean;
}

export const UserManagementTab: React.FC = () => {
  const {
    users,
    roles,
    currentUser,
    addUser,
    createRole,
    updateUser,
    deleteUser,
    unlockUserAccount,
    forceLogoutUser,
    can,
    requestPasswordReset,
  } = useTrading();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resetModalUser, setResetModalUser] = useState<AppUser | null>(null);
  const [newDirectPassword, setNewDirectPassword] = useState('');
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [formData, setFormData] = useState<UserFormData>({
    id: null,
    name: '',
    username: '',
    email: '',
    role: 'operator',
    roles: ['operator'],
    pin: '',
    password: '',
    status: 'active',
    twoFactorEnabled: false,
  });

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<AppUser | null>(null);
  const [newRoleName, setNewRoleName] = useState('');

  const canManageRoles = can('roles:manage');

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole =
      roleFilter === 'all' ||
      u.role === roleFilter ||
      (u.roles && u.roles.includes(roleFilter));

    return matchesSearch && matchesRole;
  });

  const handleOpenCreate = () => {
    setFormData({
      id: null,
      name: '',
      username: '',
      email: '',
      role: roles[0]?.id || 'operator',
      roles: [roles[0]?.id || 'operator'],
      pin: '',
      password: '',
      status: 'active',
      twoFactorEnabled: false,
    });
    setFeedback(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: AppUser) => {
    setFormData({
      id: user.id,
      name: user.name,
      username: user.username || '',
      email: user.email || '',
      role: user.role,
      roles: user.roles && user.roles.length > 0 ? user.roles : [user.role],
      pin: '',
      password: '',
      status: user.status || (user.active ? 'active' : 'inactive'),
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
    });
    setFeedback(null);
    setIsModalOpen(true);
  };

  const toggleRoleSelection = (roleId: string) => {
    setFormData((prev) => {
      const exists = prev.roles.includes(roleId);
      const newRoles = exists
        ? prev.roles.filter((r) => r !== roleId)
        : [...prev.roles, roleId];
      // Ensure at least one role remains
      const finalRoles = newRoles.length > 0 ? newRoles : [roleId];
      return {
        ...prev,
        roles: finalRoles,
        role: finalRoles[0],
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (formData.id) {
      // Update existing user
      const updatePayload: Partial<AppUser> = {
        name: formData.name.trim(),
        username: formData.username.trim().toLowerCase(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        roles: formData.roles,
        active: formData.status === 'active',
        status: formData.status,
        twoFactorEnabled: formData.twoFactorEnabled,
      };

      if (formData.pin) {
        updatePayload.pin = formData.pin;
      }
      if (formData.password) {
        updatePayload.passwordHash = formData.password; // context hashes or compares
      }

      const res = updateUser(formData.id, updatePayload);
      setFeedback({ type: res.success ? 'success' : 'error', message: res.message });
      if (res.success) {
        setTimeout(() => setIsModalOpen(false), 900);
      }
    } else {
      // Create new user
      if (!formData.pin) {
        setFeedback({ type: 'error', message: 'A 4 to 6-digit terminal PIN is required.' });
        return;
      }
      const res = addUser({
        name: formData.name.trim(),
        username: formData.username.trim().toLowerCase() || formData.name.toLowerCase().replace(/\s+/g, ''),
        email: formData.email.trim().toLowerCase() || `${formData.name.toLowerCase().replace(/\s+/g, '')}@sarmaya.pk`,
        role: formData.role,
        roles: formData.roles,
        pin: formData.pin,
        password: formData.password || 'User@123456',
        twoFactorEnabled: formData.twoFactorEnabled,
      });
      setFeedback({ type: res.success ? 'success' : 'error', message: res.message });
      if (res.success) {
        setTimeout(() => setIsModalOpen(false), 900);
      }
    }
  };

  const handleCreateRoleInline = () => {
    if (!canManageRoles) {
      setFeedback({ type: 'error', message: 'You do not have permission to create roles.' });
      return;
    }

    const cleanName = newRoleName.trim();
    if (!cleanName) {
      setFeedback({ type: 'error', message: 'Enter a role name first.' });
      return;
    }

    const roleId = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!roleId) {
      setFeedback({ type: 'error', message: 'Role name must contain letters or numbers.' });
      return;
    }

    const existing = roles.find((r) => r.id === roleId || r.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      setFormData((prev) => {
        if (prev.roles.includes(existing.id)) return prev;
        return {
          ...prev,
          roles: [...prev.roles, existing.id],
          role: prev.role || existing.id,
        };
      });
      setNewRoleName('');
      setFeedback({ type: 'success', message: `Role "${existing.name}" already exists and has been selected.` });
      return;
    }

    const res = createRole({
      id: roleId,
      name: cleanName,
      description: `${cleanName} custom role`,
      hierarchyLevel: 25,
      color: 'teal',
      isSystem: false,
      permissions: ['customers:view', 'products:view', 'bookings:view'],
    });

    setFeedback({ type: res.success ? 'success' : 'error', message: res.message });
    if (!res.success) return;

    setFormData((prev) => ({
      ...prev,
      roles: prev.roles.includes(roleId) ? prev.roles : [...prev.roles, roleId],
      role: prev.role || roleId,
    }));
    setNewRoleName('');
  };

  const handleDirectPasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    if (newDirectPassword.length < 6) {
      setResetFeedback({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }
    const res = updateUser(resetModalUser.id, {
      passwordHash: newDirectPassword,
      failedAttempts: 0,
      lockedUntil: null,
      status: 'active',
    });
    setResetFeedback({ type: res.success ? 'success' : 'error', message: 'Password successfully updated.' });
    if (res.success) {
      setTimeout(() => {
        setResetModalUser(null);
        setNewDirectPassword('');
        setResetFeedback(null);
      }, 1200);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF9F6] dark:bg-[#162436] p-4 rounded-3xl border border-[#E5E5E1] dark:border-[#203248]">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-[#8E9299] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, username, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#111827] dark:text-white focus:outline-hidden"
          >
            <option value="all">All Roles ({roles.length})</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-4 py-2.5 rounded-2xl bg-[#111827] dark:bg-white hover:bg-black dark:hover:bg-slate-100 text-white dark:text-[#111827] text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0"
        >
          <UserPlus className="w-4 h-4 text-teal-400 dark:text-teal-700" />
          <span>Add New User</span>
        </button>
      </div>

      {/* Users table / list */}
      <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF9F6] dark:bg-[#162436] border-b border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]">
              <tr>
                <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[10px]">User & Identity</th>
                <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-[10px]">Roles & Permissions</th>
                <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-[10px]">Status & Security</th>
                <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-[10px]">Last Active</th>
                <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0EE] dark:divide-[#1E2E40]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-[#8E9299]">
                    No users matching the filter criteria found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isLocked = Boolean(
                    user.status === 'locked' ||
                    (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now())
                  );

                  return (
                    <tr key={user.id} className="hover:bg-[#FAF9F6]/60 dark:hover:bg-[#162436]/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-900/60 text-teal-800 dark:text-teal-300 font-bold flex items-center justify-center text-sm shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-[#111827] dark:text-white flex items-center gap-1.5 truncate">
                              <span>{user.name}</span>
                              {currentUser?.id === user.id && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#8E9299] dark:text-[#94A3B8] font-mono truncate">
                              @{user.username || 'n/a'} • {user.email || 'No email'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1 items-center">
                          {(user.roles && user.roles.length > 0 ? user.roles : [user.role]).map((rId) => {
                            const roleDef = roles.find((r) => r.id === rId);
                            return (
                              <span
                                key={rId}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#374151] dark:text-[#CBD5E1]"
                              >
                                <Shield className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400" />
                                <span>{roleDef ? roleDef.name : rId}</span>
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {isLocked ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                                <Lock className="w-2.5 h-2.5" /> Locked Out
                              </span>
                            ) : user.active ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                Suspended
                              </span>
                            )}

                            {user.twoFactorEnabled && (
                              <span
                                title="Two-Factor Authentication Active"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
                              >
                                <ShieldCheck className="w-2.5 h-2.5" /> 2FA
                              </span>
                            )}
                          </div>

                          {user.failedAttempts && user.failedAttempts > 0 ? (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                              {user.failedAttempts} failed login attempt(s)
                            </div>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-[11px] text-[#8E9299] dark:text-[#94A3B8] font-mono">
                        {user.lastLoginAt ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-teal-600" />
                            <span>{new Date(user.lastLoginAt).toLocaleDateString()} {new Date(user.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ) : (
                          <span>Never signed in</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isLocked && (
                            <button
                              type="button"
                              onClick={() => unlockUserAccount(user.id)}
                              title="Unlock account immediately"
                              className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 transition-colors"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setResetModalUser(user);
                              setNewDirectPassword('');
                              setResetFeedback(null);
                            }}
                            title="Reset Password"
                            className="p-1.5 rounded-xl bg-[#FAF9F6] dark:bg-[#162436] text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 border border-[#E5E5E1] dark:border-[#203248] transition-colors"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => forceLogoutUser(user.id)}
                            title="Revoke session token / Force Logout"
                            className="p-1.5 rounded-xl bg-[#FAF9F6] dark:bg-[#162436] text-[#6B7280] dark:text-[#94A3B8] hover:text-rose-600 hover:bg-rose-50 border border-[#E5E5E1] dark:border-[#203248] transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(user)}
                            title="Edit User Profile"
                            className="p-1.5 rounded-xl bg-[#FAF9F6] dark:bg-[#162436] text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 border border-[#E5E5E1] dark:border-[#203248] transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {user.username !== 'superadmin' && user.id !== 'user-super-admin' && (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteUser(user)}
                              title="Delete User"
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

      {/* User Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl bg-white dark:bg-[#101A26] rounded-[32px] border border-[#E5E5E1] dark:border-[#203248] p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E5E1] dark:border-[#203248] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-900 text-teal-800 dark:text-teal-300 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827] dark:text-white">
                    {formData.id ? 'Edit User Account' : 'Register New User'}
                  </h3>
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                    Configure credentials, roles, and authentication security.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs font-semibold text-[#8E9299] hover:text-[#111827] dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Tariq Mehmood"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. tariq_trade"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                    Work Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="tariq@sarmaya.pk"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              </div>

              {/* Roles Multi-Assignment */}
              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  Assigned Roles (Select one or more)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248]">
                  {roles.map((role) => {
                    const isSelected = formData.roles.includes(role.id);
                    return (
                      <button
                        type="button"
                        key={role.id}
                        onClick={() => toggleRoleSelection(role.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent shadow-xs'
                            : 'bg-white dark:bg-[#101A26] text-[#4B5563] dark:text-[#CBD5E1] border-[#E5E5E1] dark:border-[#203248] hover:border-teal-500/40'
                        }`}
                      >
                        <span className="truncate">{role.name}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Add new role (e.g. branch_cashier)"
                    className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/40"
                  />
                  <button
                    type="button"
                    onClick={handleCreateRoleInline}
                    disabled={!canManageRoles}
                    className="px-3.5 py-2 rounded-xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Add Role
                  </button>
                </div>
                <p className="text-[11px] text-[#8E9299] dark:text-[#94A3B8] mt-1">
                  Primary role determines default portal view; all granted permissions merge accumulatively.
                </p>
              </div>

              {/* Security Credentials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                    Terminal PIN {formData.id ? '(Leave blank to keep)' : '*'}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required={!formData.id}
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                    placeholder={formData.id ? '••••' : '4 to 6 digits (e.g. 1234)'}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                    Account Password {formData.id ? '(Leave blank to keep)' : '*'}
                  </label>
                  <input
                    type="password"
                    required={!formData.id}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={formData.id ? '••••••••' : 'Min 6 chars (e.g. Pass@123)'}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              </div>

              {/* 2FA & Account Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248]">
                  <div>
                    <div className="text-xs font-bold text-[#111827] dark:text-white">Two-Factor Authentication</div>
                    <div className="text-[10px] text-[#8E9299]">Require 6-digit TOTP code on login</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.twoFactorEnabled}
                    onChange={(e) => setFormData({ ...formData, twoFactorEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                    Account Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as UserAccountStatus })}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#111827] dark:text-white focus:outline-hidden"
                  >
                    <option value="active">Active (Full Access)</option>
                    <option value="inactive">Inactive (Disabled)</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              {feedback && (
                <div
                  className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2 ${
                    feedback.type === 'success'
                      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E5E1] dark:border-[#203248]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:bg-[#FAF9F6] dark:hover:bg-[#162436]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold shadow-xs hover:bg-black dark:hover:bg-slate-100 transition-all active:scale-95"
                >
                  {formData.id ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#101A26] rounded-3xl border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 flex items-center justify-center border border-teal-200 dark:border-teal-900">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#111827] dark:text-white">
                  Reset Password for {resetModalUser.name}
                </h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  Set a new bcrypt-encrypted password and reset failed attempts.
                </p>
              </div>
            </div>

            <form onSubmit={handleDirectPasswordReset} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newDirectPassword}
                  onChange={(e) => setNewDirectPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                />
              </div>

              {resetFeedback && (
                <div
                  className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2 ${
                    resetFeedback.type === 'success'
                      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {resetFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{resetFeedback.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-[#6B7280]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation */}
      {pendingDeleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#101A26] rounded-3xl border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-900">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#111827] dark:text-white">
                  Remove User {pendingDeleteUser.name}?
                </h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  They will permanently lose access to Sarmaya terminal and APIs. Past audit logs will retain their name.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteUser(null)}
                className="px-4 py-2 rounded-2xl text-xs font-semibold text-[#6B7280]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteUser(pendingDeleteUser.id);
                  setPendingDeleteUser(null);
                }}
                className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
