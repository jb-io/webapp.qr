/**
 * Shows one decoded code: what it is, what it contains, warnings - and only
 * then the actions. Nothing is opened or executed automatically.
 */
import { useId, useMemo, useState, type ReactElement } from 'react';
import { parseContent, toIcsFile, toVcfFile, type ParsedContent } from '../../core/parse.ts';
import { DEFAULT_OPTIONS } from '../../core/history.ts';
import { requiredEcLevel } from '../../core/payloads.ts';
import { Icon, TYPE_ICONS } from './Icon.tsx';
import { Note } from './ui.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';
import { useStore, useToasts } from '../state/Store.tsx';
import { canShare, copyText, downloadText, share } from '../lib/export.ts';
import type { DecodedCode } from '../lib/decoder.ts';

const FORMAT_LABELS: Record<string, string> = {
  QRCode: 'QR Code', MicroQRCode: 'Micro QR', RMQRCode: 'rMQR', DataMatrix: 'Data Matrix', Aztec: 'Aztec',
  PDF417: 'PDF417', EAN13: 'EAN-13', EAN8: 'EAN-8', UPCA: 'UPC-A', UPCE: 'UPC-E', Code128: 'Code 128',
  Code39: 'Code 39', Code93: 'Code 93', ITF: 'ITF', Codabar: 'Codabar', MaxiCode: 'MaxiCode', ISBN: 'ISBN',
};
export const formatLabel = (f: string): string => FORMAT_LABELS[f] ?? f;

const SECURITY_LABEL: Record<string, Key> = { WPA: 'field.wpa', SAE: 'field.sae', WEP: 'field.wep', nopass: 'field.nopass' };

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

/** Safe `tel:` href: only dial characters, `#` percent-encoded. */
const telHref = (n: string) => `tel:${n.replace(/[^\d+*#]/g, '').replace(/#/g, '%23')}`;

