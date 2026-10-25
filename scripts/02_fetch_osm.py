"""Выгрузка OSM по коридору маршрута тайлами 1.5 км. Результат: scripts/cache/osm_tiles.json (сырые элементы)."""
import json, sys
import numpy as np
from common import ROOT, CACHE, to_latlon, in_corridor, overpass, corridor_dist

TILE = 1500
HW = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"


def tiles():
    out = []
    for ix in range(-4, 3):
        for iz in range(-5, 5):  # покрывает x -6000..3000, z -7500..7500 (z на юг)
            x0, z0 = ix * TILE, iz * TILE - 1500
            c = np.array([[x0 + TILE / 2, z0 + TILE / 2], [x0, z0], [x0 + TILE, z0], [x0, z0 + TILE], [x0 + TILE, z0 + TILE]])
            if in_corridor(c, margin=0).any():
                out.append((x0, z0))
    return out


def query(x0, z0):
    n, w = to_latlon(x0, z0)
    s, e = to_latlon(x0 + TILE, z0 + TILE)
    b = f"({s:.5f},{w:.5f},{n:.5f},{e:.5f})"
    return (f'[out:json][timeout:120];(nwr["building"]{b};way["highway"~"^({HW})$"]{b};'
            f'way["man_made"~"pier|breakwater"]{b};way["railway"="rail"]{b};);out geom tags;')


def main():
    T = tiles()
    print(len(T), "tiles", flush=True)
    res = []
    for i, (x0, z0) in enumerate(T):
        els = overpass(query(x0, z0))["elements"]
        res.append({"x0": x0, "z0": z0, "elements": els})
        print(i + 1, "/", len(T), (x0, z0), len(els), flush=True)
    (CACHE / "osm_tiles.json").write_text(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()
