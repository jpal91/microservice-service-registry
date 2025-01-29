import request from "supertest";
import createApi from "@app/api";
import ServiceRegistry, { type Instance } from "@app/service-registry";

process.env.SERVICE_REGISTRATION_KEY = "abc123";

const registry = new ServiceRegistry({ healthChecks: false });
const app = createApi(registry);

afterAll(() => {
  registry.dispose();
});

describe("GET /", () => {
  test("it works", (done) => {
    request(app).get("/").expect(200, done);
  });
});

describe("POST /service", () => {
  test("it needs auth header", (done) => {
    request(app).post("/service").expect(401, done);
  });

  test("it needs valid input", (done) => {
    request(app)
      .post("/service")
      .auth("abc123", { type: "bearer" })
      .expect(400, done);
  });

  test("it registers", async () => {
    await request(app)
      .post("/service")
      .auth("abc123", { type: "bearer" })
      .send({ serviceType: "users", port: 3000 })
      .expect("Content-Type", /json/)
      .expect(201)
      .then((res) => {
        expect(res.body.data.serviceId).toBeDefined();
        expect(res.body.data.token).toBeDefined();
      });
  });
});

describe("GET /services/:servicename", () => {
  const { serviceId, token } = registry.register(
    { serviceType: "products", port: "3001", host: "localhost" },
    "abc123",
  );

  test("it needs token and id", (done) => {
    request(app).get("/services/products").expect(401, done);
  });

  test("it doesn't get invalid services", (done) => {
    request(app)
      .get("/services/nothing")
      .set("x-service-id", serviceId)
      .set("x-service-token", token)
      .expect(400, done);
  });

  test("it gets services", async () => {
    await request(app)
      .get("/services/products")
      .set("x-service-id", serviceId)
      .set("x-service-token", token)
      .expect(200)
      .then((res) => {
        const data = res.body.data;
        expect(data).toBeInstanceOf(Array);
        expect((data as Instance[])[0].id).toBe(serviceId);
      });
  });
});

describe("GET /service/:id", () => {
  const { serviceId, token } = registry.register(
    { serviceType: "search", port: "3002", host: "localhost" },
    "abc123",
  );
  const { serviceId: id2 } = registry.register(
    { serviceType: "search", port: "3003", host: "localhost" },
    "abc123",
  );

  test("it needs token and id", (done) => {
    request(app).get(`/service/${serviceId}`).expect(401, done);
  });

  test("it gets service by id", (done) => {
    request(app)
      .get(`/service/${serviceId}`)
      .set("x-service-id", serviceId)
      .set("x-service-token", token)
      .expect(200, done);
  });

  test("it gets a different service by id when authenticated", (done) => {
    request(app)
      .get(`/service/${id2}`)
      .set("x-service-id", serviceId)
      .set("x-service-token", token)
      .expect(200, done);
  });
});

describe("DELETE service/:id", () => {
  const { serviceId, token } = registry.register(
    { serviceType: "orders", port: "3002", host: "localhost" },
    "abc123",
  );

  test("it needs token and id", (done) => {
    request(app).get(`/service/${serviceId}`).expect(401, done);
  });

  test("it unregisters a service", async () => {
    await request(app)
      .delete(`/service/${serviceId}`)
      .set("x-service-id", serviceId)
      .set("x-service-token", token)
      .expect(200);

    const unregistered = registry.getInstanceById(serviceId);
    expect(unregistered).toBeUndefined();
  });
});
