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
import { Note } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useStore } from '../state/Store.tsx';
import { isCalendar, isImage, isText, isVcard, takeSharedData } from '../lib/shareTarget.ts';

export function SharedPage() {
  const { t } = useI18n();
  const { loadDraft, navigate, setPendingImage, draft } = useStore();
  const [empty, setEmpty] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const data = await takeSharedData().catch(() => null);
      // Drop `?shared=1` so a reload does not re-run the import.
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      if (!data) {
        setEmpty(true);
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
        setEmpty(true);
        return;
      }
      const forced = requiredEcLevel(content.type);
      loadDraft({ content, style: draft.style, options: forced ? { ...DEFAULT_OPTIONS, ecLevel: forced } : draft.options, origin: 'share' });
      navigate('create');
    })();
  }, [loadDraft, navigate, setPendingImage, draft.style, draft.options]);

  return (
    <>
      <div className="page-head"><h1>{t('shared.title')}</h1></div>
      {empty ? <Note tone="info">{t('shared.empty')}</Note> : <p className="muted" role="status">{t('shared.loading')}</p>}
    </>
  );
}
