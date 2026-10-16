import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function captureMatrix(page, evidence) {
  for (const width of [390, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const colorScheme of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.locator(".theme-selector select").selectOption(colorScheme);
      assert.equal(await page.locator("html").getAttribute("data-theme"), colorScheme);
      assert.equal(
        await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor),
        colorScheme === "light" ? "rgb(244, 246, 248)" : "rgb(16, 19, 22)",
      );
      for (const selector of [".explorer-scroll", ".detail-scroll"]) {
        await page.locator(selector).evaluate((element) => {
          element.scrollTop = 0;
        });
      }
      await page.screenshot({
        path: join(evidence, `session-manager-${width}-${colorScheme}.png`),
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `Horizontal overflow at ${width}`);
      const clippedHeaderControls = await page
        .locator(".app-header button, .app-header select, .app-version")
        .evaluateAll(
          (elements) =>
            elements.filter((element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.left < 0 || bounds.right > innerWidth;
            }).length,
        );
      assert.equal(clippedHeaderControls, 0, `Clipped header controls at ${width}`);
      for (const selector of [".explorer-scroll", ".detail-scroll"]) {
        await page.locator(selector).evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
      }
      await page.screenshot({
        path: join(evidence, `session-manager-${width}-${colorScheme}-end.png`),
      });
      for (const selector of [".explorer-scroll", ".detail-scroll"]) {
        await page.locator(selector).evaluate((element) => {
          element.scrollTop = 0;
        });
      }
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
      await page
        .getByRole("button", { name: "Delete session Refine the session dispatch pipeline" })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Cancel", exact: true })
          .evaluate((element) => element === document.activeElement),
        true,
      );
      await page.screenshot({
        path: join(evidence, `session-manager-delete-${width}-${colorScheme}.png`),
      });
      await page.keyboard.press("Escape");
    }
  }
}
