import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Truck,
  Sun,
  Moon,
  Clock,
  User,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Shield,
  Key,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useTheme } from '../context/ThemeContext';
import { AppUser } from '../types';

export const AppStartPinGate: React.FC = () => {
  const {
    unlockAsUser,
    users,
    roles,
    securityPolicy,
  } = useTrading();

  const { resolvedTheme, setThemeMode } = useTheme();

  // Active users only (no self-registration)
  const activeUsers = useMemo(() => users.filter((u) => u.active), [users]);

  // Role filter pills
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');

  // Filtered users list
  const filteredUsers = useMemo(() => {
    if (selectedRoleFilter === 'all') return activeUsers;
    return activeUsers.filter(
      (u) => u.role === selectedRoleFilter || (u.roles && u.roles.includes(selectedRoleFilter))
    );
  }, [activeUsers, selectedRoleFilter]);

  // Selected User state - default to first active user
  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    return activeUsers[0]?.id || '';
  });

  // Ensure selected user stays valid if filter changes
  useEffect(() => {
    if (filteredUsers.length > 0 && !filteredUsers.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(filteredUsers[0].id);
    }
  }, [filteredUsers, selectedUserId]);

  const selectedUser: AppUser | null = useMemo(() => {
    return activeUsers.find((u) => u.id === selectedUserId) || null;
  }, [activeUsers, selectedUserId]);

  // Check if selected user is currently locked out
  const isSelectedUserLocked = useMemo(() => {
    if (!selectedUser?.lockedUntil) return false;
    const lockTime = new Date(selectedUser.lockedUntil).getTime();
    return lockTime > Date.now();
  }, [selectedUser]);

  const lockoutRemainingMinutes = useMemo(() => {
    if (!selectedUser?.lockedUntil) return 0;
    const diff = new Date(selectedUser.lockedUntil).getTime() - Date.now();
    return diff > 0 ? Math.ceil(diff / 60000) : 0;
  }, [selectedUser]);

  // PIN state
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [showDigits, setShowDigits] = useState<boolean>(false);
  const [pinErrorMessage, setPinErrorMessage] = useState<string | null>(null);
  const [shakeTrigger, setShakeTrigger] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Available unique roles present in active users for filter pills
  const availableRoles = useMemo(() => {
    const roleIdMap = new Map<string, string>();
    roles.forEach((r) => roleIdMap.set(r.id, r.name));
    const uniqueUserRoleIds: string[] = Array.from(new Set(activeUsers.map((u) => u.role)));
    return uniqueUserRoleIds.map((id: string) => ({
      id,
      name: roleIdMap.get(id) || id.replace(/_/g, ' ').toUpperCase(),
    }));
  }, [roles, activeUsers]);

  // Role meta for selected user
  const userRoleMeta = useMemo(() => {
    if (!selectedUser) return null;
    return roles.find((r) => r.id === selectedUser.role) || {
      id: selectedUser.role,
      name: selectedUser.role.replace(/_/g, ' '),
      color: 'teal',
    };
  }, [selectedUser, roles]);

  // Live PKT Clock
  const [currentTime, setCurrentTime] = useState<string>(() => {
    return new Date().toLocaleTimeString('en-US', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', {
          timeZone: 'Asia/Karachi',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Physical Keyboard handler for PIN entry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if focus is on select or other inputs
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlock();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enteredPin, selectedUserId, isSelectedUserLocked, isSubmitting]);

  const handleDigit = (digit: string) => {
    if (isSelectedUserLocked || isSubmitting) return;
    if (enteredPin.length >= 6) return;
    setPinErrorMessage(null);
    setEnteredPin((prev) => prev + digit);
  };

  const handleBackspace = () => {
    if (isSelectedUserLocked || isSubmitting) return;
    setPinErrorMessage(null);
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isSelectedUserLocked || isSubmitting) return;
    setPinErrorMessage(null);
    setEnteredPin('');
  };

  const handleUnlock = async () => {
    if (!selectedUserId) {
      setPinErrorMessage('Please select your user name from the dropdown');
      setShakeTrigger((s) => s + 1);
      return;
    }

    if (isSelectedUserLocked) {
      setPinErrorMessage(`Account is temporarily locked. Try again in ${lockoutRemainingMinutes} minute(s).`);
      setShakeTrigger((s) => s + 1);
      return;
    }

    if (enteredPin.length < 4) {
      setPinErrorMessage('PIN must be 4 to 6 digits');
      setShakeTrigger((s) => s + 1);
      return;
    }

    setIsSubmitting(true);
    setPinErrorMessage(null);

    try {
      const res = await unlockAsUser(selectedUserId, enteredPin);
      if (res.success) {
        setIsSuccess(true);
      } else {
        setPinErrorMessage(res.error || 'Incorrect PIN. Access denied.');
        setShakeTrigger((s) => s + 1);
        setEnteredPin('');
      }
    } catch (err: any) {
      setPinErrorMessage(err?.message || 'Authentication error. Please retry.');
      setShakeTrigger((s) => s + 1);
      setEnteredPin('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] dark:bg-[#090F17] text-[#111827] dark:text-[#F1F5F9] flex flex-col justify-between p-4 sm:p-6 lg:p-8 transition-colors relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[320px] bg-teal-500/5 dark:bg-teal-500/10 blur-3xl pointer-events-none rounded-full" />

      {/* Header */}
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#111827] dark:bg-[#162436] flex items-center justify-center text-white shadow-xs border border-transparent dark:border-[#203248]">
            <Truck className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif italic font-bold text-xl tracking-tight text-[#111827] dark:text-white">
                Sarmaya
              </span>
              <span className="text-[11px] uppercase font-bold tracking-widest px-2.5 py-0.5 bg-white dark:bg-[#162436] text-teal-800 dark:text-teal-300 rounded-full border border-[#E5E5E1] dark:border-[#203248]">
                سرمایہ
              </span>
            </div>
            <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
              Billing &amp; daily cash book
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#6B7280] dark:text-[#94A3B8] shadow-2xs">
            <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>PKT {currentTime}</span>
          </div>

          <button
            type="button"
            onClick={() => setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark')}
            title="Toggle Light/Dark Theme"
            className="p-2.5 rounded-2xl bg-white dark:bg-[#101A26] hover:bg-[#FAF9F6] dark:hover:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#111827] dark:text-white transition-colors shadow-2xs cursor-pointer"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-[#4B5563]" />
            )}
          </button>
        </div>
      </div>

      {/* Main Terminal Card */}
      <div className="w-full flex-1 flex items-center justify-center my-6 z-10 px-2">
        <motion.div
          key={`pin-terminal-${shakeTrigger}`}
          animate={{
            x: pinErrorMessage ? [-10, 10, -7, 7, -4, 4, 0] : 0,
            scale: isSuccess ? 0.98 : 1,
            opacity: isSuccess ? 0.75 : 1,
          }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="w-full max-w-md sm:max-w-lg bg-white dark:bg-[#101A26] rounded-[32px] border border-[#E5E5E1] dark:border-[#203248] p-6 sm:p-8 shadow-2xl flex flex-col items-center"
        >
          {/* Lock Icon */}
          <div
            className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-3 transition-all shadow-xs border ${
              isSuccess
                ? 'bg-teal-500 text-white border-teal-400 scale-105'
                : isSelectedUserLocked
                ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400'
                : 'bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-400'
            }`}
          >
            {isSuccess ? (
              <Unlock className="w-8 h-8 animate-pulse" />
            ) : isSelectedUserLocked ? (
              <ShieldAlert className="w-8 h-8" />
            ) : (
              <Lock className="w-8 h-8" />
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF9F6] dark:bg-[#162436] text-[11px] font-bold text-teal-800 dark:text-teal-300 border border-[#E5E5E1] dark:border-[#203248] mb-2 uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sign in with your PIN</span>
          </div>

          <h2 className="font-serif italic text-2xl sm:text-3xl font-bold text-[#111827] dark:text-white mb-1">
            Sign In with PIN
          </h2>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] max-w-sm mb-5 text-center leading-relaxed">
            Select your assigned name from the directory and enter your 4–6 digit security PIN.
          </p>

          {/* Account Lockout Banner */}
          {isSelectedUserLocked && (
            <div className="w-full mb-4 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div>
                <div className="font-bold">Account Temporarily Locked</div>
                <div className="text-[11px] text-rose-700 dark:text-rose-300/80 mt-0.5">
                  Too many incorrect PIN attempts. Security lockout active for approx.{' '}
                  <span className="font-bold font-mono underline">{lockoutRemainingMinutes} min</span>.
                  Contact System Administrator for instant reset.
                </div>
              </div>
            </div>
          )}

          {/* Role Filter Pills */}
          <div className="w-full mb-3">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filter by Role
              </span>
              <span className="text-[11px] text-[#9CA3AF] dark:text-[#64748B]">
                {filteredUsers.length} active staff
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedRoleFilter('all')}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  selectedRoleFilter === 'all'
                    ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent shadow-xs'
                    : 'bg-white dark:bg-[#162436] text-[#4B5563] dark:text-[#94A3B8] border-[#E5E5E1] dark:border-[#203248] hover:border-teal-500/40'
                }`}
              >
                All Roles
              </button>
              {availableRoles.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setSelectedRoleFilter(r.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                    selectedRoleFilter === r.id
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent shadow-xs'
                      : 'bg-white dark:bg-[#162436] text-[#4B5563] dark:text-[#94A3B8] border-[#E5E5E1] dark:border-[#203248] hover:border-teal-500/40'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          {/* User Name Dropdown */}
          <div className="w-full mb-4">
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5 px-1">
              Select Your Name
            </label>
            <div className="relative">
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setEnteredPin('');
                  setPinErrorMessage(null);
                }}
                disabled={filteredUsers.length === 0}
                className="w-full px-4 py-3 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-sm font-semibold text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50 appearance-none cursor-pointer pr-10"
              >
                {filteredUsers.length === 0 ? (
                  <option value="">No active users in selected role</option>
                ) : (
                  filteredUsers.map((u) => {
                    const rName = roles.find((r) => r.id === u.role)?.name || u.role;
                    return (
                      <option key={u.id} value={u.id}>
                        {u.name} — ({rName})
                      </option>
                    );
                  })
                )}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#6B7280] dark:text-[#94A3B8]">
                <User className="w-4 h-4" />
              </div>
            </div>

            {/* Selected User Badge Bar */}
            {selectedUser && (
              <div className="mt-2 flex items-center justify-between px-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-[#4B5563] dark:text-[#94A3B8]">
                    Role: <span className="font-bold text-[#111827] dark:text-white">{userRoleMeta?.name}</span>
                  </span>
                </div>
                {selectedUser.failedAttempts && selectedUser.failedAttempts > 0 && !isSelectedUserLocked ? (
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {securityPolicy.maxFailedAttempts - selectedUser.failedAttempts} attempt(s) remaining
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* PIN Display Field */}
          <div className="w-full mb-3">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <label className="text-xs font-semibold text-[#111827] dark:text-white">
                Enter Security PIN (4–6 digits)
              </label>
              <button
                type="button"
                onClick={() => setShowDigits(!showDigits)}
                className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {showDigits ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showDigits ? 'Mask PIN' : 'Show Digits'}</span>
              </button>
            </div>

            {/* Visual PIN Slots */}
            <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] min-h-[58px]">
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const hasDigit = index < enteredPin.length;
                const digitChar = enteredPin[index];
                return (
                  <div
                    key={index}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-lg font-mono font-bold transition-all border ${
                      hasDigit
                        ? 'bg-white dark:bg-[#101A26] text-[#111827] dark:text-white border-teal-500 shadow-xs scale-105'
                        : 'bg-transparent text-transparent border-[#D1D5DB] dark:border-[#2A3B4F]'
                    }`}
                  >
                    {hasDigit ? (showDigits ? digitChar : '•') : ''}
                  </div>
                );
              })}
            </div>

            {/* Error Message */}
            <AnimatePresence>
              {pinErrorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{pinErrorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Numeric Keypad */}
          <div className="w-full max-w-xs grid grid-cols-3 gap-2.5 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                type="button"
                key={num}
                disabled={isSelectedUserLocked || isSubmitting}
                onClick={() => handleDigit(String(num))}
                className="h-12 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-white dark:hover:bg-[#203248] border border-[#E5E5E1] dark:border-[#203248] text-base font-mono font-bold text-[#111827] dark:text-white transition-all active:scale-95 shadow-2xs disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={isSelectedUserLocked || isSubmitting || enteredPin.length === 0}
              onClick={handleClear}
              className="h-12 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-white dark:hover:bg-[#203248] border border-[#E5E5E1] dark:border-[#203248] text-xs font-bold text-[#6B7280] dark:text-[#94A3B8] transition-all active:scale-95 shadow-2xs disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={isSelectedUserLocked || isSubmitting}
              onClick={() => handleDigit('0')}
              className="h-12 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-white dark:hover:bg-[#203248] border border-[#E5E5E1] dark:border-[#203248] text-base font-mono font-bold text-[#111827] dark:text-white transition-all active:scale-95 shadow-2xs disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              disabled={isSelectedUserLocked || isSubmitting || enteredPin.length === 0}
              onClick={handleBackspace}
              className="h-12 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-white dark:hover:bg-[#203248] border border-[#E5E5E1] dark:border-[#203248] text-xs font-bold text-[#6B7280] dark:text-[#94A3B8] transition-all active:scale-95 shadow-2xs disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              ⌫ Back
            </button>
          </div>

          {/* Submit Unlock Button */}
          <button
            type="button"
            onClick={handleUnlock}
            disabled={isSelectedUserLocked || isSubmitting || enteredPin.length < 4}
            className="w-full py-3.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-sm font-bold shadow-lg hover:bg-black dark:hover:bg-slate-100 transition-all active:scale-98 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Verifying PIN...</span>
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-teal-400 dark:text-teal-700" />
                <span>Access Granted</span>
              </>
            ) : (
              <>
                <span>Unlock</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Admin Policy Notice */}
          <div className="mt-5 pt-4 border-t border-[#E5E5E1] dark:border-[#203248] w-full flex items-center justify-between text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>Admin-provisioned accounts only. No public signup.</span>
            </div>
            <span className="font-mono text-[10px]">bcrypt-hashed PINs</span>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#6B7280] dark:text-[#94A3B8] z-10">
        <div>
          <span>TradeFlow Sarmaya v2.6 Enterprise</span> •{' '}
          <span>Karachi, Pakistan</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Keyboard: Numbers, Enter, Backspace, Esc</span>
        </div>
      </div>
    </div>
  );
};
