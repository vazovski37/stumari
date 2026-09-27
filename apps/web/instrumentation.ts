/** Startup checks (ADR-0008): a wrong program id disables every chain feature, loudly. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { programIdProblem } = await import("./lib/solana/program-id");
  const { DEFAULT_PROGRAM_ID, parseMewsEnv } = await import("./lib/env-schema");
  const problem = programIdProblem(process.env.STUMARI_PROGRAM_ID || DEFAULT_PROGRAM_ID);
  if (problem) console.error(`\n[stumari] ${problem}. Payments are disabled until this is fixed.\n`);
  // A bad optional Mews setting disables Mews only (mews-inventory.md "Configuration"); messages never echo values.
  const mews = parseMewsEnv(process.env);
  if (mews.problems.length > 0) {
    console.warn(`\n[stumari] Mews is disabled: ${mews.problems.join("; ")}. Mews hotels answer 503 until this is fixed.\n`);
  }
}
