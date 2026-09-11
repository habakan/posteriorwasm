import { test } from "node:test";
import assert from "node:assert/strict";
import { summaryTable, forestPlot, densityPlot, rankPlot, tracePlot, flags, fmt } from "../svg.js";

const row = (name, extra = {}) => ({
  name, mean: 0.1, sd: 1, ciLb: -1.5, ciUb: 1.6, essBulk: 1800, essTail: 1900,
  rHat: 1.001, mcseMean: 0.02, mcseSd: 0.015, ...extra,
});
const result = {
  names: ["a<b", "stuck"], nChains: 2, nDraws: 3, ci: { kind: "eti", prob: 0.89 }, diverging: null,
  summary: [row("a<b"), row("stuck", { rHat: 1.4, essBulk: 9, essTail: NaN })],
  density: [{ x: [-2, 0, 2], y: [0.1, 0.4, 0.1] }, { x: [0, 0, 0], y: [NaN, NaN, NaN] }],
  ranks: [{ x: [[0, 0.5, 1], [0, 0.5, 1]], y: [[0, 0.01, 0], [0, -0.01, 0]] }, { x: [[0, 1], [0, 1]], y: [[0, 0], [0, 0]] }],
  trace: [[[1, 2, 3], [3, 2, 1]], [[5, 5, 5], [5, 5, 5]]],
};

test("flags follow ArviZ's thresholds, and NaN counts as a problem", () => {
  assert.deepEqual(flags(result.summary[0], 2), { rHat: false, essBulk: false, essTail: false });
  assert.deepEqual(flags(result.summary[1], 2), { rHat: true, essBulk: true, essTail: true });
});

test("names are escaped and flagged cells are marked", () => {
  const html = summaryTable(result);
  assert.match(html, /a&lt;b/);
  assert.doesNotMatch(html, /a<b/);
  assert.match(html, /<th scope="col">eti89_lb<\/th>/);
  assert.equal(html.match(/data-flag/g).length, 3);
  assert.match(forestPlot(result), /a&lt;b/);
});

test("plots stay finite when a variable is constant or all NaN", () => {
  for (const k of [0, 1]) {
    for (const svg of [densityPlot(result, k), rankPlot(result, k), tracePlot(result, k)]) {
      assert.match(svg, /^<svg [^>]*>.*<\/svg>$/s);
      assert.doesNotMatch(svg, /NaN|Infinity/);
    }
  }
});

test("fmt keeps three significant digits and dashes non-finite values", () => {
  assert.equal(fmt(1234.5), "1230");
  assert.equal(fmt(0.012345), "0.0123");
  assert.equal(fmt(NaN), "—");
});
