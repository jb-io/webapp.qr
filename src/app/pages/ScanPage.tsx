/**
 * Scanner: camera only after an explicit click, still images via picker,
 * drag & drop, paste or Android share. Results are shown first; any action
 * needs another click.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseContent } from '../../core/parse.ts';
import { Icon } from '../components/Icon.tsx';
import { ResultCard } from '../components/ResultCard.tsx';
import { Note } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useStore } from '../state/Store.tsx';
import { decode, decodeFile, type DecodedCode } from '../lib/decoder.ts';

type CamState = 'off' | 'starting' | 'on';

/** Frames are sampled at most this often; decoding is the bottleneck anyway. */
const FRAME_INTERVAL = 120;
const MAX_FRAME_EDGE = 1080;

interface TorchTrack extends MediaStreamTrack {
  getCapabilities(): MediaTrackCapabilities & { torch?: boolean };
}

interface Found { code: DecodedCode; saved: boolean }

export function ScanPage() {
  const { t } = useI18n();
  const { recordScan, settings, takePendingImage, pendingImageStamp } = useStore();
  const [cam, setCam] = useState<CamState>('off');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Found[]>([]);
  const [dragging, setDragging] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(-1);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [announce, setAnnounce] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  const stopCamera = useCallback(() => {
    loopRef.current += 1; // invalidates a running loop
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCam('off');
    setTorch(null);
  }, []);

  // Always release the camera when leaving the page or hiding the app.
  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') stopCamera();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [stopCamera]);

  // Focus follows the controls that replace each other.
  useEffect(() => {
    if (cam === 'on') stopRef.current?.focus();
  }, [cam]);

  const found = useCallback((codes: DecodedCode[], source: 'camera' | 'image') => {
    const list = codes.map((code) => {
      const type = parseContent(code.text, code.format).type;
      // Two-factor secrets are never persisted (Architecture.md A14).
      const saved = type !== 'otp' && recordScan({ text: code.text, format: code.format, contentType: type, source });
      return { code, saved, type };
    });
    setResults(list);
    if (settings.vibrate && 'vibrate' in navigator) navigator.vibrate?.(60);
    const first = list[0];
    setAnnounce(list.length > 1 ? t('scan.foundMany', { count: list.length }) : first ? t('scan.found', { type: t(`type.${first.type}`) }) : '');
    requestAnimationFrame(() => {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [recordScan, settings.vibrate, t]);

  const runLoop = useCallback((token: number) => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (loopRef.current !== token || !video || !ctx) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.drawImage(video, 0, 0, w, h);
        try {
          const codes = await decode(ctx.getImageData(0, 0, w, h), { thorough: false });
          if (loopRef.current !== token) return;
          if (codes.length) {
            stopCamera();
            found(codes, 'camera');
            return;
          }
        } catch {
          if (loopRef.current !== token) return;
          setError(t('scan.engineError'));
          stopCamera();
          return;
        }
      }
      setTimeout(() => { void tick(); }, FRAME_INTERVAL);
    };
    void tick();
  }, [found, stopCamera, t]);

  const startCamera = useCallback(async (index = deviceIndex) => {
    setError('');
    setResults([]);
    if (!window.isSecureContext) {
      setError(t('scan.insecure'));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('scan.noCamera'));
      return;
    }
    stopCamera();
    setCam('starting');
    const token = loopRef.current;
    try {
      const chosen = index >= 0 ? devices[index] : undefined;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: chosen
          ? { deviceId: { exact: chosen.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (loopRef.current !== token) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setCam('on');
      // Labels are only available after permission was granted.
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      setDevices(all);
      const track = stream.getVideoTracks()[0] as TorchTrack | undefined;
      const current = track?.getSettings().deviceId;
      setDeviceIndex(Math.max(0, all.findIndex((d) => d.deviceId === current)));
      setTorch(track && typeof track.getCapabilities === 'function' && track.getCapabilities().torch ? false : null);
      runLoop(token);
    } catch (err) {
      setCam('off');
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') setError(t('scan.denied'));
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') setError(t('scan.noCamera'));
      else setError(t('scan.cameraError', { message: err instanceof Error ? err.message : String(err) }));
    }
  }, [deviceIndex, devices, runLoop, stopCamera, t]);

  const stopByUser = () => {
    stopCamera();
    requestAnimationFrame(() => startRef.current?.focus());
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { /* not supported after all */ }
  };

  const switchCamera = () => {
    if (devices.length < 2) return;
    const next = (deviceIndex + 1) % devices.length;
    setDeviceIndex(next);
    void startCamera(next);
  };

  const readImage = useCallback(async (file: Blob) => {
    stopCamera();
    setError('');
    setResults([]);
    setBusy(true);
    try {
      const codes = await decodeFile(file);
      if (codes.length) found(codes, 'image');
      else setError(t('scan.nothingFound'));
    } catch {
      setError(t('scan.nothingFound'));
    } finally {
      setBusy(false);
    }
  }, [found, stopCamera, t]);

  // Image shared from another app (Android share target).
  useEffect(() => {
    const img = takePendingImage();
    if (img) void readImage(img.file);
  }, [pendingImageStamp, takePendingImage, readImage]);

  // Paste an image from the clipboard (desktop).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        event.preventDefault();
        void readImage(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [readImage]);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = [...event.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (file) void readImage(file);
  };

  const hasResult = results.length > 0;

  return (
    <>
      <div className="page-head">
        <h1>{t('scan.title')}</h1>
      </div>

      <div className="visually-hidden" role="status" aria-live="polite">{announce}</div>

      <div className={`scan-layout${hasResult ? ' has-result' : ''}`}>
        <div className="stack scan-input">
          <div className="viewer" hidden={cam === 'off'}>
            <video ref={videoRef} playsInline muted aria-label={t('scan.video')} />
            <div className="finder" aria-hidden="true" />
            {cam === 'on' && <div className="scanline" aria-hidden="true" />}
            <div className="status" role="status">{cam === 'starting' ? t('scan.starting') : t('scan.searching')}</div>
            <div className="controls">
              <button ref={stopRef} type="button" className="btn" onClick={stopByUser}>
                <Icon name="stop" size={18} />
                {t('scan.stop')}
              </button>
              {devices.length > 1 && (
                <button type="button" className="btn btn-icon" onClick={switchCamera} aria-label={t('scan.switch')} title={t('scan.switch')}>
                  <Icon name="switch" />
                </button>
              )}
              {torch !== null && (
                <button type="button" className="btn btn-icon" onClick={toggleTorch} aria-pressed={torch} aria-label={torch ? t('scan.torchOff') : t('scan.torchOn')} title={torch ? t('scan.torchOff') : t('scan.torchOn')}>
                  <Icon name="flash" />
                </button>
              )}
            </div>
          </div>

          {cam === 'off' && (
            <div
              className={`dropzone${dragging ? ' dragging' : ''}${hasResult ? ' compact' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              {!hasResult && <div className="hero-icon"><Icon name="scan" size={40} /></div>}
              {!hasResult && <p>{t('scan.intro')}</p>}
              <div className="actions">
                <button ref={startRef} type="button" className="btn btn-primary btn-lg" onClick={() => void startCamera()}>
                  <Icon name="camera" />
                  {hasResult ? t('scan.again') : t('scan.start')}
                </button>
                <button type="button" className="btn btn-lg" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Icon name="image" />
                  {t('scan.image')}
                </button>
              </div>
              {!hasResult && <p className="small pointer-only">{t('scan.dropHint')}</p>}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void readImage(file);
                }}
              />
            </div>
          )}

          {busy && <Note tone="info" live>{t('scan.reading')}</Note>}
          {error && <Note tone="error" live>{error}</Note>}

          {!hasResult && cam === 'off' && (
            <ul className="trust" aria-label={t('settings.about')}>
              <li><Icon name="shield" size={16} />{t('trust.local')}</li>
              <li><Icon name="eyeOff" size={16} />{t('trust.noTracking')}</li>
              <li><Icon name="github" size={16} />{t('trust.openSource')}</li>
            </ul>
          )}
        </div>

        {hasResult && (
          <section className="stack scan-results" ref={resultRef} tabIndex={-1} aria-label={t('result.heading')}>
            {results.length > 1 && <p className="muted">{t('scan.foundMany', { count: results.length })}</p>}
            {results.map((r, i) => (
              <ResultCard key={`${i}-${r.code.format}-${r.code.text.slice(0, 20)}`} code={r.code} saved={r.saved} />
            ))}
          </section>
        )}
      </div>
    </>
  );
}
