// Module worker: Pyodide, numpy, scipy and arviz-stats load once, then each
// message is one analysis. Kept off the main thread because loading takes seconds.

const PY = `
import numpy as np
from arviz_stats.base import array_stats as a

def analyze(buf, n_chains, n_draws, n_vars, ci_kind, ci_prob, grid_len, ecdf_points):
    x = np.frombuffer(buf.to_py(), dtype=np.float64).reshape(n_chains, n_draws, n_vars)
    x = np.ascontiguousarray(x.transpose(2, 0, 1))
    flat = x.reshape(n_vars, -1)
    ax = dict(chain_axis=-2, draw_axis=-1)
    ci = (a.hdi if ci_kind == "hdi" else a.eti)(flat, ci_prob)
    # kde rejects the whole batch if one row is constant or non-finite; those rows get NaN.
    ok = np.isfinite(flat).all(-1) & (np.ptp(flat, -1) > 0)
    grid = np.full((n_vars, grid_len), np.nan)
    pdf = grid.copy()
    if ok.any():
        grid[ok], pdf[ok], _ = a.kde(flat[ok], grid_len=grid_len)
    # The fractional-rank delta-ECDF arviz_plots.plot_rank draws.
    ex, ey = a.ecdf(a.compute_ranks(flat).reshape(x.shape), npoints=ecdf_points, pit=True)
    col = lambda v: np.asarray(v, dtype=float).tolist()
    return {
        "mean": col(flat.mean(-1)), "sd": col(flat.std(-1)),
        "ci_lb": col(ci[..., 0]), "ci_ub": col(ci[..., 1]),
        "ess_bulk": col(a.ess(x, method="bulk", **ax)),
        # summary() leaves prob to rcParams' ci_prob, so its tail quantiles move with the interval.
        "ess_tail": col(a.ess(x, method="tail", prob=ci_prob, **ax)),
        "r_hat": col(a.rhat(x, method="rank", **ax)),
        "mcse_mean": col(a.mcse(x, method="mean", **ax)),
        "mcse_sd": col(a.mcse(x, method="sd", **ax)),
        "kde_x": col(grid), "kde_y": col(pdf), "rank_x": col(ex), "rank_y": col(ey),
    }
`;

let booting;
let analyze;

async function boot({ indexURL, arvizStats }) {
  const step = (name) => self.postMessage({ type: "progress", step: name });
  step("pyodide");
  const { loadPyodide } = await import(`${indexURL}pyodide.mjs`);
  const py = await loadPyodide({ indexURL });
  step("numpy+scipy");
  await py.loadPackage(["numpy", "scipy", "micropip"]);
  step("arviz-stats");
  await py.pyimport("micropip").install(arvizStats);
  await py.runPythonAsync(PY);
  analyze = py.globals.get("analyze");
  const versions = py.runPython(
    "import sys, numpy, scipy, arviz_stats\n" +
    "{'python': sys.version.split()[0], 'numpy': numpy.__version__, 'scipy': scipy.__version__, " +
    "'arvizStats': arviz_stats.__version__}",
  ).toJs({ dict_converter: Object.fromEntries });
  step("ready");
  return { ...versions, pyodide: py.version };
}

self.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    let result;
    if (data.type === "boot") {
      booting ??= boot(data);
      result = await booting;
    } else {
      await booting;
      const { draws, nChains, nDraws, nVars, ciKind, ciProb, gridLen, ecdfPoints } = data;
      const proxy = analyze(draws, nChains, nDraws, nVars, ciKind, ciProb, gridLen, ecdfPoints);
      result = proxy.toJs({ dict_converter: Object.fromEntries });
      proxy.destroy();
    }
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: String(e?.message ?? e) });
  }
};
