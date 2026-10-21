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
  className?: string;
}

const SECONDS_PER_MINUTE = 60;
const NO_VIDEO_MESSAGE = 'Sem vídeo para esta aula';

function formatTime(secs: number) {
  const m = Math.floor(secs / SECONDS_PER_MINUTE).toString().padStart(2, '0');
  const s = Math.floor(secs % SECONDS_PER_MINUTE).toString().padStart(2, '0');
  return `${m}:${s}`;
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
  className,
}: InteractiveVideoPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const triggered = React.useRef<Set<number>>(new Set());
  const [activeCheckpoint, setActiveCheckpoint] = React.useState<SocraticCheckpoint | null>(null);

  const sorted = React.useMemo(() => [...checkpoints].sort((a, b) => a.timeSeconds - b.timeSeconds), [checkpoints]);

  const trigger = React.useCallback(
    (cp: SocraticCheckpoint) => {
      videoRef.current?.pause();
      setActiveCheckpoint(cp);
      onTriggerCheckpoint?.(cp);
    },
    [onTriggerCheckpoint]
  );

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const now = e.currentTarget.currentTime;
    const due = sorted.find((cp) => cp.timeSeconds <= now && !triggered.current.has(cp.timeSeconds));
    if (!due) return;
    // Marca todos os anteriores como vistos para não disparar em cascata após um salto na linha do tempo.
    sorted.filter((cp) => cp.timeSeconds <= now).forEach((cp) => triggered.current.add(cp.timeSeconds));
    trigger(sorted.filter((cp) => cp.timeSeconds <= now).at(-1) ?? due);
  };

  const jumpTo = (cp: SocraticCheckpoint) => {
    if (videoRef.current) videoRef.current.currentTime = cp.timeSeconds;
    triggered.current.add(cp.timeSeconds);
    trigger(cp);
  };

  const embedUrl = mediaType === LESSON_MEDIA_TYPE.YOUTUBE && videoUrl ? youtubeEmbedUrl(videoUrl) : null;
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
