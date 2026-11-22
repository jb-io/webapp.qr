import { useState } from 'react';
import type { Settings } from '../../core/types.ts';
import { Icon } from '../components/Icon.tsx';
import { ConfirmDialog, Segmented, Select, Toggle } from '../components/ui.tsx';
import { LANGUAGES, useI18n } from '../i18n/index.tsx';
import { useStore } from '../state/Store.tsx';
import { formatBytes, rawStorage, wipeEverything } from '../lib/storage.ts';
import { REPO_URL } from '../config.ts';

export function SettingsPage() {
  const { t, lang } = useI18n();
  const { settings, updateSettings } = useStore();
  const [confirm, setConfirm] = useState(false);
  const used = rawStorage().reduce((sum, r) => sum + r.bytes, 0);

  return (
    <>
      <div className="page-head"><h1>{t('settings.title')}</h1></div>

      <section className="card" aria-labelledby="s-appearance">
        <h2 id="s-appearance" className="card-title">{t('settings.appearance')}</h2>
        <div className="stack">
          <Select<Settings['language']>
            label={t('settings.language')}
            value={settings.language}
            onChange={(language) => updateSettings({ language })}
            options={[{ value: 'auto', label: t('common.auto') }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.label }))]}
          />
          <Segmented<Settings['theme']>
            legend={t('settings.theme')}
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
          />
        </div>
      </section>

      <section className="card" aria-labelledby="s-storage">
        <h2 id="s-storage" className="card-title">{t('settings.storage')}</h2>
        <div className="settings-list">
          <Toggle label={t('settings.saveScans')} checked={settings.saveScans} onChange={(saveScans) => updateSettings({ saveScans })} />
          <Toggle label={t('settings.saveCreated')} checked={settings.saveCreated} onChange={(saveCreated) => updateSettings({ saveCreated })} />
          <Toggle label={t('settings.vibrate')} checked={settings.vibrate} onChange={(vibrate) => updateSettings({ vibrate })} />
        </div>
        <p className="muted small" style={{ margin: '12px 0' }}>{t('settings.usage', { size: formatBytes(used, lang) })}</p>
        <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>
          <Icon name="trash" size={18} />
          {t('settings.wipe')}
        </button>
      </section>

      <section className="card" aria-labelledby="s-install">
        <h2 id="s-install" className="card-title">{t('settings.install')}</h2>
        <p className="muted">{t('settings.installHint')}</p>
      </section>

      <section className="card" aria-labelledby="s-about">
        <h2 id="s-about" className="card-title">{t('settings.about')}</h2>
        <p>{t('settings.aboutText')}</p>
        <div className="actions" style={{ marginTop: 14 }}>
          <a className="btn" href="#/privacy"><Icon name="shield" size={18} />{t('settings.privacyLink')}</a>
          <a className="btn" href={REPO_URL} target="_blank" rel="noopener noreferrer"><Icon name="github" size={18} />{t('settings.sourceLink')}</a>
        </div>
        <p className="muted small" style={{ marginTop: 14 }}>{t('settings.version', { version: __APP_VERSION__ })}</p>
      </section>

      <ConfirmDialog
        open={confirm}
        title={t('settings.wipe')}
        text={t('settings.wipeConfirm')}
        confirmLabel={t('common.delete')}
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          await wipeEverything();
          window.location.replace(window.location.pathname);
        }}
      />
    </>
  );
}
