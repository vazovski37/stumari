/**
 * Error codes. The first group mirrors `EscrowError` names in the on-chain program so
 * TS and Rust report the same code for the same input (spec/vectors/refund.json).
 */
export type CoreErrorCode =
  | "InvalidTiers"
  | "InvalidStatus"
  | "TooLateToCancel"
  | "InvalidBps"
  | "InvalidAmount"
  | "MathOverflow"
  | "InvalidInput"
  | "InvalidPolicy"
  | "InvalidModel"
  | "NonCanonical";

export class CoreError extends Error {
  readonly code: CoreErrorCode;

  constructor(code: CoreErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "CoreError";
    this.code = code;
  }
}

export function isCoreError(e: unknown, code?: CoreErrorCode): e is CoreError {
  return e instanceof CoreError && (code === undefined || e.code === code);
}
