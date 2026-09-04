import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare,
  X,
  Send,
  CheckCheck,
  Zap,
  ExternalLink,
  Trash2,
  Users,
  BellRing,
  RotateCcw,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { formatCurrency } from '../utils/formatters';

interface WhatsAppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppDrawer: React.FC<WhatsAppDrawerProps> = ({ isOpen, onClose }) => {
  const {
    whatsappMessages,
    customers,
    sendWhatsAppDirect,
    deleteWhatsAppMessage,
    can,
    sendWhatsAppReminder,
    runAutomatedOverdueCheck,
  } = useTrading();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'feed' | 'send'>('feed');
  const [triggerStatus, setTriggerStatus] = useState<string | null>(null);

  const handleRunAutomation = () => {
    const count = runAutomatedOverdueCheck();
    setTriggerStatus(`Automated check executed: sent reminders to ${count} customer(s) with pending balances.`);
    setTimeout(() => setTriggerStatus(null), 4000);
  };

  const handleSendCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    const targetCust = customers.find((c) => c.id === selectedCustomerId);
    if (!targetCust) return;

    sendWhatsAppReminder(targetCust.id, customMessage || undefined);
    setCustomMessage('');
    setActiveTab('feed');
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col border-l border-slate-200"
          >
            {/* Header */}
            <div className="p-6 bg-[#111827] text-white flex items-center justify-between border-b border-[#262626]">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-teal-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif italic text-2xl font-normal tracking-tight text-white">WhatsApp Hub</h3>
                  <p className="text-xs text-[#9CA3AF]">Quiet real-time alerts & auto reminders</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Header / Quick Action */}
            <div className="p-4 bg-[#FAF9F6] border-b border-[#E5E5E1] flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-[#E5E5E1] text-xs font-bold">
                <button
                  onClick={() => setActiveTab('feed')}
                  className={`px-3.5 py-1.5 rounded-xl transition-colors ${
                    activeTab === 'feed'
                      ? 'bg-[#111827] text-white shadow-xs'
                      : 'text-[#8E9299] hover:text-[#111827]'
                  }`}
                >
                  Activity Feed ({whatsappMessages.length})
                </button>
                <button
                  onClick={() => setActiveTab('send')}
                  className={`px-3.5 py-1.5 rounded-xl transition-colors ${
                    activeTab === 'send'
                      ? 'bg-[#111827] text-white shadow-xs'
                      : 'text-[#8E9299] hover:text-[#111827]'
                  }`}
                >
                  Quick Send
                </button>
              </div>

              <button
                onClick={handleRunAutomation}
                title="Trigger automated payment reminder check for all pending customers"
                className="bg-[#111827] hover:bg-black active:scale-95 text-white text-xs font-bold py-2 px-3.5 rounded-2xl flex items-center gap-1.5 shadow-xs transition-all border border-[#111827]"
              >
                <Zap className="w-3.5 h-3.5 text-teal-400 fill-teal-400" />
                <span>Auto-Sweep</span>
              </button>
            </div>

            {triggerStatus && (
              <div className="bg-[#FAF9F6] text-[#111827] text-xs px-5 py-2.5 flex items-center gap-2 border-b border-[#E5E5E1] animate-in fade-in">
                <BellRing className="w-3.5 h-3.5 shrink-0 text-teal-700" />
                <span className="font-medium">{triggerStatus}</span>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#FAF9F6]">
              {activeTab === 'feed' ? (
                whatsappMessages.length === 0 ? (
                  <div className="text-center py-16 text-[#8E9299]">
                    <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40 text-teal-700" />
                    <p className="text-sm font-bold text-[#111827]">No automated alerts yet</p>
                    <p className="text-xs text-[#8E9299] mt-1">
                      Log a dispatch or booking to see automation in action.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {whatsappMessages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl p-5 border border-[#E5E5E1] shadow-xs space-y-3 hover:border-teal-700/40 transition-colors"
                      >
                        <div className="flex items-center justify-between border-b border-[#FAF9F6] pb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                msg.type === 'dispatch_alert'
                                  ? 'bg-blue-100 text-blue-800'
                                  : msg.type === 'booking_confirmation'
                                  ? 'bg-teal-100 text-teal-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {msg.type.replace('_', ' ')}
                            </span>
                            <span className="text-xs font-bold text-[#111827]">
                              {msg.recipientName}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#8E9299] font-mono">{msg.timestamp}</span>
                        </div>

                        {/* Message Preview Bubble */}
                        <div className="bg-[#FAF9F6] text-[#111827] text-xs p-3.5 rounded-2xl rounded-tr-none border border-[#E5E5E1] font-mono whitespace-pre-line leading-relaxed">
                          {msg.message}
                          <div className="flex items-center justify-end gap-1 text-[10px] text-teal-700 font-sans pt-1 font-bold">
                            <span>Delivered</span>
                            <CheckCheck className="w-3.5 h-3.5 text-teal-600" />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-[#8E9299] font-mono">
                            {msg.recipientPhone}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => sendWhatsAppDirect(msg.recipientPhone, msg.message)}
                              className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline"
                            >
                              <span>Open in WhatsApp</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                            {can('delete_records') && (<button
                              onClick={() => deleteWhatsAppMessage(msg.id)}
                              title="Delete log entry (admin)"
                              className="p-1 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>)}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )
              ) : (
                /* Quick Send Tab */
                <form onSubmit={handleSendCustom} className="bg-white p-6 rounded-2xl border border-[#E5E5E1] shadow-xs space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                      Select Customer
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} - {c.company} (Due: {formatCurrency(c.totalDue)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedCustomer && (
                    <div className="bg-[#FAF9F6] p-4 rounded-2xl border border-[#E5E5E1] text-xs space-y-1.5 text-[#6B7280]">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8E9299]">Phone:</span>
                        <span className="font-bold text-[#111827] font-mono">{selectedCustomer.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8E9299]">Outstanding Due:</span>
                        <span className="font-bold text-teal-800 font-mono">{formatCurrency(selectedCustomer.totalDue)}</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                      Custom Message (Leave empty for smart automated reminder)
                    </label>
                    <textarea
                      rows={5}
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder="Will auto-format with current balance and polite settlement request..."
                      className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-3.5 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 font-mono leading-relaxed"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#111827] hover:bg-black text-white font-bold py-2.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-xs transition-all border border-[#111827]"
                  >
                    <Send className="w-3.5 h-3.5 text-teal-400" />
                    <span>Send WhatsApp Alert</span>
                  </button>
                </form>
              )}
            </div>

            {/* Footer Summary */}
            <div className="p-5 bg-white border-t border-[#E5E5E1] flex items-center justify-between text-xs text-[#8E9299]">
              <span className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                Meta WhatsApp API: Ready
              </span>
              <button
                onClick={() => {
                  const demoMsg = `🚚 *Test Alert*\nSarmaya automated engine operational.`;
                  sendWhatsAppDirect('+15551234567', demoMsg);
                }}
                className="text-teal-700 hover:text-teal-800 font-bold"
              >
                Test Web Link
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
