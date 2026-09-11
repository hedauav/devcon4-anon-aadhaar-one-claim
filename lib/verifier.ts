import { ArtifactsOrigin, artifactUrls, init, verify } from '@anon-aadhaar/core';
import type { ProofVerifier } from './intake';

let ready: Promise<void> | null = null;

/**
 * The real Anon Aadhaar verifier, run on the server.
 *
 * `init` points the SDK at the published v2 circuit artifacts (only the verification key is used
 * here); `verify` checks the groth16 proof against it and that the QR was signed by UIDAI's key
 * (or the SDK test key when USE_TEST_AADHAAR=true). It throws on an issuer mismatch, which the
 * intake service treats as an invalid proof.
 */
export const verifyAnonAadhaar: ProofVerifier = async (pcd, useTestAadhaar) => {
  ready ??= init({
    wasmURL: artifactUrls.v2.wasm,
    zkeyURL: artifactUrls.v2.zkey,
    vkeyURL: artifactUrls.v2.vk,
    artifactsOrigin: ArtifactsOrigin.server,
  });
  await ready;
  return verify(pcd, useTestAadhaar);
};
