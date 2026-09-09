import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  ShieldCheck,
  DollarSign,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { ActiveScreen, RoleVisibilitySettings, SensitiveFieldKey } from '../../types';
import { useTrading } from '../../context/TradingContext';
import { SENSITIVE_FIELDS_METAS } from '../../lib/auth';

const ALL_SCREENS: { id: ActiveScreen; label: string; description: string }[] = [
  { id: 'dashboard', label: 'Commercial Dashboard', description: 'Aggregated trade volume, monthly targets, and receivables.' },
  { id: 'customers', label: 'Customer Management', description: 'Customer directory, balances, and credit ledger overview.' },
  { id: 'suppliers', label: 'Supplier Management', description: 'Supplier registry and commodity payables.' },
  { id: 'products', label: 'Commodity Products', description: 'Stock catalog, base selling rates, and physical weight in kg.' },
  { id: 'bookings', label: 'Sales Bookings', description: 'Contract order bookings, broker fees, and remaining kg.' },
  { id: 'reports', label: 'Financial & Ops Reports', description: 'In-depth P&L statements, aging reports, and cash flow.' },
  { id: 'ops', label: 'Operational Alerts & Tasks', description: 'Overdue debtor alerts, low stock notices, and follow-ups.' },
  { id: 'admin', label: 'Admin Control Center', description: 'Security, audit trails, roles, and database management.' },
];

export const VisibilitySettingsTab: React.FC = () => {
  const { roles, visibilitySettings, updateVisibilitySettings } = useTrading();

  const [selectedRoleId, setSelectedRoleId] = useState<string>(() => roles[0]?.id || 'manager');
  const [localSettings, setLocalSettings] = useState<Record<string, RoleVisibilitySettings>>(() => {
    return JSON.parse(JSON.stringify(visibilitySettings));
  });

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const currentRoleSettings: RoleVisibilitySettings = localSettings[selectedRoleId] || {
    hiddenScreens: [],
    hiddenFields: [],
  };

  const handleToggleScreen = (screenId: ActiveScreen) => {
    if (selectedRoleId === 'super_admin' && screenId === 'admin') {
      return; // Cannot hide admin screen from super admin
    }

    setLocalSettings((prev) => {
      const roleSet = prev[selectedRoleId] || { hiddenScreens: [], hiddenFields: [] };
      const isHidden = roleSet.hiddenScreens.includes(screenId);
      const newHidden = isHidden
        ? roleSet.hiddenScreens.filter((s) => s !== screenId)
        : [...roleSet.hiddenScreens, screenId];

      return {
        ...prev,
        [selectedRoleId]: {
          ...roleSet,
          hiddenScreens: newHidden,
        },
      };
    });
  };

  const handleToggleField = (fieldKey: SensitiveFieldKey) => {
    setLocalSettings((prev) => {
      const roleSet = prev[selectedRoleId] || { hiddenScreens: [], hiddenFields: [] };
      const isHidden = roleSet.hiddenFields.includes(fieldKey);
      const newHidden = isHidden
        ? roleSet.hiddenFields.filter((f) => f !== fieldKey)
        : [...roleSet.hiddenFields, fieldKey];

      return {
        ...prev,
        [selectedRoleId]: {
          ...roleSet,
          hiddenFields: newHidden,
        },
      };
    });
  };

  const handleSave = () => {
    const res = updateVisibilitySettings(localSettings);
    setFeedback({ type: res.success ? 'success' : 'error', message: res.message });
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Role Picker Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF9F6] dark:bg-[#162436] p-4 rounded-3xl border border-[#E5E5E1] dark:border-[#203248]">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-[#111827] dark:text-white shrink-0">
            Configure Visibility for:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  selectedRoleId === r.id
                    ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent shadow-xs'
                    : 'bg-white dark:bg-[#101A26] text-[#374151] dark:text-[#CBD5E1] border-[#E5E5E1] dark:border-[#203248] hover:border-teal-500/50'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Save Visibility Settings</span>
        </button>
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

      {/* Screen-level visibility */}
      <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white">
                Screen-Level Navigation Visibility
              </h3>
              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                Choose which entire pages are visible in the top navigation bar for users with the{' '}
                <span className="font-bold text-[#111827] dark:text-white">
                  {roles.find((r) => r.id === selectedRoleId)?.name || selectedRoleId}
                </span>{' '}
                role.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {ALL_SCREENS.map((scr) => {
            const isHidden = currentRoleSettings.hiddenScreens.includes(scr.id);
            const isVisible = !isHidden;

            return (
              <div
                key={scr.id}
                onClick={() => handleToggleScreen(scr.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none ${
                  isVisible
                    ? 'bg-teal-50/40 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800/60 shadow-2xs'
                    : 'bg-[#FAF9F6] dark:bg-[#162436] border-[#E5E5E1] dark:border-[#203248] opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-[#111827] dark:text-white">{scr.label}</span>
                    {isVisible ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-teal-700 dark:text-teal-400 bg-teal-100/70 dark:bg-teal-900/50 px-2 py-0.5 rounded-full">
                        <Eye className="w-3 h-3" /> Visible
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        <EyeOff className="w-3 h-3" /> Hidden
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] leading-tight">
                    {scr.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Field-level visibility */}
      <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white">
                Field-Level Sensitive Data Masking
              </h3>
              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                Restrict confidential financial margins and balances from unauthorized roles.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {SENSITIVE_FIELDS_METAS.map((fld) => {
            const isHidden = currentRoleSettings.hiddenFields.includes(fld.key);
            const isVisible = !isHidden;

            return (
              <div
                key={fld.key}
                onClick={() => handleToggleField(fld.key)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none ${
                  isVisible
                    ? 'bg-teal-50/40 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800/60 shadow-2xs'
                    : 'bg-[#FAF9F6] dark:bg-[#162436] border-[#E5E5E1] dark:border-[#203248] opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-[#111827] dark:text-white">{fld.label}</span>
                    {isVisible ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-teal-700 dark:text-teal-400 bg-teal-100/70 dark:bg-teal-900/50 px-2 py-0.5 rounded-full">
                        <Eye className="w-3 h-3" /> Visible
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-100/70 dark:bg-rose-950/60 px-2 py-0.5 rounded-full">
                        <EyeOff className="w-3 h-3" /> Masked
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] leading-tight">
                    {fld.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
