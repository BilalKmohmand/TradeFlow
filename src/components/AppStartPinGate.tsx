import React, { useState, useEffect } from 'react';
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
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useTheme } from '../context/ThemeContext';

export const AppStartPinGate: React.FC = () => {
  const {
    unlockAdmin,
    adminPin,
    changeAdminPin,
  } = useTrading();
  const { resolvedTheme, setThemeMode } = useTheme();

  // PIN entry state
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [showDigits, setShowDigits] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shakeTrigger, setShakeTrigger] = useState<number>(0);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Change PIN modal state
  const [showChangePinModal, setShowChangePinModal] = useState<boolean>(false);
  const [currentPinVal, setCurrentPinVal] = useState<string>('');
  const [newPinVal, setNewPinVal] = useState<string>('');
  const [confirmPinVal, setConfirmPinVal] = useState<string>('');
  const [changeFeedback, setChangeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Time in Pakistan (PKT, UTC+5)
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

  // Physical Keyboard Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing inside the Change PIN modal inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlockAttempt();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enteredPin, adminPin]);

  const handleDigit = (digit: string) => {
    if (enteredPin.length >= 6) return;
    setErrorMessage(null);
    const next = enteredPin + digit;
    setEnteredPin(next);

    // Auto unlock if matches exact pin upon reaching length
    if ((next.length === 4 || next.length === adminPin.length) && next === adminPin) {
      triggerSuccessUnlock(next);
    }
  };

  const handleBackspace = () => {
    setErrorMessage(null);
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setErrorMessage(null);
    setEnteredPin('');
  };

  const triggerSuccessUnlock = (pin: string) => {
    setIsSuccess(true);
    setTimeout(() => {
      unlockAdmin(pin);
    }, 280);
  };

  const handleUnlockAttempt = () => {
    if (!enteredPin) {
      setErrorMessage('Please enter your 4-6 digit PIN');
      setShakeTrigger((s) => s + 1);
      return;
    }

    if (enteredPin.trim() === adminPin.trim()) {
      triggerSuccessUnlock(enteredPin);
    } else {
      setErrorMessage('Incorrect PIN. Please try again.');
      setShakeTrigger((s) => s + 1);
      setEnteredPin('');
    }
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setChangeFeedback(null);

    if (newPinVal !== confirmPinVal) {
      setChangeFeedback({ type: 'error', message: 'New PIN and confirmation do not match.' });
      return;
    }

    const res = changeAdminPin(currentPinVal, newPinVal);
    if (res.success) {
      setChangeFeedback({ type: 'success', message: 'PIN successfully updated! You can now use your new PIN.' });
      setCurrentPinVal('');
      setNewPinVal('');
      setConfirmPinVal('');
      setTimeout(() => {
        setShowChangePinModal(false);
        setChangeFeedback(null);
      }, 1400);
    } else {
      setChangeFeedback({ type: 'error', message: res.message });
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] dark:bg-[#090F17] text-[#111827] dark:text-[#F1F5F9] flex flex-col justify-between p-4 sm:p-6 lg:p-8 transition-colors selection:bg-teal-700 selection:text-white relative overflow-hidden">
      {/* Background Subtle Ambience */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-teal-500/5 dark:bg-teal-500/10 blur-3xl pointer-events-none rounded-full" />

      {/* Top Header Bar */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between z-10">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#111827] dark:bg-[#162436] flex items-center justify-center text-white shadow-xs border border-transparent dark:border-[#203248]">
            <Truck className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif italic font-bold text-lg tracking-tight text-[#111827] dark:text-white">
                Sarmaya
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 bg-white dark:bg-[#162436] text-teal-800 dark:text-teal-300 rounded-full border border-[#E5E5E1] dark:border-[#203248]">
                سرمایہ
              </span>
            </div>
            <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
              Pakistani Bulk Commodity Trading
            </div>
          </div>
        </div>

        {/* Right side controls: PKT Time & Theme Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#6B7280] dark:text-[#94A3B8] shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>PKT {currentTime}</span>
          </div>

          <button
            type="button"
            onClick={() => setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark')}
            title="Toggle Light/Dark Theme"
            className="p-2.5 rounded-2xl bg-white dark:bg-[#101A26] hover:bg-[#FAF9F6] dark:hover:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#111827] dark:text-white transition-colors shadow-2xs"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-[#4B5563]" />
            )}
          </button>
        </div>
      </div>

      {/* Main Center PIN Card */}
      <div className="w-full flex-1 flex items-center justify-center my-6 z-10">
        <motion.div
          key={`pin-terminal-${shakeTrigger}`}
          animate={{
            x: errorMessage ? [-10, 10, -7, 7, -4, 4, 0] : 0,
            scale: isSuccess ? 0.98 : 1,
            opacity: isSuccess ? 0.7 : 1,
          }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="w-full max-w-sm sm:max-w-md bg-white dark:bg-[#101A26] rounded-3xl border border-[#E5E5E1] dark:border-[#203248] p-6 sm:p-8 shadow-xl text-center flex flex-col items-center"
        >
          {/* Animated Lock Icon */}
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all shadow-xs border ${
              isSuccess
                ? 'bg-teal-500 text-white border-teal-400 scale-105'
                : 'bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-400'
            }`}
          >
            {isSuccess ? <Unlock className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF9F6] dark:bg-[#162436] text-[11px] font-bold text-teal-800 dark:text-teal-300 border border-[#E5E5E1] dark:border-[#203248] mb-2 uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Protected Trading Terminal</span>
          </div>

          <h2 className="font-serif italic text-2xl sm:text-3xl font-bold text-[#111827] dark:text-white mb-2">
            Enter PIN to Open
          </h2>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] max-w-xs mb-5 leading-relaxed">
            Please enter your security PIN to access dispatches, customer ledgers, and trade bookings.
          </p>

          {/* PIN Digits Display */}
          <div className="flex items-center justify-center gap-2.5 sm:gap-3 mb-3">
            {[0, 1, 2, 3].map((slotIdx) => {
              const isFilled = enteredPin.length > slotIdx;
              const char = enteredPin[slotIdx];
              return (
                <div
                  key={slotIdx}
                  className={`w-12 h-14 rounded-2xl flex items-center justify-center text-xl font-mono font-bold transition-all border ${
                    isFilled
                      ? 'border-teal-600 bg-teal-50/60 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 shadow-xs scale-105'
                      : 'border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#162436] text-[#8E9299]'
                  }`}
                >
                  {isFilled ? (showDigits ? char : '•') : ''}
                </div>
              );
            })}
            {enteredPin.length > 4 && (
              <div className="flex items-center gap-2">
                {[4, 5].map((slotIdx) => {
                  if (enteredPin.length <= slotIdx && slotIdx === 5) return null;
                  const isFilled = enteredPin.length > slotIdx;
                  const char = enteredPin[slotIdx];
                  return (
                    <div
                      key={slotIdx}
                      className="w-12 h-14 rounded-2xl flex items-center justify-center text-xl font-mono font-bold border border-teal-600 bg-teal-50/60 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200"
                    >
                      {isFilled ? (showDigits ? char : '•') : ''}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mask toggle or Error notification */}
          <div className="min-h-6 flex items-center justify-center mb-4">
            {errorMessage ? (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-semibold animate-in fade-in">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : isSuccess ? (
              <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-400 font-bold animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>PIN Verified • Opening Terminal...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDigits(!showDigits)}
                className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors"
              >
                {showDigits ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showDigits ? 'Mask Digits' : 'Show Digits'}</span>
              </button>
            )}
          </div>

          {/* Tactile Keypad */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 w-full max-w-[280px] mb-4">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleDigit(num)}
                className="h-12 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] active:scale-95 text-[#111827] dark:text-white font-mono font-semibold text-lg border border-[#E5E5E1] dark:border-[#203248] transition-all flex items-center justify-center shadow-2xs"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              title="Clear All (Esc)"
              className="h-12 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-rose-50 dark:hover:bg-rose-950/30 active:scale-95 text-[#6B7280] hover:text-rose-600 dark:text-[#94A3B8] font-semibold text-xs border border-[#E5E5E1] dark:border-[#203248] transition-all flex items-center justify-center"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-12 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] active:scale-95 text-[#111827] dark:text-white font-mono font-semibold text-lg border border-[#E5E5E1] dark:border-[#203248] transition-all flex items-center justify-center shadow-2xs"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              title="Backspace"
              className="h-12 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] active:scale-95 text-[#6B7280] dark:text-[#94A3B8] font-semibold text-xs border border-[#E5E5E1] dark:border-[#203248] transition-all flex items-center justify-center"
            >
              ⌫
            </button>
          </div>

          {/* Unlock Submit Button */}
          <button
            type="button"
            onClick={handleUnlockAttempt}
            className="w-full max-w-[280px] bg-[#111827] dark:bg-white hover:bg-black dark:hover:bg-slate-100 text-white dark:text-[#111827] font-semibold text-sm py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all mb-4"
          >
            <Unlock className="w-4 h-4 text-teal-400 dark:text-teal-700" />
            <span>Unlock Terminal</span>
          </button>

          {/* PIN Action Bar */}
          <div className="pt-3 border-t border-[#E5E5E1] dark:border-[#203248] w-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => setShowChangePinModal(true)}
              className="text-xs text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white hover:underline flex items-center gap-1.5 py-1 px-3 rounded-xl hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Change PIN</span>
            </button>
          </div>
        </motion.div>
      </div>

      {/* Footer Info */}
      <div className="w-full max-w-5xl mx-auto text-center text-xs text-[#8E9299] dark:text-[#64748B] z-10 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          Pakistan Bulk Commodities • Cement, Coal, Steel & Chemical Haulage
        </div>
        <div>
          Keyboard Supported: Type <kbd className="px-1 py-0.5 rounded bg-white dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] font-mono text-[10px]">0-9</kbd> and press <kbd className="px-1 py-0.5 rounded bg-white dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] font-mono text-[10px]">Enter</kbd>
        </div>
      </div>

      {/* Change PIN Modal */}
      <AnimatePresence>
        {showChangePinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#101A26] rounded-3xl border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-2xl"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900/50">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827] dark:text-white">
                    Update Terminal PIN
                  </h3>
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                    Establish a new 4 to 6-digit security code for Sarmaya.
                  </p>
                </div>
              </div>

              <form onSubmit={handleChangePinSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                    Current PIN
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={currentPinVal}
                    onChange={(e) => setCurrentPinVal(e.target.value)}
                    placeholder="Enter current PIN"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                      New PIN (4-6 digits)
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={newPinVal}
                      onChange={(e) => setNewPinVal(e.target.value)}
                      placeholder="e.g. 5566"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                      Confirm PIN
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={confirmPinVal}
                      onChange={(e) => setConfirmPinVal(e.target.value)}
                      placeholder="Re-type PIN"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                      required
                    />
                  </div>
                </div>

                {changeFeedback && (
                  <div
                    className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2 ${
                      changeFeedback.type === 'success'
                        ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    {changeFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{changeFeedback.message}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePinModal(false);
                      setChangeFeedback(null);
                    }}
                    className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:bg-[#FAF9F6] dark:hover:bg-[#162436]"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold shadow-xs hover:bg-black dark:hover:bg-slate-100 transition-all active:scale-95"
                  >
                    Save New PIN
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
