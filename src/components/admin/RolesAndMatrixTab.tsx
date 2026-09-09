import React, { useState } from 'react';
import {
  Shield,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  Sparkles,
  Info,
  Sliders,
  Check,
  X,
} from 'lucide-react';
import { RoleDefinition, Permission } from '../../types';
import { useTrading } from '../../context/TradingContext';
import { PERMISSION_METAS } from '../../lib/auth';

export const RolesAndMatrixTab: React.FC = () => {
  const {
    roles,
    createRole,
    updateRole,
    deleteRole,
    updatePermissionsMatrix,
    can,
  } = useTrading();

  const canManageRoles = can('roles:manage');
  const canEditMatrix = can('roles:matrix_edit');

  const [activeSubView, setActiveSubView] = useState<'matrix' | 'roles'>('matrix');
  const [matrixState, setMatrixState] = useState<Record<string, Permission[]>>(() => {
    const initial: Record<string, Permission[]> = {};
    roles.forEach((r) => {
      initial[r.id] = [...r.permissions];
    });
    return initial;
  });

  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<{
    id: string;
    name: string;
    description: string;
    hierarchyLevel: number;
    color: string;
    isEditing: boolean;
  }>({
    id: '',
    name: '',
    description: '',
    hierarchyLevel: 40,
    color: 'teal',
    isEditing: false,
  });

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pendingDeleteRole, setPendingDeleteRole] = useState<RoleDefinition | null>(null);

  // Group permissions by category
  const categories = Array.from(new Set(PERMISSION_METAS.map((m) => m.category)));

  const handleTogglePermission = (roleId: string, permKey: Permission) => {
    if (!canEditMatrix) return;

    if (roleId === 'super_admin' && (permKey === 'system:admin_screen' || permKey === 'roles:manage')) {
      return; // Root admin must keep admin screen & role management
    }

    setMatrixState((prev) => {
      const currentPerms = prev[roleId] || [];
      const hasPerm = currentPerms.includes(permKey);
      const updated = hasPerm
        ? currentPerms.filter((p) => p !== permKey)
        : [...currentPerms, permKey];
      return {
        ...prev,
        [roleId]: updated,
      };
    });
  };

  const handleToggleCategoryForRole = (roleId: string, category: string) => {
    if (!canEditMatrix) return;

    const categoryPerms = PERMISSION_METAS.filter((m) => m.category === category).map((m) => m.key);
    const currentPerms = matrixState[roleId] || [];
    const allAssigned = categoryPerms.every((p) => currentPerms.includes(p));

    let updated: Permission[];
    if (allAssigned) {
      // Uncheck all in category except root requirements for super_admin
      updated = currentPerms.filter((p) => {
        if (!categoryPerms.includes(p)) return true;
        if (roleId === 'super_admin' && (p === 'system:admin_screen' || p === 'roles:manage')) return true;
        return false;
      });
    } else {
      // Check all in category
      const set = new Set([...currentPerms, ...categoryPerms]);
      updated = Array.from(set);
    }

    setMatrixState((prev) => ({
      ...prev,
      [roleId]: updated,
    }));
  };

  const handleSaveMatrix = () => {
    if (!canEditMatrix) {
      setFeedback({ type: 'error', message: 'You do not have permission to update the permissions matrix.' });
      return;
    }

    const res = updatePermissionsMatrix(matrixState);
    setFeedback({ type: res.success ? 'success' : 'error', message: res.message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleOpenCreateRole = () => {
    if (!canManageRoles) {
      setFeedback({ type: 'error', message: 'You do not have permission to create roles.' });
      return;
    }

    setRoleForm({
      id: '',
      name: '',
      description: '',
      hierarchyLevel: 35,
      color: 'teal',
      isEditing: false,
    });
    setIsRoleModalOpen(true);
  };

  const handleOpenEditRole = (r: RoleDefinition) => {
    if (!canManageRoles) {
      setFeedback({ type: 'error', message: 'You do not have permission to edit roles.' });
      return;
    }

    setRoleForm({
      id: r.id,
      name: r.name,
      description: r.description,
      hierarchyLevel: r.hierarchyLevel,
      color: r.color || 'teal',
      isEditing: true,
    });
    setIsRoleModalOpen(true);
  };

  const handleSubmitRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageRoles) {
      setFeedback({ type: 'error', message: 'You do not have permission to manage roles.' });
      return;
    }

    if (roleForm.isEditing) {
      const res = updateRole(roleForm.id, {
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        hierarchyLevel: roleForm.hierarchyLevel,
        color: roleForm.color,
      });
      setFeedback({ type: res.success ? 'success' : 'error', message: res.message });
      if (res.success) setIsRoleModalOpen(false);
    } else {
      const roleId = roleForm.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (!roleId) {
        setFeedback({ type: 'error', message: 'Please provide a valid alphanumeric role ID.' });
        return;
      }
      const res = createRole({
        id: roleId,
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        hierarchyLevel: roleForm.hierarchyLevel,
        color: roleForm.color,
        isSystem: false,
        permissions: ['customers:view', 'products:view', 'bookings:view'],
      });
      setFeedback({ type: res.success ? 'success' : 'error', message: res.message });
      if (res.success) {
        setMatrixState((prev) => ({
          ...prev,
          [roleId]: ['customers:view', 'products:view', 'bookings:view'],
        }));
        setIsRoleModalOpen(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF9F6] dark:bg-[#162436] p-4 rounded-3xl border border-[#E5E5E1] dark:border-[#203248]">
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#101A26] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
          <button
            type="button"
            onClick={() => setActiveSubView('matrix')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubView === 'matrix'
                ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
            }`}
          >
            Permissions Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('roles')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubView === 'roles'
                ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
            }`}
          >
            Role Definitions ({roles.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubView === 'matrix' ? (
            <button
              type="button"
              onClick={handleSaveMatrix}
              disabled={!canEditMatrix}
              className="px-4 py-2 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Permissions Matrix</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenCreateRole}
              disabled={!canManageRoles}
              className="px-4 py-2 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" />
              <span>Create Custom Role</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2.5 ${
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

      {/* VIEW 1: Granular Permissions Matrix */}
      {activeSubView === 'matrix' && (
        <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-[#162436] border-b border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]">
                  <th className="px-5 py-4 font-bold uppercase tracking-wider text-[10px] w-80 sticky left-0 bg-[#FAF9F6] dark:bg-[#162436] z-10">
                    Feature & Permission Scope
                  </th>
                  {roles.map((r) => (
                    <th key={r.id} className="px-3 py-4 text-center font-bold text-[11px] min-w-[120px]">
                      <div className="text-[#111827] dark:text-white font-bold">{r.name}</div>
                      <div className="text-[9px] font-mono text-[#8E9299]">Level {r.hierarchyLevel}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0EE] dark:divide-[#1E2E40]">
                {categories.map((cat) => {
                  const permsInCat = PERMISSION_METAS.filter((m) => m.category === cat);
                  return (
                    <React.Fragment key={cat}>
                      {/* Category Group Header */}
                      <tr className="bg-[#FAF9F6]/80 dark:bg-[#162436]/60 border-y border-[#E5E5E1] dark:border-[#203248]">
                        <td
                          className="px-5 py-2.5 font-bold text-teal-800 dark:text-teal-300 text-xs uppercase tracking-wider sticky left-0 bg-[#FAF9F6] dark:bg-[#162436] z-10 flex items-center justify-between"
                        >
                          <span>{cat}</span>
                        </td>
                        {roles.map((r) => (
                          <td key={r.id} className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryForRole(r.id, cat)}
                              className="text-[10px] font-semibold text-[#8E9299] hover:text-teal-700 dark:hover:text-teal-300 underline"
                            >
                              Toggle
                            </button>
                          </td>
                        ))}
                      </tr>

                      {/* Individual Permissions in Category */}
                      {permsInCat.map((meta) => (
                        <tr key={meta.key} className="hover:bg-[#FAF9F6]/40 dark:hover:bg-[#162436]/30 transition-colors">
                          <td className="px-5 py-3 sticky left-0 bg-white dark:bg-[#101A26] z-10">
                            <div className="font-bold text-[#111827] dark:text-white">{meta.label}</div>
                            <div className="text-[11px] text-[#8E9299] dark:text-[#94A3B8] font-medium leading-tight">
                              {meta.description}
                            </div>
                          </td>
                          {roles.map((r) => {
                            const isChecked = (matrixState[r.id] || []).includes(meta.key);
                            const isLockedSuperAdmin =
                              r.id === 'super_admin' &&
                              (meta.key === 'system:admin_screen' || meta.key === 'roles:manage');

                            return (
                              <td key={r.id} className="px-3 py-3 text-center">
                                <label className="inline-flex items-center justify-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    disabled={isLockedSuperAdmin || !canEditMatrix}
                                    checked={isChecked}
                                    onChange={() => handleTogglePermission(r.id, meta.key)}
                                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: Role Definitions & Hierarchy */}
      {activeSubView === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((r) => (
            <div
              key={r.id}
              className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-5 shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-900 text-teal-700 dark:text-teal-400 flex items-center justify-center font-bold text-xs">
                      {r.hierarchyLevel}
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-[#111827] dark:text-white">{r.name}</h4>
                      <span className="text-[10px] font-mono text-[#8E9299]">id: {r.id}</span>
                    </div>
                  </div>

                  {r.isSystem ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      System
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-400">
                      Custom
                    </span>
                  )}
                </div>

                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] leading-relaxed">
                  {r.description}
                </p>

                <div className="mt-3 pt-3 border-t border-[#E5E5E1] dark:border-[#203248] flex items-center justify-between text-xs">
                  <span className="text-[#8E9299] font-medium">Granted Privileges</span>
                  <span className="font-mono font-bold text-[#111827] dark:text-white">
                    {r.permissions.length} actions
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E5E1] dark:border-[#203248]">
                <button
                  type="button"
                  onClick={() => handleOpenEditRole(r)}
                  disabled={!canManageRoles}
                  className="px-3 py-1.5 rounded-xl bg-[#FAF9F6] dark:bg-[#162436] text-[#374151] dark:text-[#CBD5E1] hover:text-teal-700 dark:hover:text-teal-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>

                {!r.isSystem && (
                  <button
                    type="button"
                    disabled={!canManageRoles}
                    onClick={() => setPendingDeleteRole(r)}
                    className="p-1.5 rounded-xl bg-[#FAF9F6] dark:bg-[#162436] text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role Create / Edit Modal */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#101A26] rounded-3xl border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 flex items-center justify-center border border-teal-200 dark:border-teal-900">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#111827] dark:text-white">
                  {roleForm.isEditing ? `Edit Role: ${roleForm.name}` : 'Create Custom Role'}
                </h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  Define role hierarchy and commercial responsibilities.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitRole} className="space-y-3">
              {!roleForm.isEditing && (
                <div>
                  <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                    Role Identifier Key *
                  </label>
                  <input
                    type="text"
                    required
                    value={roleForm.id}
                    onChange={(e) => setRoleForm({ ...roleForm, id: e.target.value })}
                    placeholder="e.g. branch_cashier"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  Role Title *
                </label>
                <input
                  type="text"
                  required
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="e.g. Branch Cashier"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  placeholder="Briefly describe what duties this role carries..."
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  Hierarchy Priority Level (1 - 100)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={roleForm.hierarchyLevel}
                  onChange={(e) => setRoleForm({ ...roleForm, hierarchyLevel: parseInt(e.target.value, 10) || 10 })}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                />
                <p className="text-[10px] text-[#8E9299] mt-1">Higher numbers inherit authority over lower numbers.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-[#6B7280]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold"
                >
                  {roleForm.isEditing ? 'Save Changes' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Role Confirmation */}
      {pendingDeleteRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#101A26] rounded-3xl border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-900">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#111827] dark:text-white">
                  Delete Role {pendingDeleteRole.name}?
                </h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  Users currently holding this role will revert to their fallback role.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteRole(null)}
                className="px-4 py-2 rounded-2xl text-xs font-semibold text-[#6B7280]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteRole(pendingDeleteRole.id);
                  setPendingDeleteRole(null);
                }}
                className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Delete Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
