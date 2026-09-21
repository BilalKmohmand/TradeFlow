import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimate } from 'motion/react';
import { AlertTriangle, ArrowRight, Eye, EyeOff, KeyRound, Lock, LogOut, Moon, ShieldCheck, Store, Sun, Truck, UserRound } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useTheme } from '../context/ThemeContext';
import { hasLegacyCredential, MIN_PASSWORD_LENGTH } from '../lib/password';

/**
 * Everything shown before the app opens: create the owner account (empty device), sign in,
 * the lock screen and the forced "choose a new password" step. Replaces the old PIN gate.
 */

const inputCls =
  'w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-3 text-sm font-semibold text-[#111827] dark:text-white focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 placeholder:font-normal placeholder:text-[#9CA3AF] disabled:opacity-60';
const labelCls = 'block text-xs font-bold text-[#374151] dark:text-[#CBD5E1] mb-1.5';
const primaryBtn =
  'w-full py-3.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-sm font-bold shadow-lg hover:bg-black dark:hover:bg-slate-100 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer';
const linkBtn = 'text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer';

const Field: React.FC<{ label: string; hint?: string; children: (id: string) => React.ReactNode }> = ({ label, hint, children }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{hint}</p>}
    </div>
  );
};

export const PasswordInput: React.FC<{
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}> = ({ id, value, onChange, autoComplete, disabled, autoFocus, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`${inputCls} pr-12`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 px-3.5 flex items-center text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white cursor-pointer"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

const ErrorBox: React.FC<{ message: string | null }> = ({ message }) => (
  <AnimatePresence>
    {message && (
      <motion.div
        role="alert"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="px-3.5 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start gap-2"
      >
        <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
        <span>{message}</span>
      </motion.div>
    )}
  </AnimatePresence>
);

const Spinner = () => <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />;

/** Run an async submit with a busy flag and a friendly error on unexpected failures. */
const useSubmit = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const run = async (fn: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const err = await fn();
      if (err) {
        setError(err);
        setShake((n) => n + 1);
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, shake, run };
};

const Card: React.FC<{ icon: React.ReactNode; badge: string; title: string; subtitle: React.ReactNode; shake: number; children: React.ReactNode; testId: string }> = ({
  icon,
  badge,
  title,
  subtitle,
  shake,
  children,
  testId,
}) => {
  // Shake on a wrong answer without remounting (so focus stays in the field).
  const [scope, animate] = useAnimate();
  useEffect(() => {
    if (shake && scope.current) animate(scope.current, { x: [0, -8, 8, -5, 5, -2, 2, 0] }, { duration: 0.35, ease: 'easeInOut' });
  }, [shake]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
  <div
    ref={scope}
    data-testid={testId}
    className="w-full max-w-md bg-white dark:bg-[#101A26] rounded-[28px] sm:rounded-[32px] border border-[#E5E5E1] dark:border-[#203248] p-5 sm:p-8 shadow-2xl"
  >
    <div className="flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-3xl flex items-center justify-center mb-3 shadow-xs border bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-400">
        {icon}
      </div>
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF9F6] dark:bg-[#162436] text-[11px] font-bold text-teal-800 dark:text-teal-300 border border-[#E5E5E1] dark:border-[#203248] mb-2 uppercase tracking-wider">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>{badge}</span>
      </div>
      <h2 className="font-serif italic text-2xl sm:text-3xl font-bold text-[#111827] dark:text-white mb-1">{title}</h2>
      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] max-w-sm mb-5 leading-relaxed">{subtitle}</p>
    </div>
    {children}
  </div>
  );
};

const SignUpForm: React.FC = () => {
  const { signUpOwner, settings } = useTrading();
  const [shopName, setShopName] = useState(settings.companyName && settings.companyName !== 'Sarmaya' ? settings.companyName : '');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, shake, run } = useSubmit();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!shopName.trim()) return 'Enter your shop or business name.';
      const res = await signUpOwner({ shopName, name, username, password, confirmPassword: confirm });
      return res.success ? null : res.error || 'Could not create the account.';
    });
  };

  return (
    <Card
      testId="signup-form"
      icon={<Store className="w-7 h-7" />}
      badge="First time on this device"
      title="Create your account"
      subtitle="You will be the owner. Staff accounts are added later from Admin → Users."
      shake={shake}
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <Field label="Shop name">{(id) => <input id={id} value={shopName} onChange={(e) => setShopName(e.target.value)} autoComplete="organization" placeholder="e.g. Rohail Zaman Traders" className={inputCls} disabled={busy} />}</Field>
        <Field label="Your name">{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="e.g. Bilal Khan" className={inputCls} disabled={busy} />}</Field>
        <Field label="Username" hint="Small letters and numbers, no spaces. You will sign in with this.">
          {(id) => (
            <input
              id={id}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="e.g. bilal"
              className={inputCls}
              disabled={busy}
            />
          )}
        </Field>
        <Field label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
          {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" disabled={busy} />}
        </Field>
        <Field label="Confirm password">{(id) => <PasswordInput id={id} value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={busy} />}</Field>
        <ErrorBox message={error} />
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy ? <Spinner /> : null}
          <span>{busy ? 'Creating account…' : 'Create account'}</span>
          {!busy && <ArrowRight className="w-4 h-4" />}
        </button>
      </form>
    </Card>
  );
};

