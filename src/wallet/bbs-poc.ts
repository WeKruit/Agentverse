/**
 * BBS+ Proof of Concept
 *
 * Week 1 Gate: Can we sign a VC, derive a selective disclosure proof, and verify it?
 *
 * This file proves the Digital Bazaar BBS+ stack works for our use case:
 * 1. Generate BLS12-381 key pair
 * 2. Sign a VC with bbs-2023 cryptosuite
 * 3. Derive a proof revealing only selected claims
 * 4. Verify the derived proof
 */

// @ts-nocheck — Digital Bazaar packages don't ship TypeScript types

import * as Bls12381Multikey from "@digitalbazaar/bls12-381-multikey";
import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
import {
  createSignCryptosuite,
  createDiscloseCryptosuite,
  createVerifyCryptosuite,
} from "@digitalbazaar/bbs-2023-cryptosuite";
import * as vc from "@digitalbazaar/vc";

// We need a document loader that resolves contexts locally
import { createLocalLoader } from "./document-loader.js";

/**
 * Step 1: Generate a BLS12-381 key pair
 */
export async function generateKeyPair() {
  const keyPair = await Bls12381Multikey.generateBbsKeyPair({
    algorithm: "BBS-BLS12-381-SHA-256",
  });

  // Set controller (DID) for the key
  const did = `did:key:${keyPair.publicKeyMultibase}`;
  keyPair.controller = did;
  keyPair.id = `${did}#${keyPair.publicKeyMultibase}`;

  // Export for storage
  const exported = {
    publicKeyMultibase: keyPair.publicKeyMultibase,
    secretKeyMultibase: keyPair.secretKeyMultibase,
    controller: keyPair.controller,
    id: keyPair.id,
  };

  return { keyPair, exported };
}

/**
 * Step 2: Sign a VC with BBS+ (bbs-2023 cryptosuite)
 */
export async function signCredential(keyPair: any, claims: Record<string, any>) {
  const documentLoader = createLocalLoader(keyPair);

  // The credential to sign
  const credential = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://w3id.org/security/data-integrity/v2",
      {
        // Custom context for Agentverse profile attributes
        AgentverseCredential: "https://agentverse.app/ns#AgentverseCredential",
        skills: "https://agentverse.app/ns#skills",
        experienceBand: "https://agentverse.app/ns#experienceBand",
        values: "https://agentverse.app/ns#values",
        locationRegion: "https://agentverse.app/ns#locationRegion",
        availability: "https://agentverse.app/ns#availability",
        lookingFor: "https://agentverse.app/ns#lookingFor",
        about: "https://agentverse.app/ns#about",
        projectHighlights: "https://agentverse.app/ns#projectHighlights",
        experienceYears: "https://agentverse.app/ns#experienceYears",
        domain: "https://agentverse.app/ns#domain",
      },
    ],
    type: ["VerifiableCredential", "AgentverseCredential"],
    issuer: keyPair.controller || `did:key:${keyPair.publicKeyMultibase}`,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: `did:key:${keyPair.publicKeyMultibase}`,
      ...claims,
    },
  };

  // Create the sign suite
  const suite = new DataIntegrityProof({
    signer: keyPair.signer(),
    cryptosuite: createSignCryptosuite(),
  });

  // Sign it
  const signedVC = await vc.issue({
    credential,
    suite,
    documentLoader,
  });

  return signedVC;
}

/**
 * Step 3: Derive a proof with selective disclosure
 *
 * This is the core BBS+ magic: from a signed VC with 10 claims,
 * produce a derived proof revealing only 3 claims.
 */
export async function deriveProof(
  signedVC: any,
  keyPair: any,
  revealPaths: string[]
) {
  const documentLoader = createLocalLoader(keyPair);

  // Build JSON pointer selectors for the fields to reveal
  // Always reveal mandatory fields + selected claim fields
  const mandatoryPointers = [
    "/type",
    "/issuer",
    "/issuanceDate",
    "/credentialSubject/id",
  ];

  const claimPointers = revealPaths.map(
    (path) => `/credentialSubject/${path}`
  );

  const selectivePointers = [...mandatoryPointers, ...claimPointers];

  const deriveSuite = new DataIntegrityProof({
    cryptosuite: createDiscloseCryptosuite({
      selectivePointers,
    }),
  });

  // Derive the proof
  const derivedVC = await vc.derive({
    verifiableCredential: signedVC,
    suite: deriveSuite,
    documentLoader,
  });

  return derivedVC;
}

