import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", globals: true, include: ["src/**/*.test.ts", "src/**/*.test.tsx"], setupFiles: ["./vitest.setup.ts"], timeout: 20000 }, resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } } });
