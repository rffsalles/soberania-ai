'use client';

import * as React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DEFAULT_CHECKPOINTS } from '@/lib/mocks-pending';

export interface SocraticCheckpoint {
  timeSeconds: number;
  label: string;
  prompt: string;
}

interface InteractiveVideoPlayerProps {
  checkpoints?: SocraticCheckpoint[];
  onTriggerCheckpoint?: (checkpoint: SocraticCheckpoint) => void;
  className?: string;
}


export function InteractiveVideoPlayer({
  checkpoints = DEFAULT_CHECKPOINTS,
  onTriggerCheckpoint,
  className,
}: InteractiveVideoPlayerProps) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(28);
  const totalDuration = 300; // 5 minutos
  const [isMuted, setIsMuted] = React.useState(false);
  const [activeCheckpoint, setActiveCheckpoint] =
    React.useState<SocraticCheckpoint | null>(null);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 1;
          const cp = checkpoints.find((c) => c.timeSeconds === next);
          if (cp) {
            setIsPlaying(false);
            setActiveCheckpoint(cp);
            onTriggerCheckpoint?.(cp);
          }
          return next >= totalDuration ? 0 : next;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, checkpoints, onTriggerCheckpoint]);

  const progressPercent = (currentTime / totalDuration) * 100;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl bg-slate-950 border border-slate-800 text-white shadow-xl',
        className
      )}
    >
      {/* Video Content / Blackboard Simulation */}
      <div className="relative aspect-video w-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900">
        <div className="text-center max-w-lg space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-teal/20 text-brand-teal border border-brand-teal/30 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Aula Síncrona com Pausas Inteligentes</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-bold font-heading text-white">
            JOINs Relacionais na Prática (INNER vs OUTER)
          </h3>

          <p className="text-sm text-slate-400 leading-relaxed">
            Apostila Oficial de Banco de Dados · Cap. 4, pág. 58
          </p>
        </div>

        {/* Overlay do Desafio Socrático em Pausa Ativa */}
        {activeCheckpoint && (
          <div className="absolute inset-0 z-20 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="max-w-md bg-slate-900/90 border border-brand-orange/40 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-center gap-2 text-brand-orange font-semibold text-xs uppercase tracking-wider">
                <HelpCircle className="h-4 w-4" />
                <span>{activeCheckpoint.label}</span>
              </div>
              <p className="text-base text-slate-100 font-medium leading-relaxed">
                {activeCheckpoint.prompt}
              </p>
              <div className="pt-2 flex justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveCheckpoint(null);
                    setIsPlaying(true);
                  }}
                  className="bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer"
                >
                  Continuar Vídeo
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Video Timeline & Controls */}
      <div className="p-4 bg-slate-900/90 border-t border-slate-800/80 space-y-3">
        {/* Timeline with Socratic Checkpoint Pins */}
        <div className="relative w-full">
          <div
            className="relative h-2 w-full bg-slate-800 rounded-full cursor-pointer overflow-hidden"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const newTime = Math.floor(
                (clickX / rect.width) * totalDuration
              );
              setCurrentTime(newTime);
            }}
          >
            <div
              className="h-full bg-brand-teal transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Markers / Pins */}
          {checkpoints.map((cp) => {
            const leftPct = (cp.timeSeconds / totalDuration) * 100;
            return (
              <div
                key={cp.timeSeconds}
                className="absolute top-[-3px] h-3.5 w-3.5 -ml-1.5 rounded-full bg-brand-orange border-2 border-slate-950 shadow-md cursor-pointer hover:scale-125 transition-transform"
                style={{ left: `${leftPct}%` }}
                title={`${cp.label} (${formatTime(cp.timeSeconds)})`}
                onClick={() => {
                  setCurrentTime(cp.timeSeconds);
                  setActiveCheckpoint(cp);
                  setIsPlaying(false);
                }}
              />
            );
          })}
        </div>

        {/* Buttons and Time Labels */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl border-slate-700 bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              onClick={() => setCurrentTime(0)}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            <span className="text-xs font-mono text-slate-400">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-brand-orange/10 text-brand-orange border-brand-orange/30 text-[11px] hidden sm:inline-flex"
            >
              2 Pausas Socráticas
            </Badge>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
