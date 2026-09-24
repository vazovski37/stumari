import numpy as np

from stumari_ml.periods import expand, hazard_matrix, q_matrix
from stumari_ml.windows import exposure_days, is_reachable, window_of_day


def rows_for(lead: int, event_window: int, *, truncate: bool):
    booking = np.array([[7.0, 8.0]])
    rows = expand(booking, np.array([lead]), np.array([event_window]), truncate=truncate)
    return rows.window.tolist(), rows.label.tolist(), rows.X[:, -1].tolist(), rows.X


def test_window_of_day_boundaries():
    assert [window_of_day(d) for d in (0, 1, 2, 3, 6, 7, 13, 14, 29, 30, 400)] == [5, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0]


def reachable_windows(lead: int) -> list[int]:
    return [k for k in range(6) if is_reachable(lead, k)]


def test_exposure_and_reachability():
    assert reachable_windows(35) == [0, 1, 2, 3, 4, 5]
    assert [exposure_days(35, k) for k in range(6)] == [5, 16, 7, 4, 2, 1]
    assert reachable_windows(20) == [1, 2, 3, 4, 5]
    assert exposure_days(20, 1) == 6
    assert reachable_windows(0) == [5] and exposure_days(0, 5) == 0
    assert exposure_days(30, 0) == 0


def test_truncation_stops_after_event_window():
    windows, labels, exposure, X = rows_for(35, 2, truncate=True)
    assert windows == [0, 1, 2]
    assert labels == [0, 0, 1]
    assert exposure == [5, 16, 7]
    assert X[:, :2].tolist() == [[7.0, 8.0]] * 3
    assert X[:, 2:8].tolist() == [[1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0]]


def test_survivors_get_every_reachable_window():
    windows, labels, _, _ = rows_for(35, -1, truncate=True)
    assert windows == [0, 1, 2, 3, 4, 5] and labels == [0] * 6
    windows, labels, exposure, _ = rows_for(0, -1, truncate=True)
    assert (windows, labels, exposure) == ([5], [0], [0])


def test_cancel_on_booking_day_is_first_reachable_window():
    windows, labels, _, _ = rows_for(10, window_of_day(10), truncate=True)
    assert (windows, labels) == ([2], [1])


def test_full_expansion_ignores_the_event():
    windows, labels, _, _ = rows_for(35, 2, truncate=False)
    assert windows == [0, 1, 2, 3, 4, 5]
    assert labels == [0, 0, 1, 0, 0, 0]


def test_vectorised_exposure_matches_scalar_rule():
    leads = np.arange(0, 800)
    rows = expand(np.zeros((len(leads), 1)), leads, np.full(len(leads), -1), truncate=False)
    expected = [exposure_days(int(leads[b]), int(k)) for b, k in zip(rows.booking, rows.window)]
    assert rows.X[:, -1].tolist() == expected


def test_hazard_matrix_marks_unreachable_as_nan():
    rows = expand(np.zeros((2, 1)), np.array([20, 2]), np.array([-1, -1]), truncate=False)
    h = hazard_matrix(rows, np.full(len(rows.window), 0.1), 2)
    assert np.isnan(h[0, 0]) and not np.isnan(h[0, 1:]).any()
    assert np.isnan(h[1, :4]).all() and not np.isnan(h[1, 4:]).any()
    q = q_matrix(h)
    assert q[1].tolist() == [0.0, 0.0, 0.0, 0.0, 0.1, 0.1 * 0.9]
