import requests
import os
from dotenv import load_dotenv

load_dotenv(override=True)

STEAM_STORE_API = "https://store.steampowered.com/api/appdetails/"
STEAM_PLAYERS_API = (
    "https://api.steampowered.com/"
    "ISteamUserStats/GetNumberOfCurrentPlayers/v1/"
)
STEAM_REVIEWS_API = (
    "https://api.steampowered.com/"
    "IUserReviewsService/GetAppReviews/v1/"
)
STEAMSPY_API = "https://steamspy.com/api.php"

STEAMSPY_CACHE_TTL = 24 * 60 * 60
STEAMSPY_MIN_REQUEST_INTERVAL = 1.1

STEAM_PAGE_ANALYZER_API = (
    "https://www.steampageanalyzer.com/api/v1/revenue"
)

STEAM_PAGE_ANALYZER_CACHE_TTL = 24 * 60 * 60

# Conservative spacing: approximately 9 requests per minute.
STEAM_PAGE_ANALYZER_MIN_REQUEST_INTERVAL = 6.2

COUNTRY_CODE = "in"
LANGUAGE = "en"
REQUEST_TIMEOUT = 20

HEADERS = {
    "User-Agent": "RigzerSteamResearch/1.0"
}

# MongoDB Configuration
MONGODB_URI = os.getenv("MONGODB_URI")

MONGODB_DATABASE = "rigzer_steam_research"
MONGODB_COLLECTION = "bookmarked_games"
MONGODB_SEARCHED_COLLECTION = "searched_games"

session = requests.Session()
session.headers.update(HEADERS)