const LoginForm: React.FC = () => {
  const { login, users } = useTrading();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const { busy, error, shake, run } = useSubmit();
  const pinEraUsers = useMemo(() => users.some(hasLegacyCredential), [users]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await login(username, password, keep);
      if (!res.success) setPassword('');
      return res.success ? null : res.error || 'Could not sign in.';
    });
  };

  return (
    <Card
      testId="login-form"
      icon={<Lock className="w-7 h-7" />}
      badge="Welcome back"
      title="Sign in"
      subtitle="Enter your username and password."
      shake={shake}
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <Field label="Username">
          {(id) => (
            <input
              id={id}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              className={inputCls}
              disabled={busy}
            />
          )}
        </Field>
        <Field label="Password">{(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" disabled={busy} />}</Field>
        <label className="flex items-center gap-2.5 text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] cursor-pointer select-none">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="w-4 h-4 rounded accent-teal-600" />
          <span>Keep me signed in on this device</span>
        </label>
        <ErrorBox message={error} />
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy ? <Spinner /> : null}
          <span>{busy ? 'Signing in…' : 'Sign in'}</span>
          {!busy && <ArrowRight className="w-4 h-4" />}
        </button>
      </form>
      <div className="mt-5 pt-4 border-t border-[#E5E5E1] dark:border-[#203248] space-y-2 text-[11px] text-[#6B7280] dark:text-[#94A3B8] leading-relaxed">
        {pinEraUsers && (
          <p data-testid="pin-migration-hint">
            <span className="font-bold text-[#111827] dark:text-white">Used a PIN before?</span> Your username is your first name in small letters (for
            example <span className="font-mono">bilal</span>). Sign in once with your old PIN as the password, then choose a new password.
          </p>
        )}
        <p>Forgot your password? Ask the shop owner to set a temporary one from Admin → Users.</p>
      </div>
    </Card>
  );
};

const LockedForm: React.FC = () => {
  const { unlockScreen, logout, pendingUser } = useTrading();
  const [password, setPassword] = useState('');
  const { busy, error, shake, run } = useSubmit();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await unlockScreen(password);
      if (!res.success) setPassword('');
      return res.success ? null : res.error || 'Could not unlock.';
    });
  };

  return (
    <Card
      testId="lock-screen"
      icon={<Lock className="w-7 h-7" />}
      badge="Screen locked"
      title="Locked"
      subtitle={
        <>
          Signed in as <span className="font-bold text-[#111827] dark:text-white">{pendingUser?.name}</span>{' '}
          <span className="font-mono">@{pendingUser?.username}</span>. Enter your password to continue.
        </>
      }
      shake={shake}
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        {/* Lets password managers fill the right account. */}
        <input type="text" name="username" autoComplete="username" value={pendingUser?.username || ''} readOnly hidden />
        <Field label="Password">{(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" disabled={busy} autoFocus />}</Field>
        <ErrorBox message={error} />
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy ? <Spinner /> : <KeyRound className="w-4 h-4" />}
          <span>{busy ? 'Checking…' : 'Unlock'}</span>
        </button>
      </form>
      <div className="mt-4 flex items-center justify-center">
        <button type="button" onClick={logout} className={`${linkBtn} inline-flex items-center gap-1.5`}>
          <UserRound className="w-3.5 h-3.5" /> Not you? Switch user
        </button>
      </div>
    </Card>
  );
};

