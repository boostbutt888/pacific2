import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PACIFIC2_PRIMARY, PACIFIC2_TEAL, cssVar, primitiveColor, tokens } from "../src/index.js";

const css = readFileSync(fileURLToPath(new URL("../src/tokens.css", import.meta.url)), "utf8");

describe("design tokens (D-128)", () => {
  it("keeps the approved Pacific2 brand colours", () => {
    expect(primitiveColor("blue", "600")).toBe(PACIFIC2_PRIMARY);
    expect(primitiveColor("teal", "700")).toBe(PACIFIC2_TEAL);
  });

  it("ships the generated CSS with the brand variables", () => {
    expect(css).toContain(`${cssVar("color", "blue", "600")}: ${PACIFIC2_PRIMARY}`);
    expect(css).toContain(`${cssVar("brand", "primary")}: var(--p2-color-blue-600)`);
  });

  it("is the G4-approved token set", () => {
    expect(tokens.$extensions["pacific2.version"]).toMatch(/^0\.\d+\.\d+$/);
    expect(Object.keys(tokens.device)).toEqual(
      expect.arrayContaining(["pos", "kiosk", "kds", "qms", "cop", "backoffice"]),
    );
  });
});
