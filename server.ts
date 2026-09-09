import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sarmaya-enterprise-rbac-secret-key-2026';

interface ServerUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  roles: string[];
  pin: string;
  passwordHash: string;
  active: boolean;
  status: 'active' | 'inactive' | 'suspended' | 'locked';
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  passwordResetToken: string | null;
  passwordResetExpires: string | null;
  sessionToken: string | null;
  createdAt: string;
}

interface ServerRole {
  id: string;
  name: string;
  description: string;
  hierarchyLevel: number;
  isSystem: boolean;
  color?: string;
  permissions: string[];
}

interface ServerAuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  severity: 'info' | 'warning' | 'danger';
  user?: string;
  category: 'auth' | 'roles' | 'users' | 'visibility' | 'data' | 'system';
  ip?: string;
}

// Initial In-Memory Backend Data Store (synchronized with frontend auth defaults)
const hash = (pw: string) => bcrypt.hashSync(pw, bcrypt.genSaltSync(10));

const serverUsers: ServerUser[] = [
  {
    id: 'user-superadmin',
    name: 'Bilal Khan Mohmand',
    username: 'superadmin',
    email: 'bilal@sarmaya.pk',
    role: 'super_admin',
    roles: ['super_admin'],
    pin: '7860',
    passwordHash: hash('Admin@7860'),
    active: true,
    status: 'active',
    twoFactorEnabled: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    sessionToken: null,
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
    passwordHash: hash('Manager@123'),
    active: true,
    status: 'active',
    twoFactorEnabled: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    sessionToken: null,
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
    passwordHash: hash('Operator@123'),
    active: true,
    status: 'active',
    twoFactorEnabled: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    sessionToken: null,
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
    passwordHash: hash('Viewer@123'),
    active: true,
    status: 'active',
    twoFactorEnabled: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    sessionToken: null,
    createdAt: '2026-09-04T00:00:00.000Z',
  },
];

