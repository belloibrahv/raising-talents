/** Strong ETag for a version number: "7". */
export const formatEtag = (version: number): string => `"${String(version)}"`;

/** Reads If-Match. Accepts "7" and W/"7"; anything else (or missing) is null. */
export function parseIfMatch(header: string | undefined): number | null {
  const match = header?.trim().match(/^(?:W\/)?"(\d+)"$/);
  return match?.[1] ? Number(match[1]) : null;
}
