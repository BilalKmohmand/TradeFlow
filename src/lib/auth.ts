import bcrypt from 'bcryptjs';
import {
  AppUser,
  ActiveScreen,
  Permission,
  RoleDefinition,
  RoleVisibilitySettings,
  SecurityPolicySettings,
  SensitiveFieldKey,
  StandardUserRole,
} from '../types';

export interface PermissionMeta {
  key: Permission;
  label: string;
  category: string;
  description: string;
}

export const PERMISSION_METAS: PermissionMeta[] = [
  // User Management
  { key: 'users:view', label: 'View Users', category: 'User Management', description: 'See user profiles, login records and account states' },
  { key: 'users:create', label: 'Create / Invite Users', category: 'User Management', description: 'Invite new staff and set initial roles and credentials' },
  { key: 'users:edit', label: 'Edit Users', category: 'User Management', description: 'Modify user profiles, credentials and account statuses' },
  { key: 'users:delete', label: 'Delete Users', category: 'User Management', description: 'Permanently remove user accounts from the directory' },
  { key: 'users:manage_roles', label: 'Assign Roles', category: 'User Management', description: 'Assign or reassign roles to user accounts' },
  { key: 'users:force_logout', label: 'Force Session Logout', category: 'User Management', description: 'Terminate active user sessions or lock accounts' },

  // Role Management
  { key: 'roles:view', label: 'View Roles', category: 'Role Management', description: 'View system and custom role definitions and hierarchy' },
  { key: 'roles:manage', label: 'Create & Edit Roles', category: 'Role Management', description: 'Create, update and delete custom organizational roles' },
  { key: 'roles:matrix_edit', label: 'Edit Permissions Matrix', category: 'Role Management', description: 'Configure granular permission checkboxes for each role' },

  // Visibility Controls
  { key: 'visibility:manage', label: 'Configure Visibility', category: 'Visibility Controls', description: 'Toggle screen and field-level visibility across roles' },

  // Customers
  { key: 'customers:view', label: 'View Customers', category: 'Customers', description: 'Browse customer list, contact details and ledger summaries' },
  { key: 'customers:create', label: 'Add Customers', category: 'Customers', description: 'Register new customers into the commercial system' },
  { key: 'customers:edit', label: 'Edit Customers', category: 'Customers', description: 'Update customer profiles, phone numbers and credit limits' },
  { key: 'customers:delete', label: 'Delete Customers', category: 'Customers', description: 'Remove customer records from the database' },

  // Suppliers
  { key: 'suppliers:view', label: 'View Suppliers', category: 'Suppliers', description: 'View supplier registry and payables ledger summaries' },
  { key: 'suppliers:create', label: 'Add Suppliers', category: 'Suppliers', description: 'Onboard new raw material and bulk suppliers' },
  { key: 'suppliers:edit', label: 'Edit Suppliers', category: 'Suppliers', description: 'Update supplier contacts and commodity categories' },
  { key: 'suppliers:delete', label: 'Delete Suppliers', category: 'Suppliers', description: 'Remove supplier accounts' },

  // Products & Inventory
  { key: 'products:view', label: 'View Inventory', category: 'Products & Stock', description: 'Monitor live warehouse stock levels in kg' },
  { key: 'products:create', label: 'Add Products', category: 'Products & Stock', description: 'Introduce new commodity catalog items' },
  { key: 'products:edit_prices', label: 'Edit Selling Prices', category: 'Products & Stock', description: 'Update base price per kg and historical price points' },
  { key: 'products:delete', label: 'Delete Products', category: 'Products & Stock', description: 'Delete commodity items from the catalog' },
  { key: 'stock:adjust', label: 'Adjust Stock Counts', category: 'Products & Stock', description: 'Record physical count variances, wastage and write-offs' },

  // Bookings & Trades
  { key: 'bookings:view', label: 'View Bookings', category: 'Bookings & Orders', description: 'Examine bulk contract bookings, terms and balances' },
  { key: 'bookings:create', label: 'Create Bookings', category: 'Bookings & Orders', description: 'Lock in new sales contract bookings for customers' },
  { key: 'bookings:edit', label: 'Edit Bookings', category: 'Bookings & Orders', description: 'Amend price per kg, delivery targets and broker notes' },
  { key: 'bookings:cancel', label: 'Cancel Bookings', category: 'Bookings & Orders', description: 'Void active bookings with recorded cancellation reasons' },
  { key: 'bookings:delete', label: 'Delete Bookings', category: 'Bookings & Orders', description: 'Hard delete trade booking records' },

  // Invoicing & Commercial Billing
  { key: 'billing:view', label: 'View Invoices & Billing', category: 'Invoicing & Billing', description: 'Access commercial bills, payment status and customer invoices' },
  { key: 'billing:create', label: 'Generate Invoices', category: 'Invoicing & Billing', description: 'Create commercial bills from confirmed bookings or items' },
  { key: 'billing:edit', label: 'Edit Draft Bills', category: 'Invoicing & Billing', description: 'Modify draft bills, discounts, taxes, and freight before finalizing' },
  { key: 'billing:delete', label: 'Void / Delete Invoices', category: 'Invoicing & Billing', description: 'Cancel or remove customer billing invoices' },

  // Dispatches & Fleet
  { key: 'dispatches:view', label: 'View Dispatches', category: 'Dispatches & Logistics', description: 'View dispatch challans and weighbridge tickets' },
  { key: 'dispatches:create', label: 'Dispatch Goods', category: 'Dispatches & Logistics', description: 'Record truck tare/gross weighbridge dispatches' },
  { key: 'dispatches:edit', label: 'Edit Dispatches', category: 'Dispatches & Logistics', description: 'Correct freight charges, taxes or delivery status' },
  { key: 'dispatches:delete', label: 'Delete Dispatches', category: 'Dispatches & Logistics', description: 'Delete dispatches and reverse customer ledger debits' },
  { key: 'fleet:manage', label: 'Manage Fleet', category: 'Dispatches & Logistics', description: 'Maintain vehicle fleet, driver contacts and statuses' },

  // Financials
  { key: 'finance:view_ledger', label: 'View Ledgers', category: 'Financials & Cashbook', description: 'Inspect double-entry debit/credit ledger transactions' },
  { key: 'finance:record_payment', label: 'Record Payments', category: 'Financials & Cashbook', description: 'Accept customer receipts or disburse supplier payments' },
  { key: 'finance:view_pnl', label: 'View Profit & Loss', category: 'Financials & Cashbook', description: 'Access revenue, gross margins and expense P&L breakdown' },
  { key: 'finance:manage_expenses', label: 'Manage Expenses', category: 'Financials & Cashbook', description: 'Record operating expenses, tolls, fuel and labor' },
  { key: 'finance:cashbook', label: 'Manage Cashbook', category: 'Financials & Cashbook', description: 'Track physical cash drawer movements and bank transfers' },

  // Reports
  { key: 'reports:view', label: 'View Analytics & Reports', category: 'Reports & Analytics', description: 'Access daily/monthly performance and aging charts' },
  { key: 'reports:export', label: 'Export Data (CSV)', category: 'Reports & Analytics', description: 'Export ledgers, customer records and financials to CSV' },

  // System Administration
  { key: 'system:admin_screen', label: 'Access Admin Screen', category: 'System Administration', description: 'Open the Administrator Control Center' },
  { key: 'system:audit_view', label: 'View Security Audit Log', category: 'System Administration', description: 'Inspect real-time security events and auth history' },
  { key: 'system:audit_clear', label: 'Clear Audit Log', category: 'System Administration', description: 'Wipe historical audit records from storage' },
  { key: 'system:backup_restore', label: 'Backup & Restore', category: 'System Administration', description: 'Download JSON snapshots or restore previous backups' },
  { key: 'system:purge_data', label: 'Purge Tables & Reset', category: 'System Administration', description: 'Execute table purges or full factory database resets' },
  { key: 'system:company_settings', label: 'Company Profile & Tax', category: 'System Administration', description: 'Change NTN/STRN, sales tax % and header info' },
];

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: 'super_admin',
    name: 'Super Admin',
    description: 'Unrestricted master access to all security, roles, database purges, and financials.',
    hierarchyLevel: 100,
    isSystem: true,
    color: 'emerald',
    badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    permissions: PERMISSION_METAS.map((m) => m.key).concat([
      'delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen', 'purge_data', 'manage_users'
    ]),
  },
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full organizational authority over users, bookings, dispatches, and reports.',
    hierarchyLevel: 80,
    isSystem: true,
    color: 'teal',
    badgeBg: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20',
    permissions: PERMISSION_METAS.filter((m) => m.key !== 'system:purge_data').map((m) => m.key).concat([
      'delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen', 'manage_users'
    ]),
  },
  {
    id: 'manager',
    name: 'Operations Manager',
    description: 'Supervises commercial bookings, dispatches, inventory, payments and performance.',
    hierarchyLevel: 50,
    isSystem: true,
    color: 'blue',
    badgeBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    permissions: [
      'users:view',
      'customers:view', 'customers:create', 'customers:edit', 'customers:delete',
      'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
      'products:view', 'products:create', 'products:edit_prices', 'products:delete', 'stock:adjust',
      'bookings:view', 'bookings:create', 'bookings:edit', 'bookings:cancel',
      'billing:view', 'billing:create', 'billing:edit',
      'dispatches:view', 'dispatches:create', 'dispatches:edit', 'fleet:manage',
      'finance:view_ledger', 'finance:record_payment', 'finance:view_pnl', 'finance:manage_expenses', 'finance:cashbook',
      'reports:view', 'reports:export',
      'system:admin_screen', 'system:audit_view',
      'delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen'
    ],
  },
  {
    id: 'editor',
    name: 'Trade Editor',
    description: 'Creates and amends sales bookings, dispatch weighbridge records and payment vouchers.',
    hierarchyLevel: 30,
    isSystem: true,
    color: 'amber',
    badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    permissions: [
      'customers:view', 'customers:create', 'customers:edit',
      'suppliers:view', 'suppliers:create', 'suppliers:edit',
      'products:view', 'products:create',
      'bookings:view', 'bookings:create', 'bookings:edit',
      'billing:view', 'billing:create',
      'dispatches:view', 'dispatches:create', 'dispatches:edit', 'fleet:manage',
      'finance:view_ledger', 'finance:record_payment', 'finance:cashbook',
      'reports:view',
      'manage_fleet', 'manage_expenses'
    ],
  },
  {
    id: 'viewer',
    name: 'Auditor / Viewer',
    description: 'Strict read-only oversight across transactions, bookings, and ledger entries.',
    hierarchyLevel: 10,
    isSystem: true,
    color: 'purple',
    badgeBg: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
    permissions: [
      'customers:view',
      'suppliers:view',
      'products:view',
      'bookings:view',
      'billing:view',
      'dispatches:view',
      'reports:view'
    ],
  },
  {
    id: 'operator',
    name: 'Weighbridge Operator',
    description: 'Records incoming trucks, tare weights, gross dispatches, and gate operations.',
    hierarchyLevel: 20,
    isSystem: true,
    color: 'slate',
    badgeBg: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20',
    permissions: [
      'customers:view', 'customers:create',
      'suppliers:view',
      'products:view',
      'bookings:view', 'bookings:create',
      'dispatches:view', 'dispatches:create', 'fleet:manage',
      'finance:record_payment',
      'manage_fleet', 'manage_expenses'
    ],
  },
];

