# posteriorwasm

ArviZ diagnostics and plots for MCMC draws, in a browser page that does not run
Python itself. [arviz-stats](https://github.com/arviz-devs/arviz-stats) runs
unmodified on [Pyodide](https://pyodide.org) inside a Web Worker; the numbers it
returns are drawn as plain SVG on the main thread.

This is not an ArviZ project. It calls ArviZ's own code rather than
reimplementing it, so the summary matches `arviz_stats.summary` — the browser
tests check that in Chromium, Firefox and WebKit.

```js
import { createAnalyzer, summaryTable, forestPlot, rankPlot } from "posteriorwasm";

const analyzer = createAnalyzer({ onProgress: (step) => console.log(step) });
const result = await analyzer.analyze({
  names: ["mu", "tau"],
  chains: [chain0, chain1, chain2, chain3], // Float64Array each, post-warmup, row-major
});

document.querySelector("#summary").innerHTML = summaryTable(result);
document.querySelector("#forest").innerHTML = forestPlot(result);
document.querySelector("#rank").innerHTML = rankPlot(result, 0);
```

## What it computes

Per variable, the columns of `arviz_stats.summary`: mean, sd, a credible
interval (equal-tailed 89% by default, as ArviZ 1.x does; `ciKind: "hdi"` for
the HDI), bulk and tail ESS, rank-normalized R-hat, and the MCSE of the mean and
the sd. Also a KDE, the fractional-rank Δ-ECDF `plot_rank` draws, and a thinned
trace per chain.

## Cross-validation

`analyzer.loo` takes a pointwise log-likelihood beside the draws and returns
PSIS-LOO: `elpd` with its standard error, `pLoo`, and a Pareto k per
observation. `aboveGoodK` counts the observations whose k passed the threshold
ArviZ warns at, which is what says the estimate itself is unreliable.

```js
const loo = await analyzer.loo({
  names, chains,
  // one entry per chain, nDraws * nObs long, row-major per draw
  logLikelihood: [ll0, ll1, ll2, ll3],
});
document.querySelector("#loo").innerHTML = looTable(loo);
```

A Stan model supplies this by writing `log_lik` into `generated quantities`.
`r_eff` comes from the posterior's mean ESS, the way `arviz_stats.loo` takes it,
which is why the draws are passed too.

## Plots

Each returns an SVG string: `densityPlot`, `rankPlot`, `tracePlot` take the
result and a variable index; `forestPlot`, `summaryTable` and `looTable` (both
HTML) take the result. Set `innerHTML` in plain JS, or `dangerouslySetInnerHTML` in React.
Cells ArviZ would warn about — R-hat of 1.01 or more, fewer than 100 effective
draws per chain — carry a `data-flag` attribute.

## Cost

The first `createAnalyzer` downloads about 24 MB (Pyodide, numpy, scipy,
arviz-stats) and takes 5 to 10 seconds before the first result; an analysis
after that takes tens of milliseconds. Create the analyzer when someone asks for
diagnostics, not on page load. Pyodide comes from jsDelivr and arviz-stats from
PyPI unless `indexURL` and `arvizStats` point elsewhere.

With Vite, exclude the package from dependency pre-bundling so the worker URL
survives: `optimizeDeps: { exclude: ["posteriorwasm"] }`.

## Tests

```sh
npm test                 # the SVG helpers, in Node
npm run test:browser     # arviz_stats.summary parity in three engines (needs network)
npm run reference        # regenerate test/fixtures/reference.json with native ArviZ
```

## License

MIT OR Apache-2.0.
