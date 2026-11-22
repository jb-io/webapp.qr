/**
 * Landing route for the Android share target. Converts the shared data and
 * hands it on: images go to the scanner, everything else to the generator
 * form, where the user can adjust it before a code is created.
 */
import { useEffect, useRef, useState } from 'react';
import { sharedToContent, textToContent, vcardToContact } from '../../core/convert.ts';
import { DEFAULT_OPTIONS } from '../../core/history.ts';
import { requiredEcLevel } from '../../core/payloads.ts';
import type { CreateContent } from '../../core/types.ts';
import { Icon } from '../components/Icon.tsx';
import { Note } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useStore } from '../state/Store.tsx';
import { isCalendar, isImage, isText, isVcard, takeSharedData } from '../lib/shareTarget.ts';

export function SharedPage() {
  const { t } = useI18n();
  const { loadDraft, navigate, setPendingImage, draft } = useStore();
  const [state, setState] = useState<'loading' | 'empty' | 'error'>('loading');
  const done = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      try {
        const failed = new URLSearchParams(window.location.search).get('shared') === 'error';
        const data = await takeSharedData();
        // Drop `?shared=…` so a reload does not re-run the import.
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
        if (failed) {
          setState('error');
          return;
        }
        if (!data) {
          setState('empty');
          return;
        }
        const image = data.files.find(isImage);
        if (image) {
          setPendingImage({ file: image.blob, name: image.name });
          navigate('scan');
          return;
        }
        let content: CreateContent | null = null;
        const vcf = data.files.find(isVcard);
        const ics = data.files.find(isCalendar);
        const txt = data.files.find(isText);
        if (vcf) content = vcardToContact(await vcf.blob.text());
        else if (ics) content = textToContent(await ics.blob.text());
        else if (txt) content = textToContent(await txt.blob.text());
        else if (data.text || data.url || data.title) content = sharedToContent(data);
        if (!content) {
          setState('empty');
          return;
        }
        const forced = requiredEcLevel(content.type);
        const { style, options } = draftRef.current;
        loadDraft({ content, style, options: forced ? { ...DEFAULT_OPTIONS, ecLevel: forced } : options, origin: 'share' });
        navigate('create');
      } catch {
        setState('error');
      }
    })();
  }, [loadDraft, navigate, setPendingImage]);

  return (
    <>
      <div className="page-head"><h1>{t('shared.title')}</h1></div>
      {state === 'loading' && <p className="muted" role="status">{t('shared.loading')}</p>}
      {state !== 'loading' && (
        <div className="stack">
          <Note tone={state === 'error' ? 'error' : 'info'} live>{state === 'error' ? t('shared.error') : t('shared.empty')}</Note>
          <div className="actions">
            <a className="btn btn-primary" href="#/scan"><Icon name="scan" size={18} />{t('nav.scan')}</a>
            <a className="btn" href="#/create"><Icon name="qr" size={18} />{t('nav.create')}</a>
          </div>
        </div>
      )}
    </>
  );
}
