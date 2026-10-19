import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { HealthController } from "../src/health.controller";

describe("HealthController", () => {
  it("reports ok without touching tenant data", () => {
    expect(new HealthController().get()).toMatchObject({ status: "ok", service: "api" });
  });
});
