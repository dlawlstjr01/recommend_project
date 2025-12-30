from flask import Flask, jsonify, request
from flask_cors import CORS
import os, json, re, hashlib, random
from pathlib import Path
import jwt
from sqlalchemy import create_engine, text


# -------------------------
# App / CORS / JWT
# -------------------------
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
    """쿠키 accessToken에서 유저 번호 추출"""
    token = request.cookies.get("accessToken")
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("userNo") or payload.get("user_no") or payload.get("user_id") or payload.get("id")
    except Exception as e:
        print("DEBUG jwt decode error:", repr(e))
        return None


# -------------------------
# JSON -> Product Index
# -------------------------
def slugify_text(s: str) -> str:
    s = str(s).strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"[^0-9a-z가-힣]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s


def norm_cat(stem: str) -> str:
    return str(stem).strip().lower().replace(" ", "_").replace("-", "_")


def flatten_records(data):
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for k in ("items", "data", "products", "result", "list"):
            if isinstance(data.get(k), list):
                return [x for x in data[k] if isinstance(x, dict)]
        return [data]
    return []


def get_name(obj):
    return (
        obj.get("Name")
        or obj.get("name")
        or obj.get("product_name")
        or obj.get("title")
        or obj.get("Title")
        or obj.get("model_name")
        or obj.get("Product")
        or obj.get("제품명")
        or (f"pcode_{obj.get('PCode')}" if obj.get("PCode") else None)
        or "Unknown"
    )


def get_price(obj):
    v = obj.get("price_krw") or obj.get("Price") or obj.get("price") or obj.get("lowest_price") or obj.get("최저가")
    if v is None:
        return 0
    try:
        return int(float(str(v).replace(",", "").strip()))
    except:
        return 0


def get_image(obj):
    if obj.get("BaseImageURL"):
        return obj.get("BaseImageURL")
    imgs = obj.get("Images")
    if isinstance(imgs, list) and imgs:
        return imgs[0]
    dimgs = obj.get("DetailImages")
    if isinstance(dimgs, list) and dimgs:
        return dimgs[0]
    return obj.get("img") or obj.get("image")


def get_url(obj):
    if obj.get("Purchase_Link"):
        return obj.get("Purchase_Link")
    urls = obj.get("URLs")
    if isinstance(urls, list) and urls:
        return urls[0]
    return obj.get("url") or obj.get("purchase_url") or obj.get("purchaseLink") or obj.get("purchase_link")


def get_brand(obj):
    if obj.get("brand") or obj.get("Brand"):
        return obj.get("brand") or obj.get("Brand")
    spec = obj.get("Spec")
    if isinstance(spec, dict):
        for k in ("브랜드", "제조회사", "제조사", "Brand", "Maker"):
            if spec.get(k):
                return str(spec.get(k))
    name = get_name(obj)
    first = str(name).split(" ")[0]
    return first if first else "UNKNOWN"


def make_id(category, obj, idx):
    """JSON에 id가 없으면 생성 (full id)"""
    name = get_name(obj)
    slug = slugify_text(name)
    base = f"{category}:{slug or 'item'}"
    h = hashlib.sha1(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:8]
    return f"{base}-{h}-{idx}"


def base_key(full_id: str) -> str:
    """full id -> basekey 변환 (DB에 저장된 product_id가 basekey일 때 매핑용)"""
    return re.sub(r"-[0-9a-f]{8}-\d+$", "", str(full_id))


def normalize_product(obj, category, idx):
    return {
        "id": obj.get("id") or make_id(category, obj, idx),
        "category": category,
        "name": get_name(obj),
        "price": get_price(obj),
        "brand": get_brand(obj),
        "img": get_image(obj),
        "url": get_url(obj),
    }


PRODUCTS = []
PRODUCT_BY_ID = {}
BASEKEY_TO_FULLIDS = {}
CATEGORIES = []


def build_products_index():
    global PRODUCTS, PRODUCT_BY_ID, BASEKEY_TO_FULLIDS, CATEGORIES

    products = []
    cats = []
    idx = 0

    for file in sorted(DATA_DIR.glob("*.json")):
        category = norm_cat(file.stem)
        cats.append({"key": category, "label": file.stem})

        try:
            with open(file, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print("⚠️ JSON load fail:", file.name, repr(e))
            continue

        for obj in flatten_records(data):
            p = normalize_product(obj, category, idx)
            products.append(p)
            idx += 1

    PRODUCTS = products
    PRODUCT_BY_ID = {p["id"]: p for p in PRODUCTS}

    BASEKEY_TO_FULLIDS = {}
    for p in PRODUCTS:
        bk = base_key(p["id"])
        BASEKEY_TO_FULLIDS.setdefault(bk, []).append(p["id"])

    CATEGORIES = cats


build_products_index()


def resolve_full_id_from_db_pid(pid: str):
    """DB product_id가 full id거나 basekey일 수 있어서 둘 다 대응"""
    pid = str(pid).strip()
    if pid in PRODUCT_BY_ID:
        return pid
    if pid in BASEKEY_TO_FULLIDS:
        return BASEKEY_TO_FULLIDS[pid][0]
    return None


# DB: user_recommendations
def fetch_model_recommend_random_rows(user_id: int, k: int, top_n: int = 100):
    candidates = [("user_no", "user_recommendations"), ("user_id", "user_recommendations")]
    with engine.connect() as conn:
        for ucol, table in candidates:
            try:
                q = text(f"""
                    SELECT product_id, score, rec_rank
                    FROM (
                        SELECT product_id, score, rec_rank
                        FROM {table}
                        WHERE {ucol} = :u
                        ORDER BY rec_rank ASC
                        LIMIT :topn
                    ) t
                    ORDER BY RAND()
                    LIMIT :k
                """)
                return conn.execute(q, {"u": int(user_id), "topn": int(top_n), "k": int(k)}).fetchall()
            except Exception:
                continue
    return []




# -------------------------
# Routes
# -------------------------
@app.route("/api/products", methods=["GET"])
def get_products():
    return jsonify(PRODUCTS)


@app.route("/api/products/categories", methods=["GET"])
def get_categories():
    return jsonify(CATEGORIES)


@app.route("/api/recommend", methods=["GET"])
def recommend():
    user_id = get_user_no_from_jwt()
    if not user_id:
        return jsonify({"type": "unauthorized", "items": []}), 401

    K = int(request.args.get("k", 10))
    K = max(1, min(K, 100))

    model_rows = fetch_model_recommend_random_rows(int(user_id), k=K, top_n=100)

    items = []
    for r in model_rows:
        pid = str(r.product_id)
        fid = pid if pid in PRODUCT_BY_ID else (BASEKEY_TO_FULLIDS.get(pid, [None])[0])
        if not fid:
            continue
        prod = PRODUCT_BY_ID.get(fid)
        if not prod:
            continue

        it = dict(prod)
        it["base_id"] = pid
        it["score"] = float(r.score) if r.score is not None else None
        it["rec_rank"] = int(r.rec_rank) if r.rec_rank is not None else None
        items.append(it)

    return jsonify({"type": "personalized", "items": items})






if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
