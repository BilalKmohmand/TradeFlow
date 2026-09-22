import React from 'react';
import { useTrading } from '../../context/TradingContext';
import { inputCls, labelCls, rs } from './ui';
import { MAIN_BANK_CODE } from '../../utils/banks';

/**
 * "Which bank?" for money that goes through a bank. Shows nothing while the shop has only the main bank,
 * so the everyday forms look exactly as before; the value then stays '' (= the main bank).
 */
export const BankSelect: React.FC<{
  id: string;
  value: string;
  onChange: (code: string) => void;
  label?: string;
  /** Balance per bank to show next to each name. */
  balances?: Record<string, number>;
  className?: string;
  /** Leave out one bank (e.g. the "from" bank of a bank-to-bank move). */
  exclude?: string;
}> = ({ id, value, onChange, label = 'Bank account', balances, className, exclude }) => {
  const { bankAccounts } = useTrading();
  if (bankAccounts.length < 2) return null;
  const list = bankAccounts.filter((b) => b.code !== exclude);
  return (
    <div className={className}>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <select id={id} value={value || (exclude === MAIN_BANK_CODE ? list[0]?.code : MAIN_BANK_CODE)} onChange={(e) => onChange(e.target.value)} className={inputCls} data-testid={id}>
        {list.map((b) => (
          <option key={b.code} value={b.code}>{b.name}{balances && balances[b.code] != null ? ` (${rs(balances[b.code])})` : ''}</option>
        ))}
      </select>
    </div>
  );
};

/** '' / main bank -> undefined (records without a bank are the main bank). */
export const bankOpt = (code: string) => (code && code !== MAIN_BANK_CODE ? { bankCode: code } : {});
