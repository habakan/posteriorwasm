// The main-thread half: packs draws, hands them to the worker, and reshapes what
// comes back into one row per variable. The plots live in svg.js.

export * from "./svg.js";

export const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.2/full/";
export const ARVIZ_STATS = "arviz-stats==1.3.2";

// A trace wider than this many points only repaints the same pixels.
const TRACE_POINTS = 400;

export function createAnalyzer({ indexURL = PYODIDE_URL, arvizStats = ARVIZ_STATS, onProgress } = {}) {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const pending = new Map();
  let next = 0;

  worker.onmessage = ({ data }) => {
    if (data.type === "progress") return onProgress?.(data.step);
    const p = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) p.reject(new Error(data.error));
    else p.resolve(data.result);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "posteriorwasm worker failed"));
    pending.clear();
  };

  const call = (message, transfer = []) => new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id }, transfer);
  });

  const ready = call({ type: "boot", indexURL, arvizStats });

  async function analyze({ names, chains, diverging }, { ciKind = "eti", ciProb = 0.89, gridLen = 256, ecdfPoints = 200 } = {}) {
    const nVars = names.length;
    const nChains = chains.length;
    const nDraws = chains[0].length / nVars;
    if (!nChains || !Number.isInteger(nDraws) || chains.some((c) => c.length !== chains[0].length)) {
      throw new Error("each chain must hold the same whole number of draws, names.length wide");
    }
    const draws = new Float64Array(nChains * nDraws * nVars);
    chains.forEach((c, i) => draws.set(c, i * nDraws * nVars));
    const trace = thinnedTraces(draws, nChains, nDraws, nVars);

    const r = await call(
      { type: "analyze", draws, nChains, nDraws, nVars, ciKind, ciProb, gridLen, ecdfPoints: Math.min(ecdfPoints, nDraws) },
      [draws.buffer],
    );
    return {
      names, nChains, nDraws, ci: { kind: ciKind, prob: ciProb },
      diverging: diverging ? diverging.map((d) => d.reduce((s, v) => s + (v ? 1 : 0), 0)) : null,
      summary: names.map((name, k) => ({
        name, mean: r.mean[k], sd: r.sd[k], ciLb: r.ci_lb[k], ciUb: r.ci_ub[k],
        essBulk: r.ess_bulk[k], essTail: r.ess_tail[k], rHat: r.r_hat[k],
        mcseMean: r.mcse_mean[k], mcseSd: r.mcse_sd[k],
      })),
      density: names.map((_, k) => ({ x: r.kde_x[k], y: r.kde_y[k] })),
      ranks: names.map((_, k) => ({ x: r.rank_x[k], y: r.rank_y[k] })),
      trace,
    };
  }

  // PSIS-LOO over a pointwise log-likelihood. Separate from `analyze` because a
  // page only has one if its model wrote `log_lik` into generated quantities.
  async function loo({ names, chains, logLikelihood }) {
    const nVars = names.length;
    const nChains = chains.length;
    const nDraws = chains[0].length / nVars;
    const nObs = logLikelihood[0].length / nDraws;
    if (logLikelihood.length !== nChains || !Number.isInteger(nObs)
        || logLikelihood.some((c) => c.length !== logLikelihood[0].length)) {
      throw new Error("logLikelihood needs one chain per posterior chain, nDraws * nObs wide");
    }
    const draws = new Float64Array(nChains * nDraws * nVars);
    chains.forEach((c, i) => draws.set(c, i * nDraws * nVars));
    const logLik = new Float64Array(nChains * nDraws * nObs);
    logLikelihood.forEach((c, i) => logLik.set(c, i * nDraws * nObs));

    const r = await call(
      { type: "loo", logLik, nChains, nDraws, nObs, draws, nVars },
      [logLik.buffer, draws.buffer],
    );
    return {
      nObs, elpd: r.elpd, se: r.se, pLoo: r.p_loo, lppd: r.lppd,
      goodK: r.good_k, rEff: r.r_eff,
      paretoK: r.pareto_k, elpdI: r.elpd_i,
      aboveGoodK: r.pareto_k.reduce((n, k) => n + (k > r.good_k ? 1 : 0), 0),
    };
  }

  return { ready, analyze, loo, terminate: () => worker.terminate() };
}

function thinnedTraces(draws, nChains, nDraws, nVars) {
  const step = Math.max(1, Math.ceil(nDraws / TRACE_POINTS));
  return Array.from({ length: nVars }, (_, k) => Array.from({ length: nChains }, (_, c) => {
    const out = [];
    for (let i = 0; i < nDraws; i += step) out.push(draws[(c * nDraws + i) * nVars + k]);
    return out;
  }));
}
