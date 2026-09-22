import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cheque, Invoice, LedgerEntry } from '../types';
import { NumberedDoc, deviceTag, findNumberClashes, untaggedClashes } from '../utils/numberClash';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * Bill numbers never clash silently across devices (see utils/numberClash.ts for the rule).
 * After this device's bills reach the cloud (and when the app comes back online, and every few
 * minutes) the cloud's bill numbers are read; a bill made here that repeats a number another device
 * used first is renumbered, its ledger lines follow, and a notice tells the user.
 */

export interface NumberNotice {
  id: string;
  text: string;
  at: string;
}

export interface NumberGuardApi {
  /** This device's short tag (stamped on every bill it makes). */
  deviceId: string;
  /** "Bill INV-0012 is now INV-0015 …" messages until the user dismisses them. */
  numberNotices: NumberNotice[];
  dismissNumberNotice: (id: string) => void;
  /** Numbers used by two old bills (made before device tags) that no device fixes on its own. */
  duplicateBillNumbers: string[];
  /** Compare with the cloud's bills now and renumber this device's later copies. Returns how many changed. */
  resolveBillNumberClashes: (cloud: NumberedDoc[]) => number;
}

interface Deps {
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  cheques: Cheque[];
  isCloudSyncReady: boolean;
  /** Next bill number for a date, never one of `existing` (moves the shared counter on). */
  nextBillNumber: (date: string, existing: string[]) => string;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: 'billing') => void;
}

const NOTICE_KEY = 'sarmaya_number_notices_v1';
const loadNotices = (): NumberNotice[] => {
  try {
    const v = JSON.parse(localStorage.getItem(NOTICE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Bill numbers held in the cloud (null when it can't be reached). */
const fetchCloudNumbers = async (): Promise<NumberedDoc[] | null> => {
  if (!isSupabaseConfigured) return null;
  try {
    const withDevice = await supabase.from('invoices').select('id,invoiceNumber,deviceId,createdAt');
    if (!withDevice.error) return (withDevice.data || []) as NumberedDoc[];
    // Cloud not updated yet (no deviceId column): numbers alone still find the clash.
    const plain = await supabase.from('invoices').select('id,invoiceNumber,createdAt');
    return plain.error ? null : ((plain.data || []) as NumberedDoc[]);
  } catch {
    return null;
  }
};

export const useNumberGuard = (d: Deps): NumberGuardApi => {
  const deviceId = useMemo(() => deviceTag(), []);
  const [numberNotices, setNotices] = useState<NumberNotice[]>(loadNotices);
  const [duplicateBillNumbers, setDuplicates] = useState<string[]>([]);
  const invoicesRef = useRef(d.invoices);
  invoicesRef.current = d.invoices;
  const chequesRef = useRef(d.cheques);
  chequesRef.current = d.cheques;
  const depsRef = useRef(d);
  depsRef.current = d;

  useEffect(() => {
    try {
      localStorage.setItem(NOTICE_KEY, JSON.stringify(numberNotices));
    } catch {
      /* storage full */
    }
  }, [numberNotices]);

  const resolveBillNumberClashes = (cloud: NumberedDoc[]): number => {
    const local = invoicesRef.current;
    const localDocs: NumberedDoc[] = local.map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, deviceId: i.deviceId, createdAt: i.createdAt }));
    setDuplicates(untaggedClashes(localDocs, cloud));
    const clashes = findNumberClashes(localDocs, cloud, deviceId);
    if (clashes.length === 0) return 0;
    const used = new Set([...localDocs, ...cloud].map((x) => (x.invoiceNumber || '').trim()).filter(Boolean));
    const changes = new Map<string, { from: string; to: string }>();
    clashes.forEach((c) => {
      const inv = local.find((i) => i.id === c.invoiceId);
      if (!inv || changes.has(inv.id)) return;
      const to = depsRef.current.nextBillNumber(inv.issueDate, Array.from(used));
      used.add(to);
      changes.set(inv.id, { from: c.number, to });
    });
    if (changes.size === 0) return 0;
    const now = new Date().toISOString();
    depsRef.current.setInvoices((prev) =>
      prev.map((i) => {
        const ch = changes.get(i.id);
        if (!ch) return i;
        const note = `Renumbered from ${ch.from}: another device had already used that number.`;
        return { ...i, invoiceNumber: ch.to, renumberedFrom: i.renumberedFrom || ch.from, notes: i.notes ? `${i.notes}\n${note}` : note, updatedAt: now.slice(0, 10) };
      })
    );
    // The bill's own ledger lines (sale, payments) and its cheque line carry the number: move them too.
    const chequeBill = new Map(chequesRef.current.filter((c) => c.invoiceId && changes.has(c.invoiceId)).map((c) => [c.id, c.invoiceId as string]));
    depsRef.current.setLedger((prev) =>
      prev.map((l) => {
        const billId = l.sourceId ? (changes.has(l.sourceId) ? l.sourceId : chequeBill.get(l.sourceId)) : undefined;
        const ch = billId ? changes.get(billId) : undefined;
        if (!ch) return l;
        return { ...l, referenceId: l.referenceId === ch.from ? ch.to : l.referenceId, description: (l.description || '').split(`Bill ${ch.from}`).join(`Bill ${ch.to}`) };
      })
    );
    const added: NumberNotice[] = Array.from(changes.values()).map((ch) => ({
      id: `num-${ch.from}-${ch.to}`,
      text: `Bill ${ch.from} made on this device is now ${ch.to}: another device had already used ${ch.from}. Reprint it if the old copy was handed over.`,
      at: now,
    }));
    setNotices((prev) => [...added.filter((a) => !prev.some((p) => p.id === a.id)), ...prev].slice(0, 20));
    changes.forEach((ch) => depsRef.current.logAuditEvent('Bill Renumbered', `${ch.from} → ${ch.to} (the same number was used on another device).`, 'warning', 'billing'));
    return changes.size;
  };
  const resolveRef = useRef(resolveBillNumberClashes);
  resolveRef.current = resolveBillNumberClashes;

  // Check shortly after this device's bills change (their upload runs first), when the connection
  // comes back, and every 5 minutes while the app is open.
  const check = useRef<() => void>(() => {});
  check.current = () => {
    if (!depsRef.current.isCloudSyncReady) return;
    void fetchCloudNumbers().then((cloud) => {
      if (cloud) resolveRef.current(cloud);
    });
  };
  useEffect(() => {
    if (!d.isCloudSyncReady || !isSupabaseConfigured) return;
    const t = setTimeout(() => check.current(), 2500);
    return () => clearTimeout(t);
  }, [d.invoices, d.isCloudSyncReady]);
  useEffect(() => {
    if (!d.isCloudSyncReady || !isSupabaseConfigured) return;
    const again = () => check.current();
    window.addEventListener('online', again);
    const every = setInterval(again, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('online', again);
      clearInterval(every);
    };
  }, [d.isCloudSyncReady]);

  return {
    deviceId,
    numberNotices,
    dismissNumberNotice: (id) => setNotices((prev) => prev.filter((n) => n.id !== id)),
    duplicateBillNumbers,
    resolveBillNumberClashes,
  };
};
