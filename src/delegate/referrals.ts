// @ts-nocheck
/**
 * Referral token system.
 *
 * Uses BBS+ VCs to create non-forgeable, purpose-bound, expiring
 * referral tokens. Carol can issue a token introducing Bob to Alice
 * for a specific purpose, and Alice can verify Carol signed it.
 */

import { issueCredential, verifyCredential } from "../wallet/credentials.js";
import type { ReferralClaims } from "./types.js";

/** Custom JSON-LD context for referral tokens. */
const REFERRAL_CONTEXT = {
  ReferralCredential: "https://agentverse.app/ns#ReferralCredential",
  referee_did: "https://agentverse.app/ns#referee_did",
  target_did: "https://agentverse.app/ns#target_did",
  purpose: "https://agentverse.app/ns#purpose",
  vouching_level: "https://agentverse.app/ns#vouching_level",
  message: "https://agentverse.app/ns#message",
  expires_at: "https://agentverse.app/ns#expires_at",
};

/**
 * Issue a referral token — a BBS+ signed VC from the referrer.
 *
 * @param referrerKeyPair - The referrer's (Carol's) BBS+ key pair
 * @param claims - Referral details (who is being referred, to whom, for what)
 */
export async function issueReferralToken(
  referrerKeyPair: any,
  claims: ReferralClaims
): Promise<any> {
  return await issueCredential(
    {
      referee_did: claims.referee_did,
      target_did: claims.target_did,
      purpose: claims.purpose,
      vouching_level: claims.vouching_level,
      ...(claims.message && { message: claims.message }),
      expires_at: claims.expires_at,
    },
    referrerKeyPair
  );
}

/**
 * Verify a referral token.
 *
 * Checks that:
 * 1. The BBS+ signature is valid (Carol signed this)
 * 2. The token hasn't expired
 * 3. The target DID matches (this referral is for us)
 *
 * @param token - The referral VC
 * @param referrerKeyPair - The referrer's key pair (for verification)
 * @param ourDid - Our DID (to check target_did)
 */
export async function verifyReferralToken(
  token: any,
  referrerKeyPair: any,
  ourDid: string
): Promise<{
  valid: boolean;
  reason?: string;
  claims?: ReferralClaims;
}> {
  // 1. Verify BBS+ signature
  const result = await verifyCredential(token, referrerKeyPair);
  if (!result.verified) {
    return { valid: false, reason: "Invalid signature" };
  }

  const subject = token.credentialSubject;

  // 2. Check expiration
  if (subject.expires_at) {
    const expiresAt = new Date(subject.expires_at).getTime();
    if (expiresAt < Date.now()) {
      return { valid: false, reason: "Referral token expired" };
    }
  }

  // 3. Check target DID
  if (subject.target_did && subject.target_did !== ourDid) {
    return { valid: false, reason: "Referral not addressed to us" };
  }

  return {
    valid: true,
    claims: {
      referee_did: subject.referee_did,
      target_did: subject.target_did,
      purpose: subject.purpose,
      vouching_level: subject.vouching_level,
      message: subject.message,
      expires_at: subject.expires_at,
    },
  };
}

/**
 * Check if a referral token is for a specific purpose.
 */
export function isReferralForPurpose(token: any, purpose: string): boolean {
  return token?.credentialSubject?.purpose === purpose;
}
