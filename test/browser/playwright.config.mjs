import { defineConfig, devices } from "@playwright/test";

// Pyodide and arviz-stats come from jsDelivr and PyPI, so this needs the network.
export default defineConfig({
  testDir: ".",
  timeout: 300_000,
  fullyParallel: false,
  reporter: [["list"]],
  webServer: {
    command: "node serve.mjs",
    url: "http://127.0.0.1:8124/test/browser/page.html",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: { baseURL: "http://127.0.0.1:8124" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
