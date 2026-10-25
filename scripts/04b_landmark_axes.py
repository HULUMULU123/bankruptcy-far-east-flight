"""Оси мостов, контур отеля и коса маяка из OSM → public/data/landmark_axes.json.
Для мостов замеряем длину участка над водой (DEM == 0) — проверка против ТЗ (Русский: пролёт 1104 м)."""
import json
import numpy as np
from scipy.ndimage import map_coordinates
from common import ROOT, CACHE, to_local, overpass

dem = np.load(CACHE / "dem_grid.npz")
H, X0, Z0, S = dem["h"], int(dem["x0"]), int(dem["z0"]), int(dem["step"])
g = lambda x, z: map_coordinates(H, [(np.asarray(z) - Z0) / S, (np.asarray(x) - X0) / S], order=1, mode="nearest")


def ways(ids):
    els = overpass(f'[out:json][timeout:60];way(id:{",".join(map(str, ids))});out geom tags;')["elements"]
    return {e["id"]: np.array([to_local(p["lat"], p["lon"]) for p in e["geometry"]]) for e in els}


def chain(lines):
    """Склеивает ломаные в одну по ближайшим концам, возвращает (N,2)."""
    lines = [l for l in lines]
    out = lines.pop(0)
    while lines:
        best = min(((np.hypot(*(out[-1] - l[0])), i, False) for i, l in enumerate(lines)), default=None)
        alt = min(((np.hypot(*(out[-1] - l[-1])), i, True) for i, l in enumerate(lines)))
        d, i, rev = min(best, alt)
        l = lines.pop(i)
        out = np.vstack([out, l[::-1] if rev else l])
    return out


def axis(ids):
    L = ways(ids)
    return chain(list(L.values()))


def water_section(P):
    s = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    # плотная пересэмплировка
    t = np.arange(0, s[-1], 5.0)
    xz = np.c_[np.interp(t, s, P[:, 0]), np.interp(t, s, P[:, 1])]
    w = g(xz[:, 0], xz[:, 1]) == 0
    idx = np.where(w)[0]
    return xz, t, (idx[0], idx[-1]) if len(idx) else None


out = {}
# Русский мост: две проезжие части — берём ту, что длиннее; ось по ней
for name, ids in {"russky": [45790339], "russky_b": [176906236], "golden_main": [186711507], "golden_main_b": [330254503],
                  "golden_n": [161753993], "golden_n2": [186711508], "golden_s": [178090098], "golden_s2": [330254502]}.items():
    P = axis(ids)
    xz, t, sec = water_section(P)
    out[name] = {"ids": ids, "pts": np.round(P, 1).tolist(), "length_m": round(float(t[-1]), 1),
                 "water_m": round(float(t[sec[1]] - t[sec[0]]), 1) if sec else 0,
                 "water_from": xz[sec[0]].round(1).tolist() if sec else None, "water_to": xz[sec[1]].round(1).tolist() if sec else None}
    print(name, out[name]["length_m"], "m total;", out[name]["water_m"], "m over water")

hotel = ways([256941173])[256941173]
out["hotel_ring"] = np.round(hotel, 1).tolist()
# коса: ось от основания к маяку по береговой линии не определяем; фиксируем маяк и основание косы по OSM-улице (замер длины)
street = axis([469003504, 469002964, 1191762555])
out["tokarev_street"] = np.round(street, 1).tolist()
print("hotel ring pts", len(hotel), "tokarev street length", round(float(np.hypot(*np.diff(street, axis=0).T).sum())))
(ROOT / "public" / "data" / "landmark_axes.json").write_text(json.dumps(out))
