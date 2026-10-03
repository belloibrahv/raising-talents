import type { VideoPlayback } from '@rt/contracts';
import { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  readonly playback: VideoPlayback;
  readonly label: string;
}

/**
 * Plays a Mux stream. Safari and most phones play HLS themselves; other browsers get
 * hls.js, loaded only when a clip is shown so nobody downloads it who does not need it.
 */
export function VideoPlayer({ playback, label }: VideoPlayerProps) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = playback.streamUrl;
      return;
    }
    let destroyed = false;
    let instance: { destroy: () => void } | null = null;
    void import('hls.js').then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) return;
      const hls = new Hls({ capLevelToPlayerSize: true });
      hls.loadSource(playback.streamUrl);
      hls.attachMedia(element);
      instance = hls;
    });
    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, [playback.streamUrl]);

  return (
    <video
      ref={video}
      className="media-frame"
      controls
      playsInline
      preload="none"
      poster={playback.posterUrl}
      aria-label={label}
    />
  );
}
