import type { Request, Response, NextFunction } from "express";
import type { HelmetOptions } from "helmet";
import type ServiceRegistry from "./service-registry";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export const sendResponse = <T>(
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

export const authenticateAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const apiKey = req.headers["x-admin-key"];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return sendResponse(res, 401, "Invalid admin api key");
  }
  next();
};

export const authenticateService = (registry: ServiceRegistry) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const serviceId = req.headers["x-service-id"];
    const serviceToken = req.headers["x-service-token"];

    if (!serviceId || !serviceToken) {
      return sendResponse(res, 401, null, "Missing authentication credentials");
    }

    if (
      !registry.validateInstanceAuth(
        serviceId as string,
        serviceToken as string,
      )
    ) {
      return sendResponse(res, 401, null, "Invalid authentication credentials");
    }

    next();
  };
};

export const helmetOpts: HelmetOptions = {
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
};
