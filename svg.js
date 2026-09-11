// Plots as SVG strings, so a page mounts them however it likes: innerHTML in
// plain JS, dangerouslySetInnerHTML in React. Chain colors are arviz-plots' default cycle.

export const CHAIN_COLORS = [
  "#36acc6", "#f66d7f", "#fac364", "#7c2695", "#228306",
  "#a252f4", "#63f0ea", "#000000", "#6f6f6f", "#b7b7b7",
];
const INK = "currentColor";
const FLAG = "#c0392b";
const FONT = 'font-family="system-ui, sans-serif" font-size="10"';
const PAD = { l: 4, r: 4, t: 4, b: 14 };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ArviZ's own advice: R-hat under 1.01, and 100 effective draws per chain.
export function flags(row, nChains) {
  return {
    rHat: !(row.rHat < 1.01),
    essBulk: !(row.essBulk >= 100 * nChains),
    essTail: !(row.essTail >= 100 * nChains),
  };
}

export function fmt(v, digits = 3) {
  if (!Number.isFinite(v)) return "—";
  return String(Number(v.toPrecision(digits)));
}

function extent(arrays) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of arrays) for (const v of a) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!(hi > lo)) return Number.isFinite(lo) ? [lo - 1, lo + 1] : [0, 1];
  return [lo, hi];
}

const scale = ([lo, hi], a, b) => (v) => a + ((v - lo) / (hi - lo)) * (b - a);

// A non-finite point breaks the line instead of dragging it to an edge.
function line(xs, ys, sx, sy) {
  let d = "";
  let pen = "M";
  for (let i = 0; i < ys.length; i++) {
    if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) { pen = "M"; continue; }
    d += `${pen}${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`;
    pen = "L";
  }
  return d;
}

const frame = (w, h, label, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}" ${FONT}>${body}</svg>`;

const axisLabels = (w, h, lo, hi) =>
  `<text x="${PAD.l}" y="${h - 3}" fill="${INK}">${fmt(lo)}</text>` +
  `<text x="${w - PAD.r}" y="${h - 3}" fill="${INK}" text-anchor="end">${fmt(hi)}</text>`;

export function densityPlot(result, k, { width = 240, height = 80 } = {}) {
  const { x, y } = result.density[k];
  const s = result.summary[k];
  const xr = extent([x, [s.ciLb, s.ciUb]]);
  const sx = scale(xr, PAD.l, width - PAD.r);
  const sy = scale([0, extent([y])[1]], height - PAD.b, PAD.t);
  const base = height - PAD.b;
  const ci = [s.ciLb, s.ciUb].every(Number.isFinite)
    ? `<line x1="${sx(s.ciLb).toFixed(1)}" x2="${sx(s.ciUb).toFixed(1)}" y1="${base}" y2="${base}" stroke="${INK}" stroke-width="3"/>`
    : "";
  const mean = Number.isFinite(s.mean) ? `<circle cx="${sx(s.mean).toFixed(1)}" cy="${base}" r="3.5" fill="${CHAIN_COLORS[0]}" stroke="${INK}"/>` : "";
  return frame(width, height, `${s.name} density`,
    `<path d="${line(x, y, sx, sy)}" fill="none" stroke="${CHAIN_COLORS[0]}" stroke-width="1.5"/>` +
    ci + mean + axisLabels(width, height, ...xr));
}

export function rankPlot(result, k, { width = 240, height = 80 } = {}) {
  const { x, y } = result.ranks[k];
  // plot_rank's y-limit: the Dvoretzky-Kiefer-Wolfowitz bound at 99%, padded 30%.
  const dkw = Math.sqrt(Math.log(2 / 0.01) / (2 * result.nDraws)) * 1.3;
  const lim = Math.max(dkw, ...y.map((c) => extent([c.map(Math.abs)])[1]));
  const sx = scale([0, 1], PAD.l, width - PAD.r);
  const sy = scale([-lim, lim], height - PAD.b, PAD.t);
  const lines = y.map((c, i) =>
    `<path d="${line(x[i], c, sx, sy)}" fill="none" stroke="${CHAIN_COLORS[i % CHAIN_COLORS.length]}" stroke-width="1.2"/>`).join("");
  return frame(width, height, `${result.summary[k].name} rank`,
    `<line x1="${PAD.l}" x2="${width - PAD.r}" y1="${sy(0)}" y2="${sy(0)}" stroke="${INK}" stroke-opacity="0.35" stroke-dasharray="3 2"/>` +
    lines + axisLabels(width, height, 0, 1));
}

