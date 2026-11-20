import logging

import requests
from flask import Flask, jsonify, render_template, request
from concurrent.futures import ThreadPoolExecutor

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

        games = list(
            collection.find(
                {},
                {"_id": 0},
            ).sort("last_searched_at", -1)
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
        })

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


@app.route("/api/bookmarks", methods=["GET"])
def get_bookmarked_games():

    try:
        collection = get_bookmarked_games_collection()

        games = list(
            collection.find(
                {},
                {"_id": 0}
            ).sort("bookmarked_at", -1)
        )

        for game in games:
            for field in [
                "bookmarked_at",
                "updated_at",
                "last_refreshed_at",
            ]:
                if game.get(field):
                    game[field] = game[field].isoformat()

        return jsonify({
            "success": True,
            "count": len(games),
            "games": games,
        })

    except PyMongoError:
        logger.exception("Failed to retrieve bookmarked games")

        return jsonify({
            "success": False,
            "error": "Unable to retrieve bookmarked games.",
        }), 500

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