import copy
import logging
import threading
import time
import requests

logger = logging.getLogger(__name__)

from config import (
    STEAM_PAGE_ANALYZER_API,
    STEAM_PAGE_ANALYZER_CACHE_TTL,
    STEAM_PAGE_ANALYZER_MIN_REQUEST_INTERVAL,
    session,
)


analyzer_cache = {}
analyzer_cache_lock = threading.Lock()
analyzer_request_lock = threading.Lock()

analyzer_last_request = 0.0


def unwrap_provider_value(value):
    """
    Extract the actual value from Steam Page Analyzer's
    wrapped Steam Store text fields.

    Example:
    {"untrusted_content": True, "value": "Hades"}
    becomes:
    "Hades"
    """

    if (
        isinstance(value, dict)
        and value.get("untrusted_content") is True
        and "value" in value
    ):
        return value["value"]

    return value


def fetch_steam_page_analyzer_data(app_id):
    """
    Fetch estimated Steam sales and revenue from
    Steam Page Analyzer.

    Estimates use the Boxleiter method.

    Successful responses are cached for 24 hours.
    Requests are spaced to respect the provider's
    published rate limit.
    """

    global analyzer_last_request

    cache_key = int(app_id)
    now = time.monotonic()

    # Check cache first.
    with analyzer_cache_lock:
        cached = analyzer_cache.get(cache_key)

        if (
            cached
            and now - cached["timestamp"]
            < STEAM_PAGE_ANALYZER_CACHE_TTL
        ):
            result = copy.deepcopy(cached["data"])
            result["cache_hit"] = True
            return result

    # Serialize requests and enforce minimum spacing.
    with analyzer_request_lock:

        elapsed = time.monotonic() - analyzer_last_request

        if elapsed < STEAM_PAGE_ANALYZER_MIN_REQUEST_INTERVAL:
            time.sleep(
                STEAM_PAGE_ANALYZER_MIN_REQUEST_INTERVAL - elapsed
            )

        # Update before making the request so failed requests
        # also count towards the rate limit.
        analyzer_last_request = time.monotonic()

        try:
            response = session.post(
                STEAM_PAGE_ANALYZER_API,
                json={
                    "app_id": str(cache_key),
                },
                timeout=(5, 35),
            )

            response.raise_for_status()
            payload = response.json()

        except requests.exceptions.Timeout:
            logger.warning(
                "Steam Page Analyzer timed out for app_id=%s",
                cache_key,
            )

            return {
                "available": False,
                "reason": "Steam Page Analyzer timed out. Other game data may still be available.",
            }

        except requests.exceptions.RequestException as exc:
            logger.warning(
                "Steam Page Analyzer request failed for app_id=%s: %s",
                cache_key,
                exc,
            )

            return {
                "available": False,
                "reason": "Steam Page Analyzer is temporarily unavailable.",
            }

        except ValueError:
            logger.warning(
                "Steam Page Analyzer returned invalid JSON for app_id=%s",
                cache_key,
            )

            return {
                "available": False,
                "reason": "Steam Page Analyzer returned an invalid response.",
            }

    if not isinstance(payload, dict):
        return {
            "available": False,
            "reason": "Steam Page Analyzer returned an invalid response.",
        }

    if payload.get("error"):
        return {
            "available": False,
            "reason": payload.get(
                "message",
                "Steam Page Analyzer could not estimate this game.",
            ),
        }

    # Validate the application ID.
    returned_app_id = payload.get("app_id")

    if (
        returned_app_id is None
        or str(returned_app_id) != str(cache_key)
    ):
        return {
            "available": False,
            "reason": "Steam Page Analyzer returned unexpected application data.",
        }

    units = payload.get("units_sold")
    revenue = payload.get("revenue_usd")

    if not isinstance(units, dict) or not isinstance(revenue, dict):
        return {
            "available": False,
            "reason": "Sales or revenue estimates were missing.",
        }

    required_ranges = ("low", "mid", "high")

    if not all(
        key in units and key in revenue
        for key in required_ranges
    ):
        return {
            "available": False,
            "reason": "Sales or revenue estimate ranges were incomplete.",
        }

    # Normalize provider-wrapped text fields.
    raw_tags = payload.get("inputs", {}).get("tags") or []

    if isinstance(raw_tags, list):
        tags = [
            unwrap_provider_value(tag)
            for tag in raw_tags
        ]
    else:
        tags = []

    inputs = payload.get("inputs") or {}

    genre_benchmark = payload.get("genre_benchmark")

    if not isinstance(genre_benchmark, dict):
        genre_benchmark = None

    timeline = payload.get("timeline")

    if not isinstance(timeline, list):
        timeline = []

    result = {
        "available": True,

        "app_id": cache_key,

        "game_name": unwrap_provider_value(
            payload.get("game_name")
        ),

        "method": payload.get("method"),
        "method_note": payload.get("method_note"),

        "inputs": {
            "review_count": inputs.get("review_count"),
            "price_usd": inputs.get("price_usd"),
            "positive_ratio": inputs.get("positive_ratio"),
            "is_free": inputs.get("is_free"),
            "is_released": inputs.get("is_released"),
            "release_date": unwrap_provider_value(
                inputs.get("release_date")
            ),
            "primary_genre": unwrap_provider_value(
                inputs.get("primary_genre")
            ),
            "tags": tags,
        },

        "units_sold": {
            "low": units["low"],
            "mid": units["mid"],
            "high": units["high"],
        },

        "revenue_usd": {
            "low": revenue["low"],
            "mid": revenue["mid"],
            "high": revenue["high"],
        },

        "net_revenue_per_unit_usd": payload.get(
            "net_revenue_per_unit_usd"
        ),

        "multipliers": payload.get("multipliers"),

        "confidence": payload.get("confidence"),

        "confidence_reasons": payload.get(
            "confidence_reasons",
            [],
        ),

        "genre_benchmark": genre_benchmark,

        "timeline": timeline,

        "steam_store_url": payload.get("steam_store_url"),
        "source_url": payload.get("source_url"),

        "cache_hit": False,
    }

    # Cache successful results only.
    with analyzer_cache_lock:
        analyzer_cache[cache_key] = {
            "timestamp": time.monotonic(),
            "data": copy.deepcopy(result),
        }

    return result