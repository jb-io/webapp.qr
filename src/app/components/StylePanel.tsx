/** Design and technical options of the generator, as collapsible sections. */
import { useRef } from 'react';
import { DEFAULT_STYLE, EC_LEVELS } from '../../core/types.ts';
import type { CreateType, EcLevel, EyeShape, MatrixOptions, QrStyle } from '../../core/types.ts';
import { ColorField, Note, Segmented, Select, TextField, Toggle } from './ui.tsx';
import { Icon } from './Icon.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';
import { useStore } from '../state/Store.tsx';
import { logoToDataUrl } from '../lib/export.ts';

const PRESETS: { fg: string; bg: string }[] = [
  { fg: '#111827', bg: '#ffffff' },
  { fg: '#0f766e', bg: '#ffffff' },
  { fg: '#1e3a8a', bg: '#eff6ff' },
  { fg: '#7c2d12', bg: '#fff7ed' },
  { fg: '#581c87', bg: '#faf5ff' },
  { fg: '#000000', bg: '#fde047' },
];

interface Props {
  style: QrStyle;
  options: MatrixOptions;
  type: CreateType;
  onStyle: (patch: Partial<QrStyle>) => void;
  onOptions: (patch: Partial<MatrixOptions>) => void;
}

export function StylePanel({ style, options, type, onStyle, onOptions }: Props) {
  const { t } = useI18n();
  const { notify } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const ecLocked = type === 'epc';

  const eyeOptions = (prefix: string) => (['square', 'rounded', 'circle'] as EyeShape[]).map((v) => ({
    value: v, label: t(v === 'circle' ? 'style.circle' : (`style.${v}` as Key)), key: prefix + v,
  }));

  const pickLogo = async (file: File) => {
    try {
      const logo = await logoToDataUrl(file);
      onStyle({ logo });
      if (!ecLocked && (options.ecLevel === 'L' || options.ecLevel === 'M')) onOptions({ ecLevel: 'H' });
    } catch {
      notify('style.logoError', 'error');
    }
  };

  return (
    <div>
      <details className="section" open>
        <summary>{t('style.colors')}</summary>
        <div className="stack">
          <div className="field">
            <span className="field-label" id="presets-label">{t('style.presets')}</span>
            <div className="swatches" role="group" aria-labelledby="presets-label">
              {PRESETS.map((p) => (
                <button
                  key={p.fg + p.bg}
                  type="button"
                  className="swatch"
                  style={{ background: p.bg }}
                  aria-label={`${p.fg} / ${p.bg}`}
                  aria-pressed={style.foreground === p.fg && style.background === p.bg}
                  onClick={() => onStyle({ foreground: p.fg, background: p.bg, frameColor: p.fg })}
                >
                  <i style={{ background: p.fg }} />
                </button>
              ))}
              <button
                type="button"
                className="swatch"
                aria-label={t('style.swap')}
                title={t('style.swap')}
                onClick={() => onStyle({ foreground: style.background, background: style.foreground })}
              >
                <Icon name="swap" size={18} />
              </button>
            </div>
          </div>
          <div className="grid-2">
            <ColorField label={t('style.foreground')} value={style.foreground} onChange={(foreground) => onStyle({ foreground })} />
            <ColorField label={t('style.background')} value={style.background} onChange={(background) => onStyle({ background })} />
          </div>
          <Toggle label={t('style.transparent')} checked={style.transparentBackground} onChange={(transparentBackground) => onStyle({ transparentBackground })} />
          <Toggle label={t('style.eyeColor')} checked={Boolean(style.eyeColor)} onChange={(on) => onStyle({ eyeColor: on ? '#0f766e' : '' })} />
          {style.eyeColor && <ColorField label={t('style.eyeColor')} value={style.eyeColor} onChange={(eyeColor) => onStyle({ eyeColor })} />}
        </div>
      </details>

      <details className="section">
        <summary>{t('style.shape')}</summary>
        <div className="stack">
          <Segmented
            legend={t('style.modules')}
            value={style.moduleShape}
            onChange={(moduleShape) => onStyle({ moduleShape })}
            options={(['square', 'rounded', 'dots', 'gapped'] as const).map((v) => ({ value: v, label: t(`style.${v}` as Key) }))}
          />
          <Segmented legend={t('style.eyeFrame')} value={style.eyeFrameShape} onChange={(eyeFrameShape) => onStyle({ eyeFrameShape })} options={eyeOptions('f')} />
          <Segmented legend={t('style.eyeBall')} value={style.eyeBallShape} onChange={(eyeBallShape) => onStyle({ eyeBallShape })} options={eyeOptions('b')} />
        </div>
      </details>

      <details className="section">
        <summary>{t('style.frameLabel')}</summary>
        <div className="stack">
          <Segmented
            legend={t('style.frame')}
            value={style.frame}
            onChange={(frame) => onStyle({ frame })}
            options={[
              { value: 'none', label: t('style.frameNone') },
              { value: 'border', label: t('style.frameBorder') },
              { value: 'rounded', label: t('style.frameRounded') },
              { value: 'banner', label: t('style.frameBanner') },
            ]}
          />
          {style.frame !== 'none' && <ColorField label={t('style.frameColor')} value={style.frameColor} onChange={(frameColor) => onStyle({ frameColor })} />}
          <TextField label={t('style.label')} value={style.label} optional maxLength={60} placeholder={t('style.labelPlaceholder')} onChange={(label) => onStyle({ label })} />
          {style.label.trim() && (
            <>
              <div className="grid-2">
                <Segmented legend={t('style.labelPosition')} value={style.labelPosition} onChange={(labelPosition) => onStyle({ labelPosition })} options={[{ value: 'top', label: t('style.top') }, { value: 'bottom', label: t('style.bottom') }]} />
                <Segmented legend={t('style.labelSize')} value={style.labelSize} onChange={(labelSize) => onStyle({ labelSize })} options={[{ value: 's', label: t('style.small') }, { value: 'm', label: t('style.medium') }, { value: 'l', label: t('style.large') }]} />
              </div>
              <Toggle label={t('style.labelColor')} checked={Boolean(style.labelColor)} onChange={(on) => onStyle({ labelColor: on ? style.foreground : '' })} />
              {style.labelColor && <ColorField label={t('style.labelColor')} value={style.labelColor} onChange={(labelColor) => onStyle({ labelColor })} />}
            </>
          )}
        </div>
      </details>

      <details className="section">
        <summary>{t('style.logo')}</summary>
        <div className="stack">
          <div className="logo-row">
            {style.logo && <img src={style.logo} alt="" />}
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={18} />
              {t('style.logoPick')}
            </button>
            {style.logo && (
              <button type="button" className="btn btn-ghost btn-danger" onClick={() => onStyle({ logo: '' })}>
                <Icon name="trash" size={18} />
                {t('style.logoRemove')}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void pickLogo(file);
              }}
            />
          </div>
          {style.logo && (
            <>
              <div className="field">
                <label htmlFor="logo-size">{t('style.logoSize')}: {Math.round(style.logoSize * 100)} %</label>
                <input id="logo-size" type="range" min={0.1} max={0.3} step={0.01} value={style.logoSize} onChange={(e) => onStyle({ logoSize: Number(e.target.value) })} />
              </div>
              <Toggle label={t('style.logoPlate')} checked={style.logoPlate} onChange={(logoPlate) => onStyle({ logoPlate })} />
              {!style.logoPlate && <Toggle label={t('style.logoExcavate')} checked={style.logoExcavate} onChange={(logoExcavate) => onStyle({ logoExcavate })} />}
            </>
          )}
          <Note tone="info">{t('style.logoHint')}</Note>
        </div>
      </details>

      <details className="section">
        <summary>{t('style.technical')}</summary>
        <div className="stack">
          <Segmented<EcLevel>
            legend={t('style.ecLevel')}
            value={ecLocked ? 'M' : options.ecLevel}
            onChange={(ecLevel) => { if (!ecLocked) onOptions({ ecLevel }); }}
            options={EC_LEVELS.map((l) => ({ value: l, label: t(`style.ec${l}` as Key) }))}
          />
          <p className="muted small">{ecLocked ? t('create.epcLocked') : t('style.ecHelp')}</p>
          <div className="grid-2">
            <Select
              label={t('style.version')}
              value={options.minVersion}
              onChange={(minVersion) => onOptions({ minVersion })}
              options={[{ value: 0, label: t('style.versionAuto') }, ...Array.from({ length: 40 }, (_, i) => ({ value: i + 1, label: `${i + 1} (${17 + 4 * (i + 1)} × ${17 + 4 * (i + 1)})` }))]}
            />
            <Select
              label={t('style.mask')}
              value={options.mask}
              onChange={(mask) => onOptions({ mask })}
              options={[{ value: -1, label: t('style.maskAuto') }, ...Array.from({ length: 8 }, (_, i) => ({ value: i, label: String(i) }))]}
            />
          </div>
          <div className="field">
            <label htmlFor="quiet">{t('style.quietZone')}: {style.quietZone}</label>
            <input id="quiet" type="range" min={0} max={10} step={1} value={style.quietZone} onChange={(e) => onStyle({ quietZone: Number(e.target.value) })} aria-describedby="quiet-h" />
            <span className="hint" id="quiet-h">{t('style.quietZoneHelp')}</span>
          </div>
          <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onStyle({ ...DEFAULT_STYLE, logo: style.logo })}>
            <Icon name="reset" size={16} />
            {t('create.reset')}
          </button>
        </div>
      </details>
    </div>
  );
}
