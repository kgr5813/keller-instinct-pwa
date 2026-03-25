#!/usr/bin/env python3
"""
migrate_time_per_day.py - one-time migration: replace the three time-limit
columns with seven per-day columns (Mon-Sun).
Run once: python migrate_time_per_day.py
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "keller_instinct.db")
conn = sqlite3.connect(DB_PATH)

# Read current values so we can carry them over sensibly
row = conn.execute("SELECT max_weekday_time_min, max_monday_tuesday_time_min, max_weekend_time_min FROM preferences WHERE id=1").fetchone()
if row:
    weekday, mon_tue, weekend = row
else:
    weekday, mon_tue, weekend = 60, 30, 90

# Add new columns, skip if already exist
new_cols = {
    "max_time_mon": mon_tue,
    "max_time_tue": mon_tue,
    "max_time_wed": weekday,
    "max_time_thu": weekday,
    "max_time_fri": weekday,
    "max_time_sat": weekend,
    "max_time_sun": weekend,
}
for col, default in new_cols.items():
    try:
        conn.execute(f"ALTER TABLE preferences ADD COLUMN {col} INTEGER NOT NULL DEFAULT {default}")
        print(f"  Added {col} = {default}")
    except Exception as e:
        print(f"  Skipped {col}: {e}")

# Fill in values for existing row
conn.execute("""
    UPDATE preferences SET
        max_time_mon = ?, max_time_tue = ?, max_time_wed = ?,
        max_time_thu = ?, max_time_fri = ?, max_time_sat = ?, max_time_sun = ?
    WHERE id = 1
""", (mon_tue, mon_tue, weekday, weekday, weekday, weekend, weekend))

# Drop old columns (requires SQLite 3.35+)
for col in ("max_weekday_time_min", "max_monday_tuesday_time_min", "max_weekend_time_min"):
    try:
        conn.execute(f"ALTER TABLE preferences DROP COLUMN {col}")
        print(f"  Dropped {col}")
    except Exception as e:
        print(f"  Could not drop {col}: {e}")

conn.commit()
conn.close()
print("Migration complete.")
