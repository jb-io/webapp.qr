/**
 * History: transparent view of everything stored locally, with single and
 * bulk deletion (undoable), JSON export and the raw localStorage content.
 */
import { useMemo, useRef, useState } from 'react';
import { createMatrix } from '../../core/matrix.ts';
import { parseContent } from '../../core/parse.ts';
import { renderSvg } from '../../core/render.ts';
import { MAX_ENTRIES } from '../../core/history.ts';
import type { CreateEntry, ScanEntry } from '../../core/types.ts';
import { FullscreenQr } from '../components/FullscreenQr.tsx';
import { Icon, TYPE_ICONS } from '../components/Icon.tsx';
import { ResultCard, formatLabel } from '../components/ResultCard.tsx';
import { ConfirmDialog, Note, Segmented, Toggle } from '../components/ui.tsx';
import { summarize } from './CreatePage.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useStore, useToasts } from '../state/Store.tsx';
import { downloadText, svgDataUrl } from '../lib/export.ts';
import { formatBytes, rawStorage } from '../lib/storage.ts';

type Tab = 'scans' | 'created';

function entrySvg(entry: CreateEntry, width?: number): string {
  try {
    return svgDataUrl(renderSvg(createMatrix(entry.payload, entry.options), entry.style, width).svg);
  } catch {
    return '';
  }
}

function Thumb({ entry }: { entry: CreateEntry }) {
  const src = useMemo(() => entrySvg(entry, 96), [entry]);
  return src ? <img className="thumb" src={src} alt="" /> : <span className="type-icon"><Icon name="qr" /></span>;
}

/** Title without secrets: for OTP/Wi-Fi the first non-sensitive field. */
function scanTitle(entry: ScanEntry): string {
  const parsed = parseContent(entry.text, entry.format);
  const first = parsed.sensitive ? parsed.fields.find((f) => !f.sensitive)?.value : undefined;
  return (first ?? entry.text).split('\n')[0]?.slice(0, 120) ?? '';
}

