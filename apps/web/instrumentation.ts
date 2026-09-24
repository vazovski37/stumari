/** Startup checks (ADR-0008): a wrong program id disables every chain feature, loudly. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { programIdProblem } = await import("./lib/solana/program-id");
  const { DEFAULT_PROGRAM_ID } = await import("./lib/env-schema");
  const problem = programIdProblem(process.env.STUMARI_PROGRAM_ID || DEFAULT_PROGRAM_ID);
  if (problem) console.error(`\n[stumari] ${problem}. Payments are disabled until this is fixed.\n`);
}
