import { useState } from 'react';
import { useAppLanguage } from './WelcomeLanguage';

export function RangeNumber({ label, value, min, max, step, onChange, disabled = false }: {
  disabled?: boolean; label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void;
}) {
  const { t, tr } = useAppLanguage();
  const displayLabel = tr(label);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    if (raw.trim() === '' || !Number.isFinite(Number(raw))) return;
    const clamped = Math.min(max, Math.max(min, Number(raw)));
    onChange(Number((min + Math.round((clamped - min) / step) * step).toFixed(8)));
  };
  return <div className="setup-range-number">
    <label>{displayLabel}<input disabled={disabled} type="number" min={min} max={max} step={step} value={draft ?? value}
      onChange={event => {
        setDraft(event.target.value);
        if (event.target.value && event.target.validity.valid) commit(event.target.value);
      }}
      onBlur={event => { commit(event.target.value); setDraft(null); }}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
    <input disabled={disabled} type="range" aria-label={t(displayLabel + ' slider', 'Thanh trượt ' + displayLabel)} min={min} max={max} step={step} value={value}
      onChange={event => { setDraft(null); commit(event.target.value); }} />
  </div>;
}
