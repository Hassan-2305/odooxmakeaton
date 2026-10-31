import express from "express";
import { healthRouter } from "./routes/health.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.use("/api/health", healthRouter);

  return app;
}
