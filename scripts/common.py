"""Общее для скриптов данных: проекция, кэшируемые HTTP-запросы к Nominatim и Overpass."""
import hashlib, json, math, pathlib, time
import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / "cache"
CACHE.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "bankrufeast-demo/0.1 (stas.r.d87@gmail.com)"}

# Начало координат: ЖД-вокзал (проверено, tripster.ru)
ORIGIN = (43.111251, 131.881595)
_KX = 111320 * math.cos(math.radians(ORIGIN[0]))
_KY = 110574


def to_local(lat, lon):
    """x на восток, z на юг, метры."""
    return ((lon - ORIGIN[1]) * _KX, -(lat - ORIGIN[0]) * _KY)


def _cached(key, fn):
    p = CACHE / (hashlib.sha1(key.encode()).hexdigest()[:16] + ".json")
    if p.exists():
        return json.loads(p.read_text())
    data = fn()
    p.write_text(json.dumps(data, ensure_ascii=False))
    return data


def nominatim(q, **params):
    def go():
        time.sleep(1.1)  # правила использования: ≤1 запрос/с
        r = requests.get("https://nominatim.openstreetmap.org/search", headers=UA, timeout=40,
                         params={"q": q, "format": "jsonv2", "limit": 8, "accept-language": "ru", **params})
        r.raise_for_status()
        return r.json()
    return _cached("nom|" + q + json.dumps(params, sort_keys=True), go)


OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def overpass(ql):
    def go():
        last = None
        for attempt in range(5):  # Overpass часто отвечает 504/429: повторяем с паузой
            for url in OVERPASS:
                try:
                    r = requests.post(url, data={"data": ql}, headers=UA, timeout=180)
                    r.raise_for_status()
                    return r.json()
                except Exception as e:  # noqa: BLE001
                    last = e
            time.sleep(10 * (attempt + 1))
        raise last
    return _cached("op|" + ql, go)


# ---------- коридор сцены ----------
import numpy as np

STOP_ORDER = ["russky_bridge", "golden_bridge", "station", "tokarevsky_lighthouse", "hotel"]


def route_points():
    d = json.loads((ROOT / "public" / "data" / "anchors.json").read_text())["anchors"]
    return np.array([[d[k]["x"], d[k]["z"]] for k in STOP_ORDER]), d


def corridor_halfwidth(dist_to_anchor):
    """1000 м вдоль маршрута, до 1500 м у остановок (раздел 4.5, стартовые значения)."""
    return 1000 + 500 * np.clip(1 - dist_to_anchor / 1500, 0, 1)


def corridor_dist(xz):
    """Возвращает (расстояние до ломаной маршрута, допустимая полуширина) для массива точек (N,2)."""
    P, _ = route_points()
    xz = np.asarray(xz, dtype=np.float64)
    best = np.full(len(xz), np.inf)
    for a, b in zip(P[:-1], P[1:]):
        ab = b - a
        t = np.clip(((xz - a) @ ab) / (ab @ ab), 0, 1)
        proj = a + t[:, None] * ab
        best = np.minimum(best, np.hypot(*(xz - proj).T))
    da = np.min([np.hypot(*(xz - p).T) for p in P], axis=0)
    return best, corridor_halfwidth(da)


def in_corridor(xz, margin=0.0):
    d, hw = corridor_dist(xz)
    return d <= hw + margin


def to_latlon(x, z):
    return (ORIGIN[0] - z / _KY, ORIGIN[1] + x / _KX)
