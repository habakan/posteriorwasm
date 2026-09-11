import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const reference = JSON.parse(readFileSync(new URL("../fixtures/reference.json", import.meta.url), "utf8"));
const COLUMNS = {
  mean: "mean", sd: "sd", eti89_lb: "ciLb", eti89_ub: "ciUb", ess_bulk: "essBulk",
  ess_tail: "essTail", r_hat: "rHat", mcse_mean: "mcseMean", mcse_sd: "mcseSd",
};

test("matches arviz_stats.summary on every reference case", async ({ page }) => {
  await page.goto("/test/browser/page.html");
  const result = await page.waitForFunction(() => window.result, null, { timeout: 300_000 }).then((h) => h.jsonValue());
  expect(result.error).toBeUndefined();
  console.log(`${JSON.stringify(result.versions)} boot ${(result.bootMs / 1000).toFixed(1)}s`);

  for (const [name, c] of Object.entries(reference)) {
    const rows = result.cases[name].summary;
    for (const [col, key] of Object.entries(COLUMNS)) {
      c.summary[col].forEach((want, k) => {
        // Pyodide's numpy/scipy are not the ones the reference ran on; FFT-based ESS drifts in the last bits.
        expect(Math.abs(rows[k][key] - want), `${name} ${c.names[k]} ${col}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(want)));
      });
    }
  }
  await expect(page.locator("table.posteriorwasm-summary td[data-flag]").first()).toBeVisible();
  expect(await page.locator("#out svg").count()).toBe(7);
});
