// @ts-nocheck
/**
 * BBS+ Verifiable Credential issuance and verification.
 */

import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
import {
  createSignCryptosuite,
} from "@digitalbazaar/bbs-2023-cryptosuite";
import * as vc from "@digitalbazaar/vc";
import { createLocalLoader } from "./document-loader.js";

/** The custom JSON-LD context for Agentverse profile attributes. */
export const AGENTVERSE_CONTEXT = {
  AgentverseCredential: "https://agentverse.app/ns#AgentverseCredential",
  skills: "https://agentverse.app/ns#skills",
  experienceBand: "https://agentverse.app/ns#experienceBand",
  experienceYears: "https://agentverse.app/ns#experienceYears",
  values: "https://agentverse.app/ns#values",
  locationRegion: "https://agentverse.app/ns#locationRegion",
  availability: "https://agentverse.app/ns#availability",
  lookingFor: "https://agentverse.app/ns#lookingFor",
  domain: "https://agentverse.app/ns#domain",
  about: "https://agentverse.app/ns#about",
  projectHighlights: "https://agentverse.app/ns#projectHighlights",
  interests: "https://agentverse.app/ns#interests",
  communicationStyle: "https://agentverse.app/ns#communicationStyle",
  workValues: "https://agentverse.app/ns#workValues",
  currentRole: "https://agentverse.app/ns#currentRole",
  industry: "https://agentverse.app/ns#industry",
  careerStage: "https://agentverse.app/ns#careerStage",
  ageRange: "https://agentverse.app/ns#ageRange",
  spokenLanguages: "https://agentverse.app/ns#spokenLanguages",
};

/**
 * Issue a BBS+ signed Verifiable Credential.
 */
export async function issueCredential(
  claims: Record<string, any>,
  keyPair: any,
  documentLoader?: any
): Promise<any> {
  const loader = documentLoader || createLocalLoader(keyPair);

  const credential = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://w3id.org/security/data-integrity/v2",
      AGENTVERSE_CONTEXT,
    ],
    type: ["VerifiableCredential", "AgentverseCredential"],
    issuer: keyPair.controller,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: keyPair.controller,
      ...claims,
    },
  };

  const suite = new DataIntegrityProof({
    signer: keyPair.signer(),
    cryptosuite: createSignCryptosuite(),
  });

  return await vc.issue({ credential, suite, documentLoader: loader });
}

/**
 * Verify a BBS+ credential by deriving a full-disclosure proof and verifying that.
 *
 * Note: BBS-2023 cryptosuite requires deriving a disclosure proof before verification.
 * You cannot verify a base BBS+ signature directly — this is by design.
 * For verifying derived proofs, use verifyPresentation from presentation.ts.
 */
export async function verifyCredential(
  signedVC: any,
  keyPair: any,
  documentLoader?: any
): Promise<{ verified: boolean; error?: any }> {
  const loader = documentLoader || createLocalLoader(keyPair);

  // First, derive a full-disclosure proof (reveal everything)
  const { createDiscloseCryptosuite, createVerifyCryptosuite } = await import(
    "@digitalbazaar/bbs-2023-cryptosuite"
  );

  // Get all credentialSubject fields for full disclosure
  const subjectKeys = Object.keys(signedVC.credentialSubject || {});
  const selectivePointers = [
    "/type",
    "/issuer",
    "/issuanceDate",
    ...subjectKeys.map((k) => `/credentialSubject/${k}`),
  ];

  const deriveSuite = new DataIntegrityProof({
    cryptosuite: createDiscloseCryptosuite({ selectivePointers }),
  });

  let derivedVC;
  try {
    derivedVC = await vc.derive({
      verifiableCredential: signedVC,
      suite: deriveSuite,
      documentLoader: loader,
    });
  } catch (e: any) {
    return { verified: false, error: e };
  }

  // Then verify the derived proof
  const verifySuite = new DataIntegrityProof({
    cryptosuite: createVerifyCryptosuite(),
  });

  return await vc.verifyCredential({
    credential: derivedVC,
    suite: verifySuite,
    documentLoader: loader,
  });
}
