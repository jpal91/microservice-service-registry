import { randomUUID, UUID } from "node:crypto";
import EventEmitter from "node:events";

type LoggerMethod = (...args: any[]) => void;

interface Logger {
  log?: LoggerMethod;
  debug: LoggerMethod;
  warn: LoggerMethod;
  error: LoggerMethod;
  info: LoggerMethod;
}

/**
 * Represents a registered service instance in the registry
 *
 * @interface Instance
 * @property {UUID} id - Unique identifier for this instance
 * @property {string} serviceType - The type of service this instance provides (e.g. "product-database")
 * @property {string} host - Hostname where the service is running
 * @property {string} port - Port number the service is listening on
 * @property {number} created - Timestamp when this instance was registered
 * @property {number} lastUpdated - Timestamp of most recent health check or update
 * @property {boolean} healthy - Current health status based on health checks
 * @property {Record<string,any>} meta - Additional metadata about this instance
 */
export interface Instance {
  id: UUID;
  serviceType: string;
  host: string;
  port: string;
  created: number;
  lastUpdated: number;
  healthy: boolean;
  meta: Record<string, any>;
}

export type InstanceRegisterRequest = Pick<
  Instance,
  "serviceType" | "host" | "port" | "meta"
>;

/**
 * A mapping of instance IDs to their corresponding Instance objects. Used for
 * direct instance lookups and tracking all registered instances.
 *
 * @example
 * // Example logged entry:
 * Map(1) {
 *   "550e8400-e29b-41d4-a716-446655440000" => {
 *     id: "550e8400-e29b-41d4-a716-446655440000",
 *     serviceType: "product-database",
 *     host: "db-1.example.com",
 *     port: "5432",
 *     created: 1673449837190,
 *     lastUpdated: 1673449897321,
 *     healthy: true,
 *     meta: { region: "us-east-1" }
 *   }
 * }
 */
type InstanceMap = Map<string, Instance>;

/**
 * A mapping of service types to sets of instance IDs providing that service.
 * Allows efficient lookup of all instances for a given service type.
 *
 * @example
 * // Example logged entry:
 * Map(1) {
 *   "product-database" => Set(2) {
 *     "550e8400-e29b-41d4-a716-446655440000",
 *     "7a68e0c0-1234-5678-90ab-cdef01234567"
 *   }
 * }
 */
type ServiceMap = Map<string, Set<string>>;

interface DefaultHealthCheckResponse {
  status: "ok" | "error";
  timestamp: number;
}

interface ServiceRegistryEventMap<HealthCheckResponse> {
  instanceRegistered: [Instance];
  instanceRemoved: [Instance];
  healthCheckFailed: [Instance];
  healthCheckPassed: [Instance, HealthCheckResponse];
}

/**
 * Configuration options for initializing a ServiceRegistry instance
 *
 * @interface ServiceRegistryOptions
 * @property {boolean} [healthChecks=true] - Enable/disable automatic health checking of services
 * @property {number} [healthCheckBatchSize=100] - Number of instances to check in each batch
 * @property {number} [healthCheckInterval=5000] - Time in ms between health check cycles
 * @property {number} [healthCheckMaxRequests=10] - Maximum concurrent health check requests
 * @property {number} [healthCheckTTL=2000] - Timeout in ms for individual health check requests
 * @property {Logger} [logger=console] - Custom logger implementation
 */
export interface ServiceRegistryOptions {
  healthChecks?: boolean;
  healthCheckBatchSize?: number;
  healthCheckInterval?: number;
  healthCheckMaxRequests?: number;
  healthCheckTTL?: number;
  logger?: Logger;
}

/**
 * ServiceRegistry manages a collection of microservice instances, tracking their status and health.
 * It provides registration, health checking, and lookup capabilities for distributed services.
 *
 * Features:
 * - Service registration/deregistration
 * - Automatic health checking of registered instances
 * - Instance lookup by ID or service type
 * - Event emission for instance state changes
 *
 * Health checks are performed periodically in batches with configurable parameters like:
 * - Batch size
 * - Check interval
 * - Max concurrent requests
 * - Request timeout
 *
 * Events:
 * - instanceRegistered: Fired when a new instance is registered
 *
 *   Args: [instance: Instance] - The newly registered service instance
 * - instanceRemoved: Fired when an instance is removed from the registry
 *
 *   Args: [instance: Instance] - The removed service instance
 * - healthCheckFailed: Fired when an instance's health check fails
 *
 *   Args: [instance: Instance] - The instance that failed the health check
 * - healthCheckPassed: Fired when an instance passes its health check
 *
 *   Args: [instance: Instance, data: HealthCheckResponse] - The healthy instance and health check response data
 */
