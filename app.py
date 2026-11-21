import logging

import requests
from flask import Flask, jsonify, render_template, request
from concurrent.futures import ThreadPoolExecutor
import base64
import json
from config import COUNTRY_CODE
from services import (
    fetch_current_players,
    fetch_reviews_data,
    fetch_steam_page_analyzer_data,
    fetch_steamspy_data,
    fetch_store_data,
)
from utils import normalize_app_id
from datetime import datetime, timezone

from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from database import (
    initialize_database,
    get_bookmarked_games_collection,
    get_searched_games_collection,
)

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    initialize_database()
except Exception:
    logger.exception("Database initialization failed during startup")

def prepare_bookmark_document(game_data):
    """
    Prepare a complete research response for MongoDB storage.
    """

    app_id = normalize_app_id(
        str(game_data.get("app_id", ""))
    )

    steam_store = game_data.get("steam_store")
    steam_store = (
        steam_store if isinstance(steam_store, dict) else None
    )

    game_name = (
        (steam_store or {}).get("name")
        or game_data.get("game_name")
        or f"Steam App {app_id}"
    )

    return {
        "app_id": app_id,
        "game_name": game_name,

        "steam_store": game_data.get("steam_store"),
        "steam_players": game_data.get("steam_players"),
        "steam_reviews": game_data.get("steam_reviews"),
        "steamspy": game_data.get("steamspy"),
        "steam_page_analyzer": game_data.get(
            "steam_page_analyzer"
        ),
        "release_date_sort": get_release_date_sort_value(game_data),
        "metadata": game_data.get("metadata", {}),
        "errors": game_data.get("errors", []),
    }


def prepare_searched_game_document(game_data):
    """
    Prepare a successful game research response
    for the shared searched_games collection.
    """

    app_id = normalize_app_id(
        str(game_data.get("app_id", ""))
    )

    steam_store = game_data.get("steam_store")
    steam_store = (
        steam_store if isinstance(steam_store, dict) else None
    )

    game_name = (
        (steam_store or {}).get("name")
        or game_data.get("game_name")
        or f"Steam App {app_id}"
    )

    return {
        "app_id": app_id,
        "game_name": game_name,
        "steam_store": game_data.get("steam_store"),
        "steam_players": game_data.get("steam_players"),
        "steam_reviews": game_data.get("steam_reviews"),
        "steamspy": game_data.get("steamspy"),
        "steam_page_analyzer": game_data.get(
            "steam_page_analyzer"
        ),
        "metadata": game_data.get("metadata", {}),
        "errors": game_data.get("errors", []),
    }

