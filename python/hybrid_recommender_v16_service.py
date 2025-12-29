# -*- coding: utf-8 -*-
# =========================================================
# HYBRID RECOMMENDER v16 (SERVICE FULL) - CLEAN FIXED
#  - 행동로그: DB(USER_LOG, users)
#  - 상품데이터: JSON(server/data/*.json)
#  - SERVICE 품질 우선: df_service(전체 로그) 기반
#  - Topcat 선호 기반 후보/필터 강화 (노트북/모니터 위주)
#  - seen_service 제거(서비스), seen_train 제거(평가)
#  - score_0_100 100도배 방지: finite minmax + topM only
# =========================================================

import os, sys, math, random, json, hashlib, re
from pathlib import Path
from collections import defaultdict
from contextlib import redirect_stderr
from difflib import SequenceMatcher

import numpy as np
import pandas as pd
from tqdm.auto import tqdm
from sqlalchemy import create_engine

from gensim.models import Word2Vec
from gensim.models.callbacks import CallbackAny2Vec

# -----------------------------
# 0) 설정
# -----------------------------
SEED = 42
random.seed(SEED)
np.random.seed(SEED)

EVAL_SCENARIO = "BROWSE_TOPCATS"  # "GLOBAL" or "BROWSE_TOPCATS"

# ✅ 서비스 추천 품질 우선(최근 클릭/전체 로그 반영)
TRAIN_ON_FULL_LOGS_FOR_SERVICE = True

TOPK_LIST = [10, 50]
CAND_PER_USER = 1200
USER_TOPCAT_N = 3
USER_FINECAT_N = 6

K_TEST = 5
K_VAL  = 5
MIN_TRAIN = 3

WINDOW_GRID_STAGE1 = [10, 15, 20]
EPOCHS_STAGE1 = 20
BEST_VECTOR_SIZE = 128
EPOCHS_FINAL = 90
NEGATIVE = 15

N_SESSIONS_PER_USER = 10
MAX_ITEMS_PER_USER = 40
SESSION_LEN = 20

W_W2V_GRID = [0.4, 0.6, 0.8]
W_POP_GRID = [0.0, 0.2, 0.4]

THRESHOLD_0_100 = 70.0
OUT_NAME = "recommendations_hybrid_top10_threshold70_with_names.csv"
TOPN_SAVE = 30

RATIO_TOPCAT_POP   = 0.30
RATIO_TOPCAT_TAIL  = 0.10
RATIO_FINE_POP     = 0.20
RATIO_FINE_TAIL    = 0.10
RATIO_NEIGHBORS    = 0.25
RATIO_GLOBAL_FILL  = 0.05

NEIGHBOR_TOPK_PER_ITEM = 60
TOP_ITEMS_FOR_NEIGHBORS_PER_USER = 8
NEIGHBORS_TAKE_PER_ITEM = 25
PAIR_SAMPLES_PER_ITEM = 6

CAP_TOPCAT = 6
CAP_FINECAT = 4
CAP_BRAND = 3

USE_CACHE = True
CACHE_DIR_NAME = "hybrid_cache_v16"

pd.set_option("display.max_columns", 140)
pd.set_option("display.width", 200)

print("✅ CWD:", Path.cwd())

# ---------------------------------------------------------
# 경로: python/ 실행 기준으로 recommend_project/server/data 찾기
# ---------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]  # .../recommend_project
JSON_DATA_DIR = PROJECT_ROOT / "server" / "data"
print("✅ PROJECT_ROOT:", PROJECT_ROOT)
print("✅ JSON_DATA_DIR:", JSON_DATA_DIR)

OUT_DIR = str(Path.cwd())
CACHE_DIR = os.path.join(OUT_DIR, CACHE_DIR_NAME)
if USE_CACHE:
    os.makedirs(CACHE_DIR, exist_ok=True)

# ---------------------------------------------------------
# DB 연결 (행동로그만 사용)
# ---------------------------------------------------------
engine = create_engine(
    "mysql+pymysql://cgi_25K_donga1_p2_3:smhrd3@project-db-campus.smhrd.com:3307/cgi_25K_donga1_p2_3?charset=utf8mb4"
)

# -----------------------------
# 공통 유틸
# -----------------------------
def slugify_text(s: str) -> str:
    s = str(s).strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"[^0-9a-z가-힣]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s

def normalize_db_product_id(pid: str) -> str:
    pid = str(pid).strip()
    if ":" in pid:
        cat, rest = pid.split(":", 1)
    else:
        cat, rest = "", pid

    rest = rest.strip().lower()
    rest = re.sub(r"-[0-9a-f]{8}-\d+$", "", rest)  # "-해시8자리-숫자" 제거
    rest = re.sub(r"-\d+$", "", rest)              # "-숫자" 제거
    rest = slugify_text(rest)
    return f"{cat}:{rest}" if cat else rest

# =========================================================
# 1) 행동로그(DB) -> df_ui
# =========================================================
query = """
SELECT
  u.user_no            AS user_no,
  l.product_id         AS item_no,
  (
    LOG(1 + l.stay_time) * 0.7
    + (l.scroll_depth / 100) * 0.3
  ) AS implicit_score
FROM USER_LOG l
JOIN users u
  ON l.user_id = u.user_no
WHERE l.product_id IS NOT NULL;
"""

df_ui = pd.read_sql(query, engine)
df_ui["user_no"] = pd.to_numeric(df_ui["user_no"], errors="coerce").fillna(-1).astype(int)
df_ui["implicit_score"] = pd.to_numeric(df_ui["implicit_score"], errors="coerce").fillna(0.0).astype(float)

df_ui["item_raw_db"] = df_ui["item_no"].astype(str).str.strip()
df_ui["item_raw"] = df_ui["item_raw_db"].apply(normalize_db_product_id)

df_ui = df_ui[(df_ui["user_no"] >= 0) & (df_ui["item_raw"].notna()) & (df_ui["item_raw"] != "")].copy()

print("\n===== INTERACTION (DB RAW) =====")
print("df_ui:", df_ui.shape, "| users:", df_ui.user_no.nunique(), "| raw_items:", df_ui.item_raw.nunique())

if df_ui.empty:
    print("❌ USER_LOG 쿼리 결과가 0건입니다. (추천 불가)")
    sys.exit(0)

# MF 점수 비활성
df_score = pd.DataFrame(columns=["user_no", "item_no", "final_score"])

# =========================================================
# 2) 상품 JSON -> df_prod / df_cat
# =========================================================
def _flatten_records(obj):
    if obj is None:
        return []
    if isinstance(obj, list):
        return [x for x in obj if isinstance(x, dict)]
    if isinstance(obj, dict):
        for k in ["items", "data", "products", "result", "list"]:
            if k in obj and isinstance(obj[k], list):
                return [x for x in obj[k] if isinstance(x, dict)]
        return [obj]
    return []

def _pick(d, keys, default=None):
    for k in keys:
        if k in d and d[k] is not None and str(d[k]).strip() != "":
            return d[k]
    return default

