import { useState } from 'react';
import { fieldCanonical, fieldDisplay, UnitSystem } from '../../shared/gacUnits.js';

// Preserve partial decimals/exponents while immediately reflecting external edits.
// Remount on unit-system changes; display conversion never writes into the model.
export function GacUnitInput({ field, value, system, flowUnit, title, onChange }: {
  field: string; value: string; system: UnitSystem; flowUnit: string; title: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => ({ canonical: value, text: fieldDisplay(field, value, system, flowUnit) }));
  const text = draft.canonical === value ? draft.text : fieldDisplay(field, value, system, flowUnit);
  return <input aria-label={field} title={title} type="text" inputMode="decimal" value={text} onChange={e => {
    const canonical = fieldCanonical(field, e.target.value, system, flowUnit);
    setDraft({ canonical, text: e.target.value });
    onChange(canonical);
  }} />;
}