def get_release_date_sort_value(game_data):
    """
    Return a sortable UTC datetime from Steam Store release date.

    Unknown or unparseable dates are placed last.
    """

    unknown_date = datetime(9999, 12, 31, tzinfo=timezone.utc)

    steam_store = game_data.get("steam_store") or {}
    release_info = steam_store.get("release_date") or {}

    if not isinstance(release_info, dict):
        return unknown_date

    if release_info.get("coming_soon") is True:
        return unknown_date

    raw_date = release_info.get("date")

    if not isinstance(raw_date, str) or not raw_date.strip():
        return unknown_date

    raw_date = raw_date.strip()

    formats = [
        "%d %b, %Y",
        "%b %d, %Y",
        "%B %d, %Y",
        "%Y-%m-%d",
        "%d %B, %Y",
    ]

    for date_format in formats:
        try:
            parsed_date = datetime.strptime(raw_date, date_format)

            return parsed_date.replace(tzinfo=timezone.utc)

        except ValueError:
            continue

    return unknown_date

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/game", methods=["GET"])
def get_game():
    raw_input = request.args.get("app_id", "")

    try:
        app_id = normalize_app_id(raw_input)
    except ValueError as exc:
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 400

    logger.info("Fetching Steam data for App ID %s", app_id)

    errors = []

    fetchers = {
        "Steam Store": (
            fetch_store_data,
            (requests.RequestException, ValueError, TypeError),
        ),
        "Steam Web API": (
            fetch_current_players,
            (requests.RequestException, ValueError, TypeError),
        ),
        "Steam Reviews API": (
            fetch_reviews_data,
            (requests.RequestException, ValueError, TypeError, KeyError),
        ),
        "SteamSpy": (
            fetch_steamspy_data,
            (requests.RequestException, ValueError, TypeError, KeyError),
        ),
        "Steam Page Analyzer": (
            fetch_steam_page_analyzer_data,
            (requests.RequestException, ValueError, TypeError, KeyError),
        ),
    }

    results = {}

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {
            executor.submit(fn, app_id): (source, handled_excs)
            for source, (fn, handled_excs) in fetchers.items()
        }

        for future, (source, handled_excs) in future_map.items():
            try:
                results[source] = future.result()

            except handled_excs as exc:
                logger.exception(
                    "%s request/processing failed for app_id=%s",
                    source,
                    app_id,
                )

                results[source] = None

                errors.append({
                    "source": source,
                    "message": str(exc),
                })

            except Exception as exc:
                logger.exception(
                    "Unexpected error from %s for app_id=%s",
                    source,
                    app_id,
                )

                results[source] = None

                errors.append({
                    "source": source,
                    "message": f"{source} encountered an unexpected error.",
                })

    store_data = results.get("Steam Store")
    player_data = results.get("Steam Web API")
    reviews_data = results.get("Steam Reviews API")
    steamspy_data = results.get("SteamSpy")
    steam_page_analyzer_data = results.get("Steam Page Analyzer")

    store_available = (
        store_data is not None
        and store_data.get("available") is True
    )
    players_available = (
        player_data is not None
        and player_data.get("available") is True
    )
    reviews_available = (
        reviews_data is not None
        and reviews_data.get("available") is True
    )
    steamspy_available = (
        steamspy_data is not None
        and steamspy_data.get("available") is True
    )
    steam_page_analyzer_available = (
        steam_page_analyzer_data is not None
        and steam_page_analyzer_data.get("available") is True
    )

    if not (
        store_available
        or players_available
        or reviews_available
        or steamspy_available
        or steam_page_analyzer_available
    ):
        return jsonify({
            "success": False,
            "app_id": app_id,
            "errors": errors,
            "error": (
                "Unable to retrieve game information from Steam. "
                "The App ID may be unsupported, or the Steam services "
                "may be temporarily unavailable."
            ),
        }), 502

    currency = None
    if store_available:
        currency = (store_data.get("price") or {}).get("currency")

    
    response_data = {
        "success": True,
        "app_id": app_id,
        "steam_store": store_data,
        "steam_players": player_data,
        "steam_reviews": reviews_data,
        "steamspy": steamspy_data,
        "steam_page_analyzer": steam_page_analyzer_data,
        "errors": errors,
        "metadata": {
            "country": COUNTRY_CODE.upper(),
            "currency": currency,
            "sources": [
                source
                for source, available in [
                    ("Steam Store", store_available),
                    ("Steam Web API", players_available),
                    ("Steam Reviews API", reviews_available),
                    ("SteamSpy", steamspy_available),
                    ("Steam Page Analyzer", steam_page_analyzer_available),
                ]
                if available
            ],
        },
    }

    # Automatically save successful searches to shared MongoDB history.
    try:
        document = prepare_searched_game_document(response_data)
        now = datetime.now(timezone.utc)

        collection = get_searched_games_collection()

        collection.find_one_and_update(
            {"app_id": document["app_id"]},
            {
                "$set": {
                    **document,
                    "last_searched_at": now,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "first_searched_at": now,
                },
                "$inc": {
                    "search_count": 1,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

    except (ValueError, PyMongoError, RuntimeError):
        logger.exception(
            "Could not save searched game %s to MongoDB",
            app_id,
        )

    return jsonify(response_data)


@app.route("/api/bookmarks", methods=["POST"])
def bookmark_game():

    game_data = request.get_json(silent=True)

    if not isinstance(game_data, dict):
        return jsonify({
            "success": False,
            "error": "Invalid game data.",
        }), 400

    if game_data.get("success") is not True:
        return jsonify({
            "success": False,
            "error": "Cannot bookmark unsuccessful research data.",
        }), 400

    try:
        document = prepare_bookmark_document(game_data)

        now = datetime.now(timezone.utc)

        collection = get_bookmarked_games_collection()

        existing = collection.find_one(
            {"app_id": document["app_id"]},
            {"_id": 1},
        )

        result = collection.find_one_and_update(
            {"app_id": document["app_id"]},
            {
                "$set": {
                    **document,
                    "updated_at": now,
                    "last_refreshed_at": now,
                },
                "$setOnInsert": {
                    "bookmarked_at": now,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

        return jsonify({
            "success": True,
            "message": (
                "Game updated successfully."
                if existing
                else "Game bookmarked successfully."
            ),
            "already_bookmarked": existing is not None,
            "app_id": result["app_id"],
        })

    except ValueError as exc:
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 400

    except PyMongoError:
        logger.exception("Failed to bookmark game")

        return jsonify({
            "success": False,
            "error": "Unable to save the game to MongoDB.",
        }), 500



@app.route("/api/searched-games", methods=["GET"])
def get_searched_games():

    try:
        collection = get_searched_games_collection()

        try:
            limit = int(request.args.get("limit", 30))
        except (TypeError, ValueError):
            limit = 30

        limit = max(1, min(limit, 100))

        cursor = request.args.get("cursor")
        query = {}

        if cursor:
            cursor_date, cursor_app_id = decode_search_cursor(cursor)

            query = {
                "$or": [
                    {
                        "last_searched_at": {
                            "$lt": cursor_date,
                        }
                    },
                    {
                        "last_searched_at": cursor_date,
                        "app_id": {
                            "$lt": cursor_app_id,
                        },
                    },
                ]
            }

        records = list(
            collection.find(
                query,
                {"_id": 0},
            )
            .sort([
                ("last_searched_at", -1),
                ("app_id", -1),
            ])
            .limit(limit + 1)
        )

        has_more = len(records) > limit
        games = records[:limit]

        next_cursor = None

        if has_more and games:
            last_game = games[-1]

            next_cursor = encode_search_cursor(
                last_game["last_searched_at"],
                last_game["app_id"],
            )

        for game in games:
            for field in [
                "first_searched_at",
                "last_searched_at",
                "updated_at",
            ]:
                if game.get(field):
                    game[field] = game[field].isoformat()

        return jsonify({
            "success": True,
            "count": len(games),
            "games": games,
            "next_cursor": next_cursor,
            "has_more": has_more,
        })

    except ValueError as exc:
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 400

    except PyMongoError:
        logger.exception("Failed to retrieve searched games")

        return jsonify({
            "success": False,
            "error": "Unable to retrieve searched games.",
        }), 500

    except RuntimeError:
        logger.exception("Searched games collection is unavailable")

        return jsonify({
            "success": False,
            "error": "Database is not initialized.",
        }), 503

def encode_search_cursor(last_searched_at, app_id):
    cursor_data = {
        "last_searched_at": last_searched_at.isoformat(),
        "app_id": str(app_id),
    }

    raw = json.dumps(cursor_data).encode("utf-8")

    return base64.urlsafe_b64encode(raw).decode("utf-8")


def decode_search_cursor(cursor):
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("utf-8"))
        data = json.loads(raw.decode("utf-8"))

        last_searched_at = datetime.fromisoformat(
            data["last_searched_at"]
        )

        if last_searched_at.tzinfo is None:
            last_searched_at = last_searched_at.replace(
                tzinfo=timezone.utc
            )

        app_id = str(data["app_id"])

        if not app_id:
            raise ValueError("Invalid App ID in cursor.")

        return last_searched_at, app_id

    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise ValueError("Invalid pagination cursor.")



def encode_bookmark_cursor(release_date_sort, app_id):
    cursor_data = {
        "release_date_sort": release_date_sort.isoformat(),
        "app_id": str(app_id),
    }

    raw = json.dumps(cursor_data).encode("utf-8")

    return base64.urlsafe_b64encode(raw).decode("utf-8")


def decode_bookmark_cursor(cursor):
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("utf-8"))
        data = json.loads(raw.decode("utf-8"))

        release_date_sort = datetime.fromisoformat(
            data["release_date_sort"]
        )

        if release_date_sort.tzinfo is None:
            release_date_sort = release_date_sort.replace(
                tzinfo=timezone.utc
            )

        app_id = str(data["app_id"])

        if not app_id:
            raise ValueError("Invalid App ID in cursor.")

        return release_date_sort, app_id

    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise ValueError("Invalid pagination cursor.")
    
@app.route("/api/bookmarks", methods=["GET"])
def get_bookmarked_games():

    try:
        collection = get_bookmarked_games_collection()

        # Keep page size within a safe range.
        try:
            limit = int(request.args.get("limit", 30))
        except (TypeError, ValueError):
            limit = 30

        limit = max(1, min(limit, 100))

        cursor = request.args.get("cursor")

        # Backfill older bookmarks that were saved before
        # release_date_sort was introduced.
        old_games = collection.find(
            {"release_date_sort": {"$exists": False}},
            {
                "_id": 1,
                "steam_store": 1,
            },
        )

        for old_game in old_games:
            release_date_sort = get_release_date_sort_value(
                {"steam_store": old_game.get("steam_store")}
            )

            collection.update_one(
                {
                    "_id": old_game["_id"],
                    "release_date_sort": {"$exists": False},
                },
                {
                    "$set": {
                        "release_date_sort": release_date_sort,
                    }
                },
            )

        query = {}

        if cursor:
            cursor_date, cursor_app_id = decode_bookmark_cursor(cursor)

            query = {
                "$or": [
                    {
                        "release_date_sort": {
                            "$gt": cursor_date,
                        }
                    },
                    {
                        "release_date_sort": cursor_date,
                        "app_id": {
                            "$gt": cursor_app_id,
                        },
                    },
                ]
            }

        # Fetch one extra record to determine whether another page exists.
        records = list(
            collection.find(
                query,
                {"_id": 0},
            )
            .sort([
                ("release_date_sort", 1),
                ("app_id", 1),
            ])
            .limit(limit + 1)
        )

        has_more = len(records) > limit
        games = records[:limit]

        next_cursor = None

        if has_more and games:
            last_game = games[-1]

            next_cursor = encode_bookmark_cursor(
                last_game["release_date_sort"],
                last_game["app_id"],
            )

        for game in games:
            for field in [
                "bookmarked_at",
                "updated_at",
                "last_refreshed_at",
                "release_date_sort",
            ]:
                if game.get(field):
                    game[field] = game[field].isoformat()

        return jsonify({
            "success": True,
            "count": len(games),
            "games": games,
            "next_cursor": next_cursor,
            "has_more": has_more,
        })

    except ValueError as exc:
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 400

    except PyMongoError:
        logger.exception("Failed to retrieve bookmarked games")

        return jsonify({
            "success": False,
            "error": "Unable to retrieve bookmarked games.",
        }), 500

@app.route("/api/bookmarks/ids", methods=["GET"])
def get_bookmarked_game_ids():
    try:
        collection = get_bookmarked_games_collection()

        ids = [
            str(game["app_id"])
            for game in collection.find(
                {},
                {"_id": 0, "app_id": 1}
            )
            if game.get("app_id") is not None
        ]

        return jsonify({
            "success": True,
            "count": len(ids),
            "ids": ids,
        })

    except PyMongoError:
        logger.exception("Failed to retrieve bookmarked game IDs")

        return jsonify({
            "success": False,
            "error": "Unable to retrieve bookmarked game IDs.",
        }), 500

    except RuntimeError:
        logger.exception("Bookmark database is unavailable")

        return jsonify({
            "success": False,
            "error": "Bookmark database is unavailable.",
        }), 503

@app.route("/api/bookmarks/<app_id>", methods=["DELETE"])
def remove_bookmarked_game(app_id):

    try:
        app_id = normalize_app_id(app_id)

        collection = get_bookmarked_games_collection()

        result = collection.delete_one({
            "app_id": app_id,
        })

        if result.deleted_count == 0:
            return jsonify({
                "success": False,
                "error": "Bookmarked game not found.",
            }), 404

        return jsonify({
            "success": True,
            "message": "Bookmark removed successfully.",
            "app_id": app_id,
        })

    except ValueError as exc:
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 400

    except PyMongoError:
        logger.exception("Failed to remove bookmark")

        return jsonify({
            "success": False,
            "error": "Unable to remove bookmark.",
        }), 500

    
if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
    )