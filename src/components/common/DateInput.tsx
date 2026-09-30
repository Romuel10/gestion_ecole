import { useCallback, useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDate, formatDateTime, parseDisplayDate } from '../../services/dateFormat';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  type?: 'date' | 'datetime-local';
  min?: string;
  max?: string;
};

/** Explicit day-month-year entry, independent of the Windows/browser locale. */
export function DateInput({ value, onChange, type = 'date', min, max, id, className, onBlur, ...props }: Props) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const display = useCallback((iso: string) => type === 'date' ? formatDate(iso, '') : formatDateTime(iso, ''), [type]);
  const [draft, setDraft] = useState(() => display(value));
  const emitted = useRef(value);
  const field = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const placeholder = type === 'date' ? 'JJ-MM-AAAA' : 'JJ-MM-AAAA HH:mm';

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(display(value));
      field.current?.setCustomValidity('');
    }
  }, [value, display]);

  const update = (text: string) => {
    setDraft(text);
    const [date, time = ''] = text.trim().split(/\s+/);
    let iso = parseDisplayDate(date || '');
    if (type === 'datetime-local') iso = iso && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? `${iso}T${time}` : '';
    const invalid = !!text.trim() && (!iso || (min && iso < min) || (max && iso > max));
    field.current?.setCustomValidity(invalid ? `Saisissez une date valide au format ${placeholder}${min ? `, à partir du ${display(min)}` : ''}${max ? `, jusqu’au ${display(max)}` : ''}.` : '');
    emitted.current = invalid ? '' : iso;
    onChange({ target: { value: emitted.current } });
  };

  return <span className="date-input">
    <input {...props} id={inputId} ref={field} type="text" inputMode={type === 'date' ? 'numeric' : 'text'}
      className={className} placeholder={props.placeholder || placeholder} title={placeholder}
      value={draft} onChange={(event) => update(event.target.value)}
      onBlur={(event) => {
        if (emitted.current) setDraft(display(emitted.current));
        if (draft && !event.currentTarget.validity.valid) event.currentTarget.reportValidity();
        onBlur?.(event);
      }} />
    <button type="button" className="date-input__calendar" aria-label="Ouvrir le calendrier" disabled={props.disabled || props.readOnly}
      onClick={() => { try { picker.current?.showPicker(); } catch { field.current?.focus(); } }}>
      <CalendarDays size={16} />
    </button>
    <input ref={picker} type={type} value={value} min={min} max={max} tabIndex={-1} aria-hidden="true"
      className="date-input__native" onChange={(event) => update(display(event.target.value))} />
  </span>;
}

