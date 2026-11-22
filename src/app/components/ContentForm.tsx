/** Input forms for every generator content type. */
import { useState } from 'react';
import type { FieldError } from '../../core/payloads.ts';
import type {
  ContactContent, CreateContent, EmailContent, EpcContent, EventContent, GeoContent, WifiContent,
} from '../../core/types.ts';
import { Check, Segmented, TextField } from './ui.tsx';
import { Icon } from './Icon.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';

interface Props {
  content: CreateContent;
  onChange: (content: CreateContent) => void;
  errors: FieldError[];
  /** Only show errors for fields the user has touched (or after a submit attempt). */
  showErrors: boolean;
}

export function ContentForm({ content, onChange, errors, showErrors }: Props) {
  const { t } = useI18n();
  const err = (field: string) => {
    const e = errors.find((x) => x.field === field);
    if (!e || !showErrors) return undefined;
    return t(`error.${e.code}` as Key);
  };
  const set = <C extends CreateContent>(c: C, patch: Partial<C>) => onChange({ ...c, ...patch });

  switch (content.type) {
    case 'text':
      return (
        <TextField
          label={t('field.text')}
          value={content.text}
          multiline
          onChange={(text) => set(content, { text })}
          error={err('text')}
          hint={t('field.charCount', { count: [...content.text].length, max: 2000 })}
          maxLength={2000}
        />
      );
    case 'url':
      return (
        <TextField
          label={t('field.url')}
          value={content.url}
          type="url"
          inputMode="url"
          placeholder="https://example.org"
          onChange={(url) => set(content, { url })}
          error={err('url')}
          spellCheck={false}
        />
      );
    case 'wifi':
      return <WifiForm c={content} set={(p) => set(content, p)} err={err} />;
    case 'contact':
      return <ContactForm c={content} set={(p) => set(content, p)} err={err} />;
    case 'email':
      return <EmailForm c={content} set={(p) => set(content, p)} err={err} />;
    case 'sms':
      return (
        <div className="stack">
          <TextField label={t('field.number')} value={content.number} type="tel" inputMode="tel" autoComplete="tel" onChange={(number) => set(content, { number })} error={err('number')} />
          <TextField label={t('field.message')} value={content.message} multiline optional onChange={(message) => set(content, { message })} />
        </div>
      );
    case 'phone':
      return <TextField label={t('field.number')} value={content.number} type="tel" inputMode="tel" placeholder="+49 30 1234567" onChange={(number) => set(content, { number })} error={err('number')} />;
    case 'geo':
      return <GeoForm c={content} set={(p) => set(content, p)} err={err} />;
    case 'event':
      return <EventForm c={content} set={(p) => set(content, p)} err={err} />;
    case 'epc':
      return <EpcForm c={content} set={(p) => set(content, p)} err={err} />;
  }
}

type Sub<C> = { c: C; set: (patch: Partial<C>) => void; err: (field: string) => string | undefined };

function WifiForm({ c, set, err }: Sub<WifiContent>) {
  const { t } = useI18n();
  return (
    <div className="stack">
      <TextField label={t('field.ssid')} value={c.ssid} onChange={(ssid) => set({ ssid })} error={err('ssid')} spellCheck={false} />
      <Segmented
        legend={t('field.security')}
        value={c.security}
        onChange={(security) => set({ security })}
        options={[
          { value: 'WPA', label: t('field.wpa') },
          { value: 'WEP', label: t('field.wep') },
          { value: 'nopass', label: t('field.nopass') },
        ]}
      />
      {c.security !== 'nopass' && (
        <TextField label={t('field.password')} value={c.password} secret onChange={(password) => set({ password })} error={err('password')} autoComplete="off" spellCheck={false} />
      )}
      <Check label={t('field.hidden')} checked={c.hidden} onChange={(hidden) => set({ hidden })} />
    </div>
  );
}

