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
    grid = np.full((n_vars, grid_len), np.nan)
    pdf = grid.copy()
    try:
        grid[:], pdf[:], _ = a.kde(flat, grid_len=grid_len)
    except ValueError:
        # One row kde cannot bin (constant, non-finite, a range at float precision) fails the
        # whole batch, so retry row by row and leave those rows NaN.
        for k in range(n_vars):
            try:
                grid[k], pdf[k], _ = a.kde(flat[k], grid_len=grid_len)
            except ValueError:
                pass
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

def loo(buf, n_chains, n_draws, n_obs, post_buf, n_vars):
    ll = np.frombuffer(buf.to_py(), dtype=np.float64).reshape(n_chains, n_draws, n_obs)
    ll = np.ascontiguousarray(ll.transpose(2, 0, 1))
    n_samples = n_chains * n_draws
    # arviz_stats.loo takes r_eff from the posterior's mean ESS; one chain leaves it 1.
    if n_chains == 1:
        r_eff = 1.0
    else:
        post = np.frombuffer(post_buf.to_py(), dtype=np.float64).reshape(n_chains, n_draws, n_vars)
        post = np.ascontiguousarray(post.transpose(2, 0, 1))
        r_eff = float(np.mean(a.ess(post, method="mean", chain_axis=-2, draw_axis=-1)) / n_samples)
    elpd_i, pareto_k, p_loo_i = a.loo(ll, chain_axis=-2, draw_axis=-1, r_eff=r_eff)
    elpd, elpd_se, p_loo, lppd = a.loo_summary(elpd_i, p_loo_i)
    good_k = min(1 - 1 / np.log10(n_samples), 0.7) if n_samples > 1 else 0.7
    return {
        "elpd": float(elpd), "se": float(elpd_se), "p_loo": float(p_loo), "lppd": float(lppd),
        "good_k": float(good_k), "r_eff": r_eff,
        "pareto_k": np.asarray(pareto_k, dtype=float).ravel().tolist(),
        "elpd_i": np.asarray(elpd_i, dtype=float).ravel().tolist(),
    }
`;

let booting;
let analyze;
let loo;

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
  loo = py.globals.get("loo");
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
    } else if (data.type === "loo") {
      await booting;
      const { logLik, nChains, nDraws, nObs, draws, nVars } = data;
      const proxy = loo(logLik, nChains, nDraws, nObs, draws, nVars);
      result = proxy.toJs({ dict_converter: Object.fromEntries });
      proxy.destroy();
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
