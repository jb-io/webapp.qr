/** Small accessible form and feedback building blocks. */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useStore } from '../state/Store.tsx';

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  type?: string;
  multiline?: boolean;
  autoComplete?: string;
  inputMode?: 'text' | 'url' | 'email' | 'tel' | 'numeric' | 'decimal';
  placeholder?: string;
  maxLength?: number;
  spellCheck?: boolean;
  /** Mask the value (passwords); a toggle reveals it. */
  secret?: boolean;
  id?: string;
}

export function TextField(p: FieldProps) {
  const { t } = useI18n();
  const auto = useId();
  const id = p.id ?? auto;
  const describedBy = [p.hint && `${id}-hint`, p.error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    className: 'input',
    value: p.value,
    'aria-invalid': p.error ? true : undefined,
    'aria-describedby': describedBy,
    placeholder: p.placeholder,
    maxLength: p.maxLength,
    autoComplete: p.autoComplete ?? 'off',
    spellCheck: p.spellCheck,
  } as const;
  return (
    <div className="field">
      <label htmlFor={id}>
        {p.label}
        {p.optional && <span className="opt"> ({t('field.optional')})</span>}
      </label>
      {p.multiline ? (
        <textarea {...common} onChange={(e) => p.onChange(e.target.value)} />
      ) : (
        <input
          {...common}
          type={p.secret ? 'password' : p.type ?? 'text'}
          inputMode={p.inputMode}
          onChange={(e) => p.onChange(e.target.value)}
        />
      )}
      {p.hint && <span className="hint" id={`${id}-hint`}>{p.hint}</span>}
      {p.error && (
        <span className="error" id={`${id}-err`}>
          <Icon name="alert" size={16} />
          {p.error}
        </span>
      )}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label className="switch" htmlFor={id}>
        <span>{label}</span>
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-h` : undefined} />
      </label>
      {hint && <p className="muted small" id={`${id}-h`}>{hint}</p>}
    </div>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({ legend, value, options, onChange, name }: {
  legend: string;
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (value: T) => void;
  name?: string;
}) {
  const auto = useId();
  return (
    <fieldset className="plain">
      <legend>{legend}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={name ?? auto} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>
              {o.icon && <Icon name={o.icon} size={16} />}
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Select<T extends string | number>({ label, value, options, onChange, hint }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="input"
        value={String(value)}
        aria-describedby={hint ? `${id}-h` : undefined}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value);
          if (hit) onChange(hit.value);
        }}
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
      {hint && <span className="hint" id={`${id}-h`}>{hint}</span>}
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="color-field">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        <input
          id={id}
          className="input"
          value={value}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[\da-f]{6}$/i.test(v)) onChange(v.toLowerCase());
            else if (/^#?[\da-f]{0,6}$/i.test(v)) onChange(v.startsWith('#') ? v : `#${v}`);
          }}
        />
      </div>
    </div>
  );
}

export function Note({ tone, children, icon }: { tone: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode; icon?: IconName }) {
  const fallback: Record<typeof tone, IconName> = { info: 'info', warn: 'alert', error: 'alert', ok: 'check' };
  return (
    <div className={`note note-${tone}`}>
      <Icon name={icon ?? fallback[tone]} size={18} />
      <div>{children}</div>
    </div>
  );
}

/** Native <dialog> confirmation: focus trap, Esc and backdrop for free. */
export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onCancel, danger }: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const titleId = useId();
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onCancel} onCancel={onCancel}>
      <div className="modal">
        <h2 id={titleId}>{title}</h2>
        <p>{text}</p>
        <div className="actions">
          <button type="button" className="btn" onClick={onCancel} autoFocus>{t('common.cancel')}</button>
          <button type="button" className={danger ? 'btn btn-primary btn-danger-solid' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  const { t } = useI18n();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          <Icon name={toast.tone === 'error' ? 'alert' : 'check'} size={18} />
          <span>{toast.text}</span>
          <button type="button" onClick={() => dismissToast(toast.id)} aria-label={t('common.close')}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
