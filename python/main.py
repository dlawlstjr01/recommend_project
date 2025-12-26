from flask import Flask, jsonify, request
from flask_cors import CORS
import jwt
import os
import json
import random
import hashlib
import re
from pathlib import Path

app = Flask(__name__)

CORS(
    app,
    supports_credentials=True,
    origins=["http://localhost:5173"]
)

JWT_SECRET = os.getenv("JWT_SECRET", "81c02530a568f9da9d1ce9d681b56544")
JWT_ALG = "HS256"

DATA_DIR = Path(__file__).resolve().parent.parent / "server" / "data"

# JSON 로드
def load_all_products_raw():
    items = []
    for file in DATA_DIR.glob("*.json"):
        with open(file, encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                items.extend(data)
    return items

def get_name(obj):
    return (
        obj.get("model_name")
        or obj.get("Name")
        or obj.get("name")
        or obj.get("Product")
        or obj.get("product_name")
        or obj.get("title")
        or obj.get("Title")
        or obj.get("제품명")
        or "Unknown"
    )

def get_price(obj):
    v = (
        obj.get("price_krw")
        or obj.get("Price")
        or obj.get("price")
        or obj.get("lowest_price")
        or obj.get("lowestPrice")
        or obj.get("가격")
        or obj.get("최저가")
        or obj.get("price.value")
    )
    if v is None:
        return 0
    try:
        return int(str(v).replace(",", "").strip())
    except:
        return 0

def get_image(obj):
    return (
        obj.get("BaseImageURL")
        or (obj.get("Images")[0] if isinstance(obj.get("Images"), list) else None)
        or obj.get("img")
        or obj.get("image")
    )

def get_brand(obj):
    if obj.get("brand") or obj.get("Brand"):
        return obj.get("brand") or obj.get("Brand")

    name = get_name(obj)
    first = str(name).split(" ")[0]

    MAP = {
        "레노버": "Lenovo",
        "삼성": "Samsung",
        "LG": "LG",
        "ASUS": "ASUS",
        "애플": "Apple",
        "HP": "HP",
        "델": "Dell",
        "MSI": "MSI",
        "에이서": "Acer",
        "기가바이트": "GIGABYTE",
    }

    return MAP.get(first, first)

def make_id(category, obj, idx):
    name = get_name(obj)
    slug = re.sub(r"[^a-z0-9가-힣]+", "-", name.lower()).strip("-")
    h = hashlib.sha1(json.dumps(obj, ensure_ascii=False).encode()).hexdigest()[:8]
    return f"{category}:{slug or 'item'}-{h}-{idx}"

# Node와 동일한 최종 상품 포맷
def normalize_like_node(obj, category, idx):
    return {
        "id": obj.get("id") or make_id(category, obj, idx),
        "category": category,
        "name": get_name(obj),
        "price": get_price(obj),
        "brand": get_brand(obj),
        "img": get_image(obj),
        "url": obj.get("url") or obj.get("purchase_url"),
    }

# 상품 정규화
def normalize_product(raw_obj, category):
    def first(*vals):
        for v in vals:
            if v not in (None, "", []):
                return v
        return None

    name = first(
        raw_obj.get("model_name"),
        raw_obj.get("Name"),
        raw_obj.get("name"),
        raw_obj.get("Product"),
        raw_obj.get("product_name"),
        raw_obj.get("title"),
        raw_obj.get("Title"),
        raw_obj.get("제품명"),
    ) or "Unknown"

    price = first(
        raw_obj.get("price_krw"),
        raw_obj.get("price"),
        raw_obj.get("lowest_price"),
        raw_obj.get("lowestPrice"),
        raw_obj.get("가격"),
        raw_obj.get("최저가"),
    ) or 0

    img = first(
        raw_obj.get("BaseImageURL"),
        raw_obj.get("image"),
        raw_obj.get("img"),
        (raw_obj.get("Images")[0] if isinstance(raw_obj.get("Images"), list) else None)
    )

    brand = first(
        raw_obj.get("brand"),
        raw_obj.get("Brand"),
        raw_obj.get("제조사")
    )

    #  id는 "추천용 임시 id" (Node 재조회 안 함)
    pid = raw_obj.get("pcode") or abs(hash(json.dumps(raw_obj, ensure_ascii=False))) % 10**10
    product_id = f"{category}:{pid}"

    return {
        "id": product_id,
        "category": category,
        "name": name,
        "price": int(price) if str(price).isdigit() else 0,
        "brand": brand,
        "img": img,
        "raw": raw_obj 
    }

# JWT
def get_user_no_from_jwt():
    token = request.cookies.get("accessToken")
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("userNo")
    except:
        return None

# 추천 API
@app.route("/api/recommend", methods=["GET"])
def recommend():
    user_no = get_user_no_from_jwt()

    raw = load_all_products_raw()
    if not raw:
        return jsonify({ "type": "fallback", "items": [] })

    # 파일명에서 category 추정
    products = []
    idx = 0
    for file in DATA_DIR.glob("*.json"):
        category = file.stem.lower()
        with open(file, encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, list):
                continue
            for obj in data:
                products.append(normalize_like_node(obj, category, idx))
                idx += 1

    picked = random.sample(products, min(10, len(products)))

    return jsonify({
        "type": "personalized" if user_no else "fallback",
        "items": picked
    })

# -------------------------------
# 실행
# -------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
