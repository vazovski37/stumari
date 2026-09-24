import { STUMARI_ESCROW_PROGRAM_ADDRESS } from "@stumari/escrow-client";

/**
 * ADR-0008: `STUMARI_PROGRAM_ID` must equal the fixed id in onchain/artifacts/program-id.txt
 * (inlined by next.config.ts as STUMARI_ARTIFACT_PROGRAM_ID) and the id the escrow client was
 * generated for. Returns a description of the mismatch, or null.
 */
export function programIdProblem(
  configured: string,
  artifactId: string | undefined = process.env.STUMARI_ARTIFACT_PROGRAM_ID,
): string | null {
  if (configured !== STUMARI_ESCROW_PROGRAM_ADDRESS) {
    return `STUMARI_PROGRAM_ID ${configured} differs from the escrow client's program ${STUMARI_ESCROW_PROGRAM_ADDRESS}`;
  }
  if (artifactId && configured !== artifactId) {
    return `STUMARI_PROGRAM_ID ${configured} differs from onchain/artifacts/program-id.txt (${artifactId})`;
  }
  return null;
}
