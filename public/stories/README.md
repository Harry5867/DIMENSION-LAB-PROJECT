# Stories photography

The active Stories collection uses 21 real location photographs from Wikimedia Commons, resized and converted to local WebP files. Each photograph has its original author, file page, license link and modification notice in `photo-credits.json`, the adjacent `demo-XX-credit.json` and the story details. The old original SVG illustrations are retained as historical assets and are not displayed.

The photographs document locations, not the proposed statistical findings. The 21 data questions remain clearly disclosed concept stories with no measured results. Geographic anchors reuse the existing Natural Earth capital records.

Earth texture: NASA Visible Earth / Blue Marble Next Generation, January 2004 monthly surface composite. Source: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/
Original download: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x5400x2700.jpg
Local modification: resized to 2048 × 1024 and converted to WebP. This is historical composite imagery, not a live or 2026 satellite feed. NASA media guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/

Refresh explicitly with `python scripts/fetch-story-photos.py` (Pillow required). Successful local photos/credits are cached. No remote photography or third-party API request is needed while using the website.
