/**
 * Regenerates src/generated/ (Codama Kit client) from the committed Anchor IDL.
 * Run after every program change: `pnpm --filter @stumari/escrow-client generate`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rootNodeFromAnchor, type AnchorIdl } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { createFromRoot } from "codama";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const idlPath = resolve(packageDir, "../../onchain/artifacts/idl/stumari_escrow.json");

const idl = JSON.parse(readFileSync(idlPath, "utf8")) as AnchorIdl;
const codama = createFromRoot(rootNodeFromAnchor(idl));

await codama.accept(
  renderVisitor(packageDir, {
    generatedFolder: "src/generated",
    kitImportStrategy: "rootOnly",
    syncPackageJson: false,
    prettierOptions: { printWidth: 100, singleQuote: false },
  }),
);
console.log(`generated src/generated from ${idlPath}`);
