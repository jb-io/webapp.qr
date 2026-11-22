/**
 * Shows one decoded code: what it is, what it contains, warnings - and only
 * then the actions. Nothing is opened or executed automatically.
 */
import { useState, type ReactElement } from 'react';
import { parseContent, toIcsFile, toVcfFile, type ParsedContent } from '../../core/parse.ts';
import { textToContent } from '../../core/convert.ts';
import { DEFAULT_OPTIONS } from '../../core/history.ts';
import { requiredEcLevel } from '../../core/payloads.ts';
import { Icon, TYPE_ICONS } from './Icon.tsx';
import { Note } from './ui.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';
import { useStore } from '../state/Store.tsx';
import { canShare, copyText, downloadText, share } from '../lib/export.ts';
import type { DecodedCode } from '../lib/decoder.ts';

const FORMAT_LABELS: Record<string, string> = {
  QRCode: 'QR Code', MicroQRCode: 'Micro QR', RMQRCode: 'rMQR', DataMatrix: 'Data Matrix', Aztec: 'Aztec',
  PDF417: 'PDF417', EAN13: 'EAN-13', EAN8: 'EAN-8', UPCA: 'UPC-A', UPCE: 'UPC-E', Code128: 'Code 128',
  Code39: 'Code 39', Code93: 'Code 93', ITF: 'ITF', Codabar: 'Codabar', MaxiCode: 'MaxiCode', ISBN: 'ISBN',
};
export const formatLabel = (f: string): string => FORMAT_LABELS[f] ?? f;

function Secret({ value }: { value: string }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <span className="secret">
      <span>{shown ? value : '•'.repeat(Math.min(12, Math.max(6, value.length)))}</span>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
        <Icon name={shown ? 'eyeOff' : 'eye'} size={16} />
        {shown ? t('result.conceal') : t('result.reveal')}
      </button>
    </span>
  );
}

const FIELD_KEYS: Record<string, Key> = {
  title: 'field.eventTitle', text: 'field.text', label: 'field.label',
};

