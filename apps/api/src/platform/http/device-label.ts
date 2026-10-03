import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

const BROWSERS: readonly [RegExp, string][] = [
  [/EdgA?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
  [/RaisingTalents|Expo|okhttp/, 'Raising Talents app'],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/**
 * A short, human name for the device, such as "Chrome on Android", so people can tell
 * their sessions apart. Only the browser and system are kept, never versions or the
 * full header, which would make devices easier to fingerprint.
 */
export function deviceLabel(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? null;
}

/** The caller's device label, parsed from the User-Agent header. */
export const DeviceLabel = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null =>
    deviceLabel(context.switchToHttp().getRequest<FastifyRequest>().headers['user-agent']),
);
