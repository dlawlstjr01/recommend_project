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
    print("DEBUG cookie accessToken exists:", bool(token))  
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        print("DEBUG payload userNo:", payload.get("userNo"))  
        return payload.get("userNo")
    except Exception as e:
        print("DEBUG jwt decode error:", repr(e))
        return None

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
        return [data]  # ✅ dict 단일 레코드도 허용
    return []

def get_name(obj):
    # ✅ 학습쪽 slug와 최대한 맞추려면 Name 계열을 우선
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
    name = get_name(obj)
    slug = slugify_text(name)
    base = f"{category}:{slug or 'item'}"
    h = hashlib.sha1(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:8]
    return f"{base}-{h}-{idx}"

def base_key(full_id: str) -> str:
    return re.sub(r"-[0-9a-f]{8}-\d+$", "", str(full_id))

def normalize_like_node(obj, category, idx):
    return {
        "id": obj.get("id") or make_id(category, obj, idx),
        "category": category,
        "name": get_name(obj),
        "price": get_price(obj),
        "brand": get_brand(obj),
        "img": get_image(obj),
        "url": get_url(obj),
    }

# ---- 상품 인덱스 ----
PRODUCTS = []
PRODUCT_BY_ID = {}
BASEKEY_TO_FULLIDS = {}

def build_products_index():
    global PRODUCTS, PRODUCT_BY_ID, BASEKEY_TO_FULLIDS

    products = []
    idx = 0

    for file in sorted(DATA_DIR.glob("*.json")):
        category = norm_cat(file.stem)
        try:
            with open(file, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print("⚠️ JSON load fail:", file.name, repr(e))
            continue

        for obj in flatten_records(data):
            p = normalize_like_node(obj, category, idx)
            products.append(p)
            idx += 1

    PRODUCTS = products
    PRODUCT_BY_ID = {p["id"]: p for p in PRODUCTS}

    BASEKEY_TO_FULLIDS = {}
    for p in PRODUCTS:
        bk = base_key(p["id"])
        BASEKEY_TO_FULLIDS.setdefault(bk, []).append(p["id"])

build_products_index()

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
        LIMIT 50
    """)

    with engine.connect() as conn:
        rows = conn.execute(q, {"u": int(user_no)}).fetchall()

    print("DEBUG user_no:", user_no)
    print("DEBUG rows:", len(rows))
    print("DEBUG first pid:", rows[0].product_id if rows else None)

    if not rows:
        picked = random.sample(PRODUCTS, min(10, len(PRODUCTS)))
        return jsonify({"type": "fallback", "items": picked})

    # =====================================================
    # ✅ 유튜브식: 상위는 자주, 일부는 매번 바뀌게 (가중치 샘플링)
    #  - exploit: 상위 15개에서 6개
    #  - explore: 16~50위에서 4개
    # =====================================================
    def weighted_sample_without_replacement(seq, weights, k):
        seq = list(seq)
        weights = list(weights)
        picked = []
        for _ in range(min(k, len(seq))):
            s = float(sum(weights))
            if s <= 0:
                break
            r = random.random() * s
            acc = 0.0
            for i, w in enumerate(weights):
                acc += float(w)
                if acc >= r:
                    picked.append(seq.pop(i))
                    weights.pop(i)
                    break
        return picked

    top_rows = list(rows[:15])
    tail_rows = list(rows[15:50])

    # rec_rank 낮을수록 가중치 크게
    top_w = [1.0 / (max(1, int(r.rec_rank)) ** 0.8) for r in top_rows]
    tail_w = [1.0 / (max(1, int(r.rec_rank)) ** 0.6) for r in tail_rows]  # tail은 조금 더 평평하게

    picked_rows = []
    picked_rows += weighted_sample_without_replacement(top_rows, top_w, k=6)
    picked_rows += weighted_sample_without_replacement(tail_rows, tail_w, k=4)

    # 혹시 부족하면 남은 rows에서 추가
    if len(picked_rows) < 10:
        rest = [r for r in rows if r not in picked_rows]
        rest_w = [1.0 / (max(1, int(r.rec_rank)) ** 0.7) for r in rest]
        picked_rows += weighted_sample_without_replacement(rest, rest_w, k=10 - len(picked_rows))

    # =====================================================
    # ✅ picked_rows -> 실제 상품 매핑 (네 기존 로직 유지)
    # =====================================================
    items = []
    used = set()

    for r in picked_rows:
        pid = str(r.product_id)  # DB: laptop:... (basekey) 또는 full id
        chosen = None

        # 1) full id 저장된 경우
        if pid in PRODUCT_BY_ID:
            if pid not in used:
                chosen = PRODUCT_BY_ID[pid]

        # 2) basekey 저장된 경우
        elif pid in BASEKEY_TO_FULLIDS:
            for full_id in BASEKEY_TO_FULLIDS[pid]:
                if full_id not in used:
                    chosen = PRODUCT_BY_ID[full_id]
                    break

        if chosen:
            item = dict(chosen)
            item["base_id"] = pid
            item["rec_rank"] = int(r.rec_rank)
            item["score"] = float(r.score)

            items.append(item)
            used.add(chosen["id"])

        if len(items) >= 10:
            break

    # ✅ 랜덤 채움은 "for문 밖에서 한번만"
    if len(items) < 10:
        remain = 10 - len(items)
        pool = [p for p in PRODUCTS if p["id"] not in used]
        if pool:
            items.extend(random.sample(pool, min(remain, len(pool))))

    return jsonify({"type": "personalized", "items": items})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
