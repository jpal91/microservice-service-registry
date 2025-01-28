import { randomUUID, UUID } from "node:crypto";
import EventEmitter from "node:events";

type LoggerMethod = (...args: any) => void;

interface Logger {
  log?: LoggerMethod;
  debug: LoggerMethod;
  warn: LoggerMethod;
  error: LoggerMethod;
  info: LoggerMethod;
}

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

type InstanceRegisterRequest = Pick<
  Instance,
  "serviceType" | "host" | "port" | "meta"
>;

type InstanceMap = Map<string, Instance>;
type ServiceMap = Map<string, Set<string>>;

interface ServiceRegistryEventMap {
  instanceRegistered: [Instance];
  instanceRemoved: [Instance];
  healthCheckFailed: [Instance];
  healthCheckPassed: [Instance, Record<string, any>];
}

export interface ServiceRegistryOptions {
  healthCheckBatchSize?: number;
  healthCheckInterval?: number;
  healthCheckMaxRequests?: number;
  healthCheckTTL?: number;
  logger?: Logger;
}

class ServiceRegistry extends EventEmitter<ServiceRegistryEventMap> {
  serviceMap: ServiceMap = new Map();
  instanceMap: InstanceMap = new Map();

  log: Logger;
  healthCheckBatchSize: number;
  healthCheckInterval: number;
  healthCheckMaxRequests: number;
  healthCheckTTL: number;

  healthCheckTimeout: NodeJS.Timeout | undefined;

  constructor(opts?: ServiceRegistryOptions) {
    super();
    this.log = opts?.logger ?? console;
    this.healthCheckBatchSize = opts?.healthCheckBatchSize ?? 100;
    this.healthCheckInterval = opts?.healthCheckInterval ?? 5000;
    this.healthCheckMaxRequests = opts?.healthCheckMaxRequests ?? 10;
    this.healthCheckTTL = opts?.healthCheckTTL ?? 2000;

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
      if (!instance.healthy) return;
      this.serviceMap.get(instance.serviceType)?.delete(instance.id);
      instance.healthy = false;
    });

    this.on("healthCheckPassed", (instance: Instance) => {
      if (instance.healthy) return;
      this.serviceMap.get(instance.serviceType)?.add(instance.id);
      instance.healthy = true;
    });
  }

  register(instance: InstanceRegisterRequest) {
    const newInstance: Instance = {
      ...instance,
      id: randomUUID(),
      healthy: true,
      created: Date.now(),
      lastUpdated: Date.now(),
    };

    this.emit("instanceRegistered", newInstance);
  }

  unregister(id: string) {
    const instance = this.instanceMap.get(id);

    if (instance) {
      this.emit("instanceRemoved", instance);
    }
  }

  /* HEALTH CHECKS */

  async runHealthChecks() {
    try {
      this.log.debug(`Starting health checks: ${Date.now()}`);
      await this.processHealthChecks();
      this.log.debug(`Finished health checks: ${Date.now()}`);
    } catch (error) {
      this.log.error(`Health check error ${error}`);
    } finally {
      this.healthCheckTimeout = setTimeout(
        this.runHealthChecks,
        this.healthCheckInterval,
      );
    }
  }

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

  async checkInstanceHealth(instance: Instance) {
    const controller = new AbortController();
    const url = new URL("/health", `https://${instance.host}:${instance.port}`);

    try {
      const timeout = setTimeout(controller.abort, this.healthCheckTTL);
      const res = await fetch(url, { signal: controller.signal });

      // Makes sure we can still access the data if the res was succesful
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Code: ${res.status}, Message: ${res.statusText}`);
      }
      const json = (await res.json()) as Record<string, any>;

      this.emit("healthCheckPassed", instance, json);
      this.log.debug(`Health Check: ${instance.id} - Passed`);
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