def _brand_from_name(name: str) -> str:
    if not isinstance(name, str):
        return "UNKNOWN"
    t = name.strip().split()
    if not t:
        return "UNKNOWN"
    b = t[0].strip()
    if 1 <= len(b) <= 25:
        return b
    return "UNKNOWN"

def _to_float_price(v):
    if v is None:
        return np.nan
    try:
        if isinstance(v, str):
            v = v.replace(",", "").strip()
        return float(v)
    except:
        return np.nan

def load_products_from_json_dir(json_data_dir: str):
    def _norm_cat(x: str) -> str:
        return str(x).strip().lower().replace(" ", "_").replace("-", "_")

    json_dir = Path(json_data_dir)
    files = sorted(json_dir.glob("*.json"))

    if not files:
        df_cat = pd.DataFrame(columns=["category_id", "category_name", "parent_id"])
        df_prod = pd.DataFrame(columns=[
            "item_raw","pcode","category_id","product_name","brand","price","base_image_url",
            "topcat_id","category_name","topcat_name"
        ])
        return df_cat, df_prod

    meta = []
    for fp in files:
        orig = fp.stem.strip()
        key = _norm_cat(orig)
        meta.append((fp, orig, key))

    cat_id_map = {}
    cat_rows = []
    key_to_orig = {}
    for fp, orig, key in meta:
        if key not in cat_id_map:
            cid = len(cat_id_map) + 1
            cat_id_map[key] = cid
            cat_rows.append((cid, orig, -1))
            key_to_orig[key] = orig
        else:
            if key_to_orig.get(key) != orig:
                print(f"⚠️ 카테고리 키 충돌: '{key_to_orig.get(key)}' vs '{orig}' -> key='{key}'")

    df_cat = pd.DataFrame(cat_rows, columns=["category_id", "category_name", "parent_id"])
    cat_name_map = df_cat.set_index("category_id")["category_name"].to_dict()

    rows = []
    for fp, orig, key in meta:
        cat_id = cat_id_map[key]
        try:
            obj = json.load(open(fp, "r", encoding="utf-8"))
        except Exception as e:
            print("⚠️ JSON 로드 실패:", fp.name, "->", repr(e))
            continue

        recs = _flatten_records(obj)
        for r in recs:
            raw_id = _pick(r, ["PCode", "pcode", "P_CODE", "product_id", "id"])
            if raw_id is None:
                continue
            raw_id = str(raw_id).strip()

            name = _pick(r, ["model_name", "Name", "name", "product_name", "title"], default="")
            price = _to_float_price(_pick(r, ["Price", "price", "sale_price", "amount"], default=np.nan))
            base_img = _pick(r, ["BaseImageURL","baseImageURL","image","img","thumbnail"], default="")

            spec = r.get("Spec", {})
            if not isinstance(spec, dict):
                spec = {}

            brand = _pick(r, ["Brand","brand"], default=None)
            if brand is None:
                brand = _pick(spec, ["브랜드","제조사","제조회사","Brand","Maker"], default=None)
            if brand is None:
                brand = _brand_from_name(str(name))
            brand = str(brand) if brand is not None else "UNKNOWN"

            safe_name = str(name).strip()
            if not safe_name:
                safe_name = f"pcode_{raw_id}"

            canon_id = f"{key}:{slugify_text(safe_name)}"
            pcode = raw_id

            rows.append((canon_id, pcode, int(cat_id), str(name), brand, price, str(base_img)))

    df_prod = pd.DataFrame(rows, columns=[
        "item_raw","pcode","category_id","product_name","brand","price","base_image_url"
    ])

    if df_prod.empty:
        df_prod = pd.DataFrame(columns=[
            "item_raw","pcode","category_id","product_name","brand","price","base_image_url"
        ])

    df_prod["item_raw"] = df_prod["item_raw"].astype(str).str.strip()
    df_prod = df_prod[df_prod["item_raw"].notna() & (df_prod["item_raw"] != "")]
    df_prod = df_prod.drop_duplicates(subset=["item_raw"], keep="first").copy()

    df_prod["category_id"] = pd.to_numeric(df_prod["category_id"], errors="coerce").fillna(-1).astype(int)
    df_prod["product_name"] = df_prod["product_name"].fillna("").astype(str)
    df_prod["brand"] = df_prod["brand"].fillna("UNKNOWN").astype(str)
    df_prod["price"] = pd.to_numeric(df_prod["price"], errors="coerce")

    # topcat 계층이 없으니 동일 취급
    df_prod["topcat_id"] = df_prod["category_id"].astype(int)
    df_prod["category_name"] = df_prod["category_id"].map(cat_name_map).fillna("")
    df_prod["topcat_name"] = df_prod["topcat_id"].map(cat_name_map).fillna("")

    return df_cat, df_prod

df_cat, df_prod = load_products_from_json_dir(JSON_DATA_DIR)

print("\n===== ITEM JSON =====")
print("df_cat :", df_cat.shape, "| n_cats:", df_cat.category_id.nunique() if len(df_cat) else 0)
print("df_prod:", df_prod.shape, "| n_items(raw):", df_prod.item_raw.nunique() if len(df_prod) else 0)

# =========================================================
# 2-2) FUZZY MATCH (DB product_id -> JSON item_raw)
# =========================================================
STOP_TOKENS = {
    "해외구매","병행수입","정품","벌크","패키지","무결점","리퍼","중고",
    "블랙","화이트","실버","그레이","핑크","레드","블루","wifi","oc",
    "stcom","mini","plus","pro","se","super","refresh","v2","d6","d6x"
}

def norm_slug(slug: str) -> str:
    slug = slugify_text(slug)
    toks = [t for t in slug.split("-") if t and t not in STOP_TOKENS]
    return "-".join(toks)

def jaccard_tokens(a: str, b: str) -> float:
    A = set([t for t in a.split("-") if t])
    B = set([t for t in b.split("-") if t])
    if not A and not B:
        return 1.0
    if not A or not B:
        return 0.0
    return len(A & B) / (len(A | B) + 1e-12)

def sim_score(a: str, b: str) -> float:
    j = jaccard_tokens(a, b)
    r = SequenceMatcher(None, a, b).ratio()
    return 0.7 * j + 0.3 * r

df_prod["cat_key"] = df_prod["item_raw"].astype(str).str.split(":", n=1, expand=True)[0].str.lower()
df_prod["json_slug"] = df_prod["item_raw"].astype(str).str.split(":", n=1, expand=True)[1].fillna("")
df_prod["json_slug_norm"] = df_prod["json_slug"].apply(norm_slug)

prod_group = {}
for cat, g in df_prod.groupby("cat_key"):
    prod_group[cat] = (
        g["item_raw"].to_numpy(dtype=str),
        g["json_slug_norm"].to_numpy(dtype=str)
    )

df_ui["db_key"] = df_ui["item_raw_db"].apply(normalize_db_product_id)
tmp = df_ui["db_key"].astype(str).str.split(":", n=1, expand=True)
df_ui["db_cat"] = tmp[0].fillna("").str.lower()
df_ui["db_slug"] = tmp[1].fillna("")
df_ui["db_slug_norm"] = df_ui["db_slug"].apply(norm_slug)

