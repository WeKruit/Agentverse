// @ts-nocheck
/**
 * Verifiable Presentation generation with BBS+ selective disclosure.
 */

import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
import {
  createDiscloseCryptosuite,
  createVerifyCryptosuite,
} from "@digitalbazaar/bbs-2023-cryptosuite";
import * as vc from "@digitalbazaar/vc";
import { createLocalLoader } from "./document-loader.js";

/** Disclosure presets — maps preset name to credential subject fields to reveal. */
export const PRESETS: Record<string, string[]> = {
  minimal: ["skills"],
  professional: ["skills", "experienceBand", "values", "availability", "lookingFor"],
  full: [
    "skills", "experienceBand", "experienceYears", "values",
    "locationRegion", "availability", "lookingFor", "domain",
    "about", "projectHighlights", "interests", "communicationStyle",
    "workValues", "currentRole", "industry", "careerStage",
    "ageRange", "spokenLanguages",
  ],
};

/** Mandatory fields always included in derived proofs. */
const MANDATORY_POINTERS = [
  "/type",
  "/issuer",
  "/issuanceDate",
  "/credentialSubject/id",
];

/**
 * Generate a Verifiable Presentation with selective disclosure.
 *
 * @param signedVC - The BBS+ signed VC to derive from
 * @param preset - Disclosure preset name ("minimal", "professional", "full") or custom field list
 * @param keyPair - The issuer's key pair (for document loader)
 * @param nonce - Optional presentation nonce for replay protection
 */
export async function generatePresentation(
  signedVC: any,
  preset: string | string[],
  keyPair: any,
  nonce?: string
): Promise<any> {
  const documentLoader = createLocalLoader(keyPair);

  // Resolve preset to field list
  const fields = Array.isArray(preset) ? preset : PRESETS[preset];
  if (!fields) {
    throw new Error(
      `Unknown preset "${preset}". Available: ${Object.keys(PRESETS).join(", ")}`
    );
  }

  // Build JSON pointer selectors
  const claimPointers = fields
    .filter((f) => signedVC.credentialSubject?.[f] !== undefined)
    .map((f) => `/credentialSubject/${f}`);

  const selectivePointers = [...MANDATORY_POINTERS, ...claimPointers];

  const deriveSuite = new DataIntegrityProof({
    cryptosuite: createDiscloseCryptosuite({ selectivePointers }),
  });

  const derivedVC = await vc.derive({
    verifiableCredential: signedVC,
    suite: deriveSuite,
    documentLoader,
  });

  return derivedVC;
}

/**
 * Verify a derived (selectively disclosed) VC.
 */
export async function verifyPresentation(
  derivedVC: any,
  keyPair: any
): Promise<{ verified: boolean; error?: any }> {
  const documentLoader = createLocalLoader(keyPair);

  const verifySuite = new DataIntegrityProof({
    cryptosuite: createVerifyCryptosuite(),
  });

  return await vc.verifyCredential({
    credential: derivedVC,
    suite: verifySuite,
    documentLoader,
  });
}