export function tracePlot(result, k, { width = 240, height = 80 } = {}) {
  const chains = result.trace[k];
  const yr = extent(chains);
  const sy = scale(yr, height - PAD.b, PAD.t);
  const lines = chains.map((c, i) => {
    const sx = scale([0, Math.max(c.length - 1, 1)], PAD.l, width - PAD.r);
    return `<path d="${line(c.map((_, j) => j), c, sx, sy)}" fill="none" stroke="${CHAIN_COLORS[i % CHAIN_COLORS.length]}" stroke-width="0.8" stroke-opacity="0.8"/>`;
  }).join("");
  return frame(width, height, `${result.summary[k].name} trace`,
    lines + `<text x="${PAD.l}" y="${height - 3}" fill="${INK}">${result.nDraws} draws × ${chains.length}</text>`);
}

export function forestPlot(result, { width = 320, rowHeight = 18, labelWidth = 90 } = {}) {
  const rows = result.summary;
  const height = rows.length * rowHeight + PAD.b;
  const xr = extent([rows.flatMap((r) => [r.ciLb, r.ciUb, r.mean])]);
  const sx = scale(xr, labelWidth, width - PAD.r);
  const body = rows.map((r, i) => {
    const cy = i * rowHeight + rowHeight / 2;
    const color = flags(r, result.nChains).rHat ? FLAG : INK;
    const ci = [r.ciLb, r.ciUb].every(Number.isFinite)
      ? `<line x1="${sx(r.ciLb).toFixed(1)}" x2="${sx(r.ciUb).toFixed(1)}" y1="${cy}" y2="${cy}" stroke="${color}" stroke-width="2"/>`
      : "";
    const mean = Number.isFinite(r.mean) ? `<circle cx="${sx(r.mean).toFixed(1)}" cy="${cy}" r="3" fill="${CHAIN_COLORS[0]}" stroke="${color}"/>` : "";
    return `<text x="${labelWidth - 6}" y="${cy + 3}" fill="${color}" text-anchor="end">${esc(r.name)}</text>` + ci + mean;
  }).join("");
  const zero = xr[0] < 0 && xr[1] > 0
    ? `<line x1="${sx(0)}" x2="${sx(0)}" y1="0" y2="${height - PAD.b}" stroke="${INK}" stroke-opacity="0.25"/>`
    : "";
  return frame(width, height, "forest", zero + body +
    `<text x="${labelWidth}" y="${height - 3}" fill="${INK}">${fmt(xr[0])}</text>` +
    `<text x="${width - PAD.r}" y="${height - 3}" fill="${INK}" text-anchor="end">${fmt(xr[1])}</text>`);
}

export function summaryTable(result, { digits = 3 } = {}) {
  const ci = `${result.ci.kind}${Math.round(result.ci.prob * 100)}`;
  const head = ["", "mean", "sd", `${ci}_lb`, `${ci}_ub`, "ess_bulk", "ess_tail", "r_hat", "mcse_mean", "mcse_sd"];
  const cell = (v, bad, text = fmt(v, digits)) => `<td${bad ? ` data-flag style="color:${FLAG};font-weight:600"` : ""}>${text}</td>`;
  const rows = result.summary.map((r) => {
    const f = flags(r, result.nChains);
    return `<tr><th scope="row">${esc(r.name)}</th>` +
      cell(r.mean) + cell(r.sd) + cell(r.ciLb) + cell(r.ciUb) +
      cell(r.essBulk, f.essBulk, Number.isFinite(r.essBulk) ? String(Math.round(r.essBulk)) : "—") +
      cell(r.essTail, f.essTail, Number.isFinite(r.essTail) ? String(Math.round(r.essTail)) : "—") +
      cell(r.rHat, f.rHat, Number.isFinite(r.rHat) ? r.rHat.toFixed(3) : "—") +
      cell(r.mcseMean) + cell(r.mcseSd) + "</tr>";
  }).join("");
  return `<table class="posteriorwasm-summary"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}
