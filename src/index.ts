import express from "express";
import ServiceRegistry from "./service-registry";
import type { RegistrationRequest } from "./index.d";

const app = express();
const port = 3001;
const registry = new ServiceRegistry();

app.get("/", (_, res) => {
  res.send("Registry active");
});

app.post("/register", (req, res) => {
  const { type, ip, port, version } = req.body as RegistrationRequest;
  try {
    const id = registry.register(type, ip, port, version);
    res.send({ id });
  } catch (e) {
    res.status(500).send({ message: e });
  }
});

app.listen(port, () => {
  console.log(`Service registry listening on port ${port}`);
});
