from config import REQUEST_TIMEOUT, STEAM_PLAYERS_API, session


def fetch_current_players(app_id):
    """
    Fetch the current concurrent player count using
    Steam's ISteamUserStats Web API.

    A missing or unsuccessful result is not treated as zero.
    """

    response = session.get(
        STEAM_PLAYERS_API,
        params={"appid": app_id},
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    payload = response.json()
    result = payload.get("response", {})

    if result.get("result") != 1:
        return {
            "available": False,
            "current_players": None,
            "reason": "Steam did not return a player count for this App ID.",
        }

    player_count = result.get("player_count")

    if player_count is None:
        return {
            "available": False,
            "current_players": None,
            "reason": "Player count was not included in the response.",
        }

    return {
        "available": True,
        "current_players": player_count,
    }