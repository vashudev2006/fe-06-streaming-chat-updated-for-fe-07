import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3010);
const baseURL = `http://127.0.0.1:${port}`;
const devCommand =
  process.platform === "win32"
    ? `npm.cmd run dev -- --webpack -H 127.0.0.1 -p ${port}`
    : `npm run dev -- --webpack -H 127.0.0.1 -p ${port}`;

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: devCommand,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
