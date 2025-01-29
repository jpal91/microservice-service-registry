"use strict";

const autocannon = require("autocannon");

const runBenchmark = async () => {
  const res = await fetch("http://localhost:3002/service", {
    method: "POST",
    body: JSON.stringify({
      serviceType: "users",
      port: 9001,
    }),
    headers: {
      Authorization: "Bearer abc123",
      "Content-Type": "application/json; char-set=utf-8",
    },
  });

  if (!res.ok) {
    throw new Error();
  }

  const { data } = await res.json();
  const { serviceId, token } = data;

  const requests = [];
  const services = ["users", "products", "search", "orders", "load-balancer"];

  for (const service of services) {
    for (let i = 1; i < 3; i++) {
      requests.push({
        path: `/services/${service + i}`,
        headers: {
          "x-service-id": serviceId,
          "x-service-token": token,
        },
      });
    }
  }

  const instance = autocannon(
    {
      url: "http://localhost:3002",
      duration: 10,
      requests,
    },
    console.log,
  );

  autocannon.track(instance);
};

runBenchmark();
