import { describe, expect, it } from "vitest";
import { CHROMIUM_NOT_FOUND_MESSAGE, resolveChromiumExecutablePath } from "@/server/datasheet/chromium";

describe("resolveChromiumExecutablePath", () => {
  it("uses PUPPETEER_EXECUTABLE_PATH when it exists", () => {
    const result = resolveChromiumExecutablePath({
      env: { PUPPETEER_EXECUTABLE_PATH: "C:\\Tools\\chrome.exe" },
      exists: (candidate) => candidate === "C:\\Tools\\chrome.exe"
    });

    expect(result).toBe("C:\\Tools\\chrome.exe");
  });

  it("supports common Linux Chromium paths", () => {
    const result = resolveChromiumExecutablePath({
      env: {},
      exists: (candidate) => candidate === "/usr/bin/chromium"
    });

    expect(result).toBe("/usr/bin/chromium");
  });

  it("supports common Windows Chrome and Edge paths", () => {
    const result = resolveChromiumExecutablePath({
      env: {},
      exists: (candidate) => candidate.endsWith("\\Microsoft\\Edge\\Application\\msedge.exe")
    });

    expect(result).toContain("msedge.exe");
  });

  it("throws a clear actionable error when no executable exists", () => {
    expect(() => resolveChromiumExecutablePath({ env: {}, exists: () => false })).toThrow(CHROMIUM_NOT_FOUND_MESSAGE);
  });
});
