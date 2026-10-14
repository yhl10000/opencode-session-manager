import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { chromium } from "@playwright/test";
import { installFixture } from "./browser-fixture.mjs";

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
  await page.addInitScript(installFixture);
  await page.reload();
  await page.getByRole("checkbox", { name: "Show child sessions" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Select Refine the session dispatch pipeline" }).count(),
    0,
  );
  await page.screenshot({ path: join(evidence, "session-manager-children-hidden.png") });
  await page.getByRole("checkbox", { name: "Show child sessions" }).check();
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
  await page
    .getByRole("button", { name: "Pin session Refine the session dispatch pipeline" })
    .click();
  await page.locator('.project-group[aria-label="Runtime Engine"] .row-pin').nth(2).click();
  assert.equal(await page.locator('.row-pin[aria-pressed="true"]').count(), 2);
  await page
    .getByRole("button", { name: "Actions for Refine the session dispatch pipeline" })
    .click();
  await page.getByRole("menuitem", { name: "Rename session" }).click();
  await page.getByRole("textbox", { name: "Session title" }).fill("   ");
  assert.equal(await page.getByRole("button", { name: "Save title" }).isEnabled(), false);
  await page.getByRole("textbox", { name: "Session title" }).fill("  Renamed dispatch pipeline  ");
  await page.evaluate(() => {
    window.__QA_FAILURE__ = "rename_session";
  });
  await page.getByRole("button", { name: "Save title" }).click();
  await page.getByRole("alert").filter({ hasText: "Test desktop unavailable" }).waitFor();
  await page.screenshot({ path: join(evidence, "session-manager-rename-error.png") });
  await page.evaluate(() => {
    window.__QA_FAILURE__ = null;
  });
  await page.getByRole("button", { name: "Save title" }).click();
  await page.getByRole("heading", { name: "Renamed dispatch pipeline" }).waitFor();
  await page.getByRole("button", { name: "Actions for Renamed dispatch pipeline" }).click();
  await page.getByRole("menuitem", { name: "Rename session" }).click();
  await page
    .getByRole("textbox", { name: "Session title" })
    .fill("Refine the session dispatch pipeline");
  await page.getByRole("button", { name: "Save title" }).click();
  await page.getByRole("heading", { name: "Refine the session dispatch pipeline" }).waitFor();
  await page.getByRole("checkbox", { name: "Show child sessions" }).uncheck();
  await page.getByRole("heading", { name: "Pick up where you left off" }).waitFor();
  await page.getByRole("button", { name: "Delete project Runtime Engine" }).click();
  assert((await page.getByRole("dialog").textContent()).includes("12 hidden child sessions"));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  assert.equal(
    await page.getByRole("checkbox", { name: "Show child sessions" }).isChecked(),
    false,
  );
  await page.getByRole("checkbox", { name: "Show child sessions" }).check();
  assert.equal(await page.locator('.row-pin[aria-pressed="true"]').count(), 2);
  await page.getByRole("button", { name: "Select Refine the session dispatch pipeline" }).click();
  await page.getByText("Preview truncated.", { exact: false }).waitFor();
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
  await page.getByRole("menuitem", { name: "Open directory" }).click();
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
  await page.getByRole("button", { name: "Collapse all projects" }).click();
  assert.equal(await page.locator(".session-row").count(), 0);
  await page.getByRole("button", { name: /Runtime Engine Q:/ }).click();
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
      await page
        .getByRole("button", { name: "Actions for Refine the session dispatch pipeline" })
        .click();
      await page.getByRole("menuitem", { name: "Rename session" }).click();
      await page.screenshot({
        path: join(evidence, `session-manager-rename-${width}-${colorScheme}.png`),
      });
      assert.equal(
        await page
          .getByRole("textbox", { name: "Session title" })
          .evaluate((element) => element === document.activeElement),
        true,
      );
      await page.keyboard.press("Escape");
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Collapse all projects" }).click();
  await page.getByRole("button", { name: "Expand all projects" }).click();
  assert.equal(await page.locator(".session-row").count(), 60);
  await page
    .getByRole("button", { name: "Delete session Refine the session dispatch pipeline" })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__QA_DELETED__.length), 0);
  await page.getByRole("button", { name: "Delete project Developer Studio" }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: join(evidence, "session-manager-delete-confirm.png") });
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator('.project-group[aria-label="Developer Studio"]').count(), 0);
  assert.equal(await page.evaluate(() => window.__QA_DELETED__.length), 23);
  console.log(
    `PASS: widths 390/1440/1920; ${errors.length} browser errors; screenshots: ${evidence}`,
  );
} finally {
  await context.close();
  await browser.close();
  server.kill();
}