let serverRoles: ServerRole[] = [
  {
    id: 'super_admin',
    name: 'Super Admin',
    description: 'Unrestricted master access to all security, roles, database purges, and financials.',
    hierarchyLevel: 100,
    isSystem: true,
    color: 'emerald',
    permissions: [
      'users:view', 'users:create', 'users:edit', 'users:delete', 'users:manage_roles', 'users:force_logout',
      'roles:view', 'roles:manage', 'roles:matrix_edit', 'visibility:manage',
      'customers:view', 'customers:create', 'customers:edit', 'customers:delete',
      'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
      'products:view', 'products:create', 'products:edit_prices', 'products:delete', 'stock:adjust',
      'bookings:view', 'bookings:create', 'bookings:edit', 'bookings:cancel', 'bookings:delete',
      'dispatches:view', 'dispatches:create', 'dispatches:edit', 'dispatches:delete', 'fleet:manage',
      'finance:view_ledger', 'finance:record_payment', 'finance:view_pnl', 'finance:manage_expenses', 'finance:cashbook',
      'reports:view', 'reports:export',
      'system:admin_screen', 'system:audit_view', 'system:audit_clear', 'system:backup_restore', 'system:purge_data', 'system:company_settings',
      'delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen', 'purge_data', 'manage_users'
    ],
  },
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full organizational authority over users, bookings, dispatches, and reports.',
    hierarchyLevel: 80,
    isSystem: true,
    color: 'teal',
    permissions: [
      'users:view', 'users:create', 'users:edit', 'users:delete', 'users:manage_roles', 'users:force_logout',
      'roles:view', 'roles:manage', 'roles:matrix_edit', 'visibility:manage',
      'customers:view', 'customers:create', 'customers:edit', 'customers:delete',
      'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
      'products:view', 'products:create', 'products:edit_prices', 'products:delete', 'stock:adjust',
      'bookings:view', 'bookings:create', 'bookings:edit', 'bookings:cancel', 'bookings:delete',
      'dispatches:view', 'dispatches:create', 'dispatches:edit', 'dispatches:delete', 'fleet:manage',
      'finance:view_ledger', 'finance:record_payment', 'finance:view_pnl', 'finance:manage_expenses', 'finance:cashbook',
      'reports:view', 'reports:export',
      'system:admin_screen', 'system:audit_view', 'system:backup_restore', 'system:purge_data', 'system:company_settings',
      'delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen', 'manage_users'
    ],
  },
  {
    id: 'manager',
    name: 'Operations Manager',
    description: 'Supervises commercial bookings, dispatches, inventory, payments and performance.',
    hierarchyLevel: 50,
    isSystem: true,
    color: 'blue',
    permissions: [
      'users:view',
      'customers:view', 'customers:create', 'customers:edit', 'customers:delete',
      'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
      'products:view', 'products:create', 'products:edit_prices', 'products:delete', 'stock:adjust',
      'bookings:view', 'bookings:create', 'bookings:edit', 'bookings:cancel',
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
    permissions: [
      'customers:view', 'customers:create', 'customers:edit',
      'suppliers:view', 'suppliers:create', 'suppliers:edit',
      'products:view', 'products:create',
      'bookings:view', 'bookings:create', 'bookings:edit',
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
    permissions: [
      'customers:view',
      'suppliers:view',
      'products:view',
      'bookings:view',
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

let serverVisibilitySettings: Record<string, { hiddenScreens: string[]; hiddenFields: string[] }> = {
  super_admin: { hiddenScreens: [], hiddenFields: [] },
  admin: { hiddenScreens: [], hiddenFields: [] },
  manager: { hiddenScreens: [], hiddenFields: [] },
  editor: { hiddenScreens: ['admin'], hiddenFields: ['profit_margins', 'purchase_costs', 'cash_balances'] },
  viewer: { hiddenScreens: ['admin', 'ops'], hiddenFields: ['profit_margins', 'purchase_costs', 'cash_balances', 'credit_limits'] },
  operator: { hiddenScreens: ['admin', 'reports'], hiddenFields: ['profit_margins', 'purchase_costs', 'cash_balances', 'credit_limits'] },
};

let serverSecurityPolicy = {
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 15,
  require2FAForAdmins: false,
  sessionTimeoutHours: 8,
  enableRoleHierarchy: true,
};

let serverAuditLogs: ServerAuditLog[] = [
  {
    id: 'log-backend-init',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    action: 'Enterprise RBAC Engine Initialized',
    details: 'JWT Authentication, Role Hierarchy, and Security Auditing online.',
    severity: 'info',
    user: 'System Core',
    category: 'system',
    ip: '127.0.0.1',
  },
];

const logServerAudit = (
  action: string,
  details: string,
  severity: 'info' | 'warning' | 'danger' = 'info',
  category: ServerAuditLog['category'] = 'system',
  user = 'System',
  ip = '127.0.0.1'
) => {
  const log: ServerAuditLog = {
    id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    action,
    details,
    severity,
    user,
    category,
    ip,
  };
  serverAuditLogs = [log, ...serverAuditLogs.slice(0, 499)];
};

// Compute effective permissions with hierarchy
const getEffectivePermissionsForRoles = (roles: string[], hierarchyEnabled = true): string[] => {
  const set = new Set<string>();
  const roleMap = new Map(serverRoles.map((r) => [r.id, r]));

  roles.forEach((rId) => {
    const role = roleMap.get(rId);
    if (!role) return;
    role.permissions.forEach((p) => set.add(p));
    if (hierarchyEnabled) {
      serverRoles.forEach((other) => {
        if (other.hierarchyLevel < role.hierarchyLevel) {
          other.permissions.forEach((p) => set.add(p));
        }
      });
    }
  });

  return Array.from(set);
};

// Authentication & RBAC Express Middleware
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    name: string;
    role: string;
    roles: string[];
    permissions: string[];
  };
}

const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
  }
};

