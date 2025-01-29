# Service Registry

A specialized microservice that manages service discovery and registration for distributed applications. It provides a centralized registry where individual service instances can register themselves and discover other available services.

## Overview

The Service Registry acts as a critical infrastructure component in microservice architectures by:

- Maintaining a dynamic registry of available service instances
- Providing service discovery capabilities
- Monitoring service health through automated health checks
- Managing service registration/deregistration

This repo is an example of one core microservice that works together as a part of a larger ecosystem to validate services of an application. When an application uses
horizontal scaling of a service by adding new instances of a service, it becomes necessary to have a central location that can accurately determine which services are available, where
they are, and if they are healthy to receive requests.

The service registry would be primarily used by a router receving incoming api requests from the client. The router would then determine which, of the possibly multiple, service(s) to
send the request to, most likely using a load balancing strategy.

## Usage

### Starting the Server

The service registry can be started in development using `tsx`:

```bash
tsx src/index.ts
```

For development with auto-reload, use `nodemon`:

```bash
nodemon -x tsx src/index.ts
```

Before starting, ensure you have set the required `SERVICE_REGISTRATION_KEY` environment variable (see [Security](#security) section for more details).

### Core API Endpoints

#### Register a Service Instance

```bash
POST /service
Authorization: Bearer <registration_key>

{
  "serviceType": "product-service",
  "port": "3000"
}

# Returns
{
    "serviceId": <service_id>,
    "token": <service_token>
}
```

Subsequent requests to other endpoints require headers of `x-service-id` and `x-service-token` to authenticate.

#### Get Service Instances by Type

```bash
GET /services/<service_type>
x-service-id: <service_id>
x-service-token: <service_token>
```

#### Get Specific Instance

```bash
GET /service/<instance_id>
x-service-id: <service_id>
x-service-token: <service_token>
```

#### Unregister Service Instance

```bash
DELETE /service/<instance_id>
x-service-id: <service_id>
x-service-token: <service_token>
```

### Example Registration Flow

```typescript
// Register service
const res = await fetch('http://registry:4000/service', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.REGISTRATION_KEY}`
  },
  body: JSON.stringify({
    serviceType: 'user-service',
    port: '3000'
  })
});

const { serviceId, token } = await res.json();

// Store serviceId and token for future requests
```

## Security

The security for this server is relatively simple and is something that can be improved upon in later iterations. The initial authentication of a service relies on a shared
`SERVICE_REGISTRATION_KEY` which would ideally be shared among all services in the ecosystem. Once an initial registration comes in with the matching `Bearer` key, the service
is then given a token and id to validate subsequent requests.

To start the server, make sure you add a `.env` file in the root and assign a registration key. It can be anything, but ideally you would want it to be somewhat complex:

```bash
# .env
SERVICE_REGISTRATION_KEY="some really long and complicated string"
```

Example of creating a secure registration key from the command line:

```bash
openssl rand -base64 32
# Outputs something like: "hG6q4FfrHSkjz+OJNZHxYEgF7IhYzqIsY5+sRpX0VtY="
```

This generates a cryptographically secure 32-byte random string encoded in base64. You can then use this value as your registration key in the `.env` file.

While a registration key can be any string, using a properly randomized value reduces the chances of it being guessed or brute-forced.

## ServiceRegistry Class

The `ServiceRegistry` class is the core component that maintains the registry of service instances and manages their lifecycle. It extends `EventEmitter` to provide event-based notifications when service states change.

Key responsibilities include:
- Maintaining a mapping of service types to instance IDs
- Tracking individual service instance details and health status
- Managing service registration and deregistration
- Performing periodic health checks of registered instances
- Emitting events for instance state changes

The class can be configured via options passed to the constructor:

```typescript
interface ServiceRegistryOptions {
  healthChecks?: boolean;           // Enable/disable automatic health checking (default: true)
  healthCheckBatchSize?: number;    // Instances to check per batch (default: 100)
  healthCheckInterval?: number;     // MS between check cycles (default: 5000)
  healthCheckMaxRequests?: number;  // Max concurrent health requests (default: 10)
  healthCheckTTL?: number;         // Health check timeout in MS (default: 2000)
  logger?: Logger;                 // Custom logger implementation (default: console)
}
```

Health checking is performed by polling each instance's `/health` endpoint and tracking their status. The health check process:

1. Batches instances into configurable sized groups
2. Runs concurrent health checks up to the max requests limit
3. Waits for the check interval before starting the next cycle
4. Emits events when instance health status changes

For example:

```typescript
const registry = new ServiceRegistry({
  healthCheckInterval: 10000,   // Check every 10 seconds
  healthCheckBatchSize: 50,     // Check 50 instances at a time
  healthCheckMaxRequests: 5     // Max 5 concurrent requests
});
```

The health check configuration options allow tuning the process based on your infrastructure capacity and requirements.

### Events

The ServiceRegistry class emits several events during operation that can be subscribed to for monitoring and custom behavior:

- `instanceRegistered` - Fired when a new service instance is registered
- `instanceRemoved` - Fired when a service instance is unregistered
- `healthCheckPassed` - Fired when an instance passes its health check
- `healthCheckFailed` - Fired when an instance fails its health check

Example of hooking into events for custom monitoring:

```typescript
const registry = new ServiceRegistry();

// Log when services register/unregister
registry.on('instanceRegistered', (instance) => {
  console.log(`New service registered: ${instance.serviceType} (${instance.id})`);
});

registry.on('instanceRemoved', (instance) => {
  console.log(`Service unregistered: ${instance.serviceType} (${instance.id})`);
});

// Custom health monitoring
const failedChecks = new Map<string, number>();

registry.on('healthCheckFailed', (instance) => {
  const fails = (failedChecks.get(instance.id) || 0) + 1;
  failedChecks.set(instance.id, fails);

  if (fails >= 3) {
    console.error(`Service ${instance.id} has failed 3 health checks`);
    // Could trigger alerts or auto-scaling here
  }
});

registry.on('healthCheckPassed', (instance) => {
  failedChecks.delete(instance.id); // Reset failed check counter
});
```

This example shows how you can extend the registry's capabilities by tracking failed health checks and implementing custom alerting logic. You could similarly hook into these events for metrics collection, automated scaling, or other infrastructure automation.
