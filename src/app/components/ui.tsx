/** Small accessible form and feedback building blocks. */
import { Component, useEffect, useId, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useToasts } from '../state/Store.tsx';

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
  /** Mask the value (passwords). */
  secret?: boolean;
  /** Called when the field loses focus (per-field "touched" state). */
  onBlur?: () => void;
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
    'aria-required': p.optional ? undefined : true,
    placeholder: p.placeholder,
    maxLength: p.maxLength,
    autoComplete: p.autoComplete ?? 'off',
    spellCheck: p.spellCheck,
    onBlur: p.onBlur,
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

export function Segmented<T extends string>({ legend, value, options, onChange, name, hideLegend }: {
  legend: string;
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (value: T) => void;
  name?: string;
  hideLegend?: boolean;
}) {
  const auto = useId();
  return (
    <fieldset className="plain">
      <legend className={hideLegend ? 'visually-hidden' : undefined}>{legend}</legend>
      <div className={`segmented${options.length >= 4 ? ' many' : ''}`}>
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

const HEX = /^#[\da-f]{6}$/i;

/** Colour picker plus hex field; only complete `#rrggbb` values leave this component. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="color-field">
        <input type="color" value={HEX.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={t('style.colorPicker', { label })} />
        <input
          id={id}
          className="input"
          value={text}
          maxLength={7}
          spellCheck={false}
          aria-invalid={HEX.test(text) ? undefined : true}
          onChange={(e) => {
            const v = e.target.value.trim();
            const withHash = v.startsWith('#') ? v : `#${v}`;
            setText(withHash);
            if (HEX.test(withHash)) onChange(withHash.toLowerCase());
          }}
          onBlur={() => setText(value)}
        />
      </div>
    </div>
  );
}

/**
 * Inline message. `live` makes it a live region: errors are announced
 * assertively (`role=alert`), everything else politely.
 */
export function Note({ tone, children, icon, live }: { tone: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode; icon?: IconName; live?: boolean }) {
  const fallback: Record<typeof tone, IconName> = { info: 'info', warn: 'alert', error: 'alert', ok: 'check' };
  const role = live ? (tone === 'error' ? 'alert' : 'status') : undefined;
  return (
    <div className={`note note-${tone}`} role={role}>
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
    <dialog ref={ref} aria-labelledby={titleId} onClose={onCancel}>
      <div className="modal">
        <h2 id={titleId}>{title}</h2>
        <p>{text}</p>
        <div className="actions">
          <button type="button" className="btn" onClick={onCancel} autoFocus>{t('common.cancel')}</button>
          <button type="button" className={danger ? 'btn btn-danger-solid' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useToasts();
  const { t } = useI18n();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          <Icon name={toast.tone === 'error' ? 'alert' : 'check'} size={18} />
          <span>{toast.text}</span>
          {toast.action && (
            <button type="button" className="toast-action" onClick={() => { toast.action?.run(); dismissToast(toast.id); }}>
              {toast.action.label}
            </button>
          )}
          <button type="button" className="toast-close" onClick={() => dismissToast(toast.id)} aria-label={t('common.close')}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Keeps a render error in one page from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback: (reset: () => void) => ReactNode; resetKey?: string }, { failed: boolean; key?: string }> {
  override state: { failed: boolean; key?: string } = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { failed: boolean; key?: string }) {
    // Navigating elsewhere clears the error.
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('render error', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}
