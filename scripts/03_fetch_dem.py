"""Copernicus GLO-30 (30 м, открытый доступ AWS) → локальная сетка 15 м. Результат: scripts/cache/dem_grid.npz.
Это DSM (поверхность с постройками и мостами), не чистый рельеф; воду приводим к 0."""
import subprocess
import numpy as np
import tifffile
from scipy.ndimage import map_coordinates
from common import CACHE, ORIGIN, to_latlon

URL = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N43_00_E131_00_DEM/Copernicus_DSM_COG_10_N43_00_E131_00_DEM.tif"
TIF = CACHE / "dem_N43_E131.tif"
STEP = 15
X0, X1, Z0, Z1 = -9000, 6000, -6500, 12000  # метры от вокзала; z на юг


def main():
    if not TIF.exists():
        subprocess.run(["curl", "-s", "-o", str(TIF), URL], check=True)
    a = tifffile.imread(TIF).astype(np.float32)
    n = a.shape[0]
    xs = np.arange(X0, X1, STEP); zs = np.arange(Z0, Z1, STEP)
    X, Z = np.meshgrid(xs, zs)
    lat, lon = to_latlon(X, Z)
    # пиксель (0,0) — центр северо-западного угла тайла 44N/131E; центры пикселей на (i+0.5)/n
    r = (44 - lat) * n - 0.5
    c = (lon - 131) * n - 0.5
    h = map_coordinates(a, [r, c], order=1, mode="nearest")
    h[(lat < 43.0)] = 0  # за пределами тайла (остров Русский южнее 43.0 не нужен)
    h[h < 0.8] = 0
    np.savez_compressed(CACHE / "dem_grid.npz", h=h.astype(np.float32), x0=X0, z0=Z0, step=STEP)
    # для клиента: карта высот 30 м, Uint16 в дециметрах → сплошной рельеф в сцене
    sub = h[::2, ::2]
    (CACHE.parent.parent / "public" / "data" / "dem.bin").write_bytes(np.round(sub * 10).astype("<u2").tobytes())
    (CACHE.parent.parent / "public" / "data" / "dem.json").write_text('{"x0":%d,"z0":%d,"step":%d,"nx":%d,"nz":%d}' % (X0, Z0, STEP * 2, sub.shape[1], sub.shape[0]))
    print(h.shape, h.min(), h.max(), "water share", float((h == 0).mean()))


if __name__ == "__main__":
    main()
