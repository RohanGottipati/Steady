import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? process.env.PORT ?? "3000";
const baseURL = `http://localhost:${port}`;
const production = process.env.PLAYWRIGHT_PRODUCTION === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run ${production ? "start" : "dev"} -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      TIGER_DATABASE_URL: "",
      BACKBOARD_API_KEY: "",
      SPEECH_ENABLED: "false",
      STEADY_E2E: production ? "" : "1",
    },
  },
});
