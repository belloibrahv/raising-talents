import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import type { BreachedPasswordChecker } from '../application/ports.js';

/**
 * How often a password must have turned up in breaches before it is refused. Most passwords
 * people actually use have leaked once or twice somewhere; refusing all of those turned new
 * members away. At this level only the ones attackers try first ("password", "12345678",
 * "qwertyuiop") are stopped.
 */
export const COMMON_PASSWORD_SIGHTINGS = 10_000;

/**
 * Have I Been Pwned range API. Only the first 5 characters of the SHA-1 hash
 * leave our servers, so the password itself is never shared.
 * If the service is down we allow the password and log it, rather than block sign-ups.
 */
export class HibpBreachedPasswordChecker implements BreachedPasswordChecker {
  constructor(
    private readonly logger: Logger,
    private readonly timeoutMs = 2000,
  ) {}

  async isBreached(password: string): Promise<boolean> {
    const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'raising-talents-api' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      return body.split('\n').some((line) => {
        const [candidate, count] = line.trim().split(':');
        return candidate === suffix && Number(count) >= COMMON_PASSWORD_SIGHTINGS;
      });
    } catch (error) {
      this.logger.warn({ err: error }, 'Breached password check unavailable, allowing password');
      return false;
    }
  }
}