function ContactForm({ c, set, err }: Sub<ContactContent>) {
  const { t } = useI18n();
  const f = (key: keyof ContactContent & string, extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
    <TextField label={t(`field.${key}` as Key)} value={String(c[key])} onChange={(v) => set({ [key]: v } as Partial<ContactContent>)} error={err(key)} optional {...extra} />
  );
  return (
    <div className="stack">
      <div className="grid-2">
        {f('firstName', { autoComplete: 'given-name' })}
        {f('lastName', { autoComplete: 'family-name' })}
      </div>
      <div className="grid-2">
        {f('organization', { autoComplete: 'organization' })}
        {f('title', { autoComplete: 'organization-title' })}
      </div>
      <div className="grid-2">
        {f('phone', { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
        {f('mobile', { type: 'tel', inputMode: 'tel' })}
      </div>
      <div className="grid-2">
        {f('email', { type: 'email', inputMode: 'email', autoComplete: 'email' })}
        {f('website', { type: 'url', inputMode: 'url', autoComplete: 'url' })}
      </div>
      {f('street', { autoComplete: 'street-address' })}
      <div className="grid-3">
        {f('postalCode', { autoComplete: 'postal-code' })}
        {f('city', { autoComplete: 'address-level2' })}
      </div>
      {f('country', { autoComplete: 'country-name' })}
      {f('note', { multiline: true })}
    </div>
  );
}

function EmailForm({ c, set, err }: Sub<EmailContent>) {
  const { t } = useI18n();
  return (
    <div className="stack">
      <TextField label={t('field.to')} value={c.to} type="email" inputMode="email" onChange={(to) => set({ to })} error={err('to')} spellCheck={false} />
      <TextField label={t('field.subject')} value={c.subject} optional onChange={(subject) => set({ subject })} />
      <TextField label={t('field.body')} value={c.body} optional multiline onChange={(body) => set({ body })} />
    </div>
  );
}

function GeoForm({ c, set, err }: Sub<GeoContent>) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const locate = () => {
    if (!navigator.geolocation) {
      setState('failed');
      return;
    }
    setState('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({ latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) });
        setState('idle');
      },
      () => setState('failed'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <div className="stack">
      <div className="grid-2">
        <TextField label={t('field.latitude')} value={c.latitude} inputMode="decimal" placeholder="52.520008" onChange={(latitude) => set({ latitude })} error={err('latitude')} />
        <TextField label={t('field.longitude')} value={c.longitude} inputMode="decimal" placeholder="13.404954" onChange={(longitude) => set({ longitude })} error={err('longitude')} />
      </div>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={locate} disabled={state === 'busy'}>
          <Icon name="locate" size={16} />
          {state === 'busy' ? t('field.locating') : t('field.useLocation')}
        </button>
        {state === 'failed' && <span className="muted small" role="status">{t('field.locationFailed')}</span>}
      </div>
      <TextField label={t('field.label')} value={c.label} optional onChange={(label) => set({ label })} />
    </div>
  );
}

function EventForm({ c, set, err }: Sub<EventContent>) {
  const { t } = useI18n();
  const toggleAllDay = (allDay: boolean) => {
    const cut = (v: string) => (allDay ? v.slice(0, 10) : v && !v.includes('T') ? `${v}T09:00` : v);
    set({ allDay, start: cut(c.start), end: cut(c.end) });
  };
  const type = c.allDay ? 'date' : 'datetime-local';
  return (
    <div className="stack">
      <TextField label={t('field.eventTitle')} value={c.title} onChange={(title) => set({ title })} error={err('title')} />
      <Check label={t('field.allDay')} checked={c.allDay} onChange={toggleAllDay} />
      <div className="grid-2">
        <TextField label={t('field.start')} value={c.start} type={type} onChange={(start) => set({ start })} error={err('start')} />
        <TextField label={t('field.end')} value={c.end} type={type} optional onChange={(end) => set({ end })} error={err('end')} />
      </div>
      <TextField label={t('field.location')} value={c.location} optional onChange={(location) => set({ location })} />
      <TextField label={t('field.description')} value={c.description} optional multiline onChange={(description) => set({ description })} />
    </div>
  );
}

function EpcForm({ c, set, err }: Sub<EpcContent>) {
  const { t } = useI18n();
  return (
    <div className="stack">
      <TextField label={t('field.name')} value={c.name} maxLength={70} onChange={(name) => set({ name })} error={err('name')} />
      <TextField label={t('field.iban')} value={c.iban} placeholder="DE89 3704 0044 0532 0130 00" onChange={(iban) => set({ iban })} error={err('iban')} spellCheck={false} />
      <div className="grid-2">
        <TextField label={t('field.bic')} value={c.bic} optional onChange={(bic) => set({ bic })} error={err('bic')} spellCheck={false} />
        <TextField label={t('field.amount')} value={c.amount} optional inputMode="decimal" placeholder="12,50" onChange={(amount) => set({ amount })} error={err('amount')} />
      </div>
      <TextField
        label={t('field.remittance')}
        value={c.text}
        optional
        maxLength={140}
        onChange={(text) => set({ text })}
        error={err('text')}
        hint={t('field.charCount', { count: c.text.length, max: 140 })}
      />
      <TextField label={t('field.reference')} value={c.reference} optional maxLength={35} onChange={(reference) => set({ reference })} error={err('reference')} />
    </div>
  );
}
