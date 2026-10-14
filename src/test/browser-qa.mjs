import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { chromium } from "@playwright/test";

const baseURL = process.env.SESSION_MANAGER_QA_URL ?? "http://127.0.0.1:1420";
const evidence = join(tmpdir(), "opencode");
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "1420", "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0" } },
);
server.stderr.on("data", (data) => process.stderr.write(data));
await new Promise((resolve, reject) => {
  server.stdout.on("data", (data) => {
    if (stripVTControlCharacters(data.toString()).includes("http://127.0.0.1:1420")) resolve();
  });
  server.on("error", reject);
  server.on("exit", (code) => reject(new Error(`QA server exited ${code}`)));
});
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(baseURL);
  await page.getByText("Desktop app required").waitFor();
  await page.screenshot({ path: join(evidence, "session-manager-desktop-required.png") });
  await page.addInitScript(() => {
    const now = Date.now();
    const projects = [
      { id: "engine", name: "Runtime Engine", path: "Q:\\workspace\\runtime-engine" },
      { id: "studio", name: "Developer Studio", path: "Q:\\workspace\\developer-studio" },
      { id: "empty", name: "Notes", path: "Q:\\workspace\\notes" },
    ];
    const sessions = projects.slice(0, 2).flatMap((project, group) =>
      Array.from({ length: group === 0 ? 45 : 23 }, (_, index) => ({
        id: `ses_${project.id}_${index}`,
        projectId: project.id,
        title:
          index === 0
            ? group === 0
              ? "Refine the session dispatch pipeline"
              : "调整开发工作区的布局"
            : [
                "Trace cancellation in the worker pool",
                "Review filesystem boundaries",
                "Simplify the catalog query",
                "Add regression coverage",
                "Investigate startup latency",
              ][index % 5],
        directory: project.path,
        createdAt: now - (index + 20) * 3600000,
        updatedAt: now - (index + group * 6) * 3600000,
        messageCount: 6 + index,
        model: index % 3 === 0 ? null : "gpt-5.1-codex",
        provider: index % 3 === 0 ? null : "github-copilot",
        tokens: index % 3 === 0 ? null : 18400 + index,
        parentId: index % 4 === 0 ? "ses_parent" : null,
      })),
    );
    window.__QA_CALLS__ = [];
    window.__QA_FAILURE__ = null;
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args = {}) => {
        window.__QA_CALLS__.push({ command, args });
        if (window.__QA_FAILURE__ === command)
          throw new Error("Test desktop unavailable. Retry the request.");
        switch (command) {
          case "get_catalog":
            return {
              databasePath: "Q:\\test-only\\opencode.db",
              opencodeVersion: "1.19.0",
              projects,
              sessions,
            };
          case "get_session_detail":
            return {
              session: sessions.find((item) => item.id === args.sessionId),
              preview: [
                {
                  id: "m1",
                  role: "user",
                  text: "Review the session launcher. Keep tab and window dispatch independent, and preserve the working directory as a literal path.",
                  createdAt: now - 420000,
                },
                {
                  id: "m2",
                  role: "assistant",
                  text: "The launcher boundary now receives a session ID and an explicit mode.\n\nNext checks\n  1. Verify Windows Terminal arguments.\n  2. Confirm stale detail requests cannot replace the selected session.\n\n路径与会话文本只在本机显示，不发送到外部服务。\n\n<script>alert('plain text only')</script>",
                  createdAt: now - 300000,
                },
              ],
              previewTruncated: true,
            };
          case "launch_session":
            return `test dispatch receipt (${args.mode})`;
          case "open_directory":
            return null;
          default:
            throw new Error(`Unexpected QA command ${command}`);
        }
      },
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Select Refine the session dispatch pipeline" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => window.__QA_CALLS__.filter((call) => call.command === "get_session_detail").length,
    ),
    0,
  );
  await page.screenshot({ path: join(evidence, "session-manager-unselected.png") });
  await page.getByRole("button", { name: "Select Refine the session dispatch pipeline" }).click();
  await page.getByText("Preview truncated.", { exact: false }).waitFor();
  assert.equal(await page.locator(".preview script").count(), 0);
  assert(await page.locator(".row-meta").getByText("18.4K tokens", { exact: true }).count());
  const detailCalls = await page.evaluate(
    () => window.__QA_CALLS__.filter((call) => call.command === "get_session_detail").length,
  );
  await page.getByRole("button", { name: "Refresh session metadata" }).click();
  await page.getByText("Preview truncated.", { exact: false }).waitFor();
  const refreshedCalls = await page.evaluate(() =>
    window.__QA_CALLS__.filter((call) => call.command === "get_session_detail"),
  );
  assert.equal(refreshedCalls.length, detailCalls + 1);
  assert.equal(refreshedCalls.at(-1).args.sessionId, "ses_engine_0");
  await page.screenshot({ path: join(evidence, "session-manager-detail.png") });
  await page.getByRole("button", { name: "Open in tab", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Launch request dispatched" }).waitFor();
  await page.getByRole("button", { name: "Open in window", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "(window)" }).waitFor();
  await page.getByRole("button", { name: "Copy session ID", exact: true }).click();
  await page.getByText("Session ID copied to clipboard.").waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "ses_engine_0");
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page
    .getByRole("button", { name: "Select Refine the session dispatch pipeline" })
    .click({ button: "right" });
  await page.getByRole("menu").waitFor();
  await page.screenshot({ path: join(evidence, "session-manager-menu.png") });
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.getByText("Directory open request sent to Windows Explorer.").waitFor();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.getByRole("button", { name: "Load 20 more 25 remaining" }).click();
  assert.equal(
    await page.locator('.project-group[aria-label="Runtime Engine"] .session-row').count(),
    40,
  );
  assert.equal(
    await page.locator('.project-group[aria-label="Developer Studio"] .session-row').count(),
    20,
  );
  await page.getByRole("button", { name: /Developer Studio Q:/ }).click();
  await page.getByRole("searchbox").fill("调整");
  await page.getByRole("button", { name: "Select 调整开发工作区的布局" }).waitFor();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: /Developer Studio Q:/ }).getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(
    await page.locator('.project-group[aria-label="Runtime Engine"] .session-row').count(),
    40,
  );
  await page.getByRole("button", { name: /Developer Studio Q:/ }).click();
  await page.getByRole("searchbox").fill("no-match-value");
  await page.getByText("No matching sessions").waitFor();
  await page.screenshot({ path: join(evidence, "session-manager-no-results.png") });
  await page.getByRole("searchbox").fill("");
  await page.evaluate(() => {
    window.__QA_FAILURE__ = "get_catalog";
  });
  await page.getByRole("button", { name: "Refresh sessions", exact: true }).click();
  await page.getByText("Refresh failed.", { exact: false }).waitFor();
  await page.screenshot({ path: join(evidence, "session-manager-refresh-error.png") });
  await page.evaluate(() => {
    window.__QA_FAILURE__ = null;
  });
  await page.getByRole("button", { name: "Retry refresh" }).click();
  await page.getByText("Refresh failed.", { exact: false }).waitFor({ state: "hidden" });
  for (const width of [390, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const colorScheme of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.screenshot({
        path: join(evidence, `session-manager-${width}-${colorScheme}.png`),
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `Horizontal overflow at ${width}`);
      await page.locator(".explorer-scroll").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.locator(".detail-scroll").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.screenshot({
        path: join(evidence, `session-manager-${width}-${colorScheme}-end.png`),
      });
      await page.locator(".explorer-scroll").evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.locator(".detail-scroll").evaluate((element) => {
        element.scrollTop = 0;
      });
    }
  }
  const calls = await page.evaluate(() => window.__QA_CALLS__);
  assert(calls.some((call) => call.command === "launch_session" && call.args.mode === "tab"));
  assert(calls.some((call) => call.command === "launch_session" && call.args.mode === "window"));
  assert(
    calls.some(
      (call) => call.command === "open_directory" && call.args.sessionId === "ses_engine_0",
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        screenshots: evidence,
        widths: [390, 1440, 1920],
        calls: calls.length,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
  server.kill();
}