function prettyJson(raw: string | null): string {
  if (!raw) return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function HistoryPage() {
  const { t, formatDate, lang } = useI18n();
  const { history, deleteEntry, clearList, settings, updateSettings, loadDraft, navigate } = useStore();
  const { notify } = useToasts();
  const [tab, setTab] = useState<Tab>('scans');
  const [confirm, setConfirm] = useState(false);
  const [openScan, setOpenScan] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [large, setLarge] = useState<CreateEntry | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);

  const list = tab === 'scans' ? history.scans : history.created;
  const enabled = tab === 'scans' ? settings.saveScans : settings.saveCreated;
  const listName = tab === 'scans' ? t('history.scanned') : t('history.created');
  const titles = useMemo(() => new Map(history.scans.map((s) => [s.id, scanTitle(s)])), [history.scans]);
  const largeSrc = useMemo(() => (large ? entrySvg(large) : ''), [large]);

  /** Deletes and moves focus to the next entry (or the empty state). */
  const remove = (id: string, index: number) => {
    deleteEntry(id);
    if (openScan === id) setOpenScan(null);
    requestAnimationFrame(() => {
      const entries = listRef.current?.querySelectorAll<HTMLElement>('[data-entry]');
      const next = entries?.[Math.min(index, entries.length - 1)];
      (next?.querySelector<HTMLElement>('.btn') ?? emptyRef.current)?.focus();
    });
  };

  const exportJson = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(JSON.stringify(history, null, 2), `qr-history-${stamp}.json`, 'application/json');
  };

  const raw = showRaw ? rawStorage() : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('history.title')}</h1>
          <p>{t('history.info')}</p>
        </div>
      </div>

      <div className="stack">
        <Segmented<Tab>
          legend={t('history.title')}
          hideLegend
          value={tab}
          onChange={(v) => { setTab(v); setOpenScan(null); }}
          options={[
            { value: 'scans', label: `${t('history.scanned')} (${history.scans.length})`, icon: 'scan' },
            { value: 'created', label: `${t('history.created')} (${history.created.length})`, icon: 'qr' },
          ]}
        />

        <div className="card card-tight">
          <Toggle
            label={tab === 'scans' ? t('settings.saveScans') : t('settings.saveCreated')}
            checked={enabled}
            onChange={(v) => updateSettings(tab === 'scans' ? { saveScans: v } : { saveCreated: v })}
          />
          {!enabled && <Note tone="warn">{t('history.disabled')}</Note>}
        </div>

        {list.length === 0 ? (
          <div className="empty-state" ref={emptyRef} tabIndex={-1}>
            <Icon name="history" size={40} />
            <p>{tab === 'scans' ? t('history.emptyScans') : t('history.emptyCreated')}</p>
            <a className="btn btn-primary" href={tab === 'scans' ? '#/scan' : '#/create'}>
              <Icon name={tab === 'scans' ? 'scan' : 'qr'} size={18} />
              {tab === 'scans' ? t('history.goScan') : t('history.goCreate')}
            </a>
          </div>
        ) : (
          <ul className="list" aria-label={listName} ref={listRef}>
            {tab === 'scans' && history.scans.map((entry, index) => {
              const title = titles.get(entry.id) ?? '';
              return (
                <li key={entry.id} data-entry>
                  <div className="entry">
                    <span className="type-icon"><Icon name={TYPE_ICONS[entry.contentType] ?? 'text'} /></span>
                    <div className="entry-main">
                      <div className="title">{title}</div>
                      <div className="meta">
                        <span>{t(`type.${entry.contentType}`)}</span>
                        <span>{formatLabel(entry.format)}</span>
                        <span>{t(`history.source.${entry.source}`)}</span>
                        <time dateTime={entry.at}>{formatDate(entry.at)}</time>
                      </div>
                    </div>
                    <div className="btns">
                      <button type="button" className="btn btn-sm" aria-expanded={openScan === entry.id} onClick={() => setOpenScan(openScan === entry.id ? null : entry.id)}>
                        <Icon name={openScan === entry.id ? 'eyeOff' : 'eye'} size={16} />
                        <span className="label">{openScan === entry.id ? t('common.hide') : t('history.open')}</span>
                      </button>
                      <button type="button" className="btn btn-sm btn-icon btn-ghost btn-danger" onClick={() => remove(entry.id, index)} aria-label={`${t('common.delete')}: ${title}`}>
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  </div>
                  {openScan === entry.id && (
                    <div className="entry-detail">
                      <ResultCard headingLevel={3} code={{ text: entry.text, format: entry.format, version: '', ecLevel: '', mask: '', uec: -1, isMirrored: false, isInverted: false, position: [] }} />
                    </div>
                  )}
                </li>
              );
            })}
            {tab === 'created' && history.created.map((entry, index) => {
              const title = summarize(entry.content) || entry.payload.slice(0, 60);
              return (
                <li key={entry.id} data-entry className="entry">
                  <Thumb entry={entry} />
                  <div className="entry-main">
                    <div className="title">{title}</div>
                    <div className="meta">
                      <span>{t(`type.${entry.content.type}`)}</span>
                      <time dateTime={entry.at}>{formatDate(entry.at)}</time>
                    </div>
                  </div>
                  <div className="btns">
                    <button type="button" className="btn btn-sm" onClick={() => setLarge(entry)} aria-label={`${t('history.showLarge')}: ${title}`}>
                      <Icon name="expand" size={16} />
                      <span className="label">{t('history.showLarge')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-icon"
                      aria-label={`${t('common.edit')}: ${title}`}
                      title={t('common.edit')}
                      onClick={() => {
                        loadDraft({ content: entry.content, style: entry.style, options: entry.options, origin: 'history' });
                        navigate('create');
                      }}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" className="btn btn-sm btn-icon btn-ghost btn-danger" onClick={() => remove(entry.id, index)} aria-label={`${t('common.delete')}: ${title}`}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="actions">
          <button type="button" className="btn btn-danger" disabled={list.length === 0} onClick={() => setConfirm(true)}>
            <Icon name="trash" size={18} />
            {t('history.clearAll')}
          </button>
          <button type="button" className="btn" disabled={!history.scans.length && !history.created.length} onClick={exportJson} aria-describedby="export-hint">
            <Icon name="download" size={18} />
            {t('history.export')}
          </button>
          <button type="button" className="btn" aria-expanded={showRaw} onClick={() => setShowRaw((s) => !s)}>
            <Icon name="eye" size={18} />
            {t('history.raw')}
          </button>
        </div>
        <p className="muted small" id="export-hint">{t('history.exportHint')} {t('history.limit', { max: MAX_ENTRIES })}</p>

        {showRaw && (
          <section className="card raw-view" aria-labelledby="raw-title">
            <h2 id="raw-title">{t('history.raw')}</h2>
            <p className="muted small">{t('history.rawHelp')}</p>
            {raw.map((r) => (
              <div key={r.key} className="raw-item">
                <code>{r.key}</code> <span className="muted small">· {formatBytes(r.bytes, lang)}</span>
                <pre>{prettyJson(r.value)}</pre>
              </div>
            ))}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        title={t('history.clearAll')}
        text={t('history.clearConfirm', { count: list.length, list: listName })}
        confirmLabel={t('common.delete')}
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          clearList(tab);
          setConfirm(false);
          setOpenScan(null);
          notify('history.cleared');
        }}
      />

      {large && largeSrc && <FullscreenQr src={largeSrc} alt={summarize(large.content)} open onClose={() => setLarge(null)} />}
    </>
  );
}
