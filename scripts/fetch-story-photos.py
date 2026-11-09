"""Refresh local location photographs and their original Wikimedia credits.

Run explicitly; never downloads assets at application runtime. Requires Pillow.
"""
import concurrent.futures
import html
import io
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
HEADERS = {'User-Agent': 'DimensionLab/1.0 (educational data-exploration website; local asset preparation)'}

def fetch(url):
    for attempt in range(4):
        try:
            time.sleep(1)
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=40) as response:
                return response.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(12 * (attempt + 1))

def api(**params):
    return json.loads(fetch('https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', **params})))['query']['pages']

def plain(value):
    return html.unescape(re.sub('<[^>]+>', '', value)).strip()

def photo(story):
    cache = ROOT / 'public/stories' / (story['id'] + '-credit.json')
    if cache.exists() and (ROOT / 'public/stories' / (story['id'] + '.webp')).exists():
        story.update(json.loads(cache.read_text(encoding='utf-8')))
        return story
    title = {'Singapore': 'Downtown Core'}.get(story['city'], story['city'])
    page = next(iter(api(titles=title, prop='pageimages', piprop='name|thumbnail', pithumbsize=640, redirects=1).values()))
    filename = page['pageimage']
    info = next(iter(api(titles='File:' + filename, prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=640).values()))['imageinfo'][0]
    metadata = info['extmetadata']
    license_name = plain(metadata.get('LicenseShortName', {}).get('value', ''))
    license_url = metadata.get('LicenseUrl', {}).get('value', '')
    license_url = license_url.replace('http://', 'https://', 1)
    if license_url.startswith('//'):
        license_url = 'https:' + license_url
    if not license_url and license_name == 'CC0':
        license_url = 'https://creativecommons.org/publicdomain/zero/1.0/'
    if not license_url and license_name in ('Public domain', 'PD'):
        license_url = 'https://commons.wikimedia.org/wiki/Commons:Public_domain'
    if not license_url.startswith('https://') or not re.search(r'CC|Public domain|PD', license_name):
        raise ValueError(f'Unverified reusable license for {title}: {license_name}')
    image = Image.open(io.BytesIO(fetch(info.get('thumburl', info['url'])))).convert('RGB')
    image.thumbnail((720, 480))
    path = ROOT / 'public' / 'stories' / (story['id'] + '.webp')
    image.save(path, 'WEBP', quality=81, method=6)
    story['imageUrl'] = 'stories/' + path.name
    story['imageAlt'] = f"Photograph of {story['city']}, {story['country']}; location imagery for a conceptual data story."
    story['photo'] = {
        'author': plain(metadata.get('Artist', {}).get('value', 'Wikimedia Commons contributor')),
        'title': filename,
        'url': info['descriptionurl'],
        'license': license_name,
        'licenseUrl': license_url,
        'changes': 'Resized and converted to WebP; thumbnails cropped by the interface.',
    }
    cache.write_text(json.dumps({key: story[key] for key in ('imageUrl', 'imageAlt', 'photo')}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(story['id'], title.encode('ascii', 'backslashreplace').decode(), license_name, path.stat().st_size, flush=True)
    return story

if __name__ == '__main__':
    collection = ROOT / 'src' / 'data' / 'stories-demo.json'
    stories = json.loads(collection.read_text(encoding='utf-8'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        updated = list(pool.map(photo, stories))
    collection.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    credits = [{'asset': story['imageUrl'], **story['photo']} for story in updated]
    (ROOT / 'public/stories/photo-credits.json').write_text(json.dumps(credits, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    texture_url = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x5400x2700.jpg'
    earth = Image.open(io.BytesIO(fetch(texture_url))).convert('RGB').resize((2048, 1024), Image.Resampling.LANCZOS)
    earth.save(ROOT / 'public/stories/earth-blue-marble.webp', 'WEBP', quality=86, method=6)
    print('NASA Blue Marble texture saved (2048 x 1024)', flush=True)