export const SENSITIVE_FIELDS_METAS: { key: SensitiveFieldKey; label: string; description: string }[] = [
  {
    key: 'profit_margins',
    label: 'Profit Margins & Markups',
    description: 'Net profit figures, margin percentages, and per-kg markups in dashboard and reports.',
  },
  {
    key: 'cash_balances',
    label: 'Bank & Cash Drawer Balances',
    description: 'Cash-in-hand totals, cashbook drawer balances, and bank account values.',
  },
  {
    key: 'purchase_costs',
    label: 'Supplier Purchase Costs / COGS',
    description: 'Commodity procurement prices from suppliers and cost-of-goods breakdown.',
  },
  {
    key: 'credit_limits',
    label: 'Customer Credit Limits & Total Debt',
    description: 'Assigned customer credit ceilings and financial risk debt thresholds.',
  },
  {
    key: 'tax_details',
    label: 'NTN / STRN & Sales Tax Rates',
    description: 'FBR tax registration identifiers and sales tax percentage rates.',
  },
];

export const DEFAULT_VISIBILITY_SETTINGS: Record<string, RoleVisibilitySettings> = {
  super_admin: {
    hiddenScreens: [],
    hiddenFields: [],
  },
  admin: {
    hiddenScreens: [],
    hiddenFields: [],
  },
  manager: {
    hiddenScreens: [],
    hiddenFields: [],
  },
  editor: {
    hiddenScreens: ['admin'],
    hiddenFields: ['profit_margins', 'purchase_costs', 'cash_balances'],
  },
  viewer: {
    hiddenScreens: ['admin', 'ops'],
    hiddenFields: ['profit_margins', 'purchase_costs', 'cash_balances', 'credit_limits'],
  },
  operator: {
    hiddenScreens: ['admin', 'reports'],
    hiddenFields: ['profit_margins', 'purchase_costs', 'cash_balances', 'credit_limits'],
  },
};

