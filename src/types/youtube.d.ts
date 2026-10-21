/** Tipagem mínima da YouTube IFrame API (https://www.youtube.com/iframe_api). */
declare namespace YT {
  interface Player {
    getCurrentTime(): number;
    pauseVideo(): void;
    playVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    destroy(): void;
  }
  interface PlayerEvent {
    target: Player;
  }
  interface PlayerOptions {
    events?: { onReady?: (event: PlayerEvent) => void };
  }
  interface PlayerConstructor {
    new (element: HTMLIFrameElement, options: PlayerOptions): Player;
  }
}

interface Window {
  YT?: { Player: YT.PlayerConstructor };
  onYouTubeIframeAPIReady?: () => void;
}
