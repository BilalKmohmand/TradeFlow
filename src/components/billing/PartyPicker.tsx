import React, { useMemo } from 'react';
import { CodeBox } from './CodeBox';
import { QuickSelect, PickOption } from './QuickPick';
import { inputCls } from './ui';

export interface PickableParty {
  id: string;
  name: string;
  code?: string;
  company?: string;
  phone?: string;
  city?: string;
}

/**
 * The one way to pick a customer or supplier in a form, as in Apna Accountant: a Code box (type "C-0007"
 * or just "7", Enter) beside the name list, which itself can be searched by typing a name, code, shop name,
 * phone or city (QuickSelect). The list keeps its own id, so `<label htmlFor={id}>` names it.
 *
 *   <PartyPicker id="rc-cust" parties={customers} value={cust} onChange={setCust} placeholder="Select customer…"
 *     optionText={(c) => `${c.name} (owes …)`} />
 */
export const PartyPicker = <T extends PickableParty>({
  id,
  parties,
  value,
  onChange,
  placeholder,
  optionText,
  nameOf = (p) => p.name,
  codeLabel = 'Party code',
  nextId,
  className = '',
  allowEmpty = true,
}: {
  id: string;
  parties: T[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  /** Text of one option after the code (default: the name). */
  optionText?: (p: T) => string;
  /** The name shown and matched first (suppliers: the company). */
  nameOf?: (p: T) => string;
  /** Accessible name of the Code box. Kept free of "Customer" / "Supplier" so the list alone owns that label. */
  codeLabel?: string;
  nextId?: string;
  className?: string;
  /** Show the placeholder as a choice (an empty value = none picked / all). */
  allowEmpty?: boolean;
}) => {
  const options: PickOption[] = useMemo(
    () => parties.map((p) => ({ value: p.id, name: nameOf(p), code: p.code, extra: [p.company, p.phone, p.city].filter(Boolean).join(' ') })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parties]
  );
  return (
    <div className={`flex gap-2 ${className}`}>
      <CodeBox id={`${id}-code`} label={codeLabel} items={parties} value={value} onPick={onChange} pairId={id} nextId={nextId} skipAutofocus className="w-24 sm:w-28 shrink-0" />
      <div className="flex-1 min-w-0">
        <QuickSelect id={id} value={value} options={options} onPick={onChange} className={inputCls} title="Type a name, code, phone or city to find it">
          {allowEmpty && <option value="">{placeholder}</option>}
          {parties.map((p) => (
            <option key={p.id} value={p.id}>{p.code ? `${p.code} • ` : ''}{optionText ? optionText(p) : nameOf(p)}</option>
          ))}
        </QuickSelect>
      </div>
    </div>
  );
};
