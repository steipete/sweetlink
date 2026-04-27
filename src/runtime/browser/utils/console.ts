import type { SweetLinkConsoleLevel } from "@sweetlink/shared";

export const CONSOLE_LEVELS: SweetLinkConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

export function getConsoleMethod<Level extends SweetLinkConsoleLevel>(
  target: Console,
  level: Level,
): Console[Level] | undefined {
  switch (level) {
    case "log": {
      return typeof target.log === "function" ? (target.log as Console[Level]) : undefined;
    }
    case "info": {
      return typeof target.info === "function" ? (target.info as Console[Level]) : undefined;
    }
    case "warn": {
      return typeof target.warn === "function" ? (target.warn as Console[Level]) : undefined;
    }
    case "error": {
      return typeof target.error === "function" ? (target.error as Console[Level]) : undefined;
    }
    case "debug": {
      return typeof target.debug === "function" ? (target.debug as Console[Level]) : undefined;
    }
    default: {
      return;
    }
  }
}

export function setConsoleMethod<Level extends SweetLinkConsoleLevel>(
  target: Console,
  level: Level,
  function_: Console[Level] | undefined,
): void {
  if (!function_) {
    return;
  }
  switch (level) {
    case "log": {
      target.log = function_ as Console["log"];
      return;
    }
    case "info": {
      target.info = function_ as Console["info"];
      return;
    }
    case "warn": {
      target.warn = function_ as Console["warn"];
      return;
    }
    case "error": {
      target.error = function_ as Console["error"];
      return;
    }
    case "debug": {
      target.debug = function_ as Console["debug"];
      return;
    }
    default: {
      break;
    }
  }
}
