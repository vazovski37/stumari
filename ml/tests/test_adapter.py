from datetime import datetime, timedelta, timezone

from stumari_ml.adapter import adapt, build_encoding, column_name, encode, feature_order

TBILISI = timezone(timedelta(hours=4))


def ts(local: str) -> int:
    return int(datetime.fromisoformat(local).replace(tzinfo=TBILISI).timestamp())


def request(issued: str, checkin: str, checkout: str, **overrides):
    base = {
        "issued_at": ts(issued),
        "checkin_ts": ts(f"{checkin} 14:00:00"),
        "checkin_date": checkin,
        "checkout_date": checkout,
        "adults": 2,
        "children": 0,
        "buyer_type": "guest",
        "hotel_type": "City Hotel",
        "meal": "BB",
        "is_repeated_guest": 0,
        "previous_bookings_not_canceled": 0,
    }
    return {**base, **overrides}


def raises(fn, *args, **kwargs) -> bool:
    try:
        fn(*args, **kwargs)
    except ValueError:
        return True
    return False


def test_spec_example_features():
    f = adapt(request("2026-10-01 00:00:00", "2026-11-05", "2026-11-08"))
    assert f["lead_time"] == 35
    assert f["arrival_month"] == 11
    assert f["arrival_dow"] == 3  # Thursday
    assert (f["weekend_nights"], f["week_nights"]) == (2, 1)  # Thu | Fri Sat


def test_lead_time_is_floor_of_seconds_over_days():
    checkin = "2026-10-15"
    assert adapt(request("2026-10-15 13:59:59", checkin, "2026-10-16"))["lead_time"] == 0
    assert adapt(request("2026-10-14 15:30:00", checkin, "2026-10-16"))["lead_time"] == 0
    assert adapt(request("2026-10-14 14:00:00", checkin, "2026-10-16"))["lead_time"] == 1
    assert adapt(request("2026-10-14 13:00:00", checkin, "2026-10-16"))["lead_time"] == 1
    assert adapt(request("2026-10-12 14:00:00", checkin, "2026-10-16"))["lead_time"] == 3
    assert adapt(request("2026-10-12 14:00:01", checkin, "2026-10-16"))["lead_time"] == 2


def test_arrival_dow_monday_is_zero():
    assert adapt(request("2026-10-01 00:00:00", "2026-10-19", "2026-10-20"))["arrival_dow"] == 0  # Monday
    assert adapt(request("2026-10-01 00:00:00", "2026-10-18", "2026-10-19"))["arrival_dow"] == 6  # Sunday


def test_weekend_nights_start_friday_or_saturday():
    def nights(checkin: str, checkout: str) -> tuple[int, int]:
        f = adapt(request("2026-09-01 00:00:00", checkin, checkout))
        return f["weekend_nights"], f["week_nights"]

    assert nights("2026-10-16", "2026-10-17") == (1, 0)  # Friday night
    assert nights("2026-10-17", "2026-10-18") == (1, 0)  # Saturday night
    assert nights("2026-10-18", "2026-10-21") == (0, 3)  # Sun Mon Tue
    assert nights("2026-10-15", "2026-10-22") == (2, 5)  # a full week
    assert nights("2026-12-31", "2027-01-02") == (1, 1)  # Thu Dec 31, Fri Jan 1


def test_history_cap_and_direct_channel_for_agents():
    guest = adapt(request("2026-09-01 10:00:00", "2026-10-15", "2026-10-17",
                          is_repeated_guest=1, previous_bookings_not_canceled=7))
    agent = adapt(request("2026-09-01 10:00:00", "2026-10-15", "2026-10-17", buyer_type="agent",
                          is_repeated_guest=1, previous_bookings_not_canceled=7))
    assert guest["previous_bookings_not_canceled"] == 3
    assert guest == agent
    assert (agent["market_segment"], agent["distribution_channel"], agent["customer_type"]) == (
        "Direct", "Direct", "Transient")


def test_training_channel_override():
    channel = {"market_segment": "Online TA", "distribution_channel": "TA/TO", "customer_type": "Contract"}
    f = adapt(request("2026-09-01 10:00:00", "2026-10-15", "2026-10-17"), channel=channel)
    assert (f["market_segment"], f["distribution_channel"], f["customer_type"]) == ("Online TA", "TA/TO", "Contract")


def test_invalid_requests_raise():
    ok = request("2026-09-01 10:00:00", "2026-10-15", "2026-10-17")
    assert not raises(adapt, ok)
    assert raises(adapt, {**ok, "checkout_date": "2026-10-15"})
    assert raises(adapt, {**ok, "issued_at": ok["checkin_ts"] + 1})
    assert raises(adapt, {**ok, "buyer_type": "reseller"})
    assert raises(adapt, {**ok, "adults": 0})
    assert raises(adapt, {**ok, "children": True})
    assert raises(adapt, {**ok, "is_repeated_guest": 2})
    assert raises(adapt, {**ok, "checkin_date": "2026-10-5"})


def test_encoding_unknown_category_is_all_zero():
    encoding = build_encoding({
        "market_segment": ["Online TA", "Direct"],
        "distribution_channel": ["Direct", "TA/TO"],
        "customer_type": ["Transient"],
        "hotel": ["City Hotel", "Resort Hotel"],
        "meal": ["BB", "SC"],
    })
    order = feature_order(encoding)
    assert order[0] == "lead_time" and order[-1] == "exposure_days"
    assert order[-7:-1] == [f"window_{k}" for k in range(6)]
    assert "market_segment_online_ta" in order and "distribution_channel_ta_to" in order
    assert column_name("market_segment", "Offline TA/TO") == "market_segment_offline_ta_to"

    f = adapt(request("2026-09-01 10:00:00", "2026-10-15", "2026-10-17", meal="AI"))
    vector = dict(zip(order, encode(f, encoding)))
    assert vector["meal_bb"] == 0 and vector["meal_sc"] == 0
    assert vector["market_segment_direct"] == 1 and vector["market_segment_online_ta"] == 0
    assert vector["hotel_city_hotel"] == 1
    assert len(encode(f, encoding)) == len(order) - 7