export function ResultCard({ code, headingLevel = 2, saved }: {
  code: DecodedCode;
  headingLevel?: 2 | 3;
  /** Whether the scan was written to the history (shown as a hint). */
  saved?: boolean;
}) {
  const { t } = useI18n();
  const { loadDraft, navigate, draft } = useStore();
  const { notify } = useToasts();
  const headingId = useId();
  const parsed: ParsedContent = useMemo(() => parseContent(code.text, code.format), [code.text, code.format]);
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
    if (!parsed.content) return;
    const forced = requiredEcLevel(parsed.content.type);
    loadDraft({ content: parsed.content, style: draft.style, options: forced ? { ...DEFAULT_OPTIONS, ecLevel: forced } : DEFAULT_OPTIONS, origin: 'scan' });
    navigate('create');
  };

  const url = parsed.url;
  const primary: ReactElement[] = [];
  const number = get('number');

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
      primary.push(<a key="call" className="btn btn-primary" href={telHref(number)}><Icon name="phone" size={18} />{t('result.call')}</a>);
      break;
    case 'sms':
      primary.push(
        <a key="sms" className="btn btn-primary" href={`sms:${number.replace(/[^\d+]/g, '')}${get('message') ? `?body=${encodeURIComponent(get('message'))}` : ''}`}>
          <Icon name="sms" size={18} />
          {t('result.sendSms')}
        </a>,
      );
      break;
    case 'email': {
      // Rebuilt only from the displayed fields - no hidden parameters reach the mail app.
      const query = [
        get('cc') && `cc=${encodeURIComponent(get('cc'))}`,
        get('bcc') && `bcc=${encodeURIComponent(get('bcc'))}`,
        get('subject') && `subject=${encodeURIComponent(get('subject'))}`,
        get('body') && `body=${encodeURIComponent(get('body'))}`,
      ].filter(Boolean).join('&');
      primary.push(<a key="mail" className="btn btn-primary" href={`mailto:${encodeURIComponent(get('to')).replace(/%40/g, '@').replace(/%2C/gi, ',')}${query ? `?${query}` : ''}`}><Icon name="mail" size={18} />{t('result.sendMail')}</a>);
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
        <button key="ics" type="button" className="btn btn-primary" onClick={() => downloadText(toIcsFile(code.text), `${(get('eventTitle') || 'event').replace(/[^\w-]+/g, '_')}.ics`, 'text/calendar')}>
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

  const display = (key: string, value: string) => {
    if (key === 'hidden') return t('common.yes');
    if (key === 'security') return SECURITY_LABEL[value] ? t(SECURITY_LABEL[value]) : value;
    return value;
  };

  return (
    <article className="card result" aria-labelledby={headingId}>
      <div className="result-head">
        <span className="type-icon"><Icon name={TYPE_ICONS[parsed.type] ?? 'text'} size={22} /></span>
        <div>
          <Heading id={headingId}>{t(`type.${parsed.type}`)}</Heading>
          <span className="muted small">{formatLabel(code.format)}{code.version ? ` · Version ${code.version}` : ''}</span>
        </div>
        {parsed.sensitive && <span className="badge badge-warn push-right"><Icon name="key" size={14} />{t('result.sensitive')}</span>}
      </div>

      {url && (parsed.type === 'url' || parsed.type === 'uri') && (
        <div className="stack result-block">
          <div className="url-box">{url.host ? highlightHost(url.href, url.host) : url.href}</div>
          {url.host && <p className="small">{t('warn.target', { host: url.domain })}</p>}
          {url.warnings.map((w) => (
            <Note key={w} tone={w === 'dangerousScheme' || w === 'userinfo' ? 'error' : 'warn'}>
              {t(`warn.${w}`, { host: url.host })}
            </Note>
          ))}
        </div>
      )}

      {parsed.type !== 'url' && parsed.type !== 'text' && parsed.fields.length > 0 && (
        <dl className="kv">
          {parsed.fields.map((f) => (
            <div key={f.key} className="kv-row">
              <dt>{t(`field.${f.key}` as Key)}</dt>
              <dd>{f.sensitive ? <Secret value={f.value} /> : display(f.key, f.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {parsed.type === 'text' && <p className="result-text">{code.text}</p>}

      <div className="stack result-block">
        {parsed.type === 'wifi' && <Note tone="info">{t('result.wifiHint')}</Note>}
        {parsed.type === 'epc' && <Note tone="info">{t('result.epcHint')}</Note>}
        {parsed.type === 'otp' && <Note tone="warn">{t('result.otpHint')} {t('result.notSaved')}</Note>}
        {parsed.type === 'uri' && <Note tone="info">{t('result.uriHint')}</Note>}
        {parsed.type === 'phone' && /[*#]/.test(number) && <Note tone="warn">{t('result.ussdWarning')}</Note>}
        {parsed.type === 'email' && get('bcc') && <Note tone="warn">{t('result.bccWarning')}</Note>}
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
          <button type="button" className="btn" onClick={() => share({ text: code.text }).catch(() => notify('common.shareFailed', 'error'))}>
            <Icon name="share" size={18} />
            {t('common.share')}
          </button>
        )}
        {parsed.content && (
          <button type="button" className="btn" onClick={edit}>
            <Icon name="edit" size={18} />
            {t('result.editAsQr')}
          </button>
        )}
      </div>
      {(parsed.type === 'url' || parsed.type === 'geo') && <p className="muted small result-note">{t('result.externalNote')}</p>}
      {saved && <p className="muted small result-note">{t('result.savedHint')} <a href="#/history">{t('result.savedHintLink')}</a></p>}

      <details className="raw">
        <summary>{t('result.rawShow')} · {t('result.length', { count: [...code.text].length })}</summary>
        <pre>{parsed.sensitive ? '••••••' : code.text}</pre>
      </details>
    </article>
  );
}

/** Emphasises the real host inside the full URL (phishing aid). */
function highlightHost(href: string, host: string) {
  const authorityStart = href.indexOf('//') + 2;
  const authorityEnd = href.indexOf('/', authorityStart) < 0 ? href.length : href.indexOf('/', authorityStart);
  const at = href.lastIndexOf('@', authorityEnd);
  const start = href.indexOf(host, Math.max(authorityStart, at + 1));
  if (start < 0) return href;
  return (
    <>
      {href.slice(0, start)}
      <strong>{host}</strong>
      {href.slice(start + host.length)}
    </>
  );
}
