# Changelog

## Unreleased

### Added

- `createAnalyzer`: arviz-stats 1.3.2 on Pyodide 0.29.2 in a module Worker, returning the
  `arviz_stats.summary` columns, a KDE, rank Δ-ECDFs and thinned traces per variable.
- SVG plots: `densityPlot`, `rankPlot`, `tracePlot`, `forestPlot`, and `summaryTable` (HTML).
- `analyzer.loo`: PSIS-LOO from a pointwise log-likelihood — `elpd` and its standard
  error, `pLoo`, and a Pareto k per observation, with `aboveGoodK` counting the ones
  past the threshold ArviZ warns at. `arviz_stats.base.array_stats.loo` does the work
  and `r_eff` is taken from the posterior's mean ESS, so the numbers match
  `arviz_stats.loo`. `looTable` renders it.
