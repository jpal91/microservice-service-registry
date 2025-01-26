import type { UUID } from "node:crypto";

type LoggerMethod = (...args: any) => void;

export interface Logger {
  log?: LoggerMethod;
  debug: LoggerMethod;
  warn: LoggerMethod;
  error: LoggerMethod;
  info: LoggerMethod;
}

export interface Service {
  type: string;
  ip: string;
  port: string;
  created: number;
  version: string;
  lastUpdated: number;
  lastUsed: number;
}

export type Registry = {
  [service: UUID]: Service;
};

export type RegistrationRequest = Pick<
  Service,
  "type" | "ip" | "port" | "version"
>;

export {};