THRESH = 0.60
db_to_item_raw = {}
for key, cat, dslug in df_ui[["db_key","db_cat","db_slug_norm"]].drop_duplicates().itertuples(index=False):
    if not cat or not dslug:
        continue
    cands = prod_group.get(cat)
    if cands is None:
        continue
    cand_item_raw, cand_slug = cands
    best_s = -1.0
    best_item = None

    for ir, s2 in zip(cand_item_raw, cand_slug):
        if not s2:
            continue
        sc = sim_score(dslug, s2)
        if sc > best_s:
            best_s = sc
            best_item = ir

    if best_item is not None and best_s >= THRESH:
        db_to_item_raw[str(key)] = str(best_item)

df_ui["item_raw_fuzzy"] = df_ui["db_key"].map(db_to_item_raw)
df_ui["is_fuzzy_matched"] = df_ui["item_raw_fuzzy"].notna()
df_ui["item_raw"] = df_ui["item_raw_fuzzy"].fillna(df_ui["db_key"])

matched = df_ui["is_fuzzy_matched"]
print("\n===== FUZZY MATCH =====")
print("matched db items:", int(matched.sum()), "/", len(df_ui), "| unique matched keys:", len(db_to_item_raw))
print("example mapping (up to 10):")
for i, (k, v) in enumerate(list(db_to_item_raw.items())[:10], start=1):
    print(f"  {i}. {k}  ->  {v}")

# =========================================================
# 3) item id 통합 매핑
# =========================================================
ui_items = pd.Index(df_ui["item_raw"].unique())
prod_items = pd.Index(df_prod["item_raw"].unique()) if len(df_prod) else pd.Index([])
intersection = ui_items.intersection(prod_items)

print("\n===== ID CHECK =====")
print("DB unique items   :", len(ui_items))
print("JSON unique items :", len(prod_items))
print("Intersection      :", len(intersection))

all_item_raw = ui_items.union(prod_items)
all_item_raw = [str(x).strip() for x in all_item_raw if str(x).strip() != ""]

item_map = {k: i for i, k in enumerate(all_item_raw, start=1)}
inv_item_map = {v: k for k, v in item_map.items()}

df_ui["item_no"] = df_ui["item_raw"].map(item_map).astype(int)
df_ui = df_ui.drop(columns=["item_raw"])

if len(df_prod):
    df_prod["item_no"] = df_prod["item_raw"].map(item_map)
    df_prod = df_prod[df_prod["item_no"].notna()].copy()
    df_prod["item_no"] = df_prod["item_no"].astype(int)

print("\n===== INTERACTION (MAPPED) =====")
print("df_ui:", df_ui.shape, "| users:", df_ui.user_no.nunique(), "| items:", df_ui.item_no.nunique())

# =========================================================
# 4) merge + split leave-k-out
# =========================================================
BETA_FINAL = 1.0
df = df_ui.merge(df_score, on=["user_no","item_no"], how="left")
df["final_score"] = pd.to_numeric(df["final_score"], errors="coerce").fillna(0.0).astype(float)

if len(df_prod):
    df = df.merge(df_prod[["item_no","category_id","topcat_id","brand"]], on="item_no", how="left")
else:
    df["category_id"] = -1
    df["topcat_id"] = -1
    df["brand"] = "UNKNOWN"

df["category_id"] = pd.to_numeric(df.get("category_id", -1), errors="coerce").fillna(-1).astype(int)
df["topcat_id"]   = pd.to_numeric(df.get("topcat_id", -1), errors="coerce").fillna(-1).astype(int)
df["w"] = df["implicit_score"] + BETA_FINAL * df["final_score"]

#  서비스용 전체 로그(최근 클릭 반영)
df_service = df.copy()

def split_leave_k_out(df_in: pd.DataFrame, k_test=5, k_val=5, min_train=3):
    train_rows, val_rows, test_rows = [], [], []
    for u, g in tqdm(df_in.groupby("user_no"), total=df_in.user_no.nunique(), desc="Split"):
        g = g.sort_values("w", ascending=False)
        n = len(g)
        if n <= min_train:
            train_rows.append(g)
            continue

        max_hold = max(0, n - min_train)
        hold = min(k_test + k_val, max_hold)

        g_hold  = g.iloc[:hold]
        g_train = g.iloc[hold:]

        g_test = g_hold.iloc[:min(k_test, len(g_hold))]
        g_val  = g_hold.iloc[min(k_test, len(g_hold)) : min(k_test+k_val, len(g_hold))]

        if len(g_train) > 0: train_rows.append(g_train)
        if len(g_val) > 0:   val_rows.append(g_val)
        if len(g_test) > 0:  test_rows.append(g_test)

    df_train = pd.concat(train_rows, ignore_index=True) if train_rows else pd.DataFrame(columns=df_in.columns)
    df_val   = pd.concat(val_rows, ignore_index=True)   if val_rows   else pd.DataFrame(columns=df_in.columns)
    df_test  = pd.concat(test_rows, ignore_index=True)  if test_rows  else pd.DataFrame(columns=df_in.columns)
    return df_train, df_val, df_test

df_train, df_val, df_test = split_leave_k_out(df, k_test=K_TEST, k_val=K_VAL, min_train=MIN_TRAIN)

print("\n===== SPLIT =====")
print("train/val/test:", df_train.shape, df_val.shape, df_test.shape)
print("val users:", df_val.user_no.nunique(), "| test users:", df_test.user_no.nunique())

def build_gt(df_split):
    return df_split.groupby("user_no")["item_no"].apply(lambda s: set(map(int, s.values))).to_dict()

gt_val  = build_gt(df_val)  if len(df_val)  else {}
gt_test = build_gt(df_test) if len(df_test) else {}

# 평가용 seen (train 기준)
seen_train = df_train.groupby("user_no")["item_no"].apply(lambda s: set(map(int, s.values))).to_dict() if len(df_train) else {}

# 서비스용 seen (전체 로그 기준)
seen_service = df_service.groupby("user_no")["item_no"].apply(lambda s: set(map(int, s.values))).to_dict() if len(df_service) else {}

# =========================================================
# 5) id maps
# =========================================================
ui_item_ids = set(map(int, df_ui["item_no"].unique()))
prod_item_ids = set(map(int, df_prod["item_no"].unique())) if len(df_prod) else set()

all_item_ids = np.array(sorted(ui_item_ids.union(prod_item_ids)), dtype=np.int32)
n_items = len(all_item_ids)
i2pos = {int(i): p for p, i in enumerate(all_item_ids)}

all_users = np.array(sorted(df_ui["user_no"].unique()), dtype=np.int32)
n_users = len(all_users)
u2idx = {int(u): i for i, u in enumerate(all_users)}

if n_items == 0 or n_users == 0:
    print("❌ n_items 또는 n_users가 0입니다. 추천 불가.")
    sys.exit(0)

