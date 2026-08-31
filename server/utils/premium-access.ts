/**
 * Single source of truth for whether Firebase custom claims grant premium access.
 *
 * Claims are written by the Stripe webhook (services/stripe.service.ts) and by the
 * maintenance scripts, all of which store subscriptionEnd alongside premium. Nothing
 * compared that timestamp against the clock, so a lapsed subscriber kept full access
 * indefinitely. Every premium gate now routes through this module.
 *
 * Rules, applied in order:
 *   1. The admin claim grants access outright; admins are not billed.
 *   2. Without premium === true there is no access.
 *   3. A missing or null subscriptionEnd is an open-ended grant. The webhook writes
 *      null when Stripe reports no period end, and that is also how manually comped
 *      accounts are represented, so it must not revoke access.
 *   4. Otherwise access ends at subscriptionEnd plus a grace window.
 *
 * The grace window absorbs webhook lag and the fact that an ID token can be up to an
 * hour stale, so a renewing subscriber is never briefly locked out.
 */

const DEFAULT_GRACE_DAYS = 1;

const parsedGraceDays = Number(process.env['PREMIUM_GRACE_DAYS']);
export const PREMIUM_GRACE_DAYS =
    Number.isFinite(parsedGraceDays) && parsedGraceDays >= 0 ? parsedGraceDays : DEFAULT_GRACE_DAYS;

const GRACE_SECONDS = PREMIUM_GRACE_DAYS * 24 * 60 * 60;

export type PremiumDenialReason = 'no_premium_claim' | 'subscription_expired';

export interface PremiumClaims {
    [key: string]: unknown;
}

export interface PremiumAccess {
    granted: boolean;
    reason?: PremiumDenialReason;
    /** Unix seconds when access lapsed or lapses; null for open-ended grants. */
    subscriptionEnd: number | null;
}

export function evaluatePremiumAccess(
    claims: PremiumClaims | undefined | null,
    now: Date = new Date()
): PremiumAccess {
    const source = claims || {};
    const endClaim = source['subscriptionEnd'];
    const subscriptionEnd = typeof endClaim === 'number' && Number.isFinite(endClaim) ? endClaim : null;

    if (source['admin'] === true) {
        return { granted: true, subscriptionEnd };
    }

    if (source['premium'] !== true) {
        return { granted: false, reason: 'no_premium_claim', subscriptionEnd };
    }

    if (subscriptionEnd === null) {
        return { granted: true, subscriptionEnd };
    }

    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (nowSeconds > subscriptionEnd + GRACE_SECONDS) {
        return { granted: false, reason: 'subscription_expired', subscriptionEnd };
    }

    return { granted: true, subscriptionEnd };
}

export function hasPremiumAccess(claims: PremiumClaims | undefined | null, now: Date = new Date()): boolean {
    return evaluatePremiumAccess(claims, now).granted;
}