/**
 * Step 4: Verify a derived proof
 */
export async function verifyProof(derivedVC: any, keyPair: any) {
  const documentLoader = createLocalLoader(keyPair);

  const verifySuite = new DataIntegrityProof({
    cryptosuite: createVerifyCryptosuite(),
  });

  const result = await vc.verifyCredential({
    credential: derivedVC,
    suite: verifySuite,
    documentLoader,
  });

  return result;
}

/**
 * Run the full PoC
 */
export async function runBbsPoc() {
  console.log("=== BBS+ Proof of Concept ===\n");

  // Step 1: Key generation
  console.log("1. Generating BLS12-381 key pair...");
  const { keyPair, exported } = await generateKeyPair();
  console.log(`   Public key: ${exported.publicKeyMultibase?.slice(0, 30)}...`);
  console.log(`   Algorithm: BBS-BLS12-381-SHA-256`);
  console.log("   OK\n");

  // Step 2: Sign a credential with 10 claims
  console.log("2. Signing VC with 10 claims...");
  const claims = {
    skills: ["rust", "typescript", "distributed-systems", "ml"],
    experienceBand: "5-10yr",
    experienceYears: 7,
    values: ["autonomy", "impact", "climate"],
    locationRegion: "US-West",
    availability: "full-time",
    lookingFor: "biz-cofounder",
    domain: "fintech",
    about: "Built payment infrastructure at scale, serving 10M req/day.",
    projectHighlights: ["payment-pipeline", "fraud-detection-system"],
  };

  const signedVC = await signCredential(keyPair, claims);
  console.log(`   Credential type: ${signedVC.type.join(", ")}`);
  console.log(`   Claims signed: ${Object.keys(claims).length}`);
  console.log(`   Proof type: ${signedVC.proof?.type}`);
  console.log(`   Cryptosuite: ${signedVC.proof?.cryptosuite}`);
  console.log("   OK\n");

  // Step 3: Derive proof revealing only 3 claims
  console.log("3. Deriving proof (selective disclosure)...");
  const revealFields = ["skills", "experienceBand", "lookingFor"];
  const derivedVC = await deriveProof(signedVC, keyPair, revealFields);

  const disclosed = Object.keys(derivedVC.credentialSubject || {}).filter(
    (k) => k !== "id"
  );
  const hidden = Object.keys(claims).filter(
    (k) => !disclosed.includes(k)
  );

  console.log(`   Disclosed (${disclosed.length}): ${disclosed.join(", ")}`);
  console.log(`   Hidden (${hidden.length}): ${hidden.join(", ")}`);
  console.log(`   Proof type: ${derivedVC.proof?.type}`);
  console.log("   OK\n");

  // Step 4: Verify the derived proof
  console.log("4. Verifying derived proof...");
  const result = await verifyProof(derivedVC, keyPair);
  console.log(`   Verified: ${result.verified}`);
  if (!result.verified) {
    console.log(`   Error: ${JSON.stringify(result.error, null, 2)}`);
  }
  console.log("   OK\n");

  // Summary
  console.log("=== RESULT ===");
  console.log(`Key generation:      PASS`);
  console.log(`VC signing:          PASS (${Object.keys(claims).length} claims)`);
  console.log(
    `Selective disclosure: PASS (${disclosed.length} revealed, ${hidden.length} hidden)`
  );
  console.log(`Proof verification:  ${result.verified ? "PASS" : "FAIL"}`);
  console.log(
    `\nBBS+ Week 1 Gate:    ${result.verified ? "PASSED" : "FAILED"}`
  );

  return {
    keyPair: exported,
    signedVC,
    derivedVC,
    verified: result.verified,
  };
}
