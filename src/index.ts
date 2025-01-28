import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";

import ServiceRegistry, {
  AuthenticationError,
  type InstanceRegisterRequest,
} from "./service-registry";
import {
  sendResponse,
  authenticateAdmin,
  authenticateService as _as,
  helmetOpts,
} from "./middleware";

const app = express();
const port = process.env.PORT || 3002;
const registry = new ServiceRegistry();

const authenticateService = _as(registry);

app.use(morgan("combined"));
app.use(express.json());
app.use(helmet(helmetOpts));

app.get("/", (_: Request, res: Response) => {
  res.send("Registry active");
});

const validateRegistration = [
  body("serviceType").notEmpty().isString(),
  body("port").notEmpty().isNumeric(),
];

// Register new service
app.post(
  "/register",
  validateRegistration,
  (req: Request<{}, any, InstanceRegisterRequest>, res: Response) => {
    const authHeader = req.headers.authorization;
    const registrationKey = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

    if (!registrationKey) {
      return sendResponse(res, 401, null, "Missing registration key");
    }

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return sendResponse(res, 400, errors.array(), "Missing required fields");
    }

    const requestBody = req.body;
    const host = req.hostname;

    try {
      const { serviceId, token } = registry.register(
        { ...requestBody, host },
        registrationKey,
      );
      sendResponse(res, 201, { serviceId, token });
    } catch (e) {
      sendResponse(
        res,
        e instanceof AuthenticationError ? 401 : 503,
        null,
        e instanceof Error ? e.message : "Unknown error occurred",
      );
    }
  },
);

// Get all services by service name
app.get(
  "/services/:serviceName",
  authenticateService,
  (req: Request<{ serviceName: string }>, res: Response) => {
    const { serviceName } = req.params;

    try {
      const services = registry.getInstancesByType(serviceName);
      sendResponse(res, 200, services);
    } catch (e) {
      sendResponse(
        res,
        400,
        null,
        e instanceof Error ? e.message : "Service does not exist",
      );
    }
  },
);

// Get a service by id
app.get(
  "/service/:id",
  authenticateService,
  (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;

    const instance = registry.getInstanceById(id);
    sendResponse(res, 200, instance);
  },
);

// Unregister a service
app.delete(
  "/service/:id",
  authenticateService,
  (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;

    registry.unregister(id);
    sendResponse(res, 200, { serviceId: id });
  },
);

const adminRouter = express.Router();
app.use("/admin", authenticateAdmin, adminRouter);

// Shut down service registry instance
adminRouter.post("/shutdown", (req: Request, res: Response) => {
  try {
    registry.dispose();
    server.close(() => {
      console.info("Server closed");
      process.exit(0);
    });

    setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error("Error during shutdown", error);
    process.exit(1);
  }
});

// Check health of service registry
adminRouter.get("/health", (req: Request, res: Response) => {
  sendResponse(res, 200, {
    status: "UP",
    timestamp: Date.now(),
    instanceCount: registry.instanceMap.size,
    serviceCount: registry.serviceMap.size,
  });
});

const server = app.listen(port, () => {
  console.log(`Service registry listening on port ${port}`);
});
