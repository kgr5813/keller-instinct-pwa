#!/usr/bin/env python3
"""
init_db.py — Initialize the Keller Instinct SQLite database.
Run once to create the schema and seed with existing recipes.
"""

import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "keller_instinct.db")


def init():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # ------------------------------------------------------------------ schema
    c.executescript("""
    CREATE TABLE IF NOT EXISTS recipes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'want_to_try'
                        CHECK(status IN ('repertoire','want_to_try','retired')),
        days        TEXT NOT NULL DEFAULT 'any'
                        CHECK(days IN ('any','weekday','weekend','friday')),
        cuisine     TEXT,
        protein     TEXT,   -- JSON array e.g. '["chicken","pork"]'
        time_min    INTEGER,
        source      TEXT,
        source_url  TEXT,
        last_made   TEXT,   -- ISO date YYYY-MM-DD
        notes       TEXT,
        created_at  TEXT DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS ingredients (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id       INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        quantity        TEXT,           -- e.g. "400g", "2 stk", "1 boks"
        unit            TEXT,           -- e.g. "g", "ml", "stk", "ss", "ts"
        is_pantry_staple INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS steps (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        instruction TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        date        TEXT NOT NULL DEFAULT (date('now')),
        comment     TEXT,
        rating      INTEGER CHECK(rating BETWEEN 1 AND 5)
    );

    CREATE TABLE IF NOT EXISTS preferences (
        id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
        servings_adults             INTEGER NOT NULL DEFAULT 2,
        servings_children           INTEGER NOT NULL DEFAULT 3,
        max_meat_per_week           INTEGER NOT NULL DEFAULT 4,
        max_beef_per_week           INTEGER NOT NULL DEFAULT 1,
        min_legumes_per_week        INTEGER NOT NULL DEFAULT 2,
        min_leafy_greens_per_week   INTEGER NOT NULL DEFAULT 2,
        min_fish_per_week           INTEGER NOT NULL DEFAULT 1,
        avoid_ingredients           TEXT    NOT NULL DEFAULT '[]',
        max_time_mon                INTEGER NOT NULL DEFAULT 30,
        max_time_tue                INTEGER NOT NULL DEFAULT 30,
        max_time_wed                INTEGER NOT NULL DEFAULT 60,
        max_time_thu                INTEGER NOT NULL DEFAULT 60,
        max_time_fri                INTEGER NOT NULL DEFAULT 60,
        max_time_sat                INTEGER NOT NULL DEFAULT 90,
        max_time_sun                INTEGER NOT NULL DEFAULT 90
    );

    CREATE INDEX IF NOT EXISTS idx_recipes_status  ON recipes(status);
    CREATE INDEX IF NOT EXISTS idx_recipes_days    ON recipes(days);
    CREATE INDEX IF NOT EXISTS idx_ingredients_rid ON ingredients(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_steps_rid       ON steps(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_rid    ON feedback(recipe_id);
    """)

    # ---------------------------------------------------------- seed preferences
    c.execute("""
        INSERT OR IGNORE INTO preferences (id, avoid_ingredients)
        VALUES (1, '["scampi", "salmon"]')
    """)

    # ------------------------------------------------------------ seed recipes
    RECIPES = [
        # --- Repertoire ---
        {
            "name": "Pasta med tomatsaus og salsiccia",
            "status": "repertoire", "days": "weekday",
            "cuisine": "italian", "protein": json.dumps(["pork"]),
            "time_min": 30, "source": "Repertoire",
            "ingredients": [
                ("salsiccia", "2 stk", "stk", 0),
                ("hermetiske tomater", "1 boks", "boks", 1),
                ("pasta", "400g", "g", 1),
                ("hvitløk", "2 fedd", "fedd", 1),
                ("løk", "1 stk", "stk", 1),
                ("chiliflak", "1 ts", "ts", 1),
                ("olivenolje", "2 ss", "ss", 1),
            ],
            "steps": [
                "Brun salsiccia i biter i olivenolje.",
                "Tilsett løk og hvitløk, stek til mykt.",
                "Ha i tomater og chili, la putre 15 min.",
                "Kok pasta og bland med sausen.",
            ],
        },
        {
            "name": "Pasta med flesk og grønne blader",
            "status": "repertoire", "days": "weekday",
            "cuisine": "italian", "protein": json.dumps(["pork"]),
            "time_min": 30, "source": "Repertoire",
            "ingredients": [
                ("stekeflesk", "200g", "g", 0),
                ("grønnkål eller spinat", "2 never", None, 0),
                ("pasta", "400g", "g", 1),
                ("hvitløk", "3 fedd", "fedd", 1),
                ("olivenolje", "2 ss", "ss", 1),
                ("parmesan", "til servering", None, 0),
            ],
            "steps": [
                "Stek flesk til sprøtt, sett til side.",
                "Stek hvitløk i fettet, tilsett grønne blader.",
                "Kok pasta, bland alt og topp med parmesan.",
            ],
        },
        {
            "name": "Tomatsuppe med makaroni og egg",
            "status": "repertoire", "days": "weekday",
            "cuisine": "other", "protein": json.dumps(["egg"]),
            "time_min": 40, "source": "Repertoire",
            "ingredients": [
                ("hermetiske tomater", "2 bokser", "bokser", 1),
                ("kylling- eller grønnsakskraft", "6 dl", "dl", 1),
                ("makaroni", "200g", "g", 0),
                ("egg", "5 stk", "stk", 0),
                ("løk", "1 stk", "stk", 1),
                ("hvitløk", "2 fedd", "fedd", 1),
                ("tomatpuré", "1-2 ss", "ss", 1),
                ("røkt paprikapulver", "1 ts", "ts", 1),
                ("oregano", "1 ts", "ts", 1),
                ("timian", "1 ts", "ts", 1),
            ],
            "steps": [
                "Stek løk og hvitløk i smør til myk.",
                "Tilsett tomatpuré og mel, rør godt.",
                "Ha i tomater, kraft og krydder. Putre 20 min.",
                "Blend jevn. Kok makaroni og hardkok egg separat.",
                "Server med makaroni, egg og evt krutonger.",
            ],
        },
        {
            "name": "Kikertgryte med kokos og tomat",
            "status": "repertoire", "days": "weekday",
            "cuisine": "indian", "protein": json.dumps(["vegetarian"]),
            "time_min": 40, "source": "Repertoire",
            "ingredients": [
                ("kikerter", "2 bokser", "bokser", 0),
                ("kokosmelk", "1 boks", "boks", 0),
                ("hermetiske tomater", "1 boks", "boks", 1),
                ("løk", "1 stk", "stk", 1),
                ("hvitløk", "3 fedd", "fedd", 1),
                ("ingefær fersk", "2 cm", None, 0),
                ("karri", "2 ts", "ts", 1),
                ("gurkemeie", "1 ts", "ts", 1),
                ("spinat", "2 never", None, 0),
                ("ris", "til servering", None, 1),
            ],
            "steps": [
                "Stek løk, hvitløk og ingefær til myk.",
                "Tilsett krydder, rør 1 min.",
                "Ha i tomater, kokosmelk og kikerter. Putre 20 min.",
                "Tilsett spinat til slutt. Server med ris.",
            ],
        },
        {
            "name": "Fiskeboller i gul saus",
            "status": "repertoire", "days": "weekday",
            "cuisine": "scandinavian", "protein": json.dumps(["fish"]),
            "time_min": 45, "source": "Repertoire",
            "ingredients": [
                ("fiskeboller", "1 boks", "boks", 0),
                ("melk", "6 dl", "dl", 1),
                ("poteter", "500g", "g", 0),
                ("gulrøtter", "2 stk", "stk", 0),
                ("erter eller grønnkål", "1 neve", None, 0),
                ("garam masala eller karri", "1 ss", "ss", 0),
                ("gurkemeie", "1 ts", "ts", 1),
                ("løk", "1/2 stk", "stk", 1),
                ("smør", "1 ss", "ss", 1),
            ],
            "steps": [
                "Kok poteter og gulrøtter til møre.",
                "Stek løk i smør, tilsett krydder.",
                "Hell i melk litt etter litt, rør til jevn saus.",
                "Tilsett fiskeboller, varm gjennom. Tilsett erter/grønnkål til slutt.",
            ],
        },
        {
            "name": "Fläskpannkaka med grönkål, äpple och brynt smör",
            "status": "repertoire", "days": "any",
            "cuisine": "scandinavian", "protein": json.dumps(["pork", "egg"]),
            "time_min": 40,
            "source": "Stefan Ekengren, Köket.se",
            "ingredients": [
                ("egg", "4 stk", "stk", 1),
                ("hvetemel", "4 dl", "dl", 1),
                ("melk", "8 dl", "dl", 1),
                ("stekeflesk", "250g", "g", 0),
                ("røde epler", "2 stk", "stk", 0),
                ("grønnkål", "4 blader", None, 0),
                ("smør", "60g", "g", 1),
                ("frosne tyttebær", "3 dl", "dl", 0),
                ("sukker", "1.5 dl", "dl", 1),
            ],
            "steps": [
                "Rør tyttebær og sukker, la stå i romtemperatur.",
                "Sett ovn på 200°C.",
                "Visp egg, mel og melk til røre.",
                "Stek flesk, legg i ildfast form. Hell røre over, stek 25-30 min.",
                "Fres epler og grønnkål i brunet smør.",
                "Server pannekake med tyttebær og eplefres.",
            ],
        },
        {
            "name": "Kinanudler",
            "status": "repertoire", "days": "any",
            "cuisine": "asian", "protein": json.dumps(["egg"]),
            "time_min": 30,
            "source": "Woks of Life (tilpasset)",
            "ingredients": [
                ("kinesiske hvite nudler", "450g", "g", 0),
                ("vårløk", "8 stk", "stk", 0),
                ("nøytral olje", "80 ml", "ml", 1),
                ("mørk soyasaus", "3 ss", "ss", 1),
                ("lys soyasaus", "3 ss", "ss", 1),
                ("gulrot", "1 stk", "stk", 0),
                ("sopp", "100g", "g", 0),
                ("fersk spinat", "2 never", None, 0),
                ("egg", "1-2 per person", None, 1),
                ("sesamolje", "noen dråper", None, 1),
            ],
            "steps": [
                "Fres vårløk sakte i olje til gyllen. Ta ut.",
                "Tilsett soyasauser og sukker i oljen, putre 2 min.",
                "Wok gulrot, sopp på høy varme. Tilsett spinat.",
                "Kok nudler, vend i saus med grønnsaker.",
                "Server toppet med stekt vårløk og egg.",
            ],
        },
        {
            "name": "Fredagstaco med lam og tørkede chilier",
            "status": "repertoire", "days": "friday",
            "cuisine": "mexican", "protein": json.dumps(["lamb"]),
            "time_min": 30,
            "source": "En Grønsberg-klassiker",
            "notes": "Klassiker!",
            "ingredients": [
                ("lammekjøttdeig", "400g", "g", 0),
                ("spisspaprika", "2 stk", "stk", 0),
                ("svarte bønner", "1 boks", "boks", 0),
                ("tørkede chilier (guajillo/ancho/pasilla)", "1-3 stk", "stk", 0),
                ("sjalottløk", "1 stk", "stk", 0),
                ("hvitløk", "3 fedd", "fedd", 1),
                ("rødløk", "1/4 stk", "stk", 0),
                ("gulrot revet", "1-2 stk", "stk", 0),
                ("lime", "1 stk", "stk", 0),
                ("tortillalefser", "1 pakke", None, 0),
                ("rømme", "til servering", None, 0),
                ("revet cheddar", "til servering", None, 0),
                ("agurk", "til servering", None, 0),
                ("tomat", "til servering", None, 0),
            ],
            "steps": [
                "Bland rødløk, revet gulrot, limesaft og salt. Sett til side.",
                "Stek paprika på høy varme til brunet. Sett til side.",
                "Bløtlegg tørkede chilier i varmt vann 10 min, hakk fint.",
                "Brun lammekjøttdeig. Tilsett sjalottløk, hvitløk og krydder.",
                "Tilsett bønner, chili og paprika. Putre 10-15 min.",
                "Server med varme lefser og tilbehør.",
            ],
        },
        # --- Want to Try ---
        {
            "name": "Stir-Fried Pork with Ginger Sauce (Buta Shogayaki)",
            "status": "want_to_try", "days": "weekday",
            "cuisine": "japanese", "protein": json.dumps(["pork"]),
            "time_min": 45,
            "source": "Japaneasy av Tim Anderson, s. 114",
            "ingredients": [
                ("svinebuk uten svor", "400g", "g", 0),
                ("fersk ingefær", "60g", "g", 0),
                ("soyasaus", "6 ss", "ss", 1),
                ("mirin", "6 ss", "ss", 0),
                ("sake", "4 ss", "ss", 0),
                ("ketchup", "1 ss", "ss", 0),
                ("sesamolje", "1 ss", "ss", 1),
                ("bønnespirer", "150g", "g", 0),
                ("hodekål", "1/2 stk", "stk", 0),
                ("vårløk", "2 stk", "stk", 0),
                ("sesamfrø", "til pynt", None, 0),
            ],
            "steps": [
                "Legg svinebuk i fryseren 30-45 min, skjær i tynne skiver.",
                "Blend ingefær, soyasaus, mirin, sake, ketchup og sesamolje til saus.",
                "Wok svinekjøtt og kål 3-4 min på høy varme.",
                "Tilsett bønnespirer og saus, rør til alt er dekket.",
                "Server med ris, toppet med vårløk og sesamfrø.",
            ],
        },
        {
            "name": "Crispy Halloumi with Tomatoes and White Beans",
            "status": "want_to_try", "days": "any",
            "cuisine": "other", "protein": json.dumps(["vegetarian"]),
            "time_min": 30,
            "source": "NYT Cooking, by Nargisse Benkabbou",
            "ingredients": [
                ("kirsebærtomater", "455g", "g", 0),
                ("hvitløk", "2 fedd", "fedd", 1),
                ("cannellini- eller navy beans", "1 boks", "boks", 0),
                ("halloumi", "225g", "g", 0),
                ("honning", "1 ts", "ts", 1),
                ("tørket oregano eller timian", "1/2 ts", "ts", 1),
                ("persille", "1 ss", "ss", 0),
                ("sitron", "1/2 stk", "stk", 0),
                ("olivenolje", "2 ss", "ss", 1),
            ],
            "steps": [
                "Sett broiler på høy.",
                "Stek tomater, hvitløk, persille, honning og oregano i olivenolje 10 min.",
                "Tilsett bønner, varm gjennom 3 min.",
                "Legg halloumiskiver på toppen, sett i ovnen under grill 5 min.",
                "Drypp med olivenolje, honning og sitron. Server med brød.",
            ],
        },
        {
            "name": "Red Lentil Soup",
            "status": "want_to_try", "days": "weekday",
            "cuisine": "other", "protein": json.dumps(["vegetarian"]),
            "time_min": 45,
            "source": "NYT Cooking, by Melissa Clark",
            "ingredients": [
                ("røde linser", "200g", "g", 0),
                ("løk", "1 stk", "stk", 1),
                ("hvitløk", "2 fedd", "fedd", 1),
                ("tomatpuré", "1 ss", "ss", 1),
                ("spisskummen", "1 ts", "ts", 1),
                ("kylling- eller grønnsakskraft", "945 ml", "ml", 1),
                ("gulrot", "1 stk", "stk", 0),
                ("sitron", "1/2 stk", "stk", 0),
                ("fersk koriander", "3 ss", "ss", 0),
                ("chili eller cayennepepper", "litt", None, 1),
            ],
            "steps": [
                "Stek løk og hvitløk i olivenolje til gyllen, 4 min.",
                "Tilsett tomatpuré, spisskummen og chili, stek 2 min.",
                "Ha i kraft, 475 ml vann, linser og gulrot. Putre 30 min.",
                "Blend halvparten av suppen, bland tilbake.",
                "Rør inn sitronsaft og koriander. Server med olivenolje.",
            ],
        },
        {
            "name": "Braised White Beans and Greens With Parmesan",
            "status": "want_to_try", "days": "weekday",
            "cuisine": "italian", "protein": json.dumps(["vegetarian"]),
            "time_min": 30,
            "source": "NYT Cooking, by Lidey Heuck",
            "ingredients": [
                ("cannellini beans", "2 bokser", "bokser", 0),
                ("escarole, grønnkål eller mangold", "285-340g", "g", 0),
                ("fennikel", "1 liten", None, 0),
                ("gul løk", "1 liten", None, 0),
                ("hvitløk", "5 fedd", "fedd", 1),
                ("fersk rosmarin eller timian", "2 ts", "ts", 0),
                ("grønnsaks- eller kyllingkraft", "475 ml", "ml", 1),
                ("sitron", "1 ss saft", "ss", 0),
                ("parmesan eller pecorino", "3 ss", "ss", 0),
                ("chiliflak", "1/4 ts", "ts", 1),
            ],
            "steps": [
                "Stek fennikel, løk og rosmarin 4-6 min. Tilsett hvitløk og chili.",
                "Tilsett grønne blader i omganger til de faller sammen.",
                "Ha i bønner og kraft, kok opp, la tykne 6-8 min.",
                "Rør inn sitronsaft og ost. Server med ristet brød.",
            ],
        },
        {
            "name": "Chicken Piccata",
            "status": "want_to_try", "days": "weekday",
            "cuisine": "italian", "protein": json.dumps(["chicken"]),
            "time_min": 25,
            "source": "NYT Cooking, by Ali Slagle",
            "ingredients": [
                ("kyllingbryst", "680g", "g", 0),
                ("hvetemel til panering", "litt", None, 1),
                ("smør", "85g", "g", 1),
                ("sjalottløk", "1 stk", "stk", 0),
                ("sitron", "1 stk", "stk", 0),
                ("kyllingkraft", "175 ml", "ml", 1),
                ("kapers", "4 ts", "ts", 0),
                ("persille", "til pynt", None, 0),
            ],
            "steps": [
                "Halver kyllingbrystene horisontalt, vend i mel med salt og pepper.",
                "Stek i smør og olje til gyllen, ca 3 min per side. Ta ut.",
                "Stek sjalottløk og sitronskiver til karamellisert.",
                "Tilsett kraft, reduser til halvparten.",
                "Rør inn resten av smøret og kapers. Server saus over kylling.",
            ],
        },
        {
            "name": "Garlicky Chicken With Lemon-Anchovy Sauce",
            "status": "want_to_try", "days": "weekday",
            "cuisine": "french", "protein": json.dumps(["chicken"]),
            "time_min": 25,
            "source": "NYT Cooking, by Melissa Clark",
            "ingredients": [
                ("kyllinglår uten bein", "565g", "g", 0),
                ("hvitløk", "6 fedd", "fedd", 1),
                ("ansjosfileter", "5 stk", "stk", 0),
                ("kapers", "2 ss", "ss", 0),
                ("chiliflak", "1 klype", None, 1),
                ("sitron", "1 stk", "stk", 0),
                ("persille", "til servering", None, 0),
            ],
            "steps": [
                "Sett ovn på 175°C. Krydre kylling med salt og pepper.",
                "Stek hvitløk, ansjos, kapers og chili i olje til ansjos løser seg.",
                "Brun kyllinglår på én side 5-7 min. Snu, sett i ovn 5-10 min.",
                "Ta kylling ut. Tilsett hvitløk og sitronsaft, skrap bunnen.",
                "Legg kylling tilbake 15-30 sek. Server med persille.",
            ],
        },
        {
            "name": "One-Pan Roasted Fish With Cherry Tomatoes",
            "status": "want_to_try", "days": "weekday",
            "cuisine": "other", "protein": json.dumps(["fish"]),
            "time_min": 30,
            "source": "NYT Cooking, by Lidey Heuck",
            "ingredients": [
                ("hvit fisk (torsk eller kveite)", "4 fileter à 170g", "g", 0),
                ("kirsebærtomater", "340g", "g", 0),
                ("sjalottløk", "1 stor", None, 0),
                ("hvitløk", "2 fedd", "fedd", 1),
                ("sherryeddik eller rødvinseddik", "1 ss", "ss", 1),
                ("honning", "1 ts", "ts", 1),
                ("sitron", "1/2 stk", "stk", 0),
                ("fersk basilikum", "til servering", None, 0),
                ("fersk mynte", "til servering", None, 0),
            ],
            "steps": [
                "Sett ovn på 205°C.",
                "Bland tomater, sjalottløk, hvitløk, olje, eddik, honning, salt i form. Stek 15 min.",
                "Tørk fisk, pensle med olje, krydre godt.",
                "Flytt tomater til siden, legg fisk i midten. Stek 10-12 min.",
                "Dryss over sitronskall, basilikum og mynte.",
            ],
        },
        {
            "name": "Stewed Greens and Chickpeas With Toasted Garlic and Lemon",
            "status": "want_to_try", "days": "any",
            "cuisine": "other", "protein": json.dumps(["vegetarian"]),
            "time_min": 55,
            "source": "NYT Cooking, by Yotam Ottolenghi",
            "ingredients": [
                ("mangold eller grønnkål", "395g", "g", 0),
                ("kikerter", "1 boks", "boks", 0),
                ("gul løk", "2 stk", "stk", 1),
                ("fennikkelfrø", "2 ts", "ts", 0),
                ("fersk oregano", "15g", "g", 0),
                ("pasta (stelline eller pepe bucato)", "210g", "g", 0),
                ("kylling- eller grønnsakskraft", "945 ml", "ml", 1),
                ("hvitløk", "6 fedd", "fedd", 1),
                ("sitron", "1 stk", "stk", 0),
                ("rømme", "235 ml", "ml", 0),
                ("chiliflak", "1/2 ts", "ts", 1),
            ],
            "steps": [
                "Stek løk, fennikkelfrø, chili og oregano i olje 10 min til myk.",
                "Tilsett mangold, pasta, kikerter, kraft og vann. Kok tildekket 10 min.",
                "Rør inn persille, hakket hvitløk og sitronskall.",
                "Stek skivet hvitløk og oregano i olje til gyllen.",
                "Server gryte med rømme, hvitløksolje og sitronbåter.",
            ],
        },
    ]

    # Insert only if table is empty
    existing = c.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
    if existing == 0:
        for r in RECIPES:
            c.execute(
                """
                INSERT INTO recipes (name, status, days, cuisine, protein,
                                     time_min, source, notes)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    r["name"],
                    r["status"],
                    r["days"],
                    r.get("cuisine"),
                    r.get("protein"),
                    r.get("time_min"),
                    r.get("source"),
                    r.get("notes"),
                ),
            )
            recipe_id = c.lastrowid

            for name, qty, unit, pantry in r.get("ingredients", []):
                c.execute(
                    """
                    INSERT INTO ingredients (recipe_id, name, quantity, unit, is_pantry_staple)
                    VALUES (?,?,?,?,?)
                    """,
                    (recipe_id, name, qty, unit, pantry),
                )

            for i, step in enumerate(r.get("steps", []), 1):
                c.execute(
                    """
                    INSERT INTO steps (recipe_id, step_number, instruction)
                    VALUES (?,?,?)
                    """,
                    (recipe_id, i, step),
                )

        print(f"Seeded {len(RECIPES)} recipes.")
    else:
        print(f"Database already has {existing} recipes — skipping seed.")

    conn.commit()
    conn.close()
    print(f"Database ready at {DB_PATH}")


if __name__ == "__main__":
    init()
