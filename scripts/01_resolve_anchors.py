"""M1. Находит якоря маршрута в OSM, пишет public/data/anchors.json и docs/anchors-preview.png.
Ничего не угадывает: для каждого якоря сохраняются все кандидаты, выбор и причина.
"""
import json, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from common import ROOT, ORIGIN, to_local, nominatim, overpass

VIEWBOX = "131.70,43.25,132.10,42.95"  # lon_min,lat_max,lon_max,lat_min

# id, поисковый запрос, ожидаемые теги/подстроки в имени
SPEC = [
    ("golden_bridge", "Золотой мост Владивосток", ["золотой мост"]),
    ("russky_bridge", "Русский мост Владивосток", ["русский мост"]),
    ("tokarevsky_lighthouse", "Токаревский маяк Владивосток", ["токарев"]),
    ("hotel", "Корабельная набережная, 10, Владивосток", ["vladivostok", "grand", "корабельная"]),
    ("station", "Железнодорожный вокзал Владивосток", ["вокзал"]),
    ("triumphal_arch", "Триумфальная арка Николая II Владивосток", ["арка", "николая"]),
    ("golden_horn", "бухта Золотой Рог Владивосток", ["золотой рог"]),
    ("eagle_nest", "Орлиное гнездо Владивосток", ["орлин"]),
]


# Явный выбор элементов OSM (проверен по списку кандидатов Nominatim и Overpass; причина в "why").
# Номинатим для моста и маяка отдаёт дорогу/улицу, а не объект, поэтому берём нужные элементы вручную.
PICK = {
    "golden_bridge": ("way", [186711507, 330254503], "основной пролёт над бухтой (две проезжие части); подходы лежат в way 161753993/186711508 и 178090098/330254502"),
    "russky_bridge": ("way", [45790339, 176906236], "две проезжие части Русского моста"),
    "tokarevsky_lighthouse": ("node", [293258283], "node «Маяк Токаревского» на конце косы (height=12 в OSM, не проверено)"),
    "triumphal_arch": ("node", [296115500], "node «Триумфальная арка»; Nominatim её не находит"),
    "hotel": ("way", [256941173], "здание Vladivostok Grand Hotel & Spa, Корабельная набережная, 10"),
    "golden_horn": ("relation", [13834223], "бухта; центр relation, не точка маршрута"),
    "eagle_nest": ("node", [414170281], "вершина сопки"),
}


def pick_osm(kind, ids):
    els = overpass(f'[out:json][timeout:60];{kind}(id:{",".join(map(str, ids))});out center tags;')["elements"]
    pts = [(e.get("center") or e) for e in els]
    return [(p["lat"], p["lon"]) for p in pts], els


def search(q):
    res = nominatim(q, viewbox=VIEWBOX, bounded=1)
    return [{"name": r.get("name") or r["display_name"].split(",")[0], "display": r["display_name"],
             "lat": float(r["lat"]), "lon": float(r["lon"]), "class": r.get("category"), "type": r.get("type"),
             "osm": f'{r["osm_type"]}/{r["osm_id"]}'} for r in res]


