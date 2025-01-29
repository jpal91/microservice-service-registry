import createApi from "./api";
import ServiceRegistry from "./service-registry";

const port = process.env.PORT || 3002;
const registry = new ServiceRegistry();
const app = createApi(registry);

const server = app.listen(port, () => {
  console.log(`Service registry listening on port ${port}`);
});

process.on("SIGTERM", () => {
  console.debug("SIGTERM Received. Closing server");
  server.close(() => {
    console.debug("Service Registry Closed");
  });
});
