import threading
import time

from config import (
    REQUEST_TIMEOUT,
    STEAMSPY_API,
    STEAMSPY_CACHE_TTL,
    STEAMSPY_MIN_REQUEST_INTERVAL,
    session,
)

steamspy_cache = {}
steamspy_cache_lock = threading.Lock()
steamspy_request_lock = threading.Lock()
steamspy_last_request = 0.0


def fetch_steamspy_data(app_id):
    """
    Fetch third-party ownership, playtime and community-tag
    estimates from SteamSpy.

    Results are cached for 24 hours.
    Individual requests are spaced to respect SteamSpy's
    published API rate limit.
    """

    global steamspy_last_request

    cache_key = int(app_id)
    now = time.monotonic()

    # Check cache first.
    with steamspy_cache_lock:
        cached = steamspy_cache.get(cache_key)

        if cached and now - cached["timestamp"] < STEAMSPY_CACHE_TTL:
            result = cached["data"].copy()
            result["cache_hit"] = True
            return result

    # Respect SteamSpy's request interval.
    with steamspy_request_lock:
        elapsed = time.monotonic() - steamspy_last_request

        if elapsed < STEAMSPY_MIN_REQUEST_INTERVAL:
            time.sleep(STEAMSPY_MIN_REQUEST_INTERVAL - elapsed)

        response = session.get(
            STEAMSPY_API,
            params={
                "request": "appdetails",
                "appid": cache_key,
            },
            timeout=REQUEST_TIMEOUT,
        )

        steamspy_last_request = time.monotonic()

    response.raise_for_status()

    payload = response.json()

    if not isinstance(payload, dict) or not payload:
        return {
            "available": False,
            "reason": "SteamSpy returned no application data.",
        }

    # SteamSpy uses appid 999999 for hidden applications.
    if payload.get("appid") == 999999:
        return {
            "available": False,
            "reason": "SteamSpy has hidden this application's data.",
        }

    if payload.get("appid") is None:
        return {
            "available": False,
            "reason": "SteamSpy has no available data for this App ID.",
        }

    # Convert tag dictionary into a sorted list.
    raw_tags = payload.get("tags") or {}

    if isinstance(raw_tags, dict):
        tags = [
            {
                "name": name,
                "votes": votes,
            }
            for name, votes in sorted(
                raw_tags.items(),
                key=lambda item: item[1] if isinstance(item[1], (int, float)) else 0,
                reverse=True,
            )
        ]
    else:
        tags = []

    result = {
        "available": True,
        "name": payload.get("name"),
        "owners_estimate": payload.get("owners"),
        "tags": tags,
        "average_playtime_forever_minutes": payload.get(
            "average_forever"
        ),
        "average_playtime_2weeks_minutes": payload.get(
            "average_2weeks"
        ),
        "median_playtime_forever_minutes": payload.get(
            "median_forever"
        ),
        "median_playtime_2weeks_minutes": payload.get(
            "median_2weeks"
        ),
        "peak_ccu_yesterday": payload.get("ccu"),
        "positive_reviews": payload.get("positive"),
        "negative_reviews": payload.get("negative"),
        "score_rank": payload.get("score_rank"),
        "cache_hit": False,
    }

    # Cache successful responses only.
    with steamspy_cache_lock:
        steamspy_cache[cache_key] = {
            "timestamp": time.monotonic(),
            "data": result.copy(),
        }

    return result