def main():
    anchors, report = {}, []
    for aid, q, keys in SPEC:
        cands = search(q)
        pick = next((c for c in cands if any(k in (c["name"] + c["display"]).lower() for k in keys)), None)
        a = {"query": q, "candidates": cands[:5], "status": "ok" if (pick or aid in PICK) else "NOT_FOUND"}
        if aid in PICK:
            kind, ids, why = PICK[aid]
            pts, els = pick_osm(kind, ids)
            lat = sum(p[0] for p in pts) / len(pts); lon = sum(p[1] for p in pts) / len(pts)
            pick = {"lat": lat, "lon": lon, "osm": ",".join(f"{kind}/{i}" for i in ids), "name": aid, "display": why}
            a["why"] = why
        if pick:
            a.update(lat=pick["lat"], lon=pick["lon"], osm=pick["osm"], name=pick["name"])
            a["x"], a["z"] = [round(v, 1) for v in to_local(pick["lat"], pick["lon"])]
        anchors[aid] = a
        report.append((aid, a["status"], pick and pick["display"][:90]))

    # вокзал: проверенная координата ТЗ — истина; сравниваем с OSM
    st = anchors["station"]
    st["verified_lat"], st["verified_lon"] = ORIGIN
    if st["status"] == "ok":
        st["osm_offset_m"] = round(((st["x"]) ** 2 + (st["z"]) ** 2) ** 0.5, 1)
    st.update(lat=ORIGIN[0], lon=ORIGIN[1], x=0.0, z=0.0, status="ok (verified, origin)")

    out = ROOT / "public" / "data" / "anchors.json"
    out.write_text(json.dumps({"origin": {"lat": ORIGIN[0], "lon": ORIGIN[1]}, "anchors": anchors}, ensure_ascii=False, indent=1))
    for r in report:
        print(*r, sep=" | ")
    return anchors


def coast():
    ql = '[out:json][timeout:120];(way["natural"="coastline"](42.95,131.70,43.25,132.10););out geom;'
    return [[to_local(p["lat"], p["lon"]) for p in w["geometry"]] for w in overpass(ql)["elements"] if "geometry" in w]


def bridges():
    ql = '[out:json][timeout:120];(way["bridge"]["name"~"Золотой мост|Русский мост"](42.95,131.70,43.25,132.10););out geom;'
    return [[to_local(p["lat"], p["lon"]) for p in w["geometry"]] for w in overpass(ql)["elements"] if "geometry" in w]


def preview(anchors):
    fig, axes = plt.subplots(1, 2, figsize=(20, 11), facecolor="#07090b", gridspec_kw={"width_ratios": [1, 1]})
    views = [("whole route", (-4800, 3800), (-6800, 1800)), ("centre (zoom)", (-1600, 2400), (-2200, 1600))]
    coast_l, br_l = coast(), bridges()
    order = [k for k in ["russky_bridge", "golden_bridge", "station", "tokarevsky_lighthouse", "hotel"] if "x" in anchors[k]]
    for ax, (title, xl, yl) in zip(axes, views):
        ax.set_facecolor("#07090b")
        for line in coast_l:
            xs, zs = zip(*line); ax.plot(xs, [-z for z in zs], color="#9aa7ad", lw=0.8)
        for line in br_l:
            xs, zs = zip(*line); ax.plot(xs, [-z for z in zs], color="#e8eef0", lw=1.8)
        ax.plot([anchors[k]["x"] for k in order], [-anchors[k]["z"] for k in order], color="#21a038", lw=1, ls="--", alpha=.7)
        for aid, a in anchors.items():
            if "x" not in a or not (xl[0] < a["x"] < xl[1] and yl[0] < -a["z"] < yl[1]):
                continue
            ax.scatter(a["x"], -a["z"], s=40, color="#21a038", zorder=5)
            n = f"{order.index(aid) + 1}. " if aid in order else ""
            ax.annotate(f'{n}{aid}\n{a["lat"]:.4f}, {a["lon"]:.4f}', (a["x"], -a["z"]), xytext=(8, 6), textcoords="offset points", color="#e8eef0", fontsize=8)
        ax.set_xlim(*xl); ax.set_ylim(*yl); ax.set_aspect("equal"); ax.grid(color="#e8eef0", alpha=.08)
        ax.tick_params(colors="#9aa7ad"); [sp.set_color("#333") for sp in ax.spines.values()]
        ax.set_title(f"{title}: metres from station, north up; dashed = stop order (route order 1-5)", color="#e8eef0", fontsize=10)
    fig.tight_layout()
    fig.savefig(ROOT / "docs" / "anchors-preview.png", dpi=90, facecolor=fig.get_facecolor())


if __name__ == "__main__":
    a = main()
    preview(a)
