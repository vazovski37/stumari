/** Step bookkeeping for the E2E: numbered output, a pass list, and the summary printed at the end. */
const passed: string[] = [];

export async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.log(`\n=== ${label}`);
  const started = Date.now();
  const result = await fn();
  passed.push(`${label} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  console.log(`--- PASS ${label}`);
  return result;
}

export function summary(failure?: unknown): string {
  const lines = passed.map((p) => `  PASS ${p}`);
  if (failure !== undefined) lines.push(`  FAIL ${failure instanceof Error ? (failure.stack ?? failure.message) : String(failure)}`);
  return lines.join("\n");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
