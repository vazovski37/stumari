import type { Address } from "@solana/kit";
import * as generatedErrors from "./generated/errors";
import { STUMARI_ESCROW_PROGRAM_ADDRESS } from "./generated/programs";

export interface EscrowErrorInfo {
  code: number;
  /** `EscrowError` variant name, e.g. `RefundBelowMinimum`. */
  name: string;
  message: string;
}

/** A failed simulation, send or confirmation, reduced to what an API response needs. */
export interface TxFailure {
  /** Custom program error number (escrow `6000+`, Anchor framework `2000+`/`3000+`), else null. */
  code: number | null;
  /** Program or Anchor error name (`RefundBelowMinimum`, `ConstraintSeeds`) or the runtime error name. */
  name: string;
  message: string;
  instructionIndex: number | null;
  logs: readonly string[];
}

export type TxStage = "simulate" | "send" | "confirm" | "expired" | "timeout";

export class EscrowTxError extends Error {
  constructor(
    readonly stage: TxStage,
    readonly failure: TxFailure,
  ) {
    super(`${stage} failed: ${failure.name}: ${failure.message}`);
    this.name = "EscrowTxError";
  }

  /** The name to report (`409 SIMULATION_FAILED` carries it). */
  get errorName(): string {
    return this.failure.name;
  }
}

const PREFIX = "STUMARI_ESCROW_ERROR__";
const pascal = (screaming: string) =>
  screaming
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

/** Built from the Codama constants, so a regenerated client adds new variants automatically. */
const ESCROW_ERRORS = new Map<number, EscrowErrorInfo>(
  Object.entries(generatedErrors as Record<string, unknown>)
    .filter((entry): entry is [string, number] => entry[0].startsWith(PREFIX) && typeof entry[1] === "number")
    .map(([key, code]) => [
      code,
      {
        code,
        name: pascal(key.slice(PREFIX.length)),
        message: generatedErrors.getStumariEscrowErrorMessage(code as generatedErrors.StumariEscrowError),
      },
    ]),
);

export function escrowErrorFromCode(code: number): EscrowErrorInfo | null {
  return ESCROW_ERRORS.get(code) ?? null;
}

/** `... Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated.` */
const ANCHOR_LOG = /Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.*?)\.?$/;

function anchorErrorFromLogs(logs: readonly string[]): EscrowErrorInfo | null {
  for (const line of logs) {
    const m = ANCHOR_LOG.exec(line);
    if (m) return { name: m[1]!, code: Number(m[2]), message: m[3]! };
  }
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function variantName(err: unknown, fallback: string): string {
  if (typeof err === "string") return err;
  if (isRecord(err)) return Object.keys(err)[0] ?? fallback;
  return fallback;
}

export interface ParseOptions {
  logs?: readonly string[] | null;
  /** Program id of each instruction, in order; attributes custom codes to the escrow program. */
  programIds?: readonly Address[];
}

/**
 * Turns an RPC `TransactionError` (simulation `err`, `getSignatureStatuses` `err`) or a thrown
 * error into a {@link TxFailure}. Anchor's own log line wins when present: it names framework
 * errors too and keeps messages that production bundles of the generated client omit.
 */
export function parseTransactionError(err: unknown, options: ParseOptions = {}): TxFailure {
  const logs = options.logs ?? [];
  const base = { logs, instructionIndex: null, code: null };
  const instructionError = isRecord(err) ? err["InstructionError"] : undefined;
  if (Array.isArray(instructionError)) {
    const [rawIndex, ixErr] = instructionError as [unknown, unknown];
    const instructionIndex = Number(rawIndex);
    if (isRecord(ixErr) && "Custom" in ixErr) {
      const code = Number(ixErr["Custom"]);
      const anchor = anchorErrorFromLogs(logs);
      if (anchor?.code === code) return { ...anchor, instructionIndex, logs };
      const programId = options.programIds?.[instructionIndex];
      const escrow =
        programId === undefined || programId === STUMARI_ESCROW_PROGRAM_ADDRESS ? escrowErrorFromCode(code) : null;
      if (escrow) return { ...escrow, instructionIndex, logs };
      // System program `create_account` on an existing address (e.g. a second create for one booking id).
      if (code === 0 && logs.some((l) => l.includes("already in use"))) {
        return { code, name: "AccountAlreadyInUse", message: "account already in use", instructionIndex, logs };
      }
      return {
        code,
        name: `Custom(${code})`,
        message: `instruction ${instructionIndex} failed with custom error ${code}`,
        instructionIndex,
        logs,
      };
    }
    const name = variantName(ixErr, "InstructionError");
    return { ...base, name, message: `instruction ${instructionIndex} failed: ${name}`, instructionIndex };
  }
  if (err instanceof Error) return { ...base, name: err.name, message: err.message };
  if (typeof err === "string" || isRecord(err)) {
    const name = variantName(err, "TransactionError");
    return { ...base, name, message: `transaction failed: ${name}` };
  }
  return { ...base, name: "UnknownError", message: String(err) };
}
