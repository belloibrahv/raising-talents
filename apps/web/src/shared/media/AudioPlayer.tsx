import type { AudioPlayback } from '@rt/contracts';
import { AudioLines } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  readonly playback: AudioPlayback;
  readonly label: string;
  /** A square for a grid of work; a shorter band where it sits in a feed. */
  readonly shape?: 'tile' | 'band';
  readonly className?: string;
}

/**
 * Plays a recording with the browser's own controls, on the stage colours so it holds its
 * place beside photos and clips. Nothing is fetched until the listener presses play.
 */
export function AudioPlayer({ playback, label, shape = 'tile', className }: AudioPlayerProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-5 bg-stage stage-glow p-5 text-stage-foreground',
        shape === 'tile' ? 'aspect-[4/5] rounded-xl' : 'min-h-56',
        className,
      )}
    >
      <span className="grid size-20 place-items-center rounded-full bg-white/10 ring-1 ring-white/20">
        <AudioLines aria-hidden="true" className="size-9" />
      </span>
      {/* The API answers range requests, so the length shows and seeking works. */}
      <audio className="w-full max-w-md" controls preload="none" aria-label={label}>
        <source src={playback.url} type={playback.contentType} />
      </audio>
    </div>
  );
}
