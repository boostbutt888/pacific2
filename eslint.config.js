// Flat ESLint config for the whole monorepo (run once from the root: `pnpm lint`).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Money must never be a float: ban parseFloat / toFixed in the money package (ADR-009 §2).
      "no-restricted-syntax": "off",
    },
  },
  {
    files: ["packages/money/src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Money is integer minor units (ADR-009 §2)." },
      ],
      "no-restricted-properties": [
        "error",
        { property: "toFixed", message: "Use the explicit rounding helpers in rounding.ts (ADR-009 §2)." },
        { object: "Math", property: "round", message: "Use roundHalfUp / mulDivHalfUp (ADR-009 §2)." },
      ],
    },
  },
);
