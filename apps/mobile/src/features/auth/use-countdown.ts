import { useEffect, useState } from 'react';

/** Seconds left on a timer that can be restarted, for "send a new code in 42s". */
export function useCountdown(initialSeconds: number): [number, (seconds: number) => void] {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => {
      setRemaining((value) => value - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [remaining]);

  return [remaining, setRemaining];
}
