
import logging

from pymongo import MongoClient, ASCENDING, DESCENDING

from config import (
    MONGODB_URI,
    MONGODB_DATABASE,
    MONGODB_COLLECTION,
    MONGODB_SEARCHED_COLLECTION,
)

logger = logging.getLogger(__name__)

client = None
bookmarked_games = None
searched_games = None


def initialize_database():
    global client, bookmarked_games, searched_games

    if not MONGODB_URI:
        raise RuntimeError(
            "MONGODB_URI environment variable is not configured."
        )

    client = MongoClient(
        MONGODB_URI,
        serverSelectionTimeoutMS=5000,
    )

    client.admin.command("ping")

    database = client[MONGODB_DATABASE]

    # Existing shared bookmarks collection.
    bookmarked_games = database[MONGODB_COLLECTION]

    bookmarked_games.create_index(
        [("app_id", ASCENDING)],
        unique=True,
    )
    bookmarked_games.create_index(
        [("bookmarked_at", DESCENDING)],
    )
    bookmarked_games.create_index(
        [("game_name", "text")],
    )

    # New shared search history collection.
    searched_games = database[MONGODB_SEARCHED_COLLECTION]

    searched_games.create_index(
        [("app_id", ASCENDING)],
        unique=True,
    )
    searched_games.create_index(
        [("last_searched_at", DESCENDING)],
    )
    searched_games.create_index(
        [("game_name", "text")],
    )

    logger.info(
        "MongoDB connected successfully. "
        "Bookmarks and searched games collections initialized."
    )


def get_bookmarked_games_collection():
    if bookmarked_games is None:
        raise RuntimeError(
            "MongoDB has not been initialized."
        )

    return bookmarked_games


def get_searched_games_collection():
    if searched_games is None:
        raise RuntimeError(
            "MongoDB has not been initialized."
        )

    return searched_games
