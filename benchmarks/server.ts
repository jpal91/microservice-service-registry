import ServiceRegistry from "@app/service-registry";
import createApi from "@app/api";
import pino from "pino";

process.env.SERVICE_REGISTRATION_KEY = "abc123";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
  },
});

const registry = new ServiceRegistry({ healthChecks: false, logger });

const services = ["users", "products", "search", "orders", "load-balancer"];

for (const service of services) {
  for (let i = 1; i < 3; i++) {
    for (let j = 0; j < 500; j++) {
      registry.register(
        {
          host: "localhost",
          port: String(4000 * i + j),
          serviceType: service + i,
        },
        "abc123",
      );
    }
  }
}

const port = 3002;
const app = createApi(registry);

const server = app.listen(port, () => {
  logger.info(`Service registry listening on port ${port}`);
});

const shutdown = () => {
  server.close(() => {
    logger.info("Service Registry Closed");
  });
};

process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
