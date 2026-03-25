#!/usr/bin/env python3
# v2
"""
main.py — Keller Instinct PWA backend (FastAPI + SQLite)

Run:
    pip install fastapi uvicorn
    python main.py
"""

import sqlite3
import json
import os
from typing import Optional, List, Literal
from contextlib import contextmanager

import anthropic
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

DB_PATH = os.path.join(os.path.dirname(__file__), "keller_instinct.db")
FRONTEND_PATH = os.path.join(os.path.dirname(__file__), "..", "frontend")

app = FastAPI(title="Keller Instinct API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)


# ------------------------------------------------------------------ db helpers

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def row_to_dict(row):
    d = dict(row)
    for field in ("protein", "avoid_ingredients"):
        if field in d and isinstance(d[field], str):
            try:
                d[field] = json.loads(d[field])
            except Exception:
                pass
    return d


def require_recipe(conn, recipe_id: int):
    """Raise 404 if recipe does not exist."""
    if not conn.execute("SELECT id FROM recipes WHERE id = ?", (recipe_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Recipe not found")


# ------------------------------------------------------------------ models

ValidStatus = Literal["repertoire", "want_to_try", "retired"]
ValidDays = Literal["any", "weekday", "weekend", "friday"]


class RecipeCreate(BaseModel):
    name: str
    status: ValidStatus = "want_to_try"
    days: ValidDays = "any"
    cuisine: Optional[str] = None
    protein: Optional[List[str]] = None
    time_min: Optional[int] = None
    source: Optional[str] = None
    source_url: Optional[str] = None
    notes: Optional[str] = None


class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[ValidStatus] = None
    days: Optional[ValidDays] = None
    cuisine: Optional[str] = None
    protein: Optional[List[str]] = None
    time_min: Optional[int] = None
    source: Optional[str] = None
    source_url: Optional[str] = None
    last_made: Optional[str] = None
    notes: Optional[str] = None


class IngredientCreate(BaseModel):
    name: str
    quantity: Optional[str] = None
    unit: Optional[str] = None
    is_pantry_staple: bool = False


class StepCreate(BaseModel):
    step_number: int
    instruction: str


class FeedbackCreate(BaseModel):
    comment: Optional[str] = None
    rating: Optional[int] = None

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v):
        if v is not None and not (1 <= v <= 5):
            raise ValueError("Rating must be between 1 and 5")
        return v


class PreferencesUpdate(BaseModel):
    servings_adults: Optional[int] = None
    servings_children: Optional[int] = None
    max_meat_per_week: Optional[int] = None
    max_beef_per_week: Optional[int] = None
    min_legumes_per_week: Optional[int] = None
    min_leafy_greens_per_week: Optional[int] = None
    min_fish_per_week: Optional[int] = None
    avoid_ingredients: Optional[List[str]] = None
    max_time_mon: Optional[int] = None
    max_time_tue: Optional[int] = None
    max_time_wed: Optional[int] = None
    max_time_thu: Optional[int] = None
    max_time_fri: Optional[int] = None
    max_time_sat: Optional[int] = None
    max_time_sun: Optional[int] = None


# ------------------------------------------------------------------ recipes

@app.get("/recipes")
def list_recipes(
    status: Optional[str] = Query(None),
    days: Optional[str] = Query(None),
    cuisine: Optional[str] = Query(None),
    protein: Optional[str] = Query(None),
    max_time: Optional[int] = Query(None),
):
    """List recipes with optional filters."""
    sql = "SELECT * FROM recipes WHERE 1=1"
    params: list = []
    if status:
        sql += " AND status = ?"
        params.append(status)
    if days and days != "any":
        sql += " AND (days = ? OR days = 'any')"
        params.append(days)
    if cuisine:
        sql += " AND cuisine = ?"
        params.append(cuisine)
    if protein:
        sql += " AND protein LIKE ?"
        params.append(f'%"{protein}"%')
    if max_time:
        sql += " AND time_min <= ?"
        params.append(max_time)
    sql += " ORDER BY name"

    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [row_to_dict(r) for r in rows]


@app.get("/recipes/{recipe_id}")
def get_recipe(recipe_id: int):
    """Get a single recipe with its ingredients, steps and feedback."""
    with get_db() as conn:
        recipe = conn.execute(
            "SELECT * FROM recipes WHERE id = ?", (recipe_id,)
        ).fetchone()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")

        ingredients = conn.execute(
            "SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY id",
            (recipe_id,),
        ).fetchall()

        steps = conn.execute(
            "SELECT * FROM steps WHERE recipe_id = ? ORDER BY step_number",
            (recipe_id,),
        ).fetchall()

        feedback = conn.execute(
            "SELECT * FROM feedback WHERE recipe_id = ? ORDER BY date DESC",
            (recipe_id,),
        ).fetchall()

    result = row_to_dict(recipe)
    result["ingredients"] = [dict(i) for i in ingredients]
    result["steps"] = [dict(s) for s in steps]
    result["feedback"] = [dict(f) for f in feedback]
    return result


@app.post("/recipes", status_code=201)
def create_recipe(recipe: RecipeCreate):
    """Create a new recipe."""
    with get_db() as conn:
        c = conn.execute(
            """
            INSERT INTO recipes (name, status, days, cuisine, protein,
                                 time_min, source, source_url, notes)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            (
                recipe.name,
                recipe.status,
                recipe.days,
                recipe.cuisine,
                json.dumps(recipe.protein) if recipe.protein is not None else None,
                recipe.time_min,
                recipe.source,
                recipe.source_url,
                recipe.notes,
            ),
        )
        return {"id": c.lastrowid, "name": recipe.name}


@app.patch("/recipes/{recipe_id}")
def update_recipe(recipe_id: int, recipe: RecipeUpdate):
    """Partial update — only fields explicitly included in the request body are changed."""
    # exclude_unset=True means only fields present in the JSON body are included
    updates = recipe.model_dump(exclude_unset=True)
    if "protein" in updates:
        updates["protein"] = (
            json.dumps(updates["protein"]) if updates["protein"] is not None else None
        )
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sql = "UPDATE recipes SET " + ", ".join(f"{k} = ?" for k in updates)
    sql += " WHERE id = ?"

    with get_db() as conn:
        result = conn.execute(sql, [*updates.values(), recipe_id])
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")
    return {"ok": True}


@app.delete("/recipes/{recipe_id}", status_code=204)
def delete_recipe(recipe_id: int):
    """Delete a recipe (cascades to ingredients, steps, feedback)."""
    with get_db() as conn:
        result = conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")


# ------------------------------------------------------------------ ingredients

@app.post("/recipes/{recipe_id}/ingredients", status_code=201)
def add_ingredient(recipe_id: int, ingredient: IngredientCreate):
    with get_db() as conn:
        require_recipe(conn, recipe_id)
        c = conn.execute(
            """
            INSERT INTO ingredients (recipe_id, name, quantity, unit, is_pantry_staple)
            VALUES (?,?,?,?,?)
            """,
            (
                recipe_id,
                ingredient.name,
                ingredient.quantity,
                ingredient.unit,
                int(ingredient.is_pantry_staple),
            ),
        )
        return {"id": c.lastrowid}


@app.put("/recipes/{recipe_id}/ingredients")
def replace_ingredients(recipe_id: int, ingredients: List[IngredientCreate]):
    """Replace all ingredients for a recipe atomically."""
    with get_db() as conn:
        require_recipe(conn, recipe_id)
        conn.execute("DELETE FROM ingredients WHERE recipe_id = ?", (recipe_id,))
        for ing in ingredients:
            conn.execute(
                """
                INSERT INTO ingredients (recipe_id, name, quantity, unit, is_pantry_staple)
                VALUES (?,?,?,?,?)
                """,
                (recipe_id, ing.name, ing.quantity, ing.unit, int(ing.is_pantry_staple)),
            )
    return {"ok": True}


@app.delete("/recipes/{recipe_id}/ingredients/{ingredient_id}", status_code=204)
def delete_ingredient(recipe_id: int, ingredient_id: int):
    with get_db() as conn:
        result = conn.execute(
            "DELETE FROM ingredients WHERE id = ? AND recipe_id = ?",
            (ingredient_id, recipe_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Ingredient not found")


# ------------------------------------------------------------------ steps

@app.post("/recipes/{recipe_id}/steps", status_code=201)
def add_step(recipe_id: int, step: StepCreate):
    with get_db() as conn:
        require_recipe(conn, recipe_id)
        c = conn.execute(
            """
            INSERT INTO steps (recipe_id, step_number, instruction)
            VALUES (?,?,?)
            """,
            (recipe_id, step.step_number, step.instruction),
        )
        return {"id": c.lastrowid}


@app.put("/recipes/{recipe_id}/steps")
def replace_steps(recipe_id: int, steps: List[StepCreate]):
    """Replace all steps for a recipe atomically."""
    with get_db() as conn:
        require_recipe(conn, recipe_id)
        conn.execute("DELETE FROM steps WHERE recipe_id = ?", (recipe_id,))
        for step in steps:
            conn.execute(
                """
                INSERT INTO steps (recipe_id, step_number, instruction)
                VALUES (?,?,?)
                """,
                (recipe_id, step.step_number, step.instruction),
            )
    return {"ok": True}


# ------------------------------------------------------------------ feedback

@app.post("/recipes/{recipe_id}/feedback", status_code=201)
def add_feedback(recipe_id: int, feedback: FeedbackCreate):
    with get_db() as conn:
        require_recipe(conn, recipe_id)
        c = conn.execute(
            """
            INSERT INTO feedback (recipe_id, comment, rating)
            VALUES (?,?,?)
            """,
            (recipe_id, feedback.comment, feedback.rating),
        )
        return {"id": c.lastrowid}


# ------------------------------------------------------------------ shopping list

@app.post("/shopping-list")
def get_weekly_shopping_list(recipe_ids: List[int]):
    """Return combined ingredients for multiple recipes, split by pantry status."""
    if not recipe_ids:
        return {"shopping": [], "pantry_check": []}

    placeholders = ",".join("?" * len(recipe_ids))
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT i.name, i.quantity, i.unit, i.is_pantry_staple,
                   r.name as recipe_name
            FROM ingredients i
            JOIN recipes r ON r.id = i.recipe_id
            WHERE i.recipe_id IN ({placeholders})
            ORDER BY i.is_pantry_staple, i.name
            """,
            recipe_ids,
        ).fetchall()

    shopping, pantry_check = [], []
    for row in rows:
        target = pantry_check if row["is_pantry_staple"] else shopping
        target.append(dict(row))
    return {"shopping": shopping, "pantry_check": pantry_check}


# ------------------------------------------------------------------ preferences

@app.get("/preferences")
def get_preferences():
    """Return structured household preferences."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM preferences WHERE id = 1").fetchone()
        if not row:
            raise HTTPException(
                status_code=404,
                detail="Preferences not initialised — run init_db.py first",
            )
        return row_to_dict(row)


@app.patch("/preferences")
def update_preferences(prefs: PreferencesUpdate):
    """Update one or more preference values."""
    updates = prefs.model_dump(exclude_unset=True)
    if "avoid_ingredients" in updates:
        updates["avoid_ingredients"] = json.dumps(updates["avoid_ingredients"])
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sql = "UPDATE preferences SET " + ", ".join(f"{k} = ?" for k in updates)
    sql += " WHERE id = 1"

    with get_db() as conn:
        conn.execute(sql, list(updates.values()))
    return {"ok": True}


# ------------------------------------------------------------------ recipe import

class _Ingredient(BaseModel):
    name: str
    quantity: Optional[str] = None
    unit: Optional[str] = None
    is_pantry_staple: bool = False

class _Step(BaseModel):
    step_number: int
    instruction: str

class _ParsedRecipe(BaseModel):
    name: str
    cuisine: Optional[str] = None
    protein: Optional[List[str]] = None
    time_min: Optional[int] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    ingredients: List[_Ingredient] = []
    steps: List[_Step] = []

class ImportRequest(BaseModel):
    text: Optional[str] = None
    image_base64: Optional[str] = None
    image_media_type: Optional[str] = "image/jpeg"

SYSTEM_PROMPT = """You are a recipe parser. Extract the recipe from the provided text or image and return it as structured JSON.

Cuisine must be one of: italian, scandinavian, asian, japanese, mexican, indian, french, other (or null if unclear).
Protein must be a list containing only values from: chicken, pork, beef, lamb, fish, egg, vegetarian (omit unknown proteins).
time_min should be the total cooking time in minutes as an integer (or null if not mentioned).
For ingredients, split quantity and unit when possible (e.g. quantity="400", unit="g").
Mark is_pantry_staple=true for basic staples like oil, salt, pepper, flour, sugar, common spices, canned tomatoes, pasta, rice.
Steps should be numbered starting from 1."""

@app.post("/import-recipe", status_code=201)
def import_recipe(req: ImportRequest):
    if not req.text and not req.image_base64:
        raise HTTPException(status_code=400, detail="Provide text or an image")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set on server")

    content = []
    if req.image_base64:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": req.image_media_type or "image/jpeg",
                "data": req.image_base64,
            },
        })
    if req.text:
        content.append({"type": "text", "text": req.text})

    client = anthropic.Anthropic(api_key=api_key)
    try:
        response = client.messages.parse(
            model="claude-opus-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
            output_format=_ParsedRecipe,
        )
    except anthropic.BadRequestError as e:
        raise HTTPException(status_code=422, detail=f"Could not parse recipe: {e.message}")

    r = response.parsed_output
    if not r or not r.name:
        raise HTTPException(status_code=422, detail="No recipe found in the provided content")

    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO recipes (name, status, days, cuisine, protein, time_min, source, notes)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                r.name,
                "want_to_try",
                "any",
                r.cuisine,
                json.dumps(r.protein) if r.protein else None,
                r.time_min,
                r.source,
                r.notes,
            ),
        )
        recipe_id = cur.lastrowid

        for ing in r.ingredients:
            conn.execute(
                "INSERT INTO ingredients (recipe_id, name, quantity, unit, is_pantry_staple) VALUES (?,?,?,?,?)",
                (recipe_id, ing.name, ing.quantity, ing.unit, int(ing.is_pantry_staple)),
            )
        for step in r.steps:
            conn.execute(
                "INSERT INTO steps (recipe_id, step_number, instruction) VALUES (?,?,?)",
                (recipe_id, step.step_number, step.instruction),
            )

    return {"id": recipe_id, "name": r.name}


# ------------------------------------------------------------------ serve frontend

INDEX_HTML = os.path.join(FRONTEND_PATH, "index.html") if os.path.exists(FRONTEND_PATH) else None

if os.path.exists(FRONTEND_PATH):
    app.mount("/static", StaticFiles(directory=FRONTEND_PATH), name="static")

@app.exception_handler(404)
async def spa_fallback(request: Request, exc):
    # Serve static files for GET requests; return JSON 404 for API paths
    if request.method == "GET" and INDEX_HTML:
        path = request.url.path.lstrip("/")
        candidate = os.path.join(FRONTEND_PATH, path) if path else None
        if candidate and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(INDEX_HTML)
    return JSONResponse({"detail": "Not Found"}, status_code=404)


# ------------------------------------------------------------------ run

if __name__ == "__main__":
    import uvicorn

    if not os.path.exists(DB_PATH):
        print("Database not found — run init_db.py first!")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
