/**
 * Generator: content form, live preview with export, independent
 * verification and design options. The draft lives in the store so it
 * survives switching tabs; it is only written to the history on an explicit
 * action (save, export, share, copy, fullscreen) - never per keystroke.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze } from '../../core/analysis.ts';
import { CapacityError, createMatrix } from '../../core/matrix.ts';
import { buildPayload, emptyContent, requiredEcLevel, validateContent } from '../../core/payloads.ts';
import { renderSvg } from '../../core/render.ts';
import { CREATE_TYPES, type CreateContent, type CreateType } from '../../core/types.ts';
import { ContentForm } from '../components/ContentForm.tsx';
import { FullscreenQr } from '../components/FullscreenQr.tsx';
import { Icon, TYPE_ICONS } from '../components/Icon.tsx';
import { StylePanel } from '../components/StylePanel.tsx';
import { Note, Select } from '../components/ui.tsx';
import { VerifyPanel } from '../components/VerifyPanel.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useStore, useToasts, type Draft } from '../state/Store.tsx';
import {
  canCopyImage, canShareFiles, copyImage, downloadBlob, EXPORT_FORMATS, exportBlob, fileName, share, svgDataUrl,
  type ExportFormat,
} from '../lib/export.ts';

const SIZES = [256, 512, 1024, 2048, 4096];
const PRINT_MM = [20, 30, 50, 80, 100, 150];

/** Short human summary for alt texts and history. Never contains secrets. */
export function summarize(c: CreateContent): string {
  switch (c.type) {
    case 'text': return c.text.slice(0, 80);
    case 'url': return c.url;
    case 'wifi': return c.ssid;
    case 'contact': return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.organization;
    case 'email': return c.to;
    case 'sms':
    case 'phone': return c.number;
    case 'geo': return c.label || `${c.latitude}, ${c.longitude}`;
    case 'event': return c.title;
    case 'epc': return `${c.name}${c.amount ? ` · ${c.amount} €` : ''}`;
  }
}

