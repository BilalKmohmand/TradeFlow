import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, CheckCheck, ExternalLink, X, Send } from 'lucide-react';
import { useTrading } from '../context/TradingContext';

export const WhatsAppNotificationToast: React.FC = () => {
  const { recentWhatsAppAlert, clearRecentAlert, sendWhatsAppDirect } = useTrading();

  // Auto-dismiss so the toast never sits over page controls; Escape closes it early.
  useEffect(() => {
    if (!recentWhatsAppAlert) return;
    const timer = setTimeout(clearRecentAlert, 8000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearRecentAlert();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [recentWhatsAppAlert, clearRecentAlert]);

  if (!recentWhatsAppAlert) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        role="status"
        className="fixed bottom-6 right-6 z-40 max-w-md w-full mx-4 sm:mx-0 shadow-2xl rounded-2xl bg-white border border-emerald-100 overflow-hidden"
      >
        <div className="bg-[#111827] px-5 py-3.5 text-white flex items-center justify-between border-b border-[#262626]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-teal-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">
                Automated WhatsApp Sent
              </div>
              <div className="text-xs font-bold flex items-center gap-1.5 text-white">
                <span>To: {recentWhatsAppAlert.recipientName}</span>
                <span className="text-[11px] text-[#9CA3AF] font-mono">({recentWhatsAppAlert.recipientPhone})</span>
              </div>
            </div>
          </div>
          <button
            onClick={clearRecentAlert}
            className="text-[#9CA3AF] hover:text-white p-1 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 bg-[#FAF9F6]">
          <div className="bg-white text-[#111827] text-xs p-4 rounded-2xl rounded-tr-none border border-[#E5E5E1] shadow-xs relative space-y-1.5 whitespace-pre-line leading-relaxed font-mono">
            {recentWhatsAppAlert.message}
            <div className="flex items-center justify-end gap-1 text-[10px] text-teal-700 font-sans pt-1 font-bold">
              <span>{recentWhatsAppAlert.timestamp}</span>
              <CheckCheck className="w-3.5 h-3.5 text-teal-600" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                sendWhatsAppDirect(recentWhatsAppAlert.recipientPhone, recentWhatsAppAlert.message);
              }}
              className="flex-1 bg-[#111827] hover:bg-black text-white text-xs font-bold py-2.5 px-3.5 rounded-2xl flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.98] border border-[#111827]"
            >
              <Send className="w-3.5 h-3.5 text-teal-400" />
              <span>Open in WhatsApp</span>
              <ExternalLink className="w-3 h-3 text-[#9CA3AF]" />
            </button>
            <button
              onClick={clearRecentAlert}
              className="text-xs font-bold text-[#6B7280] hover:text-[#111827] bg-white hover:bg-[#F0F0EE] px-4 py-2.5 rounded-2xl border border-[#E5E5E1] transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
