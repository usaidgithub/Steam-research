import re
from urllib.parse import urlparse


def normalize_app_id(value):
    """
    Accept:
      527530
      https://store.steampowered.com/app/527530/
      https://steamdb.info/app/527530/charts/

    SteamDB URLs are accepted only to extract the App ID.
    No requests are made to SteamDB.
    """

    value = str(value).strip()

    if not value:
        raise ValueError("Enter a Steam App ID or URL.")

    if value.isdigit():
        return int(value)

    parsed = urlparse(
        value if "://" in value else "https://" + value
    )

    allowed_domains = {
        "steamdb.info",
        "www.steamdb.info",
        "store.steampowered.com",
        "www.store.steampowered.com",
    }

    if parsed.hostname not in allowed_domains:
        raise ValueError(
            "Enter a valid Steam Store URL or Steam App ID."
        )

    match = re.search(r"/app/(\d+)", parsed.path)

    if not match:
        raise ValueError("Could not find a Steam App ID in the URL.")

    return int(match.group(1))