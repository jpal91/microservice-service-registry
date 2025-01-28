import express, { type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";

import ServiceRegistry, {
  type InstanceRegisterRequest,
} from "./service-registry";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

const sendResponse = <T>(
  res: Response,
  status: number,
  data?: T,
  error?: string,
) => {
  const response: ApiResponse<T> = {
    success: !error,
    timestamp: Date.now(),
    ...(data && { data }),
    ...(error && { error }),
  };

  res.status(status).json(response);
};

const app = express();

app.use(morgan("combined"));
app.use(express.json());
app.use(
  helmet({
    // Since this is an API, we can disable CSP
    contentSecurityPolicy: false,

    // Allow cross-origin requests
    crossOriginResourcePolicy: { policy: "cross-origin" },

    // Enable HSTS
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },

    // Prevent frame embedding
    frameguard: {
      action: "deny",
    },

    // Keep these enabled for basic security
    noSniff: true,
    dnsPrefetchControl: true,
  }),
);

const port = process.env.PORT || 3002;
const registry = new ServiceRegistry();

app.get("/", (_: Request, res: Response) => {
  res.send("Registry active");
});

const validateRegistration = [
  body("serviceType").notEmpty().isString(),
  body("port").notEmpty().isNumeric(),
];

app.post(
  "/register",
  validateRegistration,
  (req: Request<{}, any, InstanceRegisterRequest>, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return sendResponse(res, 400, errors.array(), "Missing required fields");
    }

    const requestBody = req.body;
    const host = req.hostname;

    try {
      const registeredInstance = registry.register({ ...requestBody, host });
      sendResponse(res, 201, { serviceId: registeredInstance });
    } catch (e) {
      sendResponse(
        res,
        503,
        null,
        e instanceof Error ? e.message : "Unknown error occurred",
      );
    }
  },
);

app.get(
  "/services/:serviceName",
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

app.get("/service/:id", (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;

  const instance = registry.getInstanceById(id);
  sendResponse(res, 200, instance);
});

app.delete("/service/:id", (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;

  registry.unregister(id);
  sendResponse(res, 200, { serviceId: id });
});

// app.delete("/", (_: Request, res: Response) => {
//   registry.dispose();
//   sendResponse(res, 200, "Shut down complete");
//   process.exit(0);
// });

app.get("/health", (req: Request, res: Response) => {
  sendResponse(res, 200, {
    status: "UP",
    timestamp: Date.now(),
    instanceCount: registry.instanceMap.size,
    serviceCount: registry.serviceMap.size,
  });
});

app.listen(port, () => {
  console.log(`Service registry listening on port ${port}`);
});
