import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run build && python3 -m http.server 5174 --bind 127.0.0.1",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true,
  },
  reporter: "list",
});
