import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Sparkles, Trash2 } from 'lucide-react';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from '../billing/ui';
import type { Customer, Invoice, Product } from '../../types';
import { buildBillCatalog } from '../../ai/context';
import { ParsedBill, parseBillResult } from '../../ai/parse';
import { resizePhoto } from '../../utils/imageResize';
import { AiPrivacyNote, AiStatus, useAiCall } from './AiKit';
import { VoiceInput, appendSpoken } from './VoiceInput';

/** Longest side of the photo sent to the AI, and its largest size (JPEG). */
export const AI_PHOTO_MAX_SIDE = 1600;
const AI_PHOTO_MAX_BYTES = 1_500_000;

/**
 * Sale Invoice → "AI: from photo / message": a photo of a handwritten parchi (camera or file) and / or a pasted
 * WhatsApp order. The AI reads it against the shop's customers and items; the lines go into the bill form for
 * the user to check. Nothing is saved here.
 */
export const BillFromAiDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onApply: (bill: ParsedBill) => void;
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
}> = ({ isOpen, onClose, onApply, customers, products, invoices }) => {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const ai = useAiCall('bill');
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    ai.cancel();
    onClose();
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhoto(await resizePhoto(file, { maxSide: AI_PHOTO_MAX_SIDE, maxBytes: AI_PHOTO_MAX_BYTES }));
    } catch (e) {
      ai.fail((e as Error).message || 'That photo could not be opened.');
    } finally {
      setPhotoBusy(false);
    }
  };
  const read = async () => {
    if (!photo && !text.trim()) return ai.fail('Add a photo of the parchi or paste the order message first.');
    const catalog = buildBillCatalog(customers, products, invoices, 300);
    const payload: Record<string, unknown> = { catalog, ...(text.trim() ? { text: text.trim() } : {}) };
    if (photo) payload.image = { mediaType: 'image/jpeg', data: photo.slice(photo.indexOf(',') + 1) };
    const result = await ai.run(payload);
    if (!result) return;
    const parsed = parseBillResult(result, catalog);
    if (!parsed || (!parsed.lines.length && !parsed.customerId)) return ai.fail('The AI found no items in this order. Try a clearer photo or paste the message.');
    onApply(parsed);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="AI: bill from photo / message"
      subtitle="The lines go into the bill for you to check. Nothing is saved until you press Save."
      footer={
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={close} className={secondaryBtn}>Close</button>
          <button type="button" onClick={read} disabled={ai.loading || photoBusy} className={primaryBtn}><Sparkles className="w-4 h-4 text-violet-300 dark:text-violet-600" /> Read order</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <span className={labelCls}>Photo of the parchi</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => camRef.current?.click()} className={secondaryBtn}><Camera className="w-4 h-4" /> Take photo</button>
            <button type="button" onClick={() => fileRef.current?.click()} className={secondaryBtn}><ImagePlus className="w-4 h-4" /> Upload image</button>
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take a photo of the parchi" data-skip-autofocus onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Upload a photo of the parchi" data-testid="ai-photo-input" data-skip-autofocus onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {photoBusy && <p className="mt-2 text-xs text-[#6B7280]">Preparing the photo…</p>}
          {photo && (
            <div className="mt-2 flex items-start gap-2">
              <img src={photo} alt="Order photo" className="max-h-48 rounded-xl border border-[#E5E5E1] dark:border-[#203248]" />
              <button type="button" onClick={() => setPhoto(null)} className={`${secondaryBtn} !px-2.5`} aria-label="Remove photo"><Trash2 className="w-4 h-4" /></button>
            </div>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-end justify-between gap-2 mb-1">
            <label className={`${labelCls} !mb-0`} htmlFor="ai-order-text">Or paste the WhatsApp order, or speak it</label>
            <VoiceInput label="Speak the order" onText={(t) => setText((x) => appendSpoken(x, t, '\n'))} />
          </div>
          <textarea id="ai-order-text" dir="auto" rows={5} value={text} onChange={(e) => setText(e.target.value)} className={inputCls} placeholder={'e.g.\nHaji Karim\n2 peti Dalda 16L\n5 dabbe Habib 5 litre'} />
        </div>
        <AiStatus state={ai.state} onCancel={ai.cancel} loadingText="Reading the order…" />
        <AiPrivacyNote>The photo or message and your list of customers and items (names, codes, prices) are sent.</AiPrivacyNote>
      </div>
    </Modal>
  );
};
