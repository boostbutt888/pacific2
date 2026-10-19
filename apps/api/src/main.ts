import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/**
 * API entry point. Configuration comes from environment variables only (SECURITY.md §4);
 * secrets are injected from AWS Secrets Manager in deployed environments, never from the repo.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix("v1");
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
