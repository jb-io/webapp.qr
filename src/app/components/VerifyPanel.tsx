/**
 * Re-reads the rendered code with an independent decoder (ZXing, the same
 * engine as the scanner) and combines that with the static analysis.
 */
import { useEffect, useState } from 'react';
import type { Analysis } from '../../core/analysis.ts';
import { EC_RECOVERY, type QrMatrix, type Severity } from '../../core/types.ts';
import { Icon, type IconName } from './Icon.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';
import { decode, type DecodedCode } from '../lib/decoder.ts';
import { rasterize } from '../lib/export.ts';

type Status = { state: 'busy' } | { state: 'done'; code: DecodedCode | null } | { state: 'error' };

const SEV_ICON: Record<Severity, IconName> = { ok: 'check', info: 'info', warn: 'alert', error: 'alert' };

/** Numbers in finding parameters follow the UI locale (1,5 cm vs 1.5 cm). */
function localize(params: Record<string, string | number> | undefined, fmt: (n: number, d?: number) => string) {
  if (!params) return undefined;
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'number' ? fmt(v, 1) : v]));
}

export function VerifyPanel({ svg, aspect, payload, matrix, analysis }: {
  svg: string;
  aspect: number;
  payload: string;
  matrix: QrMatrix;
  analysis: Analysis;
}) {
  const { t, formatNumber } = useI18n();
  const [status, setStatus] = useState<Status>({ state: 'busy' });

  useEffect(() => {
    let cancelled = false;
    setStatus({ state: 'busy' });
    // Debounce: typing should not trigger a decode per keystroke.
    const timer = setTimeout(async () => {
      try {
        // ~6 px per module, like a decent photo of the code.
        const width = Math.min(1600, Math.max(400, Math.round((matrix.size + 8) * 6)));
        const canvas = await rasterize(svg, aspect, width, true);
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;
        const codes = await decode(ctx.getImageData(0, 0, canvas.width, canvas.height), { qrOnly: true, thorough: true });
        if (!cancelled) setStatus({ state: 'done', code: codes[0] ?? null });
      } catch {
        if (!cancelled) setStatus({ state: 'error' });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [svg, aspect, matrix.size]);

  const code = status.state === 'done' ? status.code : null;
  const matches = code?.text === payload;
  const failed = (status.state === 'done' && !matches) || status.state === 'error';
  const quality = status.state === 'done' && !code ? 'poor' : analysis.quality;
  const fillPct = Math.round(analysis.fill * 100);
  const modes = matrix.segments.map((s) => `${t(`verify.mode.${s.mode}`)} (${s.length})`).join(', ');

  return (
    <section className="card verify" aria-labelledby="verify-title">
      <div className="card-title">
        <Icon name="shield" />
        <h2 id="verify-title">{t('verify.title')}</h2>
        <span className={`badge badge-${quality === 'good' ? 'ok' : quality === 'fair' ? 'warn' : 'error'} push-right`}>
          {t('verify.quality')}: {t(`verify.${quality}`)}
        </span>
      </div>

      {status.state === 'busy' && <div className="verify-status busy"><Icon name="scan" />{t('verify.running')}</div>}
      {status.state === 'done' && matches && (
        <div className="verify-status ok">
          <Icon name="check" />
          <span>{t('verify.ok')}</span>
          <small>{t('verify.engine')}</small>
        </div>
      )}
      {/* Only problems are announced - not every pause while typing. */}
      <div role="alert">
        {failed && (
          <div className="verify-status fail">
            <Icon name="alert" />
            <span>{code ? t('verify.mismatch') : t('verify.fail')}</span>
          </div>
        )}
      </div>

      <ul className="findings">
        {analysis.findings.map((f) => (
          <li key={f.code} className={`sev-${f.severity}`}>
            <Icon name={SEV_ICON[f.severity]} size={16} />
            <span>{t(`finding.${f.code}` as Key, localize(f.params, formatNumber))}</span>
          </li>
        ))}
      </ul>

      <details className="raw tech">
        <summary>{t('verify.details')}</summary>
        <dl className="kv">
          <dt>{t('verify.version')}</dt>
          <dd>{t('verify.versionValue', { version: matrix.version, size: matrix.size })}</dd>
          <dt>{t('verify.ecLevel')}</dt>
          <dd>{t('verify.ecValue', { level: matrix.ecLevel, percent: Math.round(EC_RECOVERY[matrix.ecLevel] * 100) })}</dd>
          <dt>{t('verify.mask')}</dt>
          <dd>{matrix.mask}</dd>
          <dt>{t('verify.encoding')}</dt>
          <dd>{modes}</dd>
          <dt>{t('verify.data')}</dt>
          <dd>
            {t('verify.dataValue', { used: formatNumber(matrix.usedDataBits), capacity: formatNumber(matrix.capacityDataBits), percent: fillPct })}
            <div className="meter" role="img" aria-label={`${fillPct} %`}><span style={{ width: `${Math.min(100, fillPct)}%` }} /></div>
          </dd>
          <dt>{t('verify.codewords')}</dt>
          <dd>{t('verify.codewordsValue', { total: matrix.totalCodewords, ec: matrix.ecCodewords, blocks: matrix.ecBlocks })}</dd>
          {code && code.uec >= 0 && (
            <>
              <dt>{t('verify.reserve')}</dt>
              <dd>
                {formatNumber(code.uec * 100)} %
                <span className="hint">{t('verify.reserveHelp')}</span>
              </dd>
            </>
          )}
        </dl>
      </details>
    </section>
  );
}
