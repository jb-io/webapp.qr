/**
 * History: transparent view of everything stored locally, with single and
 * bulk deletion, JSON export and the raw localStorage content.
 */
import { useMemo, useState } from 'react';
import { createMatrix } from '../../core/matrix.ts';
import { parseContent } from '../../core/parse.ts';
import { renderSvg } from '../../core/render.ts';
import { MAX_ENTRIES } from '../../core/history.ts';
import type { CreateEntry, ScanEntry } from '../../core/types.ts';
import { Icon, TYPE_ICONS } from '../components/Icon.tsx';
import { ResultCard, formatLabel } from '../components/ResultCard.tsx';
import { ConfirmDialog, Note, Segmented, Toggle } from '../components/ui.tsx';
import { summarize } from './CreatePage.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';
import { useStore } from '../state/Store.tsx';
import { downloadText, svgDataUrl } from '../lib/export.ts';
import { formatBytes, rawStorage } from '../lib/storage.ts';

type Tab = 'scans' | 'created';

function Thumb({ entry }: { entry: CreateEntry }) {
  const src = useMemo(() => {
    try {
      return svgDataUrl(renderSvg(createMatrix(entry.payload, entry.options), entry.style, 96).svg);
    } catch {
      return '';
    }
  }, [entry]);
  return src ? <img className="thumb" src={src} alt="" /> : <span className="type-icon"><Icon name="qr" /></span>;
}

function scanTitle(entry: ScanEntry): string {
  const parsed = parseContent(entry.text, entry.format);
  const first = parsed.sensitive ? parsed.fields.find((f) => !f.sensitive)?.value : undefined;
  return (first ?? entry.text).split('\n')[0]?.slice(0, 120) ?? '';
}

export function HistoryPage() {
  const { t, formatDate, lang } = useI18n();
  const { history, deleteEntry, clearList, settings, updateSettings, loadDraft, navigate, notify } = useStore();
  const [tab, setTab] = useState<Tab>('scans');
  const [confirm, setConfirm] = useState(false);
  const [openScan, setOpenScan] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const list = tab === 'scans' ? history.scans : history.created;
  const enabled = tab === 'scans' ? settings.saveScans : settings.saveCreated;
  const listName = tab === 'scans' ? t('history.scanned') : t('history.created');

  const remove = (id: string) => {
    deleteEntry(id);
    if (openScan === id) setOpenScan(null);
    notify('history.deleted');
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
          value={tab}
          onChange={(v) => { setTab(v); setOpenScan(null); }}
          options={[
            { value: 'scans', label: `${t('history.scanned')} (${history.scans.length})`, icon: 'scan' },
            { value: 'created', label: `${t('history.created')} (${history.created.length})`, icon: 'qr' },
          ]}
        />

        <div className="card">
          <Toggle
            label={tab === 'scans' ? t('settings.saveScans') : t('settings.saveCreated')}
            checked={enabled}
            onChange={(v) => updateSettings(tab === 'scans' ? { saveScans: v } : { saveCreated: v })}
          />
          {!enabled && <Note tone="warn">{t('history.disabled')}</Note>}
        </div>

        {list.length === 0 ? (
          <div className="empty-state">
            <Icon name="history" size={40} />
            <p>{tab === 'scans' ? t('history.emptyScans') : t('history.emptyCreated')}</p>
          </div>
        ) : (
          <ul className="list" aria-label={listName}>
            {tab === 'scans' && history.scans.map((entry) => (
              <li key={entry.id}>
                <div className="entry">
                  <span className="type-icon"><Icon name={TYPE_ICONS[entry.contentType] ?? 'text'} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="title">{scanTitle(entry)}</div>
                    <div className="meta">
                      <span>{t(`type.${entry.contentType}` as Key)}</span>
                      <span>{formatLabel(entry.format)}</span>
                      <span>{t(`history.source.${entry.source}` as Key)}</span>
                      <time dateTime={entry.at}>{formatDate(entry.at)}</time>
                    </div>
                  </div>
                  <div className="btns">
                    <button type="button" className="btn btn-sm" aria-expanded={openScan === entry.id} onClick={() => setOpenScan(openScan === entry.id ? null : entry.id)}>
                      {openScan === entry.id ? t('common.hide') : t('history.open')}
                    </button>
                    <button type="button" className="btn btn-sm btn-icon btn-ghost btn-danger" onClick={() => remove(entry.id)} aria-label={`${t('common.delete')}: ${scanTitle(entry)}`}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </div>
                {openScan === entry.id && (
                  <div style={{ marginTop: 8 }}>
                    <ResultCard headingLevel={3} code={{ text: entry.text, format: entry.format, version: '', ecLevel: '', mask: '', uec: -1, isMirrored: false, isInverted: false, position: [] }} />
                  </div>
                )}
              </li>
            ))}
            {tab === 'created' && history.created.map((entry) => (
              <li key={entry.id} className="entry">
                <Thumb entry={entry} />
                <div style={{ minWidth: 0 }}>
                  <div className="title">{summarize(entry.content) || entry.payload.slice(0, 60)}</div>
                  <div className="meta">
                    <span>{t(`type.${entry.content.type}` as Key)}</span>
                    <span>EC {entry.options.ecLevel}</span>
                    <time dateTime={entry.at}>{formatDate(entry.at)}</time>
                  </div>
                </div>
                <div className="btns">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      loadDraft({ content: entry.content, style: entry.style, options: entry.options, origin: 'history' });
                      navigate('create');
                    }}
                  >
                    {t('common.edit')}
                  </button>
                  <button type="button" className="btn btn-sm btn-icon btn-ghost btn-danger" onClick={() => remove(entry.id)} aria-label={`${t('common.delete')}: ${summarize(entry.content)}`}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="actions">
          <button type="button" className="btn btn-danger" disabled={list.length === 0} onClick={() => setConfirm(true)}>
            <Icon name="trash" size={18} />
            {t('history.clearAll')}
          </button>
          <button type="button" className="btn" disabled={!history.scans.length && !history.created.length} onClick={exportJson}>
            <Icon name="download" size={18} />
            {t('history.export')}
          </button>
          <button type="button" className="btn" aria-expanded={showRaw} onClick={() => setShowRaw((s) => !s)}>
            <Icon name="eye" size={18} />
            {t('history.raw')}
          </button>
        </div>
        <p className="muted small">{t('history.limit', { max: MAX_ENTRIES })}</p>

        {showRaw && (
          <section className="card raw-view" aria-labelledby="raw-title">
            <h2 id="raw-title">{t('history.raw')}</h2>
            <p className="muted small">{t('history.rawHelp')}</p>
            {raw.map((r) => (
              <div key={r.key} style={{ marginTop: 12 }}>
                <code>{r.key}</code> <span className="muted small">· {formatBytes(r.bytes, lang)}</span>
                <pre>{r.value ? JSON.stringify(JSON.parse(r.value), null, 2) : '—'}</pre>
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
    </>
  );
}