const ChangePasswordForm: React.FC = () => {
  const { changePassword, logout, pendingUser } = useTrading();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, shake, run } = useSubmit();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await changePassword(null, password, confirm);
      return res.success ? null : res.error || 'Could not save the password.';
    });
  };

  return (
    <Card
      testId="change-password-form"
      icon={<KeyRound className="w-7 h-7" />}
      badge="One more step"
      title="Choose a new password"
      subtitle={
        <>
          Hi <span className="font-bold text-[#111827] dark:text-white">{pendingUser?.name}</span>, you signed in with a temporary password or an old PIN.
          Choose your own password to continue.
        </>
      }
      shake={shake}
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <input type="text" name="username" autoComplete="username" value={pendingUser?.username || ''} readOnly hidden />
        <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
          {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" disabled={busy} autoFocus />}
        </Field>
        <Field label="Confirm new password">{(id) => <PasswordInput id={id} value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={busy} />}</Field>
        <ErrorBox message={error} />
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy ? <Spinner /> : null}
          <span>{busy ? 'Saving…' : 'Save password'}</span>
        </button>
      </form>
      <div className="mt-4 flex items-center justify-center">
        <button type="button" onClick={logout} className={`${linkBtn} inline-flex items-center gap-1.5`}>
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </Card>
  );
};

export const AuthGate: React.FC = () => {
  const { authStatus, settings } = useTrading();
  const { resolvedTheme, setThemeMode } = useTheme();
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'start' });
  }, [authStatus]);

  return (
    <div
      ref={top}
      data-testid="auth-gate"
      className="min-h-screen w-full bg-[#FAF9F6] dark:bg-[#090F17] text-[#111827] dark:text-[#F1F5F9] flex flex-col justify-between p-4 sm:p-6 lg:p-8 transition-colors relative overflow-x-hidden"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[700px] h-[320px] bg-teal-500/5 dark:bg-teal-500/10 blur-3xl pointer-events-none rounded-full" />

      <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-[#111827] dark:bg-[#162436] flex items-center justify-center text-white shadow-xs border border-transparent dark:border-[#203248]">
            <Truck className="w-5 h-5 text-teal-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-serif italic font-bold text-xl tracking-tight text-[#111827] dark:text-white truncate">
                {settings.companyName && authStatus !== 'signup' ? settings.companyName : 'Sarmaya'}
              </span>
              <span className="hidden sm:inline text-[11px] uppercase font-bold tracking-widest px-2.5 py-0.5 bg-white dark:bg-[#162436] text-teal-800 dark:text-teal-300 rounded-full border border-[#E5E5E1] dark:border-[#203248]">
                سرمایہ
              </span>
            </div>
            <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Billing &amp; daily cash book</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark')}
          title="Switch light / dark"
          aria-label="Switch light / dark"
          className="p-2.5 shrink-0 rounded-2xl bg-white dark:bg-[#101A26] hover:bg-[#FAF9F6] dark:hover:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#111827] dark:text-white transition-colors shadow-2xs cursor-pointer"
        >
          {resolvedTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#4B5563]" />}
        </button>
      </div>

      <div className="w-full flex-1 flex items-center justify-center my-6 z-10">
        {authStatus === 'loading' && (
          <div data-testid="auth-loading" className="flex items-center gap-3 text-sm text-[#6B7280] dark:text-[#94A3B8]">
            <Spinner /> Checking your account…
          </div>
        )}
        {authStatus === 'signup' && <SignUpForm />}
        {authStatus === 'login' && <LoginForm />}
        {authStatus === 'locked' && <LockedForm />}
        {authStatus === 'change_password' && <ChangePasswordForm />}
      </div>

      <div className="w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8] z-10">
        <span>Sarmaya • Karachi, Pakistan</span>
        <span>Passwords are stored as salted PBKDF2 hashes, never as plain text.</span>
      </div>
    </div>
  );
};