prod_meta = df_prod.set_index("item_no")[[
    "category_id","topcat_id","brand","product_name","price","category_name","topcat_name","base_image_url"
]].to_dict("index") if len(df_prod) else {}

# =========================================================
# 6) popularity (✅ 서비스는 전체로그 기반)
# =========================================================
df_pop_base = df_service if TRAIN_ON_FULL_LOGS_FOR_SERVICE else df_train

if len(df_pop_base) > 0:
    item_pop = df_pop_base.groupby("item_no")["w"].sum()
    mx = float(item_pop.max()) if len(item_pop) else 0.0
    item_pop = (item_pop / (mx + 1e-12)).to_dict()
else:
    item_pop = {}

pop_vec = np.array([item_pop.get(int(i), 0.0) for i in all_item_ids], dtype=np.float32)
global_pop_pos = np.argsort(-pop_vec)

# topcat / finecat -> item pos
topcat_to_pos = {}
finecat_to_pos = {}
for p, iid in enumerate(all_item_ids):
    meta = prod_meta.get(int(iid))
    if meta is None:
        continue
    tc = int(meta.get("topcat_id", -1))
    fc = int(meta.get("category_id", -1))
    if tc >= 0:
        topcat_to_pos.setdefault(tc, []).append(p)
    if fc >= 0:
        finecat_to_pos.setdefault(fc, []).append(p)

def sort_by_pop(pos_list):
    pos_arr = np.array(pos_list, dtype=np.int32)
    order = np.argsort(-pop_vec[pos_arr])
    return pos_arr[order]

topcat_pop_sorted = {tc: sort_by_pop(pos) for tc, pos in topcat_to_pos.items()}
fine_pop_sorted   = {fc: sort_by_pop(pos) for fc, pos in finecat_to_pos.items()}

def tail_pool(sorted_pos, tail_frac=0.6):
    if sorted_pos is None or len(sorted_pos) == 0:
        return np.array([], dtype=np.int32)
    cut = int(len(sorted_pos) * (1.0 - tail_frac))
    cut = max(0, min(cut, len(sorted_pos)-1))
    return sorted_pos[cut:]

topcat_tail_pool = {tc: tail_pool(arr, tail_frac=0.6) for tc, arr in topcat_pop_sorted.items()}
fine_tail_pool   = {fc: tail_pool(arr, tail_frac=0.6) for fc, arr in fine_pop_sorted.items()}

# ✅ 유저 선호는 전체 로그 기반(핵심 수정)
df_pref = df_service if TRAIN_ON_FULL_LOGS_FOR_SERVICE else df_train
u_topcats = {}
u_finecats = {}
if len(df_pref) > 0:
    for u, g in df_pref.groupby("user_no"):
        g_tc = g[g["topcat_id"] >= 0].groupby("topcat_id")["w"].sum().sort_values(ascending=False)
        u_topcats[int(u)] = [int(x) for x in g_tc.index.tolist()][:USER_TOPCAT_N]

        g_fc = g[g["category_id"] >= 0].groupby("category_id")["w"].sum().sort_values(ascending=False)
        u_finecats[int(u)] = [int(x) for x in g_fc.index.tolist()][:USER_FINECAT_N]
else:
    for u in all_users:
        u_topcats[int(u)] = []
        u_finecats[int(u)] = []

# =========================================================
# 7) item co-occurrence neighbors (✅ 서비스는 전체로그 기반)
# =========================================================
print("Item cooc (sampling) ...")
rng = np.random.default_rng(SEED)

df_nb_base = df_service if TRAIN_ON_FULL_LOGS_FOR_SERVICE else df_train

train_user_items_pos = [None] * n_users
if len(df_nb_base) > 0:
    for u, g in df_nb_base.groupby("user_no"):
        ui = u2idx.get(int(u))
        if ui is None:
            continue
        g2 = g.sort_values("w", ascending=False)
        pos = g2["item_no"].map(i2pos).dropna().astype(int).to_numpy()
        pos = pos[(pos >= 0) & (pos < n_items)]
        if len(pos) > MAX_ITEMS_PER_USER:
            pos = pos[:MAX_ITEMS_PER_USER]
        train_user_items_pos[ui] = pos

cooc_counts = [None] * n_items
for ui in tqdm(range(n_users), desc="Item cooc"):
    items = train_user_items_pos[ui]
    if items is None or len(items) < 2:
        continue
    items = np.unique(items)
    m = len(items)
    if m < 2:
        continue
    for i in items:
        k = min(PAIR_SAMPLES_PER_ITEM, m - 1)
        if k <= 0:
            continue
        partners = items[items != i]
        if len(partners) == 0:
            continue
        if len(partners) <= k:
            pick = partners
        else:
            pick = rng.choice(partners, size=k, replace=False)
        d = cooc_counts[int(i)]
        if d is None:
            d = {}
            cooc_counts[int(i)] = d
        for j in pick:
            d[int(j)] = d.get(int(j), 0) + 1

item_neighbors = [None] * n_items
has_nb = 0
for i in range(n_items):
    d = cooc_counts[i]
    if not d:
        continue
    items_counts = sorted(d.items(), key=lambda x: -x[1])[:NEIGHBOR_TOPK_PER_ITEM]
    neigh = np.array([j for j, c in items_counts if j != i], dtype=np.int32)
    if len(neigh) > 0:
        item_neighbors[i] = neigh
        has_nb += 1
print(f"✅ item_neighbors: {has_nb}/{n_items} items have >=1 neighbor")

# =========================================================
# 8) 후보 생성
# =========================================================
def safe_choice(arr, size, replace=False):
    arr = np.asarray(arr, dtype=np.int32)
    if len(arr) == 0 or size <= 0:
        return np.array([], dtype=np.int32)
    size = int(min(size, len(arr))) if not replace else int(size)
    if size <= 0:
        return np.array([], dtype=np.int32)
    if (not replace) and size >= len(arr):
        return arr.copy()
    return rng.choice(arr, size=size, replace=replace)

