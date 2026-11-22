/**
 * Scanner: camera only after an explicit click, still images via picker,
 * drag & drop, paste or Android share. Results are shown first; any action
 * needs another click.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseContent } from '../../core/parse.ts';
import { Icon } from '../components/Icon.tsx';
import { ResultCard, formatLabel } from '../components/ResultCard.tsx';
import { Note } from '../components/ui.tsx';
import { useI18n, type Key } from '../i18n/index.tsx';
import { useStore } from '../state/Store.tsx';
import { decode, decodeFile, type DecodedCode } from '../lib/decoder.ts';

type CamState = 'off' | 'starting' | 'on';

/** Frames are sampled at most this often; decoding is the bottleneck anyway. */
const FRAME_INTERVAL = 120;
const MAX_FRAME_EDGE = 1080;

interface TorchTrack extends MediaStreamTrack {
  getCapabilities(): MediaTrackCapabilities & { torch?: boolean };
}

export function ScanPage() {
  const { t } = useI18n();
  const { recordScan, settings, pendingImage, setPendingImage, route } = useStore();
  const [cam, setCam] = useState<CamState>('off');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DecodedCode[]>([]);
  const [dragging, setDragging] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(-1);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [announce, setAnnounce] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    if (route !== 'scan') stopCamera();
  }, [route, stopCamera]);

  const found = useCallback((codes: DecodedCode[], source: 'camera' | 'image') => {
    setResults(codes);
    for (const c of codes) {
      recordScan({ text: c.text, format: c.format, contentType: parseContent(c.text, c.format).type, source });
    }
    if (settings.vibrate && 'vibrate' in navigator) navigator.vibrate?.(60);
    const first = codes[0];
    setAnnounce(codes.length > 1 ? t('scan.foundMany', { count: codes.length })
      : first ? t('scan.found', { type: t(`type.${parseContent(first.text, first.format).type}` as Key) }) : '');
    requestAnimationFrame(() => resultRef.current?.focus());
  }, [recordScan, settings.vibrate, t]);

  const runLoop = useCallback((token: number) => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (loopRef.current !== token || !video || !ctx) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const codes = await decode(ctx.getImageData(0, 0, canvas.width, canvas.height), { thorough: false });
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
      const list = devices.length ? devices : [];
      const chosen = index >= 0 ? list[index] : undefined;
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
    if (!pendingImage) return;
    setPendingImage(null);
    void readImage(pendingImage.file);
  }, [pendingImage, readImage, setPendingImage]);

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
        <div>
          <h1>{t('scan.title')}</h1>
        </div>
      </div>

      <div className="visually-hidden" role="status" aria-live="polite">{announce}</div>

      <div className={`scan-layout${hasResult ? ' has-result' : ''}`}>
        <div className="stack">
          <div className="viewer" hidden={cam === 'off'}>
            <video ref={videoRef} playsInline muted aria-label={t('scan.video')} />
            <div className="finder" aria-hidden="true" />
            {cam === 'on' && <div className="scanline" aria-hidden="true" />}
            <div className="status" role="status">{cam === 'starting' ? t('scan.starting') : t('scan.searching')}</div>
            <div className="controls">
              <button type="button" className="btn" onClick={stopCamera}>
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
              className={`dropzone${dragging ? ' dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <div className="hero-icon"><Icon name="scan" size={36} /></div>
              <p>{t('scan.intro')}</p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => void startCamera()}>
                  <Icon name="camera" />
                  {hasResult ? t('scan.again') : t('scan.start')}
                </button>
                <button type="button" className="btn btn-lg" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Icon name="image" />
                  {t('scan.image')}
                </button>
              </div>
              <p className="small">{t('scan.dropHint')}</p>
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

          {busy && <Note tone="info">{t('scan.reading')}</Note>}
          {error && <Note tone="error">{error}</Note>}
        </div>

        {hasResult && (
          <div className="stack" ref={resultRef} tabIndex={-1} aria-label={t('result.heading')}>
            {results.length > 1 && <p className="muted">{t('scan.foundMany', { count: results.length })}</p>}
            {results.map((code, i) => (
              <ResultCard key={`${i}-${code.format}-${code.text.slice(0, 20)}`} code={code} />
            ))}
            {results.length > 1 && <p className="muted small">{results.map((r) => formatLabel(r.format)).join(', ')}</p>}
          </div>
        )}
      </div>
    </>
  );
}
