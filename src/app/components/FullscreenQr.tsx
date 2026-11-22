/** Large, white, distraction-free display for scanning from the screen. */
import { useEffect, useRef } from 'react';
import { Icon } from './Icon.tsx';
import { useI18n } from '../i18n/index.tsx';

export function FullscreenQr({ src, alt, open, onClose }: { src: string; alt: string; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Keep the screen on while the code is displayed.
  useEffect(() => {
    if (!open || !('wakeLock' in navigator)) return;
    let cancelled = false;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then((l) => {
      if (cancelled) void l.release();
      else lock = l;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [open]);

  return (
    <dialog ref={ref} className="fullscreen" aria-label={t('overlay.title')} onClose={onClose}>
      {open && (
        <div className="fullscreen-body" onClick={onClose}>
          <button type="button" className="btn btn-icon close" onClick={onClose} aria-label={t('common.close')} autoFocus>
            <Icon name="x" />
          </button>
          <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
          <p>{t('overlay.hint')}</p>
        </div>
      )}
    </dialog>
  );
}
