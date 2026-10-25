"""OSM + DEM → плоские Float32-буферы чанков 500×500 м в public/data.
Файлы: terrain.bin (точки, горизонтали), buildings.bin (точки, рёбра, заливка), lines.bin (дороги, мосты, берег, сетка воды), manifest.json.
Вершины: stride 4 float32 = x, y, z, w. Смысл w: terrain pts — 0; горизонтали — 1 для индексной (кратной 50 м), иначе 0;
здания — доля высоты 0..1 (0 основание, 1 крыша); линии — класс (0 улица, 1 магистраль, 2 мост, 3 берег, 4 вода, 5 пирс).
Порядок точек в чанке перемешан детерминированно: первые 15% и 50% дают уровни детализации 0 и 1."""
import json, math, re
from importlib import import_module
import numpy as np
import mapbox_earcut as earcut
from contourpy import contour_generator
from matplotlib.path import Path
from scipy.ndimage import gaussian_filter, map_coordinates
from common import ROOT, CACHE, to_local, in_corridor, corridor_dist, route_points

OUT = ROOT / "public" / "data"
CH = 500
rng = np.random.default_rng(20260729)
dem = np.load(CACHE / "dem_grid.npz")
H, X0, Z0, STEP = dem["h"], int(dem["x0"]), int(dem["z0"]), int(dem["step"])
_, ANCH = route_points()
ANCH_XZ = np.array([[a["x"], a["z"]] for a in ANCH.values() if "x" in a])


def ground(x, z):
    x = np.asarray(x, float); z = np.asarray(z, float)
    return map_coordinates(H, [(z - Z0) / STEP, (x - X0) / STEP], order=1, mode="nearest")


def ckey(x, z):
    return (int(math.floor(x / CH)), int(math.floor(z / CH)))


class Layer:
    """Накопитель вершин по чанкам: layer.add(chunk, section, array(N,4))."""
    def __init__(self):
        self.d = {}

    def add(self, key, sec, arr):
        if len(arr):
            self.d.setdefault(key, {}).setdefault(sec, []).append(np.asarray(arr, np.float32).reshape(-1, 4))


def write(layer, name, shuffled=()):
    buf, man, off = [], {}, 0
    for key, secs in sorted(layer.d.items()):
        entry = {}
        for sec, parts in secs.items():
            a = np.concatenate(parts)
            if sec in shuffled:
                a = a[rng.permutation(len(a))]
            entry[sec] = [off, len(a)] + ([int(len(a) * .15), int(len(a) * .5)] if sec in shuffled else [])
            buf.append(a); off += a.nbytes
        man[f"{key[0]},{key[1]}"] = entry
    (OUT / name).write_bytes(np.concatenate([b.ravel() for b in buf]).tobytes())
    return man


def terrain():
    L = Layer()
    # точки: ближняя сетка 12 м с джиттером в коридоре, дальняя 45 м в пределах 5 км от маршрута
    for step, near in ((12, True), (45, False)):
        xs = np.arange(-9000, 6000, step); zs = np.arange(-6500, 12000, step)
        X, Z = np.meshgrid(xs, zs); P = np.stack([X.ravel(), Z.ravel()], 1).astype(float)
        P += rng.uniform(-step * .45, step * .45, P.shape)
        d, hw = corridor_dist(P)
        m = (d <= hw) if near else ((d > hw) & (d <= 5000))
        P = P[m]; y = ground(P[:, 0], P[:, 1]); land = y > 0
        P, y = P[land], y[land]
        for (cx, cz), idx in group(P):
            L.add((cx, cz), "pts", np.c_[P[idx, 0], y[idx], P[idx, 1], np.zeros(len(idx))])
    # горизонтали: шаг 10 м, индексные 50 м, только в коридоре + 500 м
    Hs = gaussian_filter(H, 1.0)
    xs = X0 + np.arange(H.shape[1]) * STEP; zs = Z0 + np.arange(H.shape[0]) * STEP
    gen = contour_generator(xs, zs, Hs)
    for lev in range(10, int(Hs.max()), 10):
        for line in gen.lines(lev):
            segs(L, "con", line, lev, 1.0 if lev % 50 == 0 else 0.0, margin=500)
    return write(L, "terrain.bin", shuffled=("pts",))