export const DEFAULT_SECURITY_POLICY: SecurityPolicySettings = {
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 15,
  require2FAForAdmins: false,
  sessionTimeoutHours: 8,
  enableRoleHierarchy: true,
};

// ---------------------------------------------------------------------------
// Cryptographic Password Hashing & Verification via bcryptjs
// ---------------------------------------------------------------------------

export const hashPassword = (password: string): string => {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
};

export const verifyPassword = (password: string, hash: string): boolean => {
  try {
    return bcrypt.compareSync(password, hash);
  } catch (err) {
    console.error('Password verification error:', err);
    return false;
  }
};

export const hashPin = (pin: string): string => {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(pin.trim(), salt);
};

export const verifyPin = (enteredPin: string, storedHashOrPlain: string): boolean => {
  if (!enteredPin || !storedHashOrPlain) return false;
  const cleanEntered = enteredPin.trim();
  const cleanStored = storedHashOrPlain.trim();
  if (cleanStored.startsWith('$2a$') || cleanStored.startsWith('$2b$')) {
    try {
      return bcrypt.compareSync(cleanEntered, cleanStored);
    } catch {
      return false;
    }
  }
  return cleanEntered === cleanStored;
};

// Default seed users with pre-hashed PINs and passwords
export const INITIAL_DEMO_USERS: AppUser[] = [
  {
    id: 'user-superadmin',
    name: 'Bilal Khan Mohmand',
    username: 'superadmin',
    email: 'bilal@sarmaya.pk',
    role: 'super_admin',
    roles: ['super_admin'],
    pin: '7860',
    pinHash: hashPin('7860'),
    passwordHash: hashPassword('Admin@7860'),
    active: true,
    status: 'active',
    twoFactorEnabled: false,
    failedAttempts: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'user-manager',
    name: 'Rashid Minhas',
    username: 'rashid.ops',
    email: 'rashid@sarmaya.pk',
    role: 'manager',
    roles: ['manager'],
    pin: '1234',
    pinHash: hashPin('1234'),
    passwordHash: hashPassword('Manager@123'),
    active: true,
    status: 'active',
    twoFactorEnabled: false,
    failedAttempts: 0,
    createdAt: '2026-09-02T00:00:00.000Z',
  },
  {
    id: 'user-operator',
    name: 'Zahid Yard Weighbridge',
    username: 'zahid.weigh',
    email: 'zahid@sarmaya.pk',
    role: 'operator',
    roles: ['operator'],
    pin: '9876',
    pinHash: hashPin('9876'),
    passwordHash: hashPassword('Operator@123'),
    active: true,
    status: 'active',
    twoFactorEnabled: false,
    failedAttempts: 0,
    createdAt: '2026-09-03T00:00:00.000Z',
  },
  {
    id: 'user-viewer',
    name: 'Auditor Ayesha',
    username: 'ayesha.audit',
    email: 'ayesha@external-audit.com',
    role: 'viewer',
    roles: ['viewer'],
    pin: '5566',
    pinHash: hashPin('5566'),
    passwordHash: hashPassword('Viewer@123'),
    active: true,
    status: 'active',
    twoFactorEnabled: false,
    failedAttempts: 0,
    createdAt: '2026-09-04T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Multi-Role & Hierarchy Permission Evaluation
// ---------------------------------------------------------------------------

export const computeEffectivePermissions = (
  assignedRoles: string[],
  allRoles: RoleDefinition[],
  enableHierarchy = true
): Permission[] => {
  const permSet = new Set<Permission>();

  const roleMap = new Map<string, RoleDefinition>();
  allRoles.forEach((r) => roleMap.set(r.id, r));

  assignedRoles.forEach((roleId) => {
    const role = roleMap.get(roleId);
    if (!role) return;

    // Grant own permissions
    role.permissions.forEach((p) => permSet.add(p));

    // If role hierarchy is enabled, inherit permissions from roles with lower hierarchyLevel
    if (enableHierarchy) {
      allRoles.forEach((other) => {
        if (other.hierarchyLevel < role.hierarchyLevel) {
          other.permissions.forEach((p) => permSet.add(p));
        }
      });
    }
  });

  return Array.from(permSet);
};

export const hasPermission = (
  user: { role: string; roles?: string[] } | null | undefined,
  permission: Permission,
  allRoles: RoleDefinition[],
  enableHierarchy = true
): boolean => {
  if (!user) return false;
  const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
  if (roles.includes('super_admin')) return true;

  const effective = computeEffectivePermissions(roles, allRoles, enableHierarchy);
  if (effective.includes(permission)) return true;

  // Backwards compatibility legacy mapping
  if (permission === 'delete_records' && effective.includes('bookings:delete')) return true;
  if (permission === 'edit_prices' && effective.includes('products:edit_prices')) return true;
  if (permission === 'view_finance' && effective.includes('finance:view_ledger')) return true;
  if (permission === 'manage_fleet' && effective.includes('fleet:manage')) return true;
  if (permission === 'manage_expenses' && effective.includes('finance:manage_expenses')) return true;
  if (permission === 'admin_screen' && effective.includes('system:admin_screen')) return true;
  if (permission === 'purge_data' && effective.includes('system:purge_data')) return true;
  if (permission === 'manage_users' && effective.includes('users:manage_roles')) return true;

  return false;
};

// ---------------------------------------------------------------------------
// Visibility Checkers
// ---------------------------------------------------------------------------

export const isScreenVisibleForRoles = (
  roles: string[],
  screen: ActiveScreen,
  visibilitySettings: Record<string, RoleVisibilitySettings>
): boolean => {
  if (roles.includes('super_admin')) return true;
  // If ANY of the user's roles has visibility to the screen (i.e. it is not hidden in all roles), show it
  return roles.some((r) => {
    const setting = visibilitySettings[r];
    if (!setting) return true;
    return !setting.hiddenScreens.includes(screen);
  });
};

export const isFieldVisibleForRoles = (
  roles: string[],
  field: SensitiveFieldKey,
  visibilitySettings: Record<string, RoleVisibilitySettings>
): boolean => {
  if (roles.includes('super_admin')) return true;
  // If ANY assigned role allows viewing the field, it is visible
  return roles.some((r) => {
    const setting = visibilitySettings[r];
    if (!setting) return true;
    return !setting.hiddenFields.includes(field);
  });
};

// ---------------------------------------------------------------------------
// 2FA TOTP Simulation and Verification
// ---------------------------------------------------------------------------

/**
 * Standard 6-digit TOTP calculation helper based on current timestamp
 */
export const generateCurrentTOTP = (secret = 'SARMAYA2FASECRET'): string => {
  // Generates a deterministic 6-digit OTP based on 30-second time window
  const epoch = Math.floor(Date.now() / 30000);
  let hash = 0;
  const str = `${secret}-${epoch}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const code = Math.abs(hash) % 1000000;
  return code.toString().padStart(6, '0');
};

export const verifyTOTP = (enteredCode: string, secret = 'SARMAYA2FASECRET'): boolean => {
  const clean = enteredCode.trim();
  // Allow universal master test code '123456' or current/previous time window OTP
  if (clean === '123456') return true;

  const current = generateCurrentTOTP(secret);
  // Also check previous window (clock drift tolerance)
  const prevEpoch = Math.floor((Date.now() - 30000) / 30000);
  let hashPrev = 0;
  const strPrev = `${secret}-${prevEpoch}`;
  for (let i = 0; i < strPrev.length; i++) {
    hashPrev = (hashPrev << 5) - hashPrev + strPrev.charCodeAt(i);
    hashPrev |= 0;
  }
  const prevCode = (Math.abs(hashPrev) % 1000000).toString().padStart(6, '0');

  return clean === current || clean === prevCode;
};

// ---------------------------------------------------------------------------
// Password Reset Token Helper
// ---------------------------------------------------------------------------

export const generateResetToken = (): string => {
  return 'rst_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};
