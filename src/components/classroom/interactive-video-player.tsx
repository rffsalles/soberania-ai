'use client';

import * as React from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LESSON_MEDIA_TYPE, YOUTUBE_URL_PATTERN, YOUTUBE_VIDEO_ID_PATTERN, type LessonMediaType } from '@/lib/constants/teaching';

export interface SocraticCheckpoint {
  timeSeconds: number;
  label: string;
  question: string;
}

interface InteractiveVideoPlayerProps {
  videoUrl: string | null;
  mediaType: LessonMediaType;
  checkpoints: SocraticCheckpoint[];
  onTriggerCheckpoint?: (checkpoint: SocraticCheckpoint) => void;
  stepTimes?: number[];
  onStepCross?: (videoSeconds: number) => void;
  className?: string;
}

const SECONDS_PER_MINUTE = 60;
const YOUTUBE_IFRAME_API_URL = 'https://www.youtube.com/iframe_api';
const YOUTUBE_POLL_MS = 500;
const NO_VIDEO_MESSAGE = 'Sem vídeo para esta aula';

function formatTime(secs: number) {
  const m = Math.floor(secs / SECONDS_PER_MINUTE).toString().padStart(2, '0');
  const s = Math.floor(secs % SECONDS_PER_MINUTE).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Índice do último passo cujo início é <= seconds; -1 antes do primeiro. */
export function stepTimeIndex(stepTimes: number[], seconds: number): number {
  let index = -1;
  stepTimes.forEach((time, i) => {
    if (time <= seconds) index = i;
  });
  return index;
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYoutubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  youtubeApiPromise ??= new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = YOUTUBE_IFRAME_API_URL;
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

function youtubeEmbedUrl(url: string): string | null {
  if (!YOUTUBE_URL_PATTERN.test(url)) return null;
  const id = YOUTUBE_VIDEO_ID_PATTERN.exec(url)?.[1];
  return id ? `https://www.youtube.com/embed/${id}?enablejsapi=1` : null;
}

export function InteractiveVideoPlayer({
  videoUrl,
  mediaType,
  checkpoints,
  onTriggerCheckpoint,
  stepTimes,
  onStepCross,
  className,
}: InteractiveVideoPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const ytPlayer = React.useRef<YT.Player | null>(null);
  const triggered = React.useRef<Set<number>>(new Set());
  const [activeCheckpoint, setActiveCheckpoint] = React.useState<SocraticCheckpoint | null>(null);

  const stepTimesRef = React.useRef(stepTimes);
  const onStepCrossRef = React.useRef(onStepCross);
  stepTimesRef.current = stepTimes;
  onStepCrossRef.current = onStepCross;
  const lastStepIndex = React.useRef(-1);

  const sorted = React.useMemo(() => [...checkpoints].sort((a, b) => a.timeSeconds - b.timeSeconds), [checkpoints]);

  const trigger = React.useCallback(
    (cp: SocraticCheckpoint) => {
      videoRef.current?.pause();
      ytPlayer.current?.pauseVideo();
      setActiveCheckpoint(cp);
      onTriggerCheckpoint?.(cp);
    },
    [onTriggerCheckpoint]
  );

  const checkAt = React.useCallback(
    (now: number) => {
      const reportStep = onStepCrossRef.current;
      if (reportStep && stepTimesRef.current) {
        const stepIndex = stepTimeIndex(stepTimesRef.current, now);
        if (stepIndex >= 0 && stepIndex !== lastStepIndex.current) {
          lastStepIndex.current = stepIndex;
          reportStep(Math.floor(now));
        }
      }
      const passed = sorted.filter((cp) => cp.timeSeconds <= now);
      if (!passed.some((cp) => !triggered.current.has(cp.timeSeconds))) return;
      // Marca todos os anteriores como vistos para não disparar em cascata após um salto na linha do tempo.
      passed.forEach((cp) => triggered.current.add(cp.timeSeconds));
      trigger(passed[passed.length - 1]);
    },
    [sorted, trigger]
  );

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => checkAt(e.currentTarget.currentTime);

  const jumpTo = (cp: SocraticCheckpoint) => {
    if (videoRef.current) videoRef.current.currentTime = cp.timeSeconds;
    ytPlayer.current?.seekTo(cp.timeSeconds, true);
    triggered.current.add(cp.timeSeconds);
    trigger(cp);
  };

  const embedUrl = mediaType === LESSON_MEDIA_TYPE.YOUTUBE && videoUrl ? youtubeEmbedUrl(videoUrl) : null;
  React.useEffect(() => {
    if (!embedUrl) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    void loadYoutubeApi().then(() => {
      if (cancelled || !iframeRef.current || !window.YT) return;
      ytPlayer.current = new window.YT.Player(iframeRef.current, {
        events: {
          onReady: (event) => {
            timer = setInterval(() => checkAt(event.target.getCurrentTime()), YOUTUBE_POLL_MS);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      ytPlayer.current?.destroy();
      ytPlayer.current = null;
    };
  }, [embedUrl, checkAt]);

  const isUpload = mediaType === LESSON_MEDIA_TYPE.S3_UPLOAD && !!videoUrl;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl bg-slate-950 border border-slate-800 text-white shadow-xl',
        className
      )}
    >
      <div className="relative aspect-video w-full bg-slate-900">
        {embedUrl ? (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            title="Vídeo da aula"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : isUpload ? (
          <video
            ref={videoRef}
            controls
            src={videoUrl ?? undefined}
            onTimeUpdate={handleTimeUpdate}
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <Sparkles className="h-6 w-6 text-brand-teal" />
            <p className="text-sm text-slate-400">{NO_VIDEO_MESSAGE}</p>
          </div>
        )}

        {activeCheckpoint && (
          <div className="absolute inset-0 z-20 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="max-w-md bg-slate-900/90 border border-brand-orange/40 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-center gap-2 text-brand-orange font-semibold text-xs uppercase tracking-wider">
                <HelpCircle className="h-4 w-4" />
                <span>{activeCheckpoint.label}</span>
              </div>
              <p className="text-base text-slate-100 font-medium leading-relaxed">{activeCheckpoint.question}</p>
              <Button
                size="sm"
                onClick={() => {
                  setActiveCheckpoint(null);
                  void videoRef.current?.play();
                  ytPlayer.current?.playVideo();
                }}
                className="bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer"
              >
                Continuar
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-900/90 border-t border-slate-800/80 space-y-2">
        <Badge
          variant="outline"
          className="bg-brand-orange/10 text-brand-orange border-brand-orange/30 text-[11px]"
        >
          {sorted.length} {sorted.length === 1 ? 'Pausa Socrática' : 'Pausas Socráticas'}
        </Badge>
        {sorted.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {sorted.map((cp) => (
              <li key={cp.timeSeconds}>
                <button
                  type="button"
                  onClick={() => jumpTo(cp)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  <span className="font-mono text-brand-orange">{formatTime(cp.timeSeconds)}</span>
                  <span>{cp.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
