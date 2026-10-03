/** Reads a clip's length in the browser, so a too-long video is refused before it is uploaded. */
export function videoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      done(Number.isFinite(video.duration) ? video.duration : null);
    };
    // Some formats only report a length once played; the server checks it anyway.
    video.onerror = () => {
      done(null);
    };
    video.src = url;
  });
}
