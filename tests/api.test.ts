import request from "supertest";
import createApi from "@app/api";
import ServiceRegistry, { type Instance } from "@app/service-registry";
import type { Express } from "express";

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

describe("/admin", () => {
  let registry: ServiceRegistry;
  let app: Express;
  process.env.ADMIN_API_KEY = "abc123";

  const processExit = global.process.exit;
  const processEmit = global.process.emit;

  beforeEach(() => {
    registry = new ServiceRegistry({ healthChecks: false });
    app = createApi(registry);

    global.process.emit = jest.fn();
    global.process.exit = jest.fn() as never;

    jest.useFakeTimers();
  });

  afterEach(() => {
    global.process.emit = processEmit;
    global.process.exit = processExit;

    jest.useRealTimers();
    registry.dispose();
  });

  test("they need admin keys", async () => {
    await request(app).get("/admin/health").expect(401);
    await request(app).get("/admin/shutdown").expect(401);
  });

  test("it returns health check", async () => {
    await request(app)
      .get("/admin/health")
      .set("x-admin-key", "abc123")
      .expect(200)
      .then((res) => {
        const data = res.body.data;
        expect(data).toBeDefined();
        expect(data.status).toBe("UP");
      });
  });

  test("it shuts down and forces exit if timeout occurs", async () => {
    await request(app)
      .post("/admin/shutdown")
      .set("x-admin-key", "abc123")
      .expect(200);

    expect(global.process.emit).toHaveBeenCalledWith("SIGTERM");

    jest.advanceTimersByTime(10000);

    expect(global.process.exit).toHaveBeenCalledWith(1);
  });

  test("it handles shutdown errors", async () => {
    const originalDispose = registry.dispose;
    registry.dispose = jest.fn(() => {
      throw new Error();
    });

    await request(app)
      .post("/admin/shutdown")
      .set("x-admin-key", "abc123")
      .expect(500);

    expect(global.process.exit).toHaveBeenCalledWith(1);
    registry.dispose = originalDispose;
  });
});