def build_candidates_for_user(u: int) -> np.ndarray:
    ui = u2idx.get(int(u), None)
    if ui is None:
        return np.array([], dtype=np.int32)

    n_top_pop  = int(CAND_PER_USER * RATIO_TOPCAT_POP)
    n_top_tail = int(CAND_PER_USER * RATIO_TOPCAT_TAIL)
    n_f_pop    = int(CAND_PER_USER * RATIO_FINE_POP)
    n_f_tail   = int(CAND_PER_USER * RATIO_FINE_TAIL)
    n_nb       = int(CAND_PER_USER * RATIO_NEIGHBORS)
    n_glob     = int(CAND_PER_USER * RATIO_GLOBAL_FILL)

    cand = []

    # 1) topcats
    tcs = u_topcats.get(int(u), [])
    if tcs:
        per_tc_pop  = max(1, n_top_pop // len(tcs))
        per_tc_tail = max(1, n_top_tail // len(tcs))
        for tc in tcs:
            arr_pop = topcat_pop_sorted.get(int(tc))
            if arr_pop is not None and len(arr_pop) > 0:
                cand.append(arr_pop[:per_tc_pop])
            arr_tail = topcat_tail_pool.get(int(tc))
            if arr_tail is not None and len(arr_tail) > 0:
                cand.append(safe_choice(arr_tail, per_tc_tail, replace=False))

    # 2) fine categories
    fcs = u_finecats.get(int(u), [])
    if fcs:
        per_fc_pop  = max(1, n_f_pop // len(fcs))
        per_fc_tail = max(1, n_f_tail // len(fcs))
        for fc in fcs:
            arr_pop = fine_pop_sorted.get(int(fc))
            if arr_pop is not None and len(arr_pop) > 0:
                cand.append(arr_pop[:per_fc_pop])
            arr_tail = fine_tail_pool.get(int(fc))
            if arr_tail is not None and len(arr_tail) > 0:
                cand.append(safe_choice(arr_tail, per_fc_tail, replace=False))

    # 3) neighbors
    items_pos = train_user_items_pos[ui]
    if items_pos is not None and len(items_pos) > 0 and n_nb > 0:
        base = items_pos[:min(TOP_ITEMS_FOR_NEIGHBORS_PER_USER, len(items_pos))]
        nb_collect = []
        for p in base:
            nb = item_neighbors[int(p)]
            if nb is None or len(nb) == 0:
                continue
            nb_collect.append(nb[:min(NEIGHBORS_TAKE_PER_ITEM, len(nb))])
        if nb_collect:
            nb_arr = np.unique(np.concatenate(nb_collect)).astype(np.int32)
            if len(nb_arr) > n_nb:
                nb_arr = safe_choice(nb_arr, n_nb, replace=False)
            cand.append(nb_arr)

    # 4) global random tail
    if n_glob > 0 and n_items > 0:
        tail = global_pop_pos[int(n_items * 0.4):]
        cand.append(safe_choice(tail, n_glob, replace=False))

    if EVAL_SCENARIO == "GLOBAL":
        cand.append(global_pop_pos[:min(CAND_PER_USER, n_items)])

    cand_pos = np.unique(np.concatenate(cand)).astype(np.int32) if cand else np.array([], dtype=np.int32)

    # fill
    target = min(CAND_PER_USER, n_items)
    if len(cand_pos) < target:
        need = target - len(cand_pos)
        fill = global_pop_pos[:need]
        cand_pos = np.unique(np.concatenate([cand_pos, fill])).astype(np.int32)

    # cut
    if len(cand_pos) > target:
        keep_pop = int(target * 0.8)
        keep_rnd = target - keep_pop
        cand_sorted = cand_pos[np.argsort(-pop_vec[cand_pos])]
        a = cand_sorted[:keep_pop]
        b_pool = cand_sorted[keep_pop:]
        b = safe_choice(b_pool, keep_rnd, replace=False)
        cand_pos = np.unique(np.concatenate([a, b])).astype(np.int32)
        if len(cand_pos) > target:
            cand_pos = cand_pos[:target]

    return np.sort(cand_pos).astype(np.int32)

cand_pos_list = [None] * n_users
for u in all_users:
    ui = u2idx[int(u)]
    cand_pos_list[ui] = build_candidates_for_user(int(u))

print("\n===== CANDIDATES =====")
sizes = np.array([len(cand_pos_list[i]) for i in range(n_users)], dtype=int)
print("scenario:", EVAL_SCENARIO, "| avg cand:", float(sizes.mean()), "| min/max:", int(sizes.min()), int(sizes.max()))

# =========================================================
# 10) Word2Vec corpus (✅ 서비스는 전체로그 기반)
# =========================================================
def repeat_count(weight, max_rep=8, alpha=2.0):
    w = max(float(weight), 0.0)
    r = int(1 + alpha * math.log1p(w))
    return int(min(max(r, 1), max_rep))

def build_corpus(df_train_local, n_sessions, max_items_per_user):
    rng2 = np.random.default_rng(SEED)
    corpus_local = []

    for u, g in tqdm(df_train_local.groupby("user_no"), total=df_train_local.user_no.nunique(), desc="Build corpus"):
        g = g.sort_values("w", ascending=False)
        m = min(len(g), max_items_per_user)
        if m < 2:
            continue

        items = g["item_no"].values[:m].astype(int)
        w = g["w"].values[:m].astype(float)

        w_pos = np.clip(w, 0.0, None)
        if w_pos.sum() <= 1e-12:
            p = np.ones(m, dtype=np.float64) / m
        else:
            p = w_pos / (w_pos.sum() + 1e-12)
            p = p / (p.sum() + 1e-12)

        nz = int((p > 0).sum())
        if nz < 2:
            continue
        L = min(SESSION_LEN, m, nz)

        for _ in range(n_sessions):
            pick_idx = rng2.choice(np.arange(m), size=L, replace=False, p=p)
            sent = []
            for idx in pick_idx:
                iid = int(items[idx])
                rep = repeat_count(w[idx], max_rep=8, alpha=2.0)
                sent.extend([f"ITEM_{iid}"] * rep)
            if len(sent) >= 2:
                corpus_local.append(sent)

    # 모든 아이템 토큰 최소 1회
    for iid in all_item_ids:
        corpus_local.append([f"ITEM_{int(iid)}"])
    return corpus_local

df_corpus_base = df_service if TRAIN_ON_FULL_LOGS_FOR_SERVICE else df_train
corpus = build_corpus(df_corpus_base, n_sessions=N_SESSIONS_PER_USER, max_items_per_user=MAX_ITEMS_PER_USER)
print("\ncorpus size:", len(corpus))

# =========================================================
# 11) Word2Vec train + cache
# =========================================================
class SuppressStderr:
    def __enter__(self):
        self._f = open(os.devnull, "w")
        self._ctx = redirect_stderr(self._f)
        self._ctx.__enter__()
    def __exit__(self, exc_type, exc, tb):
        self._ctx.__exit__(exc_type, exc, tb)
        self._f.close()

class EpochProgress(CallbackAny2Vec):
    def __init__(self, total_epochs: int, desc: str):
        self.pbar = tqdm(total=total_epochs, desc=desc, file=sys.stdout, leave=False)
    def on_epoch_end(self, model):
        self.pbar.update(1)
    def on_train_end(self, model):
        self.pbar.close()

def train_w2v(window, vector_size=128, epochs=50, negative=15, sg=1, min_count=1, hide_noise=True):
    workers = max(1, (os.cpu_count() or 2) - 1)
    cb = EpochProgress(epochs, desc=f"Train w2v win={window}")
    kwargs = dict(
        sentences=corpus,
        vector_size=vector_size,
        window=window,
        min_count=min_count,
        workers=workers,
        sg=sg,
        negative=negative,
        sample=1e-4,
        epochs=epochs,
        seed=SEED,
        callbacks=[cb],
    )
    if hide_noise:
        with SuppressStderr():
            model = Word2Vec(**kwargs)
    else:
        model = Word2Vec(**kwargs)
    return model

def build_item_matrix(model):
    vecs = np.zeros((n_items, model.vector_size), dtype=np.float32)
    for j, iid in enumerate(all_item_ids):
        tok = f"ITEM_{int(iid)}"
        if tok in model.wv:
            v = model.wv[tok].astype(np.float32)
            vecs[j] = v / (np.linalg.norm(v) + 1e-12)
    return vecs

def build_user_matrix_from_df(item_mat, df_in):
    user_mat = np.zeros((n_users, item_mat.shape[1]), dtype=np.float32)
    if len(df_in) == 0:
        return user_mat

    uu = df_in["user_no"].map(u2idx).dropna().astype(int).to_numpy()
    ii = df_in["item_no"].map(i2pos).dropna().astype(int).to_numpy()
    ww = df_in["w"].astype(np.float32).to_numpy()

    contrib = item_mat[ii] * ww[:, None]
    np.add.at(user_mat, uu, contrib)
    return user_mat / (np.linalg.norm(user_mat, axis=1, keepdims=True) + 1e-12)

w2v_best_path = os.path.join(CACHE_DIR, "w2v_final.model")
item_mat_path = os.path.join(CACHE_DIR, "item_mat.npy")
user_mat_path = os.path.join(CACHE_DIR, "user_mat.npy")
best_json_path = os.path.join(CACHE_DIR, "best_weights.json")
sig_path = os.path.join(CACHE_DIR, "data_signature.json")

def make_signature():
    h = hashlib.md5()
    h.update(str(n_users).encode("utf-8"))
    h.update(str(n_items).encode("utf-8"))
    for u in all_users:
        h.update(str(int(u)).encode("utf-8")); h.update(b",")
    for iid in all_item_ids:
        raw = inv_item_map.get(int(iid), str(int(iid)))
        h.update(raw.encode("utf-8", errors="ignore")); h.update(b",")
    h.update(str(int(TRAIN_ON_FULL_LOGS_FOR_SERVICE)).encode("utf-8"))
    return {"n_users": int(n_users), "n_items": int(n_items), "md5": h.hexdigest()}

def cache_exists():
    return (os.path.exists(w2v_best_path) and os.path.exists(item_mat_path) and os.path.exists(user_mat_path) and os.path.exists(sig_path))

def load_cache_safely():
    sig_now = make_signature()
    sig_old = json.load(open(sig_path, "r", encoding="utf-8"))

    model = Word2Vec.load(w2v_best_path)
    item_mat = np.load(item_mat_path)
    user_mat = np.load(user_mat_path)

    mismatch = (
        sig_old.get("md5") != sig_now.get("md5")
        or item_mat.ndim != 2 or item_mat.shape[0] != n_items
        or user_mat.ndim != 2 or user_mat.shape[0] != n_users
    )
    if mismatch:
        raise RuntimeError("cache_mismatch")

    return model, item_mat, user_mat, sig_now

# =========================================================
# 12) 평가 함수
# =========================================================
def hr_at_k(topk_item_ids, gt_set):
    if not gt_set:
        return 0.0
    for iid in topk_item_ids:
        if int(iid) in gt_set:
            return 1.0
    return 0.0

def recall_at_k(topk_item_ids, gt_set):
    if not gt_set:
        return 0.0
    hit = 0
    for iid in topk_item_ids:
        if int(iid) in gt_set:
            hit += 1
    return hit / len(gt_set)

def ndcg_at_k(topk_item_ids, gt_set):
    dcg = 0.0
    for rank, iid in enumerate(topk_item_ids, start=1):
        if int(iid) in gt_set:
            dcg += 1.0 / math.log2(rank + 1)
    m = min(len(gt_set), len(topk_item_ids))
    idcg = sum(1.0 / math.log2(i + 1) for i in range(1, m + 1))
    return dcg / idcg if idcg > 0 else 0.0

def score_user_on_candidates(user_vec, item_mat, cand_pos, w_w2v, w_pop):
    cand_pos = np.asarray(cand_pos, dtype=np.int32)
    if len(cand_pos) == 0:
        return np.empty(0, dtype=np.float32), cand_pos

    cand_pos = np.unique(cand_pos)
    cand_pos = cand_pos[(cand_pos >= 0) & (cand_pos < item_mat.shape[0])]
    if len(cand_pos) == 0:
        return np.empty(0, dtype=np.float32), cand_pos

    cand_vec = item_mat[cand_pos]
    scores = (cand_vec @ user_vec).astype(np.float32) * float(w_w2v)

    if w_pop != 0:
        scores += float(w_pop) * pop_vec[cand_pos]

    return scores, cand_pos

def eval_hybrid(user_mat, item_mat, gt_dict, k, w_w2v, w_pop, user_sample=None):
    users_list = list(gt_dict.keys())
    if user_sample is not None and len(users_list) > user_sample:
        rng2 = np.random.default_rng(SEED)
        users_list = rng2.choice(users_list, size=user_sample, replace=False).tolist()

    HRs, Rs, Ns = [], [], []
    for u in users_list:
        ui = u2idx.get(int(u), None)
        if ui is None or ui < 0 or ui >= user_mat.shape[0]:
            continue

        cand_pos = cand_pos_list[ui]
        if cand_pos is None or len(cand_pos) == 0:
            continue

        scores, cand_pos2 = score_user_on_candidates(
            user_mat[ui], item_mat, cand_pos, w_w2v=w_w2v, w_pop=w_pop
        )
        if len(scores) == 0 or len(cand_pos2) == 0:
            continue

        # ✅ 평가에서는 train seen 제거
        seen = seen_train.get(int(u), None)
        if seen:
            seen_pos = np.array([i2pos.get(int(it), -1) for it in seen], dtype=np.int32)
            seen_pos = seen_pos[(seen_pos >= 0) & (seen_pos < n_items)]
            if len(seen_pos) > 0:
                j = np.searchsorted(cand_pos2, seen_pos)
                cand_pad = np.append(cand_pos2, -1)
                ok = (cand_pad[j] == seen_pos)
                if ok.any():
                    scores[j[ok]] = -np.inf

        kk = min(k, len(cand_pos2))
        if kk <= 0:
            continue

        top_idx = np.argpartition(-scores, kk - 1)[:kk]
        top_idx = top_idx[np.argsort(-scores[top_idx])]
        top_items = all_item_ids[cand_pos2[top_idx]]

        gt = gt_dict[int(u)]
        HRs.append(hr_at_k(top_items, gt))
        Rs.append(recall_at_k(top_items, gt))
        Ns.append(ndcg_at_k(top_items, gt))

    return {
        f"HR@{k}": float(np.mean(HRs)) if HRs else 0.0,
        f"Recall@{k}": float(np.mean(Rs)) if Rs else 0.0,
        f"NDCG@{k}": float(np.mean(Ns)) if Ns else 0.0,
        "n_users_eval": int(len(HRs))
    }

# =========================================================
# 13) Train or cache load
# =========================================================
model_final = None
item_mat_final = None
user_mat_final = None

if USE_CACHE and cache_exists():
    print("\n✅ Cache found. Loading from:", CACHE_DIR)
    try:
        model_final, item_mat_final, user_mat_final, sig_now = load_cache_safely()
        print("✅ Cache OK:", sig_now)
    except Exception as e:
        print("⚠️ Cache invalid -> retrain. reason:", repr(e))
        model_final = None

if model_final is None:
    print("\n==============================")
    print("Stage1: quick tune (window) on sampled VAL users")
    print("==============================")

    best_stage1 = None
    for win in WINDOW_GRID_STAGE1:
        model = train_w2v(window=win, vector_size=BEST_VECTOR_SIZE, epochs=EPOCHS_STAGE1, negative=NEGATIVE)
        item_mat = build_item_matrix(model)
        # ✅ user_vec도 서비스 기준
        user_mat = build_user_matrix_from_df(item_mat, df_service if TRAIN_ON_FULL_LOGS_FOR_SERVICE else df_train)

        m = eval_hybrid(user_mat, item_mat, gt_val, k=10, w_w2v=0.6, w_pop=0.0, user_sample=800)
        print(f"[S1] win={win:2d} -> HR@10={m['HR@10']:.4f}, Recall@10={m['Recall@10']:.4f}, NDCG@10={m['NDCG@10']:.4f} (n={m['n_users_eval']})")

        if (best_stage1 is None) or (m["HR@10"] + m["Recall@10"] > best_stage1["score"]):
            best_stage1 = {"win": win, "score": m["HR@10"] + m["Recall@10"], "m": m}

    BEST_WINDOW = best_stage1["win"] if best_stage1 else WINDOW_GRID_STAGE1[0]
    print("\n✅ BEST_WINDOW:", BEST_WINDOW)

    print("\n==============================")
    print("Training FINAL Word2Vec (more epochs)")
    print("==============================")

    model_final = train_w2v(window=BEST_WINDOW, vector_size=BEST_VECTOR_SIZE, epochs=EPOCHS_FINAL, negative=NEGATIVE)
    item_mat_final = build_item_matrix(model_final)
    user_mat_final = build_user_matrix_from_df(item_mat_final, df_service if TRAIN_ON_FULL_LOGS_FOR_SERVICE else df_train)

    if USE_CACHE:
        sig_now = make_signature()
        model_final.save(w2v_best_path)
        np.save(item_mat_path, item_mat_final)
        np.save(user_mat_path, user_mat_final)
        with open(sig_path, "w", encoding="utf-8") as f:
            json.dump(sig_now, f, ensure_ascii=False, indent=2)
        print("✅ Saved cache to:", CACHE_DIR)

# =========================================================
# 14) weight tune (W2V + POP)
# =========================================================
best = None
if USE_CACHE and os.path.exists(best_json_path):
    try:
        best = json.load(open(best_json_path, "r", encoding="utf-8"))
        print("\n✅ Loaded best weights from cache:", best_json_path)
    except:
        best = None

if best is None:
    print("\n==============================")
    print("Stage2: tuning weights (sampled VAL)")
    print("==============================")

    for w_w2v in W_W2V_GRID:
        for w_pop in W_POP_GRID:
            m = eval_hybrid(user_mat_final, item_mat_final, gt_val, k=10,
                            w_w2v=w_w2v, w_pop=w_pop, user_sample=1200)
            print(f"w2v={w_w2v:.1f} pop={w_pop:.1f} -> "
                  f"HR@10={m['HR@10']:.4f} R@10={m['Recall@10']:.4f} N@10={m['NDCG@10']:.4f} (n={m['n_users_eval']})")

            obj = (m["HR@10"] + m["Recall@10"] + 0.3*m["NDCG@10"])
            if (best is None) or (obj > best["obj"]):
                best = {"obj": float(obj), "w_w2v": float(w_w2v), "w_pop": float(w_pop), "m": m}

    print("\n==============================")
    print("CHOSEN BEST WEIGHTS")
    print("==============================")
    print(best)

    if USE_CACHE:
        with open(best_json_path, "w", encoding="utf-8") as f:
            json.dump(best, f, ensure_ascii=False, indent=2)
        print("✅ Saved best weights to:", best_json_path)

# =========================================================
# 15) Full VAL/TEST 평가
# =========================================================
print("\n==============================")
print("FULL VAL / TEST confirm")
print("==============================")

for k in TOPK_LIST:
    mv = eval_hybrid(user_mat_final, item_mat_final, gt_val, k=k,
                     w_w2v=best["w_w2v"], w_pop=best["w_pop"], user_sample=None)
    mt = eval_hybrid(user_mat_final, item_mat_final, gt_test, k=k,
                     w_w2v=best["w_w2v"], w_pop=best["w_pop"], user_sample=None)
    print(f"\n[VAL @ {k}]  ", {kk:v for kk,v in mv.items() if kk!='n_users_eval'}, "| n_users:", mv["n_users_eval"])
    print(f"[TEST @ {k}] ", {kk:v for kk,v in mt.items() if kk!='n_users_eval'}, "| n_users:", mt["n_users_eval"])

# =========================================================
# 16) 추천 생성 + 저장
# =========================================================
def minmax_0_100_finite(arr):
    arr = np.asarray(arr, dtype=np.float32)
    finite = np.isfinite(arr)
    out = np.full(arr.shape, np.nan, dtype=np.float32)
    if finite.sum() == 0:
        return out
    a = arr[finite]
    mn = float(a.min())
    mx = float(a.max())
    if mx - mn < 1e-12:
        out[finite] = 50.0
    else:
        out[finite] = (a - mn) / (mx - mn) * 100.0
    return out

if len(df_prod):
    prod_name_map  = df_prod.set_index("item_no")["product_name"].to_dict()
    brand_map      = df_prod.set_index("item_no")["brand"].to_dict()
    topcat_map     = df_prod.set_index("item_no")["topcat_name"].to_dict()
    cat_map        = df_prod.set_index("item_no")["category_name"].to_dict()
    price_map      = df_prod.set_index("item_no")["price"].to_dict()
    img_map        = df_prod.set_index("item_no")["base_image_url"].to_dict()
    finecat_id_map = df_prod.set_index("item_no")["category_id"].to_dict()
    topcat_id_map  = df_prod.set_index("item_no")["topcat_id"].to_dict()
else:
    prod_name_map = {}
    brand_map = {}
    topcat_map = {}
    cat_map = {}
    price_map = {}
    img_map = {}
    finecat_id_map = {}
    topcat_id_map = {}

def rerank_soft_caps(item_ids):
    picked = []
    cnt_tc = defaultdict(int)
    cnt_fc = defaultdict(int)
    cnt_br = defaultdict(int)

    def ok_add(iid):
        tc = int(topcat_id_map.get(iid, -1))
        fc = int(finecat_id_map.get(iid, -1))
        br = str(brand_map.get(iid, "UNKNOWN"))
        if tc >= 0 and cnt_tc[tc] >= CAP_TOPCAT:
            return False
        if fc >= 0 and cnt_fc[fc] >= CAP_FINECAT:
            return False
        if cnt_br[br] >= CAP_BRAND:
            return False
        return True

    def add(iid):
        picked.append(iid)
        tc = int(topcat_id_map.get(iid, -1))
        fc = int(finecat_id_map.get(iid, -1))
        br = str(brand_map.get(iid, "UNKNOWN"))
        if tc >= 0: cnt_tc[tc] += 1
        if fc >= 0: cnt_fc[fc] += 1
        cnt_br[br] += 1

    for iid in item_ids:
        if ok_add(iid):
            add(iid)
        if len(picked) >= TOPN_SAVE:
            return picked

    for iid in item_ids:
        if iid in picked:
            continue
        add(iid)
        if len(picked) >= TOPN_SAVE:
            break
    return picked

def filter_candidates_by_topcats(cand_pos2, scores, allowed_tcs, min_keep=10):
    """cand_pos2/scores 단계에서 topcat 선필터. 너무 적으면 원본 유지."""
    if not allowed_tcs:
        return cand_pos2, scores
    keep_mask = np.array([
        int(topcat_id_map.get(int(all_item_ids[p]), -1)) in allowed_tcs
        for p in cand_pos2
    ], dtype=bool)
    if keep_mask.sum() >= min_keep:
        return cand_pos2[keep_mask], scores[keep_mask]
    return cand_pos2, scores

rows_out = []

print("\n==============================")
print("Generating recommendations (SERVICE) WITH names + topcat-first filtering")
print("==============================")
print(f"CAND_PER_USER={CAND_PER_USER}, TOPN_SAVE={TOPN_SAVE}, THRESHOLD={THRESHOLD_0_100}")

for u in tqdm(all_users, desc="Recommend"):
    ui = u2idx[int(u)]
    cand_pos = cand_pos_list[ui]
    if cand_pos is None or len(cand_pos) == 0:
        continue

    scores, cand_pos2 = score_user_on_candidates(
        user_mat_final[ui], item_mat_final, cand_pos,
        w_w2v=best["w_w2v"], w_pop=best["w_pop"]
    )
    if len(scores) == 0:
        continue

    # ✅ topcat 선호를 "랭킹 전에" 강제 (핵심)
    allowed_tcs = set(u_topcats.get(int(u), []))
    cand_pos2, scores = filter_candidates_by_topcats(cand_pos2, scores, allowed_tcs, min_keep=TOPN_SAVE)

    # ✅ 서비스에서는 전체 seen 제거
    seen = seen_service.get(int(u), None)
    if seen:
        seen_pos = np.array([i2pos.get(int(it), -1) for it in seen], dtype=np.int32)
        seen_pos = seen_pos[(seen_pos >= 0) & (seen_pos < n_items)]
        if len(seen_pos) > 0:
            j = np.searchsorted(cand_pos2, seen_pos)
            cand_pad = np.append(cand_pos2, -1)
            ok = (cand_pad[j] == seen_pos)
            if ok.any():
                scores[j[ok]] = -np.inf

    if np.isfinite(scores).sum() == 0:
        # 전부 -inf면 글로벌 인기에서 unseen으로 채움
        fill = []
        seen_set = seen_service.get(int(u), set())
        for p in global_pop_pos:
            iid = int(all_item_ids[int(p)])
            if iid not in seen_set:
                fill.append(iid)
            if len(fill) >= TOPN_SAVE:
                break
        picked = rerank_soft_caps(fill)
        for rank, item_id in enumerate(picked, start=1):
            product_id = inv_item_map.get(int(item_id), str(item_id))
            rows_out.append((int(u), product_id,
                             prod_name_map.get(item_id, "") or product_id,
                             brand_map.get(item_id, "UNKNOWN"),
                             topcat_map.get(item_id, ""),
                             cat_map.get(item_id, ""),
                             float(price_map.get(item_id, np.nan)),
                             img_map.get(item_id, ""),
                             np.nan,
                             int(rank)))
        continue

    # 랭킹은 raw scores로
    M = min(300, len(cand_pos2))
    top_idx = np.argpartition(-scores, M - 1)[:M]
    top_idx = top_idx[np.argsort(-scores[top_idx])]

    item_ids_ranked = [int(all_item_ids[int(cand_pos2[i])]) for i in top_idx]
    top_scores_raw = scores[top_idx]

    # ✅ 표시용 0~100 스케일은 top M raw에만 + finite
    scores_ranked = minmax_0_100_finite(top_scores_raw)

    above = [iid for iid, sc in zip(item_ids_ranked, scores_ranked)
             if (sc is not None and np.isfinite(sc) and float(sc) >= THRESHOLD_0_100)]
    below = [iid for iid, sc in zip(item_ids_ranked, scores_ranked)
             if (sc is None or (not np.isfinite(sc)) or float(sc) < THRESHOLD_0_100)]
    item_ids_pref = above + below

    picked = rerank_soft_caps(item_ids_pref)

    score_map = {}
    for iid, sc in zip(item_ids_ranked, scores_ranked):
        if sc is None or (isinstance(sc, float) and np.isnan(sc)):
            continue
        if np.isfinite(sc):
            score_map[iid] = float(sc)

    for rank, item_id in enumerate(picked, start=1):
        product_id = inv_item_map.get(int(item_id), str(item_id))  # ✅ DB에 저장할 basekey(cat:slug)
        rows_out.append((
            int(u),
            product_id,
            prod_name_map.get(item_id, "") or product_id,
            brand_map.get(item_id, "UNKNOWN"),
            topcat_map.get(item_id, ""),
            cat_map.get(item_id, ""),
            float(price_map.get(item_id, np.nan)),
            img_map.get(item_id, ""),
            float(score_map.get(item_id, np.nan)),
            int(rank),
        ))

out_path = os.path.join(OUT_DIR, OUT_NAME)
df_out = pd.DataFrame(rows_out, columns=[
    "user_no","product_id","product_name","brand","topcat_name","category_name",
    "price","base_image_url","score_0_100","rank"
])
df_out.to_csv(out_path, index=False, encoding="utf-8-sig")

# DB 저장
df_db = df_out.rename(columns={"score_0_100": "score", "rank": "rec_rank"})
df_db = df_db[["user_no", "product_id", "score", "rec_rank"]]

df_db.to_sql(
    "user_recommendations",
    engine,
    if_exists="replace",  # 운영에서는 append 권장
    index=False
)

print("\n✅ Saved:", out_path)
print("rows:", len(df_out), "| users_with_rec:", df_out.user_no.nunique())
print(df_out.head(30))

# =========================================================
# 17) 디버그 출력(유저 선호 topcat 확인)
# =========================================================
try:
    u_dbg = int(all_users[0]) if len(all_users) else 0
    print("\n===== DEBUG (USER TOPCATS) =====")
    print("user:", u_dbg)
    print("u_topcats ids:", u_topcats.get(u_dbg, []))
    print("u_topcats names:", [df_cat.set_index("category_id")["category_name"].to_dict().get(tc, tc) for tc in u_topcats.get(u_dbg, [])])
except Exception as e:
    print("⚠️ DEBUG skipped:", repr(e))
