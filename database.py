
import logging

from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import PyMongoError

from config import (
    MONGODB_URI,
    MONGODB_DATABASE,
    MONGODB_COLLECTION,
)

logger = logging.getLogger(__name__)

client = None
bookmarked_games = None


def initialize_database():
    global client, bookmarked_games

    if not MONGODB_URI:
        raise RuntimeError(
            "MONGODB_URI environment variable is not configured."
        )

    client = MongoClient(
        MONGODB_URI,
        serverSelectionTimeoutMS=5000,
    )

    # Verify that MongoDB is reachable.
    client.admin.command("ping")

    database = client[MONGODB_DATABASE]

    bookmarked_games = database[MONGODB_COLLECTION]

    # One document per Steam App ID.
    bookmarked_games.create_index(
        [("app_id", ASCENDING)],
        unique=True,
    )

    # Recently bookmarked games first.
    bookmarked_games.create_index(
        [("bookmarked_at", DESCENDING)],
    )

    # Search games by name.
    bookmarked_games.create_index(
        [("game_name", "text")],
    )

    logger.info("MongoDB connected successfully.")


def get_bookmarked_games_collection():
    if bookmarked_games is None:
        raise RuntimeError(
            "MongoDB has not been initialized."
        )

    return bookmarked_games
