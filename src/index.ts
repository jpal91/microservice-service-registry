import api from "./api";

const port = process.env.PORT || 3002;

const server = api.listen(port, () => {
  console.log(`Service registry listening on port ${port}`);
});

process.on("SIGTERM", () => {
  console.debug("SIGTERM Received. Closing server");
  server.close(() => {
    console.debug("Service Registry Closed");
  });
});
