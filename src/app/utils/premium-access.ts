/**
 * Client-side mirror of server/utils/premium-access.ts.
 *
 * The server is authoritative; this exists so the UI does not offer features the API
 * will reject with a 403. Keep the two in sync, including the grace window.
 */

/** Must match PREMIUM_GRACE_DAYS on the server (server/utils/premium-access.ts). */
const PREMIUM_GRACE_DAYS = 1;
const GRACE_SECONDS = PREMIUM_GRACE_DAYS * 24 * 60 * 60;

export interface PremiumClaimsLike {
  [key: string]: unknown;
}

/**
 * Access requires the premium claim and, when subscriptionEnd is present, that the
 * date has not passed. A missing subscriptionEnd is an open-ended grant, matching how
 * the Stripe webhook and the comping scripts write claims.
 */
export function hasPremiumAccess(claims: PremiumClaimsLike | undefined | null, now: Date = new Date()): boolean {
  const source = claims || {};

  if (source['admin'] === true) {
    return true;
  }

  if (source['premium'] !== true) {
    return false;
  }

  const endClaim = source['subscriptionEnd'];
  if (typeof endClaim !== 'number' || !Number.isFinite(endClaim)) {
    return true;
  }

  return Math.floor(now.getTime() / 1000) <= endClaim + GRACE_SECONDS;
}

/** True when the premium claim is present but its end date has passed. */
export function isPremiumExpired(claims: PremiumClaimsLike | undefined | null, now: Date = new Date()): boolean {
  const source = claims || {};
  return source['premium'] === true && source['admin'] !== true && !hasPremiumAccess(source, now);
}
