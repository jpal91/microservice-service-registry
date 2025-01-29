import ServiceRegistry, {
  type ServiceRegistryOptions,
  type InstanceRegisterRequest,
} from "@app/service-registry";

process.env.SERVICE_REGISTRATION_KEY = "abc123";

test("needs .env variables", () => {
  process.env.SERVICE_REGISTRATION_KEY = "";
  expect(() => {
    const _ = new ServiceRegistry();
  }).toThrow();
  process.env.SERVICE_REGISTRATION_KEY = "abc123";
});

const regKey = process.env.SERVICE_REGISTRATION_KEY;

const defaultOpts: ServiceRegistryOptions = { healthChecks: false };

describe("service registry", () => {
  let registry: ServiceRegistry | null = null;

  afterEach(() => {
    if (registry) {
      registry.dispose();
      registry = null;
    }
  });

  test("it inits", () => {
    expect(() => {
      registry = new ServiceRegistry(defaultOpts);
    }).not.toThrow();
  });

  test("it registers", () => {
    registry = new ServiceRegistry(defaultOpts);

    const newInstance: InstanceRegisterRequest = {
      serviceType: "users",
      port: "3000",
      host: "localhost",
    };

    let res: ReturnType<ServiceRegistry["register"]>;

    expect(() => {
      registry!.register(newInstance, "notkey");
    }).toThrow();

    expect(() => {
      res = registry!.register(newInstance, regKey);
    }).not.toThrow();

    expect(res!).toHaveProperty("serviceId");
    expect(res!).toHaveProperty("token");
  });

  test("it registers multiple", () => {
    registry = new ServiceRegistry(defaultOpts);

    const serviceTypes = ["users", "products", "search"];
    const instanceRequests: InstanceRegisterRequest[] = serviceTypes.map(
      (name) => {
        return {
          serviceType: name,
          port: "3000",
          host: "localhost",
        };
      },
    );

    for (const instance of instanceRequests) {
      registry!.register(instance, regKey);
    }

    const serviceKeys = Array.from(registry.serviceMap.keys());
    expect(serviceKeys.length).toBe(3);

    const instanceValues = Array.from(registry.instanceMap.values()).map(
      (inst) => inst.serviceType,
    );
    expect(instanceValues.length).toBe(3);

    serviceTypes.forEach((type) => {
      expect(serviceKeys).toContain(type);
      expect(instanceValues).toContain(type);
    });
  });

  test("it unregisters", () => {
    registry = new ServiceRegistry(defaultOpts);
    const instanceRequest: InstanceRegisterRequest = {
      serviceType: "users",
      port: "3000",
      host: "localhost",
    };

    const { serviceId } = registry.register(instanceRequest, regKey);
    registry.unregister(serviceId);

    expect(registry.instanceMap.size).toBe(0);
    expect(registry.serviceMap.size).toBe(0);
  });

  test("it gets by id", () => {
    registry = new ServiceRegistry(defaultOpts);

    const instanceRequest: InstanceRegisterRequest = {
      serviceType: "users",
      port: "3000",
      host: "localhost",
    };

    const { serviceId } = registry.register(instanceRequest, regKey);

    const res = registry.getInstanceById(serviceId);

    expect(res).toBeDefined();
    expect(res).toHaveProperty("id", serviceId);
    expect(res).toHaveProperty("serviceType", "users");
  });

  test("it gets by type", () => {
    registry = new ServiceRegistry(defaultOpts);

    const instanceRequests: InstanceRegisterRequest[] = Array.from({
      length: 3,
    }).map((_, i) => {
      return {
        serviceType: "users",
        port: String(3000 + i),
        host: "localhost",
      };
    });

    instanceRequests.push({
      serviceType: "products",
      port: "3004",
      host: "localhost",
    });

    for (const instance of instanceRequests) {
      registry.register(instance, regKey);
    }

    const res = registry.getInstancesByType("users");
    expect(res.length).toBe(3);

    const unique = new Set(res.map((inst) => inst.serviceType));
    expect(unique.size).toBe(1);
  });
});

describe("health checks", () => {
  let registry: ServiceRegistry;

  const setup = () => {
    registry = new ServiceRegistry({ healthChecks: false });

    const instanceRequests: InstanceRegisterRequest[] = Array.from({
      length: 3,
    }).map((_, i) => {
      return {
        serviceType: "users",
        port: String(3000 + i),
        host: "localhost",
      };
    });

    for (const instance of instanceRequests) {
      registry.register(instance, regKey);
    }
  };

  afterEach(() => {
    registry.dispose();
  });

  test("it checks", async () => {
    const mockFetch = jest.fn(() => Promise.resolve(new Response("{}")));
    global.fetch = mockFetch;
    setup();

    await registry.runHealthChecks();

    const url = new URL("/health", "https://localhost:3000");
    expect(mockFetch).toHaveBeenCalledWith(url, {
      signal: new AbortController().signal,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("it removes unhealthy instances", async () => {
    const mockFetch = jest
      .fn(() => Promise.resolve(new Response("{}")))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));

    global.fetch = mockFetch;
    setup();

    expect(
      Array.from(registry.instanceMap.values()).every((inst) => inst.healthy),
    ).toBe(true);
    expect(registry.serviceMap.get("users")?.size).toBe(3);
    await registry.runHealthChecks();

    expect(
      Array.from(registry.instanceMap.values()).every((inst) => inst.healthy),
    ).toBe(false);
    expect(registry.serviceMap.get("users")?.size).toBe(2);
  });
});
