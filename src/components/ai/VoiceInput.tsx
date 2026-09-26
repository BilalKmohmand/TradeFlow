import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { secondaryBtn } from '../billing/ui';

/**
 * Speak instead of typing: the phone / browser's own speech-to-text (Chrome, Edge, Android, iPhone Safari).
 * Nothing is recorded or sent to our AI: the words just appear in the box, and the shopkeeper checks them
 * before asking. Hidden on browsers without speech recognition (e.g. Firefox).
 */

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecCtor = new () => Rec;

const getCtor = (): RecCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};

export const speechSupported = (): boolean => typeof window !== 'undefined' && !!getCtor();

export const VOICE_LANGS = [
  { code: 'ur-PK', label: 'اردو' },
  { code: 'en-PK', label: 'English' },
] as const;
const LANG_KEY = 'sarmaya_voice_lang';

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone is blocked. Allow the microphone for this site in the browser settings.',
  'service-not-allowed': 'Microphone is blocked. Allow the microphone for this site in the browser settings.',
  'no-speech': 'Nothing heard. Press the mic and speak again.',
  'audio-capture': 'No microphone found on this device.',
  network: 'Voice typing needs the internet. Check the connection and try again.',
};

/**
 * Mic button + language (Urdu / English). While listening, each finished sentence is passed to `onText`
 * (the box adds it to what is already there); `onInterim` shows the words as they are heard.
 */
export const VoiceInput: React.FC<{ onText: (text: string) => void; onInterim?: (text: string) => void; label?: string; compact?: boolean }> = ({ onText, onInterim, label = 'Speak', compact }) => {
  const [supported] = useState(speechSupported);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<string>(() => {
    try {
      return localStorage.getItem(LANG_KEY) || 'ur-PK';
    } catch {
      return 'ur-PK';
    }
  });
  const rec = useRef<Rec | null>(null);
  useEffect(() => () => rec.current?.abort(), []);
  if (!supported) return null;

  const stop = () => rec.current?.stop();
  const start = () => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError('');
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0]?.transcript || '';
        if (res.isFinal) {
          if (t.trim()) onText(t.trim());
        } else interim += t;
      }
      onInterim?.(interim);
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] || 'Voice typing stopped. Try again.');
    };
    r.onend = () => {
      setListening(false);
      onInterim?.('');
      rec.current = null;
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError('Voice typing could not start. Try again.');
    }
  };
  const pickLang = (v: string) => {
    setLang(v);
    try {
      localStorage.setItem(LANG_KEY, v);
    } catch {
      /* private mode */
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={listening ? stop : start}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : `${label} (voice typing)`}
          title={listening ? 'Stop' : 'Press and speak'}
          className={`${secondaryBtn} !px-3 shrink-0 ${listening ? '!bg-rose-600 !text-white !border-rose-600 animate-pulse' : ''}`}
        >
          {listening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {!compact && <span>{listening ? 'Stop' : label}</span>}
        </button>
        <select aria-label="Voice language" value={lang} onChange={(e) => pickLang(e.target.value)} disabled={listening} className="h-9 rounded-lg border border-[#D9D8D2] dark:border-[#2A3E57] bg-white dark:bg-[#0F1B2A] text-xs px-1.5 text-[#374151] dark:text-[#CBD5E1]">
          {VOICE_LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        {listening && <span className="text-xs font-semibold text-rose-700 dark:text-rose-300" role="status">Listening…</span>}
      </div>
      {error && <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
    </div>
  );
};

/** Add spoken words to what is already typed (a space or new line between). */
export const appendSpoken = (current: string, spoken: string, sep = ' ') => (current.trim() ? `${current.replace(/\s+$/, '')}${sep}${spoken}` : spoken);