class ServiceRegistry<
  HealthCheckResponse = DefaultHealthCheckResponse,
> extends EventEmitter<ServiceRegistryEventMap<HealthCheckResponse>> {
  serviceMap: ServiceMap = new Map();
  instanceMap: InstanceMap = new Map();

  log: Logger;
  healthChecks: boolean;
  healthCheckBatchSize: number;
  healthCheckInterval: number;
  healthCheckMaxRequests: number;
  healthCheckTTL: number;

  healthCheckTimeout: NodeJS.Timeout | undefined;

  private disposed = false;

  /**
   *
   * @param {ServiceRegistryOptions} [opts] - Configuration options for registry
   * @example
   * const registry = new ServiceRegistry({
   *   healthCheckInterval: 10000,
   *   healthCheckBatchSize: 50
   * });
   */
  constructor(opts?: ServiceRegistryOptions) {
    super();
    this.log = opts?.logger ?? console;
    this.healthChecks = opts?.healthChecks ?? true;
    this.healthCheckBatchSize = opts?.healthCheckBatchSize ?? 100;
    this.healthCheckInterval = opts?.healthCheckInterval ?? 5000;
    this.healthCheckMaxRequests = opts?.healthCheckMaxRequests ?? 10;
    this.healthCheckTTL = opts?.healthCheckTTL ?? 2000;

    this.init();
    this.setupShutdownHandlers();
  }

  /**
   * Initializes the instance by setting event handlers and starting health checks
   */
  init() {
    if (!this.disposed) return;
    this.log.info("Creating new service registry");

    this.on("instanceRegistered", (instance: Instance) => {
      if (!this.serviceMap.has(instance.serviceType)) {
        this.serviceMap.set(instance.serviceType, new Set());
      }

      this.serviceMap.get(instance.serviceType)!.add(instance.id);
      this.instanceMap.set(instance.id, instance);
    });

    this.on("instanceRemoved", (instance: Instance) => {
      this.serviceMap.get(instance.serviceType)?.delete(instance.id);
      this.instanceMap.delete(instance.id);
    });

    this.on("healthCheckFailed", (instance: Instance) => {
      // Only updates associated maps if status has changed
      if (!instance.healthy) return;

      this.serviceMap.get(instance.serviceType)?.delete(instance.id);
      instance.healthy = false;
      this.instanceMap.set(instance.id, instance);
    });

    this.on("healthCheckPassed", (instance: Instance) => {
      // Only updates associated maps if status has changed
      if (instance.healthy) return;

      this.serviceMap.get(instance.serviceType)?.add(instance.id);
      instance.healthy = true;
      this.instanceMap.set(instance.id, instance);
    });

    if (this.healthChecks) {
      this.runHealthChecks();
    }
  }

  /**
   * Resets instance by removing all event handlers and clearing maps. Blocks additional usage
   * until `init` is called.
   */
  dispose() {
    if (this.disposed) return;
    this.log.info("Disposing of service registry");

    this.stopHealthChecks();

    // Remove all event listeners that were set up in constructor
    this.removeAllListeners("instanceRegistered");
    this.removeAllListeners("instanceRemoved");
    this.removeAllListeners("healthCheckFailed");
    this.removeAllListeners("healthCheckPassed");

    // Clear internal maps
    this.serviceMap.clear();
    this.instanceMap.clear();
  }

  private setupShutdownHandlers() {
    this.log.debug("Adding shutdown handlers");

    const handleShutdown = async (signal: string) => {
      this.log.info(`Received ${signal}. Starting graceful shutdown...`);

      try {
        this.dispose();
        this.log.info("ServiceRegistry shutdown complete");

        // Exit process after cleanup
        process.exit(0);
      } catch (error) {
        this.log.error("Error during shutdown:", error);
        process.exit(1);
      }
    };

    // Handle various termination signals
    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
    process.on("SIGINT", () => handleShutdown("SIGINT")); // Ctrl+C
    process.on("SIGUSR2", () => handleShutdown("SIGUSR2")); // Nodemon restart

    // Handle uncaught exceptions and unhandled rejections
    process.on("uncaughtException", (error) => {
      this.log.error("Uncaught Exception:", error);
      handleShutdown("uncaughtException");
    });

    process.on("unhandledRejection", (reason, promise) => {
      this.log.error("Unhandled Rejection at:", promise, "reason:", reason);
      handleShutdown("unhandledRejection");
    });
  }

  /**
   * Takes a request for a new instance to be registered and adds to internal database
   * @param instance - New instance data
   * @fires instanceRegistered
   */
  register(instance: InstanceRegisterRequest) {
    if (this.disposed) {
      throw new Error("ServiceRegistry has been disposed");
    }

    const id = randomUUID();

    const newInstance: Instance = {
      ...instance,
      id,
      healthy: true,
      created: Date.now(),
      lastUpdated: Date.now(),
    };

    this.emit("instanceRegistered", newInstance);
    return id;
  }

  /**
   * Removes an instance from internal so that it can no longer be offered as a service option
   * @param id - UUID of the instance to remove
   * @fires instanceRemoved
   */
  unregister(id: string) {
    const instance = this.instanceMap.get(id);

    if (instance) {
      this.emit("instanceRemoved", instance);
    }
  }

  /**
   * Gets an instance by id
   * @param {string} id - UUID of the instance
   */
  getInstanceById(id: string) {
    return this.instanceMap.get(id);
  }

  /**
   * Gets all services registered by type (ie "product-database")
   * @param {string} serviceType - Service Type
   */
  getInstancesByType(serviceType: string) {
    const services = this.serviceMap.get(serviceType);
    return Array.from(services ?? []).map((id) => this.instanceMap.get(id));
  }

  /* HEALTH CHECKS */

  /**
   * Begins running health checks on all registered instances. Once complete,
   * waits for the predetermined period and starts again
   */
  async runHealthChecks() {
    try {
      this.log.debug(`Starting health checks: ${Date.now()}`);
      await this.processHealthChecks();
      this.log.debug(`Finished health checks: ${Date.now()}`);
    } catch (error) {
      this.log.error(`Health check error ${error}`);
    } finally {
      this.healthCheckTimeout = setTimeout(
        () => this.runHealthChecks(),
        this.healthCheckInterval,
      );
    }
  }

  /**
   * Separates instances into batches to process health checks
   */
  async processHealthChecks() {
    const instances = Array.from(this.instanceMap.values());

    for (let i = 0; i < instances.length; i += this.healthCheckBatchSize) {
      const batch = instances.slice(i, i + this.healthCheckBatchSize);

      for (let j = 0; j < batch.length; j += this.healthCheckMaxRequests) {
        const chunk = batch.slice(j, j + this.healthCheckMaxRequests);

        await Promise.all(chunk.map((inst) => this.checkInstanceHealth(inst)));
      }
    }
  }

  /**
   * Checks an individual instances health and fires associated events on success/failure
   * @param {Instance} instance
   * @fires healthCheckPassed - Fired on successful response from instance node
   * @fires healthCheckFailed - Fired on network errors or after response times out
   */
  async checkInstanceHealth(instance: Instance) {
    const controller = new AbortController();
    let url: URL;

    try {
      url = new URL("/health", `https://${instance.host}:${instance.port}`);
    } catch {
      this.log.error(
        `Unable to create url for ID: ${instance.id}, Host: ${instance.host}, Port: ${instance.port}`,
      );
      this.emit("healthCheckFailed", instance);
      return;
    }

    try {
      const timeout = setTimeout(() => controller.abort(), this.healthCheckTTL);

      try {
        const res = await fetch(url, { signal: controller.signal });

        // Makes sure we can still access the data if the res was succesful
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(
            `Bad Health Check Response. Code: ${res.status}, Message: ${res.statusText}`,
          );
        }
        const json = (await res.json()) as HealthCheckResponse;

        this.emit("healthCheckPassed", instance, json);
        this.log.debug(`Health Check: ${instance.id} - Passed`);
      } finally {
        // Clears timeout regardless to avoid memory leaks
        clearTimeout(timeout);
      }
    } catch (error) {
      this.emit("healthCheckFailed", instance);
      this.log.error(`Health Check: ${instance.id} - Failed. Error: ${error}`);
    }
  }

  stopHealthChecks() {
    if (!this.healthCheckTimeout) return;
    clearTimeout(this.healthCheckTimeout);
  }
}

export default ServiceRegistry;
