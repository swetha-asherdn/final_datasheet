import { existsSync } from "node:fs";

const LINUX_CHROMIUM_PATHS = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable"
];

const WINDOWS_CHROMIUM_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

export const CHROMIUM_NOT_FOUND_MESSAGE = "Chromium executable not found. Set PUPPETEER_EXECUTABLE_PATH or run the Docker container.";

export function resolveChromiumExecutablePath(options: { env?: Partial<NodeJS.ProcessEnv>; exists?: (path: string) => boolean } = {}) {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const candidates = [
    env.PUPPETEER_EXECUTABLE_PATH,
    ...LINUX_CHROMIUM_PATHS,
    ...WINDOWS_CHROMIUM_PATHS
  ].filter((value): value is string => Boolean(value));

  const match = candidates.find((candidate) => exists(candidate));
  if (match) return match;

  throw new Error(CHROMIUM_NOT_FOUND_MESSAGE);
}
