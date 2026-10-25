"""content_raw.json + ручная сверка имён на фото → src/content/program.json и атласный портрет-спрайт public/speakers.jpg.
Имена на карточках-фото читаются глазами (сверено с контактным листом); итог сверяется с именами в программе: ровно 24 человека, 24 фото."""
import json, pathlib
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
raw = json.loads((ROOT / "scripts/cache/content_raw.json").read_text())

PHOTO_NAMES = ["Валерия Азбиль", "Евгений Акимов", "Александр Костин", "Андрей Черкашин", "Анна Козьменко", "Данил Бухарин",
               "Сергей Домнин", "Павел Замалаев", "Евгения Уткина", "Лариса Кобякова", "Ольга Львова", "Владимир Манухин",
               "Рустем Мифтахутдинов", "Алексей Юхнин", "Андрей Амелин", "Анастасия Хрулева", "Даниил Савченко", "Олег Ильин",
               "Игорь Шулешов", "Алексей Чирков", "Тамара Иванова", "Юрий Негрей", "Алексей Попович", "Денис Кузнецов"]
TITLES = ["Банкротство – 2026. «Комплексный» закон", "Реабилитация бизнеса в банкротстве. Почему в этот раз получится", "Банкротство граждан",
          "Актуальные проблемы", "Банкротство и продажа активов в иностранных юрисдикциях", "Работа с залогами"]
sent = lambda t: t[0] + t[1:].lower() if t else t
norm = lambda n: " ".join(sorted(n.replace("Хрулева Анастасия", "Анастасия Хрулева").split()))

people, order = {}, []
sessions = []
for i, s in enumerate(raw["sessions"]):
    sid = f"d{s['day']}s{i + 1 if s['day'] == 1 else i - 3}"
    ses = dict(id=sid, day=s["day"], start=s["start"], end=s["end"], minutes=s["minutes"], title=TITLES[i], moderators=[], speakers=[])
    for q in s["people"]:
        name = "Анастасия Хрулева" if q["name"] == "Хрулева Анастасия" else q["name"]   # на сайте порядок «Фамилия Имя», на фото «Имя Фамилия»
        P = people.setdefault(name, dict(name=name, role=q["role"], moderator=False, sessions=[], talks=[]))
        P["moderator"] |= q["moderator"]; P["sessions"].append(sid)
        if q["talk"]: P["talks"].append(dict(session=sid, title=sent(q["talk"])))
        (ses["moderators"] if q["moderator"] else ses["speakers"]).append(dict(name=name, talk=sent(q["talk"]) if q["talk"] else None))
        if name not in order: order.append(name)
    sessions.append(ses)

assert len(people) == 24, f"спикеров {len(people)}, ожидалось 24"
assert sorted(map(norm, people)) == sorted(map(norm, PHOTO_NAMES)), "имена на фото не совпали с программой"
speakers = []
for pi, n in enumerate(PHOTO_NAMES):
    speakers.append({**people[n], "id": f"sp{pi + 1:02d}", "photo": pi})

# атлас: лицо и плечи (верхняя часть карточки без подписи), серая шкала, автоконтраст; 6×4 по 256 px
T = 384; atlas = Image.new("L", (T * 6, T * 4), 0)
for i in range(24):
    im = Image.open(ROOT / f"scripts/cache/speakers/{i + 1:02d}.png").convert("RGBA")
    bg = Image.new("RGBA", im.size, (0, 0, 0, 255)); im = Image.alpha_composite(bg, im).convert("L")
    w, h = im.size
    face = im.crop((int(w * .16), int(h * .02), int(w * .84), int(h * .70))).resize((T, T), Image.LANCZOS)
    atlas.paste(ImageOps.autocontrast(face, cutoff=1), ((i % 6) * T, (i // 6) * T))
atlas.save(ROOT / "public/speakers.jpg", quality=82)

topics = ["Актуальные вопросы банкротства в России и иностранных юрисдикциях", "Практические решения и правоприменительная практика",
          "Цифровизация и новые технологии в процедурах банкротства", "Международный опыт и сотрудничество", "Нетворкинг и деловое общение"]
about_full = raw["about"].split("\n")
out = dict(
    _source="https://bankrufeast.ru/ — scripts/05_scrape_content.mjs + 06_build_program.py",
    about=dict(
        # short — сокращение для сцены, на утверждение заказчику; full — полный текст с сайта (панель по клику)
        short="С 2014 года форум собирает банки, госорганы, юристов, арбитражных управляющих и инвесторов: обсудить практику и законодательство о банкротстве, цифровизацию и международный опыт.",
        full=[l for l in about_full[1:6]], topics=topics),
    note="Программа предварительная, возможны изменения", presentations="https://disk.yandex.ru/d/tmyJ6x-2no07kg",
    sessions=sessions, speakers=speakers,
    form=dict(title="Заполните форму и станьте участником форума", fields=["Имя", "Отчество", "Фамилия", "Организация", "E-mail", "Телефон (+7)"],
              submit="Зарегистрироваться", consent="Я даю согласие на обработку персональных данных в соответствии с политикой конфиденциальности"),
)
(ROOT / "src/content/program.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("ok: speakers", len(speakers), "sessions", len(sessions), "moderators", [s["name"] for s in speakers if s["moderator"]])
for s in sessions: print(s["id"], s["start"], s["end"], s["minutes"], len(s["speakers"]), "spk,", len(s["moderators"]), "mod")