def group(P):
    k = np.floor(P / CH).astype(int)
    keys, inv = np.unique(k, axis=0, return_inverse=True)
    inv = inv.ravel()
    for i, kk in enumerate(keys):
        yield (int(kk[0]), int(kk[1])), np.where(inv == i)[0]


def segs(L, sec, line, y, w, margin=200, y_is_arr=False):
    line = np.asarray(line, float)
    if len(line) < 2: return
    a, b = line[:-1], line[1:]
    mid = (a + b) / 2
    keep = in_corridor(mid, margin)
    for i in np.where(keep)[0]:
        ya, yb = (y[i], y[i + 1]) if y_is_arr else (y, y)
        L.add(ckey(*mid[i]), sec, [[a[i][0], ya, a[i][1], w], [b[i][0], yb, b[i][1], w]])


def roads():
    L = Layer()
    TR = []
    tiles = json.loads((CACHE / "osm_tiles.json").read_text())
    seen = set(); MAJOR = {"motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link", "secondary_link"}
    for t in tiles:
        for e in t["elements"]:
            tg = e.get("tags", {})
            if e["type"] != "way" or e["id"] in seen or "geometry" not in e: continue
            kind = "hw" if "highway" in tg else "pier" if "man_made" in tg else None
            if not kind: continue
            seen.add(e["id"])
            if tg.get("tunnel") in ("yes", "building_passage", "culvert"): continue
            xz = np.array([to_local(p["lat"], p["lon"]) for p in e["geometry"]])
            g = ground(xz[:, 0], xz[:, 1])
            if tg.get("bridge") in ("yes", "viaduct", "movable"):
                # настил: линейно между землёй на концах (DSM-значения на самом мосту не используем)
                s = np.r_[0, np.cumsum(np.hypot(*np.diff(xz, axis=0).T))]
                y = g[0] + (g[-1] - g[0]) * (s / max(s[-1], 1)) + 3; w = 2
            else:
                y = g + 0.4; w = 5 if kind == "pier" else (1 if tg.get("highway") in MAJOR else 0)
            segs(L, "ln", xz, y, w, y_is_arr=True)
            # для движения: ломаная в коридоре, не короче 120 м; мосты и магистрали — приоритет
            if kind == "hw" and tg.get("highway") not in ("service", "pedestrian", "living_street"):
                inside = in_corridor(xz, 150)
                if inside.sum() >= 2:
                    pts = xz[inside]; yy = np.asarray(y if np.ndim(y) else np.full(len(xz), y))[inside]
                    seg = np.hypot(*np.diff(pts, axis=0).T); Ltot = float(seg.sum())
                    if Ltot >= 120:
                        TR.append(dict(w=int(w), L=round(Ltot), p=[round(float(v), 1) for q in zip(pts[:, 0], yy, pts[:, 1]) for v in q]))
    (OUT / "traffic.json").write_text(json.dumps({"paths": TR}))
    print("traffic paths", len(TR))
    return L


def coast_and_water(L):
    m = import_module("01_resolve_anchors")
    for line in m.coast():
        segs(L, "ln", np.array(line), 0.0, 3, margin=800)
    # сетка воды: линии каждые 100 м, шаг 25 м, только над нулевой высотой
    for fixed_x in (True, False):
        for c in range(-9000 if fixed_x else -6500, 6000 if fixed_x else 12000, 100):
            t = np.arange(-6500, 12000, 25.0) if fixed_x else np.arange(-9000, 6000, 25.0)
            p = np.c_[np.full_like(t, c), t] if fixed_x else np.c_[t, np.full_like(t, c)]
            ok = in_corridor(p, 0) & (ground(p[:, 0], p[:, 1]) == 0)
            for i in np.where(ok[:-1] & ok[1:])[0]:
                L.add(ckey(*((p[i] + p[i + 1]) / 2)), "ln", [[p[i][0], 0, p[i][1], 4], [p[i + 1][0], 0, p[i + 1][1], 4]])


