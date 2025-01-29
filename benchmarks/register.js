"use strict";

const autocannon = require("autocannon");

const requests = [];
const services = ["users", "products", "search", "orders"];

for (const service of services) {
  for (let i = 0; i < 1000; i++) {
    requests.push({
      body: JSON.stringify({
        serviceType: service,
        port: 3000 + i,
      }),
      method: "POST",
      path: "/service",
      headers: {
        "Content-type": "application/json; charset=utf-8",
        Authorization: "Bearer abc123",
      },
    });
  }
}

const instance = autocannon(
  {
    url: "http://localhost:3002",
    amount: requests.length,
    requests,
  },
  console.log,
);

autocannon.track(instance);
