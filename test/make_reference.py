"""Writes test/fixtures/reference.json: draws, and what arviz_stats.summary says about them.

uv run --python 3.12 --with 'arviz-stats[xarray]==1.3.2' --with arviz-base test/make_reference.py
"""

import json
from pathlib import Path

import arviz_stats
import numpy as np
from arviz_base import from_dict

CHAINS, DRAWS = 4, 500
rng = np.random.default_rng(20260911)


def ar1(phi):
    x = np.zeros((CHAINS, DRAWS))
    for t in range(1, DRAWS):
        x[:, t] = phi * x[:, t - 1] + rng.normal(size=CHAINS)
    return x


cases = {
    "iid": {"a": rng.normal(size=(CHAINS, DRAWS)), "b": rng.normal(3, 0.5, size=(CHAINS, DRAWS))},
    "autocorrelated": {"a": ar1(0.9), "b": ar1(0.5)},
    "stuck_chain": {
        "a": rng.normal(size=(CHAINS, DRAWS)) + np.array([0, 0, 0, 2.5])[:, None],
        "b": rng.normal(size=(CHAINS, DRAWS)),
    },
    "skewed": {"a": rng.lognormal(0, 1, size=(CHAINS, DRAWS)), "b": rng.gamma(2, size=(CHAINS, DRAWS))},
    "constant": {"a": rng.normal(size=(CHAINS, DRAWS)), "b": np.full((CHAINS, DRAWS), 1.5)},
}

out = {}
for name, post in cases.items():
    # Rounded first so the JSON holds exactly the values the reference saw.
    post = {k: np.round(v, 6) for k, v in post.items()}
    s = arviz_stats.summary(from_dict({"posterior": post}), round_to="none")
    names = list(post)
    # Row-major per chain, one column per variable: the layout a sampler hands back.
    chains = [np.stack([post[k][c] for k in names], axis=-1).ravel().tolist() for c in range(CHAINS)]
    # JSON has no NaN; null stands for it.
    cols = {col: [None if np.isnan(v) else v for v in s[col].astype(float)] for col in s.columns}
    out[name] = {"names": names, "chains": chains, "summary": cols}

path = Path(__file__).parent / "fixtures" / "reference.json"
path.parent.mkdir(exist_ok=True)
path.write_text(json.dumps(out, separators=(",", ":")))
print(path, f"{path.stat().st_size / 1e3:.0f} KB", list(s.columns), f"arviz-stats {arviz_stats.__version__}")
