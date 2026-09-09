import React, { useState } from 'react';
import {
  ShieldCheck,
  Users,
  Shield,
  Eye,
  Lock,
  ScrollText,
  Database,
  Sliders,
  Sparkles,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { UserManagementTab } from '../components/admin/UserManagementTab';
import { RolesAndMatrixTab } from '../components/admin/RolesAndMatrixTab';
import { VisibilitySettingsTab } from '../components/admin/VisibilitySettingsTab';
import { SecurityPolicyTab } from '../components/admin/SecurityPolicyTab';
import { SystemDataTab } from '../components/admin/SystemDataTab';
import { AuditLogTab } from '../components/admin/AuditLogTab';

type AdminTab = 'users' | 'roles' | 'visibility' | 'policy' | 'audit' | 'system';

export const AdminScreen: React.FC = () => {
  const { currentUser, can, users, roles, auditLogs } = useTrading();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  const hasAccess = can('system:admin_screen') || can('admin_screen') || currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  if (!hasAccess) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4">
        <div className="bg-white dark:bg-[#101A26] rounded-3xl border border-rose-200 dark:border-rose-900/60 p-8 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#111827] dark:text-white">Access Denied</h2>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] max-w-md mx-auto">
            You do not possess the required administrator permissions to view or configure the system control center. Please contact your system administrator.
          </p>
        </div>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    {
      id: 'users',
      label: 'User Accounts & Auth',
      icon: <Users className="w-4 h-4" />,
      badge: users.length,
    },
    {
      id: 'roles',
      label: 'Roles & RBAC Matrix',
      icon: <Shield className="w-4 h-4" />,
      badge: roles.length,
    },
    {
      id: 'visibility',
      label: 'Visibility & Masking',
      icon: <Eye className="w-4 h-4" />,
    },
    {
      id: 'policy',
      label: 'Security Policies',
      icon: <Lock className="w-4 h-4" />,
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      icon: <ScrollText className="w-4 h-4" />,
      badge: auditLogs.length,
    },
    {
      id: 'system',
      label: 'System & Backups',
      icon: <Database className="w-4 h-4" />,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E5E5E1] dark:border-[#203248]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-900 text-teal-800 dark:text-teal-300 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#111827] dark:text-white">
              Administrator Control Center
            </h1>
          </div>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1">
            Manage user authentication, granular access permissions, screen visibility, and security policies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[11px] font-semibold bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#374151] dark:text-[#CBD5E1]">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            <span>Admin Mode</span>
            <span className="text-[#8E9299]">({currentUser?.name})</span>
          </span>
        </div>
      </div>

      {/* Main Tab Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 border ${
                isActive
                  ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent shadow-xs'
                  : 'bg-white dark:bg-[#101A26] text-[#6B7280] dark:text-[#94A3B8] border-[#E5E5E1] dark:border-[#203248] hover:text-[#111827] dark:hover:text-white hover:border-teal-500/40'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
                    isActive
                      ? 'bg-teal-500/20 text-teal-300 dark:bg-teal-900/40 dark:text-teal-800'
                      : 'bg-[#FAF9F6] dark:bg-[#162436] text-[#8E9299]'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'roles' && <RolesAndMatrixTab />}
        {activeTab === 'visibility' && <VisibilitySettingsTab />}
        {activeTab === 'policy' && <SecurityPolicyTab />}
        {activeTab === 'audit' && <AuditLogTab />}
        {activeTab === 'system' && <SystemDataTab />}
      </div>
    </div>
  );
};
export default AdminScreen;
