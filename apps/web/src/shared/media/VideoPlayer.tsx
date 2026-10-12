import type { VideoPlayback } from '@rt/contracts';
import { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  readonly playback: VideoPlayback;
  readonly label: string;
}

const frame = 'aspect-[4/5] w-full rounded-xl bg-black object-contain';

/**
 * Plays a clip. A stored file plays as it is: the browser fetches only its opening to show
 * the first frame, then the rest as it is watched. A stream is HLS: Safari and most phones
 * play that themselves; other browsers get hls.js, loaded only when a clip is shown so
 * nobody downloads it who does not need it.
 */
export function VideoPlayer({ playback, label }: VideoPlayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const isFile = playback.format === 'file';

  useEffect(() => {
    const element = video.current;
    if (!element || isFile) return;
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
  }, [playback.streamUrl, isFile]);

  if (isFile) {
    return (
      <video
        className={frame}
        // "#t=0.1" makes phones draw the first frame instead of a black box.
        src={`${playback.streamUrl}#t=0.1`}
        controls
        playsInline
        preload="metadata"
        aria-label={label}
      />
    );
  }
  return (
    <video
      ref={video}
      className={frame}
      controls
      playsInline
      preload="none"
      poster={playback.posterUrl}
      aria-label={label}
    />
  );
}