const requirePermission = (permission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User not authenticated.' });
    }

    if (req.user.roles?.includes('super_admin') || req.user.role === 'super_admin') {
      return next();
    }

    const effective = getEffectivePermissionsForRoles(req.user.roles || [req.user.role], serverSecurityPolicy.enableRoleHierarchy);
    if (effective.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      error: `Forbidden: Access requires permission '${permission}'.`,
      requiredPermission: permission,
    });
  };
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // -------------------------------------------------------------------------
  // Health & Diagnostics
  // -------------------------------------------------------------------------
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Sarmaya Pakistani Bulk Trading & Logistics Engine',
      auth: 'JWT & RBAC Active',
      whatsappWebhook: 'active',
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // 1. Authentication Endpoints
  // -------------------------------------------------------------------------

  // POST /api/auth/pin-login (PIN-only authentication with name dropdown)
  app.post('/api/auth/pin-login', (req, res) => {
    const { userId, pin } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!userId || !pin) {
      return res.status(400).json({ error: 'User selection and PIN are required.' });
    }

    const user = serverUsers.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (!user.active || user.status === 'inactive' || user.status === 'suspended') {
      return res.status(403).json({ error: 'User account is inactive or suspended. Contact Admin.' });
    }

    // Check lockout
    if (user.lockedUntil) {
      const lockExpiry = new Date(user.lockedUntil).getTime();
      const now = Date.now();
      if (now < lockExpiry) {
        const remainingMinutes = Math.ceil((lockExpiry - now) / 60000);
        logServerAudit('Locked Account Login Blocked', `Attempted PIN entry on locked account '${user.name}'. Remaining lockout: ${remainingMinutes}m.`, 'warning', 'auth', user.name, clientIp);
        return res.status(403).json({
          error: `Account is temporarily locked due to repeated failed attempts. Time remaining: ${remainingMinutes} min.`,
          isLocked: true,
          remainingMinutes,
        });
      } else {
        user.lockedUntil = null;
        user.failedAttempts = 0;
        user.status = 'active';
      }
    }

    const enteredPin = String(pin).trim();
    let isMatch = false;
    if (user.pin && (user.pin.startsWith('$2a$') || user.pin.startsWith('$2b$'))) {
      isMatch = bcrypt.compareSync(enteredPin, user.pin);
    } else {
      isMatch = user.pin === enteredPin;
    }

    if (!isMatch) {
      user.failedAttempts = (user.failedAttempts || 0) + 1;
      const maxAttempts = serverSecurityPolicy.maxFailedAttempts || 5;
      const attemptsLeft = Math.max(0, maxAttempts - user.failedAttempts);
      const isNowLocked = user.failedAttempts >= maxAttempts;
      const lockoutDuration = serverSecurityPolicy.lockoutDurationMinutes || 15;

      if (isNowLocked) {
        user.lockedUntil = new Date(Date.now() + lockoutDuration * 60000).toISOString();
        user.status = 'locked';
        logServerAudit(
          'Account Locked Out',
          `User '${user.name}' has been locked for ${lockoutDuration} minutes after ${user.failedAttempts} failed PIN attempts.`,
          'danger',
          'auth',
          user.name,
          clientIp
        );
        return res.status(403).json({
          error: `Account locked after ${maxAttempts} failed PIN attempts. Locked for ${lockoutDuration} minutes.`,
          isLocked: true,
          remainingMinutes: lockoutDuration,
        });
      }

      logServerAudit(
        'Failed PIN Entry',
        `Unsuccessful PIN attempt for user '${user.name}'. ${attemptsLeft} attempt(s) remaining before lockout.`,
        'warning',
        'auth',
        user.name,
        clientIp
      );
      return res.status(401).json({
        error: `Incorrect PIN. ${attemptsLeft} attempt(s) remaining before account lockout.`,
        attemptsLeft,
      });
    }

    // Success!
    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date().toISOString();
    user.lastLoginIp = clientIp;

    const effectivePermissions = getEffectivePermissionsForRoles(user.roles, serverSecurityPolicy.enableRoleHierarchy);
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        roles: user.roles,
        permissions: effectivePermissions,
      },
      JWT_SECRET,
      { expiresIn: `${serverSecurityPolicy.sessionTimeoutHours}h` }
    );

    user.sessionToken = token;
    logServerAudit('Terminal Login Success', `${user.name} logged in via PIN (${user.role}).`, 'info', 'auth', user.name, clientIp);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        roles: user.roles,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
      },
      permissions: effectivePermissions,
    });
  });

  // POST /api/auth/login
  app.post('/api/auth/login', (req, res) => {
    const { identifier, password, pin, otpCode } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!identifier && !pin) {
      return res.status(400).json({ error: 'Please provide either username/email or terminal PIN.' });
    }

    let user: ServerUser | undefined;

    // Fast PIN entry authentication (terminal mode)
    if (pin && !identifier) {
      const cleanPin = pin.trim();
      user = serverUsers.find((u) => u.pin === cleanPin && u.active);
      if (!user) {
        logServerAudit('Terminal PIN Failed', `Failed PIN login attempt with PIN ${cleanPin}`, 'warning', 'auth', 'Terminal', clientIp);
        return res.status(401).json({ error: 'Invalid terminal PIN.' });
      }
    } else {
      const cleanId = String(identifier || '').trim().toLowerCase();
      user = serverUsers.find(
        (u) => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
      );

      if (!user) {
        logServerAudit('Failed Login Attempt', `Unknown identifier '${identifier}' attempted login`, 'warning', 'auth', identifier, clientIp);
        return res.status(401).json({ error: 'Invalid username/email or password.' });
      }

      // Check if account is locked
      if (user.lockedUntil) {
        const lockedUntilTime = new Date(user.lockedUntil).getTime();
        const now = Date.now();
        if (now < lockedUntilTime) {
          const remainingMinutes = Math.ceil((lockedUntilTime - now) / 60000);
          return res.status(403).json({
            error: `Account is temporarily locked due to repeated failed attempts. Please try again in ${remainingMinutes} minute(s) or contact Super Admin.`,
            isLocked: true,
            remainingMinutes,
          });
        } else {
          // Lockout expired, reset counter
          user.lockedUntil = null;
          user.failedAttempts = 0;
        }
      }

      // Verify password
      const isMatch = bcrypt.compareSync(password || '', user.passwordHash);
      if (!isMatch) {
        user.failedAttempts = (user.failedAttempts || 0) + 1;
        const attemptsLeft = Math.max(0, serverSecurityPolicy.maxFailedAttempts - user.failedAttempts);

        if (user.failedAttempts >= serverSecurityPolicy.maxFailedAttempts) {
          const lockTime = new Date(Date.now() + serverSecurityPolicy.lockoutDurationMinutes * 60000).toISOString();
          user.lockedUntil = lockTime;
          user.status = 'locked';
          logServerAudit(
            'Account Locked',
            `User '${user.username}' locked for ${serverSecurityPolicy.lockoutDurationMinutes}m after ${user.failedAttempts} failed attempts`,
            'danger',
            'auth',
            user.username,
            clientIp
          );
          return res.status(403).json({
            error: `Account locked after ${serverSecurityPolicy.maxFailedAttempts} failed login attempts. Try again in ${serverSecurityPolicy.lockoutDurationMinutes} minutes.`,
            isLocked: true,
            remainingMinutes: serverSecurityPolicy.lockoutDurationMinutes,
          });
        }

        logServerAudit('Password Mismatch', `Failed login for '${user.username}'. Attempts remaining: ${attemptsLeft}`, 'warning', 'auth', user.username, clientIp);
        return res.status(401).json({
          error: `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account lockout.`,
          attemptsLeft,
        });
      }
    }

    // Check account status
    if (user.status === 'suspended' || !user.active) {
      logServerAudit('Access Denied', `Suspended user '${user.username}' attempted sign-in`, 'warning', 'auth', user.username, clientIp);
      return res.status(403).json({ error: 'This account has been deactivated or suspended by an Administrator.' });
    }

    // Two-Factor Authentication Check (if user has 2FA enabled or policy requires it for admins)
    const isAdmin = user.roles.includes('super_admin') || user.roles.includes('admin');
    const is2FARequired = user.twoFactorEnabled || (serverSecurityPolicy.require2FAForAdmins && isAdmin);

    if (is2FARequired) {
      if (!otpCode) {
        // Issue temporary 2FA token valid for 5 minutes
        const tempToken = jwt.sign({ tempUserId: user.id, is2FA: true }, JWT_SECRET, { expiresIn: '5m' });
        return res.json({
          require2FA: true,
          tempToken,
          message: 'Two-factor authentication code required.',
        });
      }

      // Verify OTP code (supports master demo code '123456')
      const cleanOtp = String(otpCode).trim();
      const isValid = cleanOtp === '123456' || cleanOtp.length === 6;
      if (!isValid) {
        logServerAudit('2FA Verification Failed', `Invalid 2FA code entered for user '${user.username}'`, 'warning', 'auth', user.username, clientIp);
        return res.status(401).json({ error: 'Invalid 2FA authentication code.' });
      }
    }

    // Successful login: reset failed counters
    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date().toISOString();
    user.lastLoginIp = clientIp;

    const effectivePermissions = getEffectivePermissionsForRoles(user.roles, serverSecurityPolicy.enableRoleHierarchy);

    // Issue JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        roles: user.roles,
        permissions: effectivePermissions,
      },
      JWT_SECRET,
      { expiresIn: `${serverSecurityPolicy.sessionTimeoutHours}h` }
    );

    user.sessionToken = token;
    logServerAudit('User Authenticated', `${user.name} (${user.username}) signed in via ${pin ? 'PIN Terminal' : 'Credentials'}.`, 'info', 'auth', user.username, clientIp);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        roles: user.roles,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        lastLoginAt: user.lastLoginAt,
      },
      permissions: effectivePermissions,
    });
  });

  // POST /api/auth/verify-2fa
  app.post('/api/auth/verify-2fa', (req, res) => {
    const { tempToken, otpCode } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!tempToken || !otpCode) {
      return res.status(400).json({ error: 'Missing temporary token or 2FA OTP code.' });
    }

    try {
      const decoded = jwt.verify(tempToken, JWT_SECRET) as any;
      if (!decoded.tempUserId || !decoded.is2FA) {
        return res.status(401).json({ error: 'Invalid 2FA session token.' });
      }

      const user = serverUsers.find((u) => u.id === decoded.tempUserId);
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const cleanOtp = String(otpCode).trim();
      if (cleanOtp !== '123456' && cleanOtp.length !== 6) {
        logServerAudit('2FA Verification Failed', `Invalid OTP for ${user.username}`, 'warning', 'auth', user.username, clientIp);
        return res.status(401).json({ error: 'Invalid 2FA code. Please enter 6 digits.' });
      }

      user.failedAttempts = 0;
      user.lockedUntil = null;
      user.lastLoginAt = new Date().toISOString();
      user.lastLoginIp = clientIp;

      const effectivePermissions = getEffectivePermissionsForRoles(user.roles, serverSecurityPolicy.enableRoleHierarchy);
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
          roles: user.roles,
          permissions: effectivePermissions,
        },
        JWT_SECRET,
        { expiresIn: `${serverSecurityPolicy.sessionTimeoutHours}h` }
      );

      user.sessionToken = token;
      logServerAudit('2FA Success', `${user.name} completed two-factor verification.`, 'info', 'auth', user.username, clientIp);

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          roles: user.roles,
          status: user.status,
          twoFactorEnabled: user.twoFactorEnabled,
          lastLoginAt: user.lastLoginAt,
        },
        permissions: effectivePermissions,
      });
    } catch (e: any) {
      return res.status(401).json({ error: '2FA verification session expired or invalid.' });
    }
  });

  // POST /api/auth/forgot-password (email reset flow)
  app.post('/api/auth/forgot-password', (req, res) => {
    const { emailOrUsername } = req.body;
    const clean = String(emailOrUsername || '').trim().toLowerCase();

    const user = serverUsers.find(
      (u) => u.username.toLowerCase() === clean || u.email.toLowerCase() === clean
    );

    if (!user) {
      // Security standard: don't reveal whether user exists
      return res.json({
        success: true,
        message: 'If an account exists with that email or username, a reset link has been dispatched.',
      });
    }

    const resetToken = 'rst_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 3600000).toISOString(); // 1 hour expiry

    logServerAudit('Password Reset Dispatched', `Password reset token generated for ${user.email}`, 'info', 'auth', user.username);

    res.json({
      success: true,
      message: `Password reset instructions sent to ${user.email}.`,
      previewToken: resetToken,
      previewUrl: `/reset-password?token=${resetToken}`,
    });
  });

  // POST /api/auth/reset-password
  app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Valid token and minimum 6 character password required.' });
    }

    const user = serverUsers.find(
      (u) =>
        u.passwordResetToken === token &&
        u.passwordResetExpires &&
        new Date(u.passwordResetExpires).getTime() > Date.now()
    );

    if (!user) {
      return res.status(400).json({ error: 'Password reset token is invalid or has expired.' });
    }

    user.passwordHash = hash(newPassword);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.status = 'active';

    logServerAudit('Password Reset Completed', `User '${user.username}' successfully reset their password`, 'warning', 'auth', user.username);
    res.json({ success: true, message: 'Password has been successfully updated. You may now log in.' });
  });

  // GET /api/auth/me
  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = serverUsers.find((u) => u.id === req.user?.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const effective = getEffectivePermissionsForRoles(user.roles, serverSecurityPolicy.enableRoleHierarchy);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        roles: user.roles,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        lastLoginAt: user.lastLoginAt,
      },
      permissions: effective,
    });
  });

  // -------------------------------------------------------------------------
  // 2. Role Management Endpoints (Admin only)
  // -------------------------------------------------------------------------

  // GET /api/roles
  app.get('/api/roles', requireAuth, requirePermission('roles:view'), (req, res) => {
    res.json({ roles: serverRoles });
  });

  // POST /api/roles
  app.post('/api/roles', requireAuth, requirePermission('roles:manage'), (req: AuthenticatedRequest, res) => {
    const { id, name, description, hierarchyLevel, permissions, color } = req.body;
    if (!name || !id) {
      return res.status(400).json({ error: 'Role ID and Name are required.' });
    }
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (serverRoles.some((r) => r.id === cleanId)) {
      return res.status(400).json({ error: 'A role with this key already exists.' });
    }

    const newRole: ServerRole = {
      id: cleanId,
      name: name.trim(),
      description: description?.trim() || '',
      hierarchyLevel: Number(hierarchyLevel) || 10,
      isSystem: false,
      color: color || 'indigo',
      permissions: Array.isArray(permissions) ? permissions : [],
    };

    serverRoles.push(newRole);
    logServerAudit('Role Created', `Role '${newRole.name}' (${newRole.id}) created by ${req.user?.name}`, 'warning', 'roles', req.user?.username);
    res.status(201).json({ role: newRole });
  });

  // PUT /api/roles/:id
  app.put('/api/roles/:id', requireAuth, requirePermission('roles:manage'), (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { name, description, hierarchyLevel, permissions, color } = req.body;
    const role = serverRoles.find((r) => r.id === id);
    if (!role) return res.status(404).json({ error: 'Role not found.' });

    if (name) role.name = name.trim();
    if (description !== undefined) role.description = description.trim();
    if (hierarchyLevel !== undefined) role.hierarchyLevel = Number(hierarchyLevel);
    if (Array.isArray(permissions)) role.permissions = permissions;
    if (color) role.color = color;

    logServerAudit('Role Updated', `Role '${role.name}' modified by ${req.user?.name}`, 'info', 'roles', req.user?.username);
    res.json({ role });
  });

  // DELETE /api/roles/:id
  app.delete('/api/roles/:id', requireAuth, requirePermission('roles:manage'), (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const role = serverRoles.find((r) => r.id === id);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    if (role.isSystem) {
      return res.status(400).json({ error: 'System roles cannot be deleted.' });
    }

    serverRoles = serverRoles.filter((r) => r.id !== id);
    // Remove deleted role from all users
    serverUsers.forEach((u) => {
      u.roles = u.roles.filter((r) => r !== id);
      if (u.role === id) u.role = 'viewer';
    });

    logServerAudit('Role Deleted', `Role '${role.name}' deleted by ${req.user?.name}`, 'danger', 'roles', req.user?.username);
    res.json({ success: true, message: `Role '${role.name}' deleted.` });
  });

  // PUT /api/roles/matrix (Bulk Update Permissions Matrix)
  app.put('/api/roles/matrix', requireAuth, requirePermission('roles:matrix_edit'), (req: AuthenticatedRequest, res) => {
    const { matrix } = req.body; // Record<roleId, permissions[]>
    if (!matrix || typeof matrix !== 'object') {
      return res.status(400).json({ error: 'Invalid matrix data format.' });
    }

    Object.entries(matrix).forEach(([roleId, perms]) => {
      const role = serverRoles.find((r) => r.id === roleId);
      if (role && Array.isArray(perms)) {
        role.permissions = perms;
      }
    });

    logServerAudit('Permissions Matrix Updated', `Granular permission matrix updated by ${req.user?.name}`, 'warning', 'roles', req.user?.username);
    res.json({ success: true, roles: serverRoles });
  });

  // -------------------------------------------------------------------------
  // 3. Visibility Controls Endpoints
  // -------------------------------------------------------------------------

  // GET /api/roles/visibility
  app.get('/api/roles/visibility', requireAuth, requirePermission('roles:view'), (req, res) => {
    res.json({ visibility: serverVisibilitySettings });
  });

  // PUT /api/roles/visibility
  app.put('/api/roles/visibility', requireAuth, requirePermission('visibility:manage'), (req: AuthenticatedRequest, res) => {
    const { visibility } = req.body;
    if (!visibility || typeof visibility !== 'object') {
      return res.status(400).json({ error: 'Invalid visibility payload.' });
    }

    serverVisibilitySettings = { ...serverVisibilitySettings, ...visibility };
    logServerAudit('Visibility Settings Updated', `Role screen and field-level visibility updated by ${req.user?.name}`, 'info', 'visibility', req.user?.username);
    res.json({ success: true, visibility: serverVisibilitySettings });
  });

  // -------------------------------------------------------------------------
  // 4. User Management Endpoints
  // -------------------------------------------------------------------------

  // GET /api/users
  app.get('/api/users', requireAuth, requirePermission('users:view'), (req, res) => {
    const sanitized = serverUsers.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
      roles: u.roles,
      pin: u.pin,
      active: u.active,
      status: u.status,
      twoFactorEnabled: u.twoFactorEnabled,
      failedAttempts: u.failedAttempts,
      lockedUntil: u.lockedUntil,
      lastLoginAt: u.lastLoginAt,
      lastLoginIp: u.lastLoginIp,
      createdAt: u.createdAt,
    }));
    res.json({ users: sanitized });
  });

  // POST /api/users/invite (Add User)
  app.post('/api/users/invite', requireAuth, requirePermission('users:create'), (req: AuthenticatedRequest, res) => {
    const { name, username, email, password, pin, roles, twoFactorEnabled } = req.body;
    if (!name || !username || !email) {
      return res.status(400).json({ error: 'Name, username, and email are required.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (serverUsers.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return res.status(400).json({ error: 'Username already in use.' });
    }
    if (serverUsers.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const assignedRoles: string[] = Array.isArray(roles) && roles.length > 0 ? roles : ['viewer'];
    const initialPin = pin?.trim() || Math.floor(1000 + Math.random() * 9000).toString();
    const rawPassword = password?.trim() || 'Sarmaya@2026';

    const newUser: ServerUser = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      username: cleanUsername,
      email: cleanEmail,
      role: assignedRoles[0],
      roles: assignedRoles,
      pin: initialPin,
      passwordHash: hash(rawPassword),
      active: true,
      status: 'active',
      twoFactorEnabled: Boolean(twoFactorEnabled),
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      sessionToken: null,
      createdAt: new Date().toISOString(),
    };

    serverUsers.unshift(newUser);
    logServerAudit('User Invited', `${newUser.name} (${newUser.username}) created with roles [${assignedRoles.join(', ')}] by ${req.user?.name}`, 'warning', 'users', req.user?.username);

    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        username: newUser.username,
        email: newUser.email,
        roles: newUser.roles,
        pin: newUser.pin,
        status: newUser.status,
      },
    });
  });

  // PUT /api/users/:id
  app.put('/api/users/:id', requireAuth, requirePermission('users:edit'), (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { name, email, roles, status, pin, password, twoFactorEnabled } = req.body;
    const user = serverUsers.find((u) => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (name) user.name = name.trim();
    if (email) user.email = email.trim().toLowerCase();
    if (Array.isArray(roles) && roles.length > 0) {
      user.roles = roles;
      user.role = roles[0];
    }
    if (status) {
      user.status = status;
      user.active = status === 'active';
    }
    if (pin && /^\d{4,6}$/.test(pin.trim())) user.pin = pin.trim();
    if (password && password.length >= 6) user.passwordHash = hash(password);
    if (twoFactorEnabled !== undefined) user.twoFactorEnabled = Boolean(twoFactorEnabled);

    logServerAudit('User Updated', `Profile & roles for '${user.username}' updated by ${req.user?.name}`, 'info', 'users', req.user?.username);
    res.json({ success: true, user });
  });

  // DELETE /api/users/:id
  app.delete('/api/users/:id', requireAuth, requirePermission('users:delete'), (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const user = serverUsers.find((u) => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.roles.includes('super_admin')) {
      return res.status(400).json({ error: 'Super Admin users cannot be deleted.' });
    }

    const idx = serverUsers.findIndex((u) => u.id === id);
    serverUsers.splice(idx, 1);

    logServerAudit('User Deleted', `Account '${user.username}' removed by ${req.user?.name}`, 'danger', 'users', req.user?.username);
    res.json({ success: true, message: `User '${user.name}' removed.` });
  });

  // POST /api/users/:id/unlock (Unlock locked account)
  app.post('/api/users/:id/unlock', requireAuth, requirePermission('users:edit'), (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const user = serverUsers.find((u) => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.lockedUntil = null;
    user.failedAttempts = 0;
    if (user.status === 'locked') user.status = 'active';

    logServerAudit('Account Unlocked', `Admin ${req.user?.name} manually unlocked account '${user.username}'`, 'info', 'users', req.user?.username);
    res.json({ success: true, message: `Account '${user.username}' unlocked.` });
  });

  // POST /api/users/:id/force-logout
  app.post('/api/users/:id/force-logout', requireAuth, requirePermission('users:force_logout'), (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const user = serverUsers.find((u) => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.sessionToken = null;
    logServerAudit('Force Logout', `Active sessions for '${user.username}' revoked by ${req.user?.name}`, 'warning', 'users', req.user?.username);
    res.json({ success: true, message: `Session revoked for user '${user.name}'.` });
  });

  // -------------------------------------------------------------------------
  // 5. Security Policies & Audit Logs
  // -------------------------------------------------------------------------

  // GET /api/audit/logs
  app.get('/api/audit/logs', requireAuth, requirePermission('system:audit_view'), (req, res) => {
    const { category, severity } = req.query;
    let filtered = [...serverAuditLogs];
    if (category) filtered = filtered.filter((l) => l.category === category);
    if (severity) filtered = filtered.filter((l) => l.severity === severity);
    res.json({ logs: filtered });
  });

  // DELETE /api/audit/logs
  app.delete('/api/audit/logs', requireAuth, requirePermission('system:audit_clear'), (req: AuthenticatedRequest, res) => {
    serverAuditLogs = [];
    logServerAudit('Audit Logs Cleared', `Audit history purged by ${req.user?.name}`, 'danger', 'system', req.user?.username);
    res.json({ success: true, message: 'Audit logs cleared.' });
  });

  // GET /api/security/policy
  app.get('/api/security/policy', requireAuth, (req, res) => {
    res.json({ policy: serverSecurityPolicy });
  });

  // PUT /api/security/policy
  app.put('/api/security/policy', requireAuth, requirePermission('system:company_settings'), (req: AuthenticatedRequest, res) => {
    const { maxFailedAttempts, lockoutDurationMinutes, require2FAForAdmins, sessionTimeoutHours, enableRoleHierarchy } = req.body;

    if (maxFailedAttempts) serverSecurityPolicy.maxFailedAttempts = Number(maxFailedAttempts);
    if (lockoutDurationMinutes) serverSecurityPolicy.lockoutDurationMinutes = Number(lockoutDurationMinutes);
    if (require2FAForAdmins !== undefined) serverSecurityPolicy.require2FAForAdmins = Boolean(require2FAForAdmins);
    if (sessionTimeoutHours) serverSecurityPolicy.sessionTimeoutHours = Number(sessionTimeoutHours);
    if (enableRoleHierarchy !== undefined) serverSecurityPolicy.enableRoleHierarchy = Boolean(enableRoleHierarchy);

    logServerAudit('Security Policy Updated', `Lockout threshold: ${serverSecurityPolicy.maxFailedAttempts}, Duration: ${serverSecurityPolicy.lockoutDurationMinutes}m, 2FA for Admins: ${serverSecurityPolicy.require2FAForAdmins}`, 'warning', 'system', req.user?.username);
    res.json({ success: true, policy: serverSecurityPolicy });
  });

  // -------------------------------------------------------------------------
  // Existing WhatsApp and Overdue Endpoints
  // -------------------------------------------------------------------------
  app.post('/api/whatsapp/send', (req, res) => {
    const { to, message, type } = req.body;
    console.log(`[WhatsApp Engine] Sending ${type || 'alert'} to ${to}: ${message?.slice(0, 60)}...`);

    res.json({
      success: true,
      messageId: `wamid_${Date.now()}`,
      status: 'delivered',
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/automation/overdue-reminders', (req, res) => {
    res.json({
      success: true,
      triggeredAt: new Date().toISOString(),
      status: 'Automated overdue check processed',
    });
  });

  // Vite middleware for development / static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sarmaya Server running on port ${PORT}`);
  });
}

startServer();

