import numpy as np

from stumari_ml.metrics import average_ranks, base_rate_brier, brier, reliability_bins, roc_auc


def test_average_ranks_share_ties():
    assert average_ranks(np.array([3.0, 1.0, 3.0, 2.0])).tolist() == [3.5, 1.0, 3.5, 2.0]


def test_auc_rank_formula():
    assert roc_auc(np.array([0, 0, 1, 1]), np.array([0.1, 0.2, 0.3, 0.4])) == 1.0
    assert roc_auc(np.array([1, 1, 0, 0]), np.array([0.1, 0.2, 0.3, 0.4])) == 0.0
    # pairs (pos, neg): (0.35>0.1) (0.35>0.4 no) (0.8>0.1) (0.8>0.4) -> 3/4
    assert roc_auc(np.array([0, 1, 0, 1]), np.array([0.1, 0.35, 0.4, 0.8])) == 0.75
    assert roc_auc(np.array([0, 1]), np.array([0.5, 0.5])) == 0.5


def test_brier_and_base_rate():
    y = np.array([1, 0, 0, 0])
    assert brier(y, np.array([1.0, 0.0, 0.0, 0.0])) == 0.0
    assert brier(y, np.full(4, 0.25)) == base_rate_brier(y) == 0.1875


def test_reliability_bins_equal_count():
    p = np.linspace(0, 1, 101)
    y = (p > 0.5).astype(int)
    bins = reliability_bins(y, p, 10)
    assert [b["count"] for b in bins] == [11] + [10] * 9
    assert bins[0]["observed_rate"] == 0.0 and bins[-1]["observed_rate"] == 1.0
    assert all(a["mean_predicted"] < b["mean_predicted"] for a, b in zip(bins, bins[1:]))
