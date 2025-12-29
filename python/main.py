from flask import Flask, jsonify, request
from flask_cors import CORS
import jwt, os, json, random, hashlib, re
from pathlib import Path
from sqlalchemy import create_engine, text

app = Flask(__name__)

CORS(app, supports_credentials=True, origins=["http://localhost:5173"])

JWT_SECRET = os.getenv("JWT_SECRET", "81c02530a568f9da9d1ce9d681b56544")
JWT_ALG = "HS256"

DATA_DIR = Path(__file__).resolve().parent.parent / "server" / "data"

engine = create_engine(
    "mysql+pymysql://cgi_25K_donga1_p2_3:smhrd3@project-db-campus.smhrd.com:3307/cgi_25K_donga1_p2_3?charset=utf8mb4",
    pool_pre_ping=True
)

def get_user_no_from_jwt():
    token = request.cookies.get("accessToken")
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("userNo")
    except:
        return None

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
        "레노버": "Lenovo","삼성": "Samsung","LG": "LG","ASUS": "ASUS","애플": "Apple",
        "HP": "HP","델": "Dell","MSI": "MSI","에이서": "Acer","기가바이트": "GIGABYTE",
    }
    return MAP.get(first, first)

def make_id(category, obj, idx):
    name = get_name(obj)
    slug = re.sub(r"[^a-z0-9가-힣]+", "-", name.lower()).strip("-")
    h = hashlib.sha1(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:8]
    return f"{category}:{slug or 'item'}-{h}-{idx}"

def normalize_like_node(obj, category, idx):
    return {
        "id": obj.get("id") or make_id(category, obj, idx),
        "category": category,
        "name": get_name(obj),
        "price": get_price(obj),
        "brand": get_brand(obj),
        "img": get_image(obj),
        "url": obj.get("url") or obj.get("purchase_url"),
        "raw": obj,  # 추천에서 바로 상세 렌더링하려면 raw 포함 추천
    }

# ---- 상품 인덱스 ----
PRODUCTS = []
PRODUCT_BY_ID = {}
BASEKEY_TO_FULLID = {}  # "category:slug" -> "category:slug-hash-idx"

def base_key(full_id: str) -> str:
    # 뒤 "-해시8자리-숫자" 제거
    return re.sub(r"-[0-9a-f]{8}-\d+$", "", str(full_id))

def build_products_index():
    global PRODUCTS, PRODUCT_BY_ID, BASEKEY_TO_FULLID
    products = []
    idx = 0

    for file in sorted(DATA_DIR.glob("*.json")):
        category = file.stem.lower()
        with open(file, encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, list):
            continue

        for obj in data:
            p = normalize_like_node(obj, category, idx)
            products.append(p)
            idx += 1

    PRODUCTS = products
    PRODUCT_BY_ID = {p["id"]: p for p in PRODUCTS}
    BASEKEY_TO_FULLID = {base_key(p["id"]): p["id"] for p in PRODUCTS}

build_products_index()

# ---- 추천 API ----
@app.route("/api/recommend", methods=["GET"])
def recommend():
    user_no = get_user_no_from_jwt()

    if not PRODUCTS:
        return jsonify({"type": "fallback", "items": []})

    # 로그인 안 했으면 fallback
    if not user_no:
        picked = random.sample(PRODUCTS, min(10, len(PRODUCTS)))
        return jsonify({"type": "fallback", "items": picked})

    q = text("""
        SELECT product_id, score, rec_rank
        FROM user_recommendations
        WHERE user_no = :u
        ORDER BY rec_rank ASC
        LIMIT 10
    """)

    with engine.connect() as conn:
        rows = conn.execute(q, {"u": int(user_no)}).fetchall()

    items = []
    for r in rows:
        pid = str(r.product_id)

        # 1) 완전 일치
        full_id = pid if pid in PRODUCT_BY_ID else None

        # 2) DB가 "category:slug"만 저장한 경우 보정
        if full_id is None:
            full_id = BASEKEY_TO_FULLID.get(pid)

        if full_id:
            items.append(PRODUCT_BY_ID[full_id])

    # 부족하면 fallback 채움
    if len(items) < 10:
        remain = 10 - len(items)
        items.extend(random.sample(PRODUCTS, min(remain, len(PRODUCTS))))

    return jsonify({"type": "personalized", "items": items})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
