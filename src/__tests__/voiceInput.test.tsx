import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VoiceInput, appendSpoken } from '../components/ai/VoiceInput';

class FakeRec {
  static last: FakeRec;
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  constructor() { FakeRec.last = this; }
  start() { this.started = true; }
  stop() { this.onend?.(); }
  abort() {}
  say(text: string, final = true) {
    const res = Object.assign([{ transcript: text }], { isFinal: final });
    this.onresult?.({ resultIndex: 0, results: [res] });
  }
}

const Box = () => {
  const [t, setT] = useState('2 peti Dalda');
  return (<><VoiceInput label="Speak the order" onText={(x) => setT((c) => appendSpoken(c, x, '\n'))} /><textarea aria-label="order" value={t} readOnly /></>);
};

afterEach(() => { delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition; localStorage.clear(); });

describe('voice typing', () => {
  it('is hidden where the browser has no speech recognition', () => {
    const { container } = render(<Box />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('mic → speak (Urdu by default) → words added to the box; Stop ends it', () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    render(<Box />);
    fireEvent.click(screen.getByRole('button', { name: 'Speak the order (voice typing)' }));
    expect(FakeRec.last.started).toBe(true);
    expect(FakeRec.last.lang).toBe('ur-PK');
    expect(screen.getByRole('status').textContent).toContain('Listening');
    act(() => FakeRec.last.say('5 dabbe Habib', false));
    expect((screen.getByLabelText('order') as HTMLTextAreaElement).value).toBe('2 peti Dalda');
    act(() => FakeRec.last.say('5 dabbe Habib'));
    expect((screen.getByLabelText('order') as HTMLTextAreaElement).value).toBe('2 peti Dalda\n5 dabbe Habib');
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('English choice is remembered; a blocked mic says how to fix it', () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    render(<Box />);
    fireEvent.change(screen.getByLabelText('Voice language'), { target: { value: 'en-PK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speak the order (voice typing)' }));
    expect(FakeRec.last.lang).toBe('en-PK');
    expect(localStorage.getItem('sarmaya_voice_lang')).toBe('en-PK');
    act(() => { FakeRec.last.onerror?.({ error: 'not-allowed' }); FakeRec.last.onend?.(); });
    expect(screen.getByRole('alert').textContent).toContain('Microphone is blocked');
  });
});
