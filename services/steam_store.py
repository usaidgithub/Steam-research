from config import (
    COUNTRY_CODE,
    LANGUAGE,
    REQUEST_TIMEOUT,
    STEAM_STORE_API,
    session,
)


def fetch_store_data(app_id):
    """
    Fetch metadata from the Steam-operated Store endpoint.

    This endpoint is not the documented Steamworks Web API.
    Its availability and returned fields are not guaranteed.
    """

    params = {
        "appids": app_id,
        "cc": COUNTRY_CODE,
        "l": LANGUAGE,
    }

    response = session.get(
        STEAM_STORE_API,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    payload = response.json()
    app_result = payload.get(str(app_id), {})

    if not app_result.get("success"):
        return {
            "available": False,
            "reason": "Steam Store has no available details for this App ID.",
        }

    data = app_result.get("data", {})

    price = data.get("price_overview")

    price_data = None

    if price:
        price_data = {
            "currency": price.get("currency"),
            "initial": price.get("initial"),
            "final": price.get("final"),
            "discount_percent": price.get("discount_percent"),
            "initial_formatted": price.get("initial_formatted"),
            "final_formatted": price.get("final_formatted"),
        }

    screenshots = [
        item.get("path_full")
        for item in data.get("screenshots", [])
        if item.get("path_full")
    ]

    return {
        "available": True,
        "name": data.get("name"),
        "type": data.get("type"),
        "is_free": data.get("is_free"),
        "short_description": data.get("short_description"),
        "detailed_description": data.get("detailed_description"),
        "developers": data.get("developers", []),
        "publishers": data.get("publishers", []),
        "website": data.get("website"),
        "release_date": data.get("release_date", {}),
        "platforms": data.get("platforms", {}),
        "genres": data.get("genres", []),
        "categories": data.get("categories", []),
        "supported_languages": data.get("supported_languages"),
        "price": price_data,
        "header_image": data.get("header_image"),
        "capsule_image": data.get("capsule_image"),
        "background": data.get("background"),
        "screenshots": screenshots,
        "movies": data.get("movies", []),
        "recommendations": data.get("recommendations", {}),
        "achievements": data.get("achievements", {}),
        "dlc": data.get("dlc", []),
        "content_descriptors": data.get(
            "content_descriptors", {}
        ),
        "metacritic": data.get("metacritic", {}),
    }