export function CreatePage() {
  const { t } = useI18n();
  const { draft, setDraft, recordCreated } = useStore();
  const { notify } = useToasts();
  const { content, style, options } = draft;
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [hint, setHint] = useState<Draft['origin']>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [size, setSize] = useState(1024);
  const [printMm, setPrintMm] = useState(50);
  const [busy, setBusy] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  /** Input per type, so that switching types never throws work away. */
  const byType = useRef(new Map<CreateType, CreateContent>());

  // A draft prefilled from outside (share, scan, history): show the hint once,
  // focus it (not an input - no keyboard covering the code) and reveal the preview.
  useEffect(() => {
    if (!draft.origin) return;
    setHint(draft.origin);
    setDraft({ origin: null });
    byType.current.clear();
    requestAnimationFrame(() => {
      hintRef.current?.focus({ preventScroll: true });
      previewRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [draft.origin, setDraft]);

  const errors = useMemo(() => validateContent(content), [content]);
  const payload = useMemo(() => (errors.length ? '' : buildPayload(content)), [content, errors]);
  const effectiveOptions = useMemo(() => {
    const forced = requiredEcLevel(content.type);
    return forced ? { ...options, ecLevel: forced } : options;
  }, [content.type, options]);

  const rendered = useMemo(() => {
    if (!payload) return null;
    try {
      const matrix = createMatrix(payload, effectiveOptions);
      const { svg, layout } = renderSvg(matrix, style);
      return { matrix, svg, aspect: layout.height / layout.width, src: svgDataUrl(svg) };
    } catch (error) {
      return { error: error instanceof CapacityError ? 'capacity' : String(error) };
    }
  }, [payload, effectiveOptions, style]);

  const ready = rendered && !('error' in rendered) ? rendered : null;
  const analysis = useMemo(() => (ready ? analyze(ready.matrix, style, size) : null), [ready, style, size]);
  const summary = summarize(content);

  const changeType = (type: CreateType) => {
    if (type === content.type) return;
    byType.current.set(content.type, content);
    setTouched(new Set());
    setHint(null);
    setDraft({ content: byType.current.get(type) ?? emptyContent(type) });
  };

  const remember = (explicit: boolean) => {
    if (!ready) return;
    recordCreated({ content, style, options: effectiveOptions, payload }, explicit);
  };

  // No content in document metadata: a PDF should not reveal more than the code.
  const exportFile = async (f: ExportFormat) => {
    if (!ready) return null;
    const blob = await exportBlob(ready.svg, { format: f, width: size, printMm, aspect: ready.aspect, title: t('create.shareText') });
    return new File([blob], fileName(content.type, f), { type: blob.type });
  };

  const fail = (error: unknown) => notify('common.error', 'error', { message: error instanceof Error ? error.message : String(error) });

  const onDownload = async () => {
    setBusy(true);
    try {
      const file = await exportFile(format);
      if (file) {
        downloadBlob(file, file.name);
        remember(false);
      }
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    setBusy(true);
    try {
      const file = await exportFile('png');
      // Text fallback only where the payload holds no secret.
      const text = content.type === 'wifi' ? undefined : payload;
      if (file && (await share({ file, title: t('create.shareText'), text }))) remember(false);
    } catch {
      notify('common.shareFailed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onCopyImage = async () => {
    if (!ready) return;
    try {
      await copyImage(exportBlob(ready.svg, { format: 'png', width: size, printMm, aspect: ready.aspect, title: '' }));
      notify('common.copied');
      remember(false);
    } catch {
      notify('common.copyFailed', 'error');
    }
  };

  const hintText = hint === 'share' ? t('create.fromShare') : hint === 'scan' ? t('create.fromScan') : hint === 'history' ? t('create.fromHistory') : '';

  return (
    <>
      <div className="page-head">
        <h1>{t('create.title')}</h1>
      </div>

      <div className="create-layout">
        <section className="card area-content" aria-labelledby="content-title">
          <h2 id="content-title" className="visually-hidden">{t('create.content')}</h2>
          <fieldset className="types">
            <legend className="visually-hidden">{t('create.type')}</legend>
            {CREATE_TYPES.map((type) => (
              <label key={type}>
                <input type="radio" name="qr-type" value={type} checked={content.type === type} onChange={() => changeType(type)} />
                <span>
                  <Icon name={TYPE_ICONS[type] ?? 'text'} size={22} />
                  {t(`type.${type}`)}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="stack form-body">
            {hintText && <div ref={hintRef} tabIndex={-1} className="hint-focus"><Note tone="info">{hintText}</Note></div>}
            <ContentForm
              content={content}
              onPatch={(patch) => setDraft((d) => ({ content: { ...d.content, ...patch } as CreateContent }))}
              errors={errors}
              touched={touched}
              onTouch={(field) => setTouched((s) => (s.has(field) ? s : new Set(s).add(field)))}
              showAll={hint !== null}
            />
          </div>
        </section>

        <div className="area-side">
          <section className="card" aria-labelledby="preview-title" ref={previewRef}>
            <h2 id="preview-title" className="visually-hidden">{t('create.preview')}</h2>
            <div className={`preview${style.transparentBackground ? ' is-transparent' : ''}`}>
              {ready ? (
                <img src={ready.src} alt={t('create.previewAlt', { summary })} />
              ) : (
                <p className="empty">{rendered && 'error' in rendered && rendered.error === 'capacity' ? t('error.capacity') : t('create.empty')}</p>
              )}
            </div>

            <div className="preview-actions">
              <button type="button" className="btn wide" disabled={!ready} onClick={() => { setFullscreen(true); remember(false); }}>
                <Icon name="expand" size={18} />
                {t('create.fullscreen')}
              </button>
              {canShareFiles() && (
                <button type="button" className="btn" disabled={!ready || busy} onClick={onShare}>
                  <Icon name="share" size={18} />
                  {t('common.share')}
                </button>
              )}
              {canCopyImage() && (
                <button type="button" className="btn" disabled={!ready} onClick={onCopyImage}>
                  <Icon name="copy" size={18} />
                  {t('create.copyImage')}
                </button>
              )}
              <button type="button" className="btn" disabled={!ready} onClick={() => remember(true)}>
                <Icon name="save" size={18} />
                {t('create.save')}
              </button>
            </div>

            <div className="export-row">
              <Select<ExportFormat>
                label={t('create.exportFormat')}
                value={format}
                onChange={setFormat}
                options={EXPORT_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))}
              />
              {format === 'pdf' ? (
                <Select label={t('create.exportPrint')} value={printMm} onChange={setPrintMm} options={PRINT_MM.map((v) => ({ value: v, label: `${v / 10} cm` }))} />
              ) : (
                <Select label={t('create.exportSize')} value={size} onChange={setSize} options={SIZES.map((v) => ({ value: v, label: `${v} × ${v} px` }))} />
              )}
              <button type="button" className="btn btn-primary btn-block wide" disabled={!ready || busy} onClick={onDownload}>
                <Icon name="download" size={18} />
                {t('create.download')} ({format.toUpperCase()})
              </button>
            </div>

            {ready && (
              <details className="raw">
                <summary>{t('create.payload')}</summary>
                <pre className="payload">{content.type === 'wifi' ? payload.replace(/P:(?:\\.|[^;])*/, 'P:••••') : payload}</pre>
              </details>
            )}
          </section>

          {ready && analysis && <VerifyPanel svg={ready.svg} aspect={ready.aspect} payload={payload} matrix={ready.matrix} analysis={analysis} />}
        </div>

        <section className="card area-design" aria-labelledby="design-title">
          <h2 id="design-title">{t('create.design')}</h2>
          <StylePanel
            style={style}
            options={options}
            type={content.type}
            onStyle={(patch) => setDraft((d) => ({ style: { ...d.style, ...patch } }))}
            onOptions={(patch) => setDraft((d) => ({ options: { ...d.options, ...(typeof patch === 'function' ? patch(d.options) : patch) } }))}
          />
        </section>
      </div>

      {ready && <FullscreenQr src={ready.src} alt={t('create.previewAlt', { summary })} open={fullscreen} onClose={() => setFullscreen(false)} />}
    </>
  );
}
