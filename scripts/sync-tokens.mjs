// Copies the approved design tokens from the docs workspace into @pacific2/tokens.
// The UI Designer owns docs/ui/tokens.json; this repo never edits tokens by hand.
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2] ?? join(root, "..", "docs", "ui");
const target = join(root, "packages", "tokens", "src");

for (const file of ["tokens.json", "tokens.css"]) {
  const from = join(source, file);
  if (!existsSync(from)) {
    console.error(`Missing ${from}. Pass the docs/ui folder as the first argument.`);
    process.exit(1);
  }
  copyFileSync(from, join(target, file));
  console.log(`synced ${file}`);
}