def num(s):
    mm = re.search(r"[\d.]+", (s or "").replace(",", "."))
    try: return float(mm.group()) if mm else None
    except ValueError: return None


def rings_of(e):
    if e["type"] == "way":
        return [e["geometry"]] if "geometry" in e else []
    return [m["geometry"] for m in e.get("members", []) if m.get("role") == "outer" and "geometry" in m]


def _bridge_lines():
    ax = json.loads((OUT / "landmark_axes.json").read_text())
    return [np.array(ax[k]["pts"]) for k in ("russky", "russky_b", "golden_main", "golden_main_b")]


def near_bridge(c, lines, r=70):
    for P in lines:
        a, b = P[:-1], P[1:]; ab = b - a; t = np.clip(((c - a) * ab).sum(1) / (ab * ab).sum(1).clip(1e-9), 0, 1)
        if np.min(np.hypot(*(c - (a + t[:, None] * ab)).T)) < r: return True
    return False


SKIP_BUILDINGS = {978105119}  # «Маяк Токаревского» — рисуется отдельной моделью, не коробкой


def buildings():
    BRIDGES = _bridge_lines()
    L = Layer(); meta = {"landmarks": {}, "stats": {}}
    tiles = json.loads((CACHE / "osm_tiles.json").read_text())
    items, seen = [], set()
    for t in tiles:
        for e in t["elements"]:
            tg = e.get("tags", {})
            if "building" not in tg or (e["type"], e["id"]) in seen or e["id"] in SKIP_BUILDINGS: continue
            seen.add((e["type"], e["id"]))
            for r in rings_of(e):
                xz = np.array([to_local(p["lat"], p["lon"]) for p in r])
                if len(xz) >= 4 and np.allclose(xz[0], xz[-1]): xz = xz[:-1]
                if len(xz) < 3: continue
                a = .5 * np.sum(xz[:, 0] * np.roll(xz[:, 1], -1) - np.roll(xz[:, 0], -1) * xz[:, 1])
                c = xz.mean(0)
                if abs(a) < 12 or not in_corridor(c[None], 0)[0]: continue
                if near_bridge(c, BRIDGES): continue       # опоры мостов в OSM нарисованы как «здания»: рисуем их своей моделью
                h = num(tg.get("height")); src = "height"
                if h is None and num(tg.get("building:levels")): h = num(tg["building:levels"]) * 3.0; src = "levels"
                items.append(dict(id=f'{e["type"]}/{e["id"]}', xz=xz, area=abs(a), c=c, h=h, src=src if h else "default", name=tg.get("name")))
    known = [b for b in items if b["h"]]
    gmean = float(np.mean([b["h"] for b in known])) if known else 9.0
    cell = {}
    for b in known: cell.setdefault((int(b["c"][0] // 500), int(b["c"][1] // 500)), []).append(b["h"])
    for b in items:
        if not b["h"]:
            v = cell.get((int(b["c"][0] // 500), int(b["c"][1] // 500)), [])
            b["h"] = float(np.mean(v)) if len(v) >= 5 else gmean; b["src"] = "district" if len(v) >= 5 else "global"
    meta["stats"] = {k: sum(1 for b in items if b["src"] == k) for k in ("height", "levels", "district", "global")}
    meta["stats"]["total"] = len(items); meta["stats"]["global_mean_h"] = round(gmean, 1)
    for b in items:
        xz, h = b["xz"], max(b["h"], 3.0)
        g = float(ground(xz[:, 0], xz[:, 1]).min()); g = max(g, 0)
        key = ckey(*b["c"])
        n = len(xz); top, bot = g + h, g
        near_anchor = np.min(np.hypot(*(ANCH_XZ - b["c"]).T)) < 300
        # рёбра
        E = []
        for i in range(n):
            p, q = xz[i], xz[(i + 1) % n]
            E += [[p[0], bot, p[1], 0], [q[0], bot, q[1], 0], [p[0], top, p[1], 1], [q[0], top, q[1], 1]]
            if n <= 16 or i % 2 == 0: E += [[p[0], bot, p[1], 0], [p[0], top, p[1], 1]]
        L.add(key, "edges", E)
        # заливка: стены + крыша
        T = []
        for i in range(n):
            p, q = xz[i], xz[(i + 1) % n]
            A, B = [p[0], bot, p[1], 0], [q[0], bot, q[1], 0]; C, D = [q[0], top, q[1], 1], [p[0], top, p[1], 1]
            T += [A, B, C, A, C, D]
        idx = earcut.triangulate_float32(xz.astype(np.float32), np.array([n], np.uint32))
        T += [[xz[j][0], top, xz[j][1], 1] for j in idx]
        L.add(key, "fill", T)
        # точки: крыша по площади + стены
        dens = (1 / 10 if near_anchor else 1 / 22)
        k = int(np.clip(b["area"] * dens, 3, 400)); path = Path(xz)
        mn, mx = xz.min(0), xz.max(0); pts = []
        for _ in range(6):
            c = rng.uniform(mn, mx, (k * 3, 2)); c = c[path.contains_points(c)]
            pts.extend(c.tolist())
            if len(pts) >= k: break
        P = [[x, top, z, 1] for x, z in pts[:k]]
        per = np.hypot(*(np.roll(xz, -1, 0) - xz).T).sum()
        kw = int(np.clip(per / (3 if near_anchor else 6) * h / (4 if near_anchor else 8), 0, 500))
        for _ in range(kw):
            i = rng.integers(n); t = rng.random(); p = xz[i] * (1 - t) + xz[(i + 1) % n] * t; f = rng.random()
            P.append([p[0], bot + f * h, p[1], f])
        L.add(key, "pts", P)
        if b["id"] == "way/256941173": meta["landmarks"]["hotel"] = dict(id=b["id"], height=round(h, 1), height_src=b["src"], ground=round(g, 1), center=b["c"].round(1).tolist())
    cand = [dict(id=b["id"], x=float(b["c"][0]), z=float(b["c"][1]), top=float(max(float(ground(*b["xz"].T).min()), 0) + max(b["h"], 3.0)), area=float(b["area"]))
            for b in items if np.hypot(*b["c"]) < 750 and b["h"] >= 14 and b["area"] >= 140]
    cand.sort(key=lambda c: c["id"])
    pick = [cand[0]]
    while len(pick) < 24 and len(pick) < len(cand):   # farthest-point sampling: равномерная раскладка, не меняется при перезагрузке
        pick.append(max(cand, key=lambda c: min(np.hypot(c["x"] - p["x"], c["z"] - p["z"]) for p in pick)))
    meta["beacons"] = pick
    man = write(L, "buildings.bin", shuffled=("pts",))
    (OUT / "buildings_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print("buildings", meta["stats"], meta["landmarks"])
    return man


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    mt = terrain(); print("terrain ok")
    L = roads(); coast_and_water(L); ml = write(L, "lines.bin"); print("lines ok")
    mb = buildings()
    (OUT / "manifest.json").write_text(json.dumps({"chunk": CH, "stride": 4, "terrain": mt, "buildings": mb, "lines": ml}))
    for f in ("terrain.bin", "buildings.bin", "lines.bin"): print(f, round((OUT / f).stat().st_size / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