export function ResultCard({ code, headingLevel = 2 }: { code: DecodedCode; headingLevel?: 2 | 3 }) {
  const { t } = useI18n();
  const { notify, loadDraft, navigate, draft } = useStore();
  const parsed: ParsedContent = parseContent(code.text, code.format);
  const get = (key: string) => parsed.fields.find((f) => f.key === key)?.value ?? '';
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  const copy = async (text: string) => {
    try {
      await copyText(text);
      notify('common.copied');
    } catch {
      notify('common.copyFailed', 'error');
    }
  };

  const edit = () => {
    const content = textToContent(code.text);
    const forced = requiredEcLevel(content.type);
    loadDraft({ content, style: draft.style, options: forced ? { ...DEFAULT_OPTIONS, ecLevel: forced } : DEFAULT_OPTIONS, origin: 'scan' });
    navigate('create');
  };

  const fieldLabel = (key: string) => t(FIELD_KEYS[key] ?? (`field.${key}` as Key));
  const url = parsed.url;
  const primary: ReactElement[] = [];

  switch (parsed.type) {
    case 'url':
      if (url?.openable && !url.warnings.includes('dangerousScheme')) {
        primary.push(
          <a key="open" className="btn btn-primary" href={url.href} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={18} />
            {t('result.openLink')}
          </a>,
        );
      }
      break;
    case 'phone':
      primary.push(<a key="call" className="btn btn-primary" href={`tel:${get('number')}`}><Icon name="phone" size={18} />{t('result.call')}</a>);
      break;
    case 'sms':
      primary.push(
        <a key="sms" className="btn btn-primary" href={`sms:${get('number')}${get('message') ? `?body=${encodeURIComponent(get('message'))}` : ''}`}>
          <Icon name="sms" size={18} />
          {t('result.sendSms')}
        </a>,
      );
      break;
    case 'email': {
      const href = /^mailto:/i.test(code.text.trim()) ? code.text.trim()
        : `mailto:${get('to')}?subject=${encodeURIComponent(get('subject'))}&body=${encodeURIComponent(get('body'))}`;
      primary.push(<a key="mail" className="btn btn-primary" href={href}><Icon name="mail" size={18} />{t('result.sendMail')}</a>);
      break;
    }
    case 'contact':
      primary.push(
        <button key="vcf" type="button" className="btn btn-primary" onClick={() => downloadText(toVcfFile(code.text), `${(get('name') || 'contact').replace(/[^\w-]+/g, '_')}.vcf`, 'text/vcard')}>
          <Icon name="download" size={18} />
          {t('result.saveContact')}
        </button>,
      );
      break;
    case 'event':
      primary.push(
        <button key="ics" type="button" className="btn btn-primary" onClick={() => downloadText(toIcsFile(code.text), `${(get('title') || 'event').replace(/[^\w-]+/g, '_')}.ics`, 'text/calendar')}>
          <Icon name="calendar" size={18} />
          {t('result.saveEvent')}
        </button>,
      );
      break;
    case 'geo': {
      const lat = get('latitude');
      const lon = get('longitude');
      primary.push(<a key="geo" className="btn btn-primary" href={`geo:${lat},${lon}`}><Icon name="pin" size={18} />{t('result.openMapApp')}</a>);
      primary.push(
        <a key="osm" className="btn" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={18} />
          {t('result.openOsm')}
        </a>,
      );
      break;
    }
    case 'wifi':
      if (get('password')) {
        primary.push(<button key="pw" type="button" className="btn btn-primary" onClick={() => copy(get('password'))}><Icon name="copy" size={18} />{t('result.copyPassword')}</button>);
      }
      break;
    case 'epc':
      primary.push(<button key="iban" type="button" className="btn btn-primary" onClick={() => copy(get('iban').replace(/\s/g, ''))}><Icon name="copy" size={18} />{t('result.copyIban')}</button>);
      break;
    default:
      break;
  }

  const editable = !['otp', 'product', 'uri'].includes(parsed.type);

  return (
    <article className="card" aria-labelledby={`res-${code.text.length}-${code.format}`}>
      <div className="result-head">
        <span className="type-icon"><Icon name={TYPE_ICONS[parsed.type] ?? 'text'} size={22} /></span>
        <div>
          <Heading id={`res-${code.text.length}-${code.format}`}>{t(`type.${parsed.type}` as Key)}</Heading>
          <span className="muted small">{formatLabel(code.format)}{code.version ? ` · ${code.version}` : ''}{code.ecLevel ? ` · EC ${code.ecLevel}` : ''}</span>
        </div>
        {parsed.sensitive && <span className="badge badge-warn" style={{ marginLeft: 'auto' }}><Icon name="key" size={14} />{t('result.sensitive')}</span>}
      </div>

      {url && (parsed.type === 'url' || parsed.type === 'uri') && (
        <div className="stack" style={{ marginBottom: 12 }}>
          <div className="url-box">
            {url.host ? highlightHost(url.href, url.host) : url.href}
          </div>
          {url.host && <p className="small">{t('warn.target', { host: url.host })}</p>}
          {url.warnings.map((w) => (
            <Note key={w} tone={w === 'dangerousScheme' || w === 'userinfo' ? 'error' : 'warn'}>
              {t(`warn.${w}` as Key, { host: url.host })}
            </Note>
          ))}
        </div>
      )}

      {parsed.type !== 'url' && parsed.type !== 'text' && parsed.fields.length > 0 && (
        <dl className="kv">
          {parsed.fields.map((f) => (
            <div key={f.key} style={{ display: 'contents' }}>
              <dt>{fieldLabel(f.key)}</dt>
              <dd>{f.sensitive ? <Secret value={f.value} /> : f.key === 'hidden' ? t('common.yes') : f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {parsed.type === 'text' && <p className="kv-text" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 14 }}>{code.text}</p>}

      <div className="stack" style={{ marginBottom: 14 }}>
        {parsed.type === 'wifi' && <Note tone="info">{t('result.wifiHint')}</Note>}
        {parsed.type === 'epc' && <Note tone="info">{t('result.epcHint')}</Note>}
        {parsed.type === 'otp' && <Note tone="warn">{t('result.otpHint')}</Note>}
        {parsed.type === 'uri' && <Note tone="info">{t('result.uriHint')}</Note>}
      </div>

      <div className="actions">
        {primary}
        {parsed.type !== 'otp' && (
          <button type="button" className="btn" onClick={() => copy(url?.href && parsed.type === 'url' ? url.href : code.text)}>
            <Icon name="copy" size={18} />
            {parsed.type === 'url' ? t('result.copyLink') : t('common.copy')}
          </button>
        )}
        {canShare() && parsed.type !== 'otp' && (
          <button type="button" className="btn" onClick={() => share({ text: code.text }).catch(() => notify('common.error', 'error', { message: 'share' }))}>
            <Icon name="share" size={18} />
            {t('common.share')}
          </button>
        )}
        {editable && (
          <button type="button" className="btn" onClick={edit}>
            <Icon name="edit" size={18} />
            {t('result.editAsQr')}
          </button>
        )}
      </div>
      {(parsed.type === 'url' || parsed.type === 'geo') && <p className="muted small" style={{ marginTop: 10 }}>{t('result.externalNote')}</p>}

      <details className="raw">
        <summary>{t('result.rawShow')} · {t('result.length', { count: [...code.text].length })}</summary>
        <pre>{parsed.sensitive ? '••••••' : code.text}</pre>
      </details>
    </article>
  );
}

/** Emphasises the real host inside the full URL (phishing aid). */
function highlightHost(href: string, host: string) {
  const at = href.indexOf(host, href.indexOf('//') + 2);
  if (at < 0) return href;
  return (
    <>
      {href.slice(0, at)}
      <strong>{host}</strong>
      {href.slice(at + host.length)}
    </>
  );
}
