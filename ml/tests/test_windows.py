import numpy as np

from stumari_ml.periods import q_matrix
from stumari_ml.windows import p_cancel, q_from_hazard


def test_spec_example_q_and_p_cancel():
    q = q_from_hazard([0.01, 0.02, 0.02, 0.03, 0.02, 0.01])
    expected = [0.01, 0.0198, 0.019404, 0.02852388, 0.0184454424, 0.009038266776]
    assert all(abs(a - b) < 1e-12 for a, b in zip(q, expected))
    assert abs(p_cancel(q) - 0.105211589176) < 1e-12


def test_unreachable_windows_are_skipped_in_the_survival_product():
    q = q_from_hazard([None, 0.1, 0.2, None, None, 0.5])
    assert q[0] == 0.0 and q[3] == 0.0 and q[4] == 0.0
    assert q[1] == 0.1
    assert q[2] == 0.2 * 0.9
    assert q[5] == 0.5 * (0.9 * 0.8)


def test_p_cancel_is_one_minus_survival():
    rng = np.random.default_rng(1)
    for _ in range(200):
        h = [None if rng.random() < 0.3 else float(rng.random() * 0.3) for _ in range(6)]
        survival = 1.0
        for v in h:
            if v is not None:
                survival *= 1.0 - v
        assert abs(p_cancel(q_from_hazard(h)) - (1.0 - survival)) < 1e-12


def test_vectorised_q_matches_scalar_bitwise():
    rng = np.random.default_rng(2)
    h = rng.random((500, 6)) * 0.4
    h[rng.random((500, 6)) < 0.25] = np.nan
    vectorised = q_matrix(h)
    for row, got in zip(h, vectorised):
        scalar = q_from_hazard([None if np.isnan(v) else float(v) for v in row])
        assert got.tolist() == scalar
