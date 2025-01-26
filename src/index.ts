import express from "express";
import ServiceRegistry from "./service-registry";
import type { RegistrationRequest } from "./index.d";

const app = express();
app.use(express.json());

const port = 3001;
const registry = new ServiceRegistry();

app.get("/", (_, res) => {
  res.send("Registry active");
});

app.post("/register", (req, res) => {
  const { type, port, version } = req.body as RegistrationRequest;
  const ip = req.ip;

  if (!ip) {
    res.status(500).send({});
    return;
  }

  try {
    const id = registry.register(type, ip, port, version);
    res.send({ id });
  } catch (e) {
    res.status(500).send({ message: e });
  }
});

app.get("/service/:serviceName", (req, res) => {
  const { serviceName } = req.params;
  try {
    const service = registry.getNextServiceByType(serviceName);
    res.send(service);
  } catch (e) {
    res.status(500).send({ message: e });
  }
});

app.get("/:path/:rem(*)", (req, res) => {
  res.send(req.params);
});

app.listen(port, () => {
  console.log(`Service registry listening on port ${port}`);
});
