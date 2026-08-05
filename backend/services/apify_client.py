from apify_client import ApifyClient
from config import settings


def run_google_maps(suchbegriff: str, limit: int) -> list[dict]:
    client = ApifyClient(settings.APIFY_API_TOKEN)
    run = client.actor("compass/crawler-google-places").call(
        run_input={
            "searchStringsArray": [suchbegriff],
            "maxCrawledPlacesPerSearch": limit,
            "language": "de",
            "countryCode": "ch",
        }
    )
    return list(client.dataset(run.default_dataset_id).iterate_items())
