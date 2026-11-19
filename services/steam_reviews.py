import json

from config import REQUEST_TIMEOUT, STEAM_REVIEWS_API, session


def fetch_reviews_data(app_id):
    """
    Fetch lifetime Steam review statistics.

    Uses Steam's current IUserReviewsService API.
    Only requests one review record because we need
    the summary, not individual review contents.
    """

    review_params = {
        "appid": app_id,
        "filter": 0,
        "languages": ["all"],
        "review_type": 0,
        "purchase_type": 1,
        "num_per_page": 1,
        "display_language": "english",
    }

    response = session.get(
        STEAM_REVIEWS_API,
        params={
            "input_json": json.dumps(review_params)
        },
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    payload = response.json()
    result = payload.get("response", {})
    summary = result.get("query_summary")

    if not summary:
        return {
            "available": False,
            "reason": "Steam did not return a review summary.",
        }

    return {
        "available": True,
        "review_score": summary.get("review_score"),
        "review_score_description": summary.get(
            "review_score_desc"
        ),
        "positive_reviews": summary.get("total_positive"),
        "negative_reviews": summary.get("total_negative"),
        "total_reviews": summary.get("total_reviews"),
    }