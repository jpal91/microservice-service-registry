import { randomUUID, type UUID } from "node:crypto";
import type { Logger, Registry } from "./index.d";

class ServiceRegistry {
  log: Logger;
  registry: Registry = {};

  constructor(logger: Logger = console) {
    this.log = logger;

    this.log.info("Starting new service registry");
  }

  /**
   * Registers new service or updates an existing service at the same ip/port.
   *
   * Will throw an error if a service of a different type already exists at the specified address (ip + port)
   */
  register(type: string, ip: string, port: string, version: string): UUID {
    const id = this.getIdByAddress(ip, port) ?? randomUUID();

    const service = this.registry[id] ?? {};

    // Attempting to register a service at an address already registered,
    // but of a different service type.
    // Otherwise we assume the same service is attempting to re-register
    if (service.type && service.type !== type) {
      this.log.error(
        `Service of type '${service.type}' already exists at IP: ${ip}, Port: ${port}`,
      );
      throw new Error();
    }

    const now = Date.now();

    this.registry[id] = {
      type,
      ip,
      port,
      version,
      created: service.created ?? now,
      lastUpdated: now,
      lastUsed: now,
    };

    this.log.debug(
      `Service '${type}' registered, Version: ${version}, IP: ${ip}, Port: ${port}`,
    );

    return id;
  }

  /**
   * Unregisters a service with id
   */
  unregister(id: UUID) {
    if (!(id in this.registry)) {
      this.log.warn(`No service with ${id} exists in registry`);
    } else {
      delete this.registry[id];
      this.log.debug(`Unregistered service: ${id}`);
    }
  }

  /**
   * Implements a round robin getter for services returning the least recently used service of
   * the specfied type.
   */
  getNextServiceByType(type: string) {
    let services = this.getServicesByType(type);

    if (!services.length) {
      throw new Error(`No services of type '${type}' exist`);
    }

    services.sort((a, b) => a.lastUsed - b.lastUsed);

    services[0].lastUsed = Date.now();

    return services[0];
  }

  getIdByAddress(ip: string, port: string): UUID | undefined {
    const entry = Object.entries(this.registry).filter(
      ([_, service]) => service.ip === ip && service.port === port,
    )[0];

    if (entry) {
      return entry[0] as UUID;
    }
  }

  getServiceById(id: UUID) {
    return this.registry[id];
  }

  getServicesByType(type: string) {
    return Object.values(this.registry).filter(
      (service) => service.type === type,
    );
  }
}

export default ServiceRegistry;
