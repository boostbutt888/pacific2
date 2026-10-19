import { Controller, Get } from "@nestjs/common";

export interface Health {
  status: "ok";
  service: "api";
  version: string;
}

/** Liveness probe for the ALB / ECS health check (ARCHITECTURE §5). No tenant data. */
@Controller("health")
export class HealthController {
  @Get()
  get(): Health {
    return { status: "ok", service: "api", version: process.env.APP_VERSION ?? "0.7.0-dev" };
  }
}
