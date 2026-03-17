/**
 * Custom JSON-LD document loader for Agentverse.
 *
 * Resolves all required contexts locally (no HTTP calls during crypto operations).
 * This is critical for:
 * 1. Offline operation (CLI tool shouldn't need internet for signing)
 * 2. Security (no remote code loading during cryptographic operations)
 * 3. Reproducibility (contexts don't change under our feet)
 */

// @ts-nocheck — JSON-LD and context packages don't ship TypeScript types

import dataIntegrityCtx from "@digitalbazaar/data-integrity-context";

// W3C Credentials v2 context
const CREDENTIALS_V2_URL = "https://www.w3.org/ns/credentials/v2";
const CREDENTIALS_V2_CTX = {
  "@context": {
    "@protected": true,
    id: "@id",
    type: "@type",
    VerifiableCredential: {
      "@id": "https://www.w3.org/2018/credentials#VerifiableCredential",
      "@context": {
        "@protected": true,
        id: "@id",
        type: "@type",
        credentialSubject: {
          "@id": "https://www.w3.org/2018/credentials#credentialSubject",
          "@type": "@id",
        },
        issuer: {
          "@id": "https://www.w3.org/2018/credentials#issuer",
          "@type": "@id",
        },
        issuanceDate: {
          "@id": "https://www.w3.org/2018/credentials#issuanceDate",
          "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
        },
        proof: {
          "@id": "https://w3id.org/security#proof",
          "@type": "@id",
          "@container": "@graph",
        },
      },
    },
    VerifiablePresentation: {
      "@id": "https://www.w3.org/2018/credentials#VerifiablePresentation",
    },
    verifiableCredential: {
      "@id": "https://www.w3.org/2018/credentials#verifiableCredential",
      "@type": "@id",
      "@container": "@graph",
    },
  },
};

// Data Integrity context
const DATA_INTEGRITY_URL = "https://w3id.org/security/data-integrity/v2";

/**
 * Creates a document loader that resolves all contexts locally
 * and resolves did:key identifiers to key documents.
 */
export function createLocalLoader(keyPair?: any) {
  const contextMap = new Map<string, any>();

  // Register known contexts
  contextMap.set(CREDENTIALS_V2_URL, {
    document: CREDENTIALS_V2_CTX,
    documentUrl: CREDENTIALS_V2_URL,
  });

  // Data Integrity context from the package
  if (dataIntegrityCtx?.contexts) {
    for (const [url, doc] of dataIntegrityCtx.contexts) {
      contextMap.set(url, { document: doc, documentUrl: url });
    }
  }

  return async function documentLoader(url: string) {
    // Check static context map
    if (contextMap.has(url)) {
      return contextMap.get(url);
    }

    // Handle did:key resolution
    if (url.startsWith("did:key:")) {
      if (keyPair) {
        const didId = url.split("#")[0];
        const keyId = `${didId}#${keyPair.publicKeyMultibase}`;

        // If requesting a specific key fragment, return the key directly
        if (url.includes("#")) {
          const keyDoc = {
            "@context": "https://w3id.org/security/multikey/v1",
            id: keyId,
            type: "Multikey",
            controller: didId,
            publicKeyMultibase: keyPair.publicKeyMultibase,
          };
          return { document: keyDoc, documentUrl: url };
        }

        // Otherwise return the full DID document
        const didDoc = {
          "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/multikey/v1",
          ],
          id: didId,
          verificationMethod: [
            {
              id: keyId,
              type: "Multikey",
              controller: didId,
              publicKeyMultibase: keyPair.publicKeyMultibase,
            },
          ],
          assertionMethod: [keyId],
          authentication: [keyId],
        };
        return { document: didDoc, documentUrl: url };
      }
    }

    // Handle inline contexts (objects passed directly in @context arrays)
    if (typeof url === "object") {
      return { document: url, documentUrl: "urn:inline-context" };
    }

    // For any URL we don't recognize, try to handle it as an unknown context
    // In production, we'd fail hard here. For PoC, return a minimal context.
    console.warn(`  [document-loader] Unknown URL: ${url}`);
    return {
      document: { "@context": {} },
      documentUrl: url,
    };
  };
}
