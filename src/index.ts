import createApi from "./api";
import ServiceRegistry from "./service-registry";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
  },
});

const port = process.env.PORT || 3002;
const registry = new ServiceRegistry({ logger });
const app = createApi(registry);

const server = app.listen(port, () => {
  logger.info(`Service registry listening on port ${port}`);
});

const shutdown = () => {
  logger.debug("Closing server");
  server.close(() => {
    logger.debug("Service Registry Closed");
  });
};

process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
