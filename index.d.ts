export const PYODIDE_URL: string;
export const ARVIZ_STATS: string;
export const CHAIN_COLORS: readonly string[];

export interface AnalyzerOptions {
  /** Where Pyodide is served from, ending in `/`. Defaults to jsDelivr. */
  indexURL?: string;
  /** What micropip installs: a requirement or a wheel URL. */
  arvizStats?: string;
  /** Called with `"pyodide" | "numpy+scipy" | "arviz-stats" | "ready"` while loading. */
  onProgress?: (step: string) => void;
}

export interface AnalyzeInput {
  names: string[];
  /** One array per chain: post-warmup draws, row-major, `names.length` wide. */
  chains: ArrayLike<number>[];
  /** One array per chain, nonzero where the draw diverged. */
  diverging?: ArrayLike<number>[];
}

export interface AnalyzeOptions {
  /** `"eti"` (arviz_stats.summary's default) or `"hdi"`. */
  ciKind?: "eti" | "hdi";
  /** Defaults to 0.89, as arviz_stats.summary does. */
  ciProb?: number;
  gridLen?: number;
  ecdfPoints?: number;
}

export interface SummaryRow {
  name: string;
  mean: number;
  sd: number;
  ciLb: number;
  ciUb: number;
  essBulk: number;
  essTail: number;
  rHat: number;
  mcseMean: number;
  mcseSd: number;
}

export interface AnalyzeResult {
  names: string[];
  nChains: number;
  nDraws: number;
  ci: { kind: "eti" | "hdi"; prob: number };
  /** Divergent draws per chain, or null when none were passed. */
  diverging: number[] | null;
  summary: SummaryRow[];
  density: { x: number[]; y: number[] }[];
  /** Fractional-rank delta-ECDF per variable, one line per chain. */
  ranks: { x: number[][]; y: number[][] }[];
  /** Per variable, per chain, thinned to a few hundred points. */
  trace: number[][][];
}

export interface Versions {
  python: string;
  numpy: string;
  scipy: string;
  arvizStats: string;
  pyodide: string;
}

export interface LooInput {
  names: string[];
  chains: Float64Array[];
  /** One entry per posterior chain, `nDraws * nObs` long, row-major per draw. */
  logLikelihood: Float64Array[];
}

export interface LooResult {
  nObs: number;
  elpd: number;
  se: number;
  pLoo: number;
  lppd: number;
  /** Pareto k above this means importance sampling did not converge. */
  goodK: number;
  rEff: number;
  paretoK: number[];
  elpdI: number[];
  aboveGoodK: number;
}

export interface Analyzer {
  ready: Promise<Versions>;
  analyze(input: AnalyzeInput, options?: AnalyzeOptions): Promise<AnalyzeResult>;
  loo(input: LooInput): Promise<LooResult>;
  terminate(): void;
}

export function createAnalyzer(options?: AnalyzerOptions): Analyzer;

export interface PlotSize {
  width?: number;
  height?: number;
}

export function flags(row: SummaryRow, nChains: number): { rHat: boolean; essBulk: boolean; essTail: boolean };
export function fmt(value: number, digits?: number): string;
export function densityPlot(result: AnalyzeResult, k: number, size?: PlotSize): string;
export function rankPlot(result: AnalyzeResult, k: number, size?: PlotSize): string;
export function tracePlot(result: AnalyzeResult, k: number, size?: PlotSize): string;
export function forestPlot(result: AnalyzeResult, options?: { width?: number; rowHeight?: number; labelWidth?: number }): string;
export function summaryTable(result: AnalyzeResult, options?: { digits?: number }): string;
export function looTable(result: LooResult, options?: { digits?: number }): string;
