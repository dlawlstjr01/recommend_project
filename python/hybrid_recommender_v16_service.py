# -*- coding: utf-8 -*-
# =========================================================
# HYBRID RECOMMENDER v16 (SERVICE FULL)
# =========================================================
# 목표:
#  1) Recall@10 올리기 위한 후보 확장 (CAND_PER_USER=1200)
#     - TopCat 인기 + TopCat tail 랜덤
#     - FineCat 인기 + FineCat tail 랜덤
#     - Item co-occurrence neighbors (train 기반)로 "정답 커버리지" 상승
#     - Global 인기 + Global 랜덤으로 fallback
#
#  2) 안정성:
#     - rng.choice p 합=1 오류 방지
#     - searchsorted IndexError 방지 (pad 사용)
#     - 카테고리 NaN / NULL 안전
#
#  3) 저장:
#     - recommendations_hybrid_top10_threshold70_with_names.csv
#     - (옵션) cache 디렉토리에 w2v model/item_mat/user_mat/best_weights 저장
#
#  4) 리랭커:
#     - TopCat / FineCat / Brand soft-cap 리랭커 적용
#     - Top10은 "무조건" 채움 (threshold는 '우선순위'로만 사용)
# =========================================================

import os, re, sys, math, random
from pathlib import Path
from collections import defaultdict
from sqlalchemy import create_engine

import numpy as np
import pandas as pd
from tqdm.auto import tqdm
from contextlib import redirect_stderr

from gensim.models import Word2Vec
from gensim.models.callbacks import CallbackAny2Vec

engine = create_engine(
    "mysql+pymysql://cgi_25K_donga1_p2_3:smhrd3@project-db-campus.smhrd.com:3307/cgi_25K_donga1_p2_3?charset=utf8mb4"
)

# -----------------------------
# 0) 설정 (여기만 조절하면 됨)
# -----------------------------
SEED = 42
random.seed(SEED)
np.random.seed(SEED)

# 평가 시나리오
EVAL_SCENARIO = "BROWSE_TOPCATS"   # "GLOBAL" or "BROWSE_TOPCATS"

TOPK_LIST = [10, 50]
CAND_PER_USER = 1200              # v16 핵심: 900 -> 1200
USER_TOPCAT_N = 3
USER_FINECAT_N = 6                # fine category도 같이 씀

# leave-k-out
K_TEST = 5
K_VAL  = 5
MIN_TRAIN = 3

# Word2Vec
WINDOW_GRID_STAGE1 = [10, 15, 20]
EPOCHS_STAGE1 = 20
BEST_VECTOR_SIZE = 128
EPOCHS_FINAL = 90
NEGATIVE = 15

# corpus
N_SESSIONS_PER_USER = 10
MAX_ITEMS_PER_USER = 40
SESSION_LEN = 20

# 하이브리드 가중치 grid
W_W2V_GRID = [0.4, 0.6, 0.8]
W_MF_GRID  = [0.2, 0.4, 0.6]
W_POP_GRID = [0.0, 0.2, 0.4]

# 추천 저장
THRESHOLD_0_100 = 70.0
OUT_NAME = "recommendations_hybrid_top10_threshold70_with_names.csv"
TOPN_SAVE = 10

# (중요) 후보 mix 비율
# - 이 비율들은 "대략"이고, 실제로는 중복/부족분 채우기 때문에 정확히 안 맞을 수 있음
RATIO_TOPCAT_POP   = 0.30
RATIO_TOPCAT_TAIL  = 0.10
RATIO_FINE_POP     = 0.20
RATIO_FINE_TAIL    = 0.10
RATIO_NEIGHBORS    = 0.25
RATIO_GLOBAL_FILL  = 0.05

# co-occurrence neighbors 설정 (train 기반)
NEIGHBOR_TOPK_PER_ITEM = 60
TOP_ITEMS_FOR_NEIGHBORS_PER_USER = 8
NEIGHBORS_TAKE_PER_ITEM = 25
PAIR_SAMPLES_PER_ITEM = 6   # co-occ 계산 시 per item 샘플링으로 메모리/시간 절약

# 리랭커 상한(soft-cap)
CAP_TOPCAT = 6
CAP_FINECAT = 4
CAP_BRAND = 3

# 캐시
USE_CACHE = True
CACHE_DIR_NAME = "hybrid_cache_v16"

pd.set_option("display.max_columns", 120)
pd.set_option("display.width", 180)

OUT_DIR = str(Path.cwd())
CACHE_DIR = os.path.join(OUT_DIR, CACHE_DIR_NAME)
if USE_CACHE:
    os.makedirs(CACHE_DIR, exist_ok=True)


# =========================================================
# 1) 파일 경로 자동 탐색 (+ Colab Drive 폴더 포함)
# =========================================================
print("✅ CWD:", Path.cwd())

IS_COLAB = False
try:
    import google.colab  # noqa
    IS_COLAB = True
except:
    IS_COLAB = False

# FILES = {
#     "INTERACTION_CSV": "user_item_interaction_matrix_robust.csv",
#     "SCORE_SQL":       "recommendation_score_dummy_from_logs_v2.sql",
#     "ITEM_SQL":        "item_dummy_categories_products_details.sql",
# }

# def find_file_fast(filename: str, roots, max_depth=10):
#     filename = str(filename)
#     for root in roots:
#         root = Path(root)
#         if not root.exists():
#             continue
#         p = root / filename
#         if p.exists():
#             return str(p)

#     for root in roots:
#         root = Path(root)
#         if not root.exists():
#             continue
#         for dirpath, dirnames, filenames in os.walk(root):
#             dp = Path(dirpath)
#             try:
#                 rel = dp.relative_to(root)
#                 if len(rel.parts) > max_depth:
#                     dirnames[:] = []
#                     continue
#             except:
#                 pass
#             if filename in filenames:
#                 return str(dp / filename)
#     return None

# roots = [
#     Path.cwd(),
#     Path.cwd() / "data",
#     Path.cwd().parent,
#     Path.cwd().parent / "data",
# ]

# if IS_COLAB:
#     roots += [
#         Path("/content"),
#         Path("/content/drive/MyDrive"),
#         Path("/content/drive/MyDrive/data"),
#         Path("/content/drive/MyDrive/동아 MX 스쿨"),
#         Path("/content/drive/MyDrive/동아 MX 스쿨/data"),
#     ]

# paths = {k: find_file_fast(v, roots) for k, v in FILES.items()}

# print("\n===== FOUND PATHS =====")
# for k, v in paths.items():
#     print(k, "=>", v)

# missing = [k for k, v in paths.items() if v is None]
# if missing:
#     print("\n❌ 못 찾은 파일:", missing)
#     print("\n📌 해결: roots에 네 실제 폴더를 추가해줘")
#     raise FileNotFoundError("파일을 자동으로 못 찾았어. roots를 추가해줘.")

# INTERACTION_CSV = paths["INTERACTION_CSV"]
# SCORE_SQL       = paths["SCORE_SQL"]
# ITEM_SQL        = paths["ITEM_SQL"]

# OUT_DIR = str(Path(INTERACTION_CSV).parent)
# print("\n✅ OUT_DIR:", OUT_DIR)

# CACHE_DIR = os.path.join(OUT_DIR, CACHE_DIR_NAME)
# if USE_CACHE:
#     os.makedirs(CACHE_DIR, exist_ok=True)

# =========================================================
# 2) interaction CSV 로드
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

# product_id (문자열) → 내부용 숫자 item_no 매핑
df_ui["item_str"] = df_ui["item_no"].astype(str)
item_map = {k: i for i, k in enumerate(df_ui["item_str"].unique(), start=1)}
df_ui["item_no"] = df_ui["item_str"].map(item_map).astype(int)

df_ui = df_ui[df_ui["user_no"] >= 0].copy()
df_ui.drop(columns=["item_str"], inplace=True)

print("\n===== INTERACTION =====")
print("df_ui:", df_ui.shape, "| users:", df_ui.user_no.nunique(), "| items:", df_ui.item_no.nunique())
df_score = pd.DataFrame(
    columns=["user_no", "item_no", "final_score"]
)
# =========================================================
# 3) SCORE SQL 파싱 (추천 점수)
# =========================================================
def load_score_sql_fast(path: str) -> pd.DataFrame:
    txt = open(path, "r", encoding="utf-8").read()
    inserts = list(re.finditer(
        r"INSERT INTO\s+`추천 점수`\s*\((.*?)\)\s*VALUES\s*(.*?);",
        txt, flags=re.S | re.I
    ))
    if not inserts:
        raise ValueError("Cannot find INSERT INTO `추천 점수` ... VALUES ...;")

    rows = []
    for ins in inserts:
        cols = [c.strip().strip("`") for c in ins.group(1).split(",")]
        vals_raw = ins.group(2)

        idx_user = cols.index("사용자 순번")
        idx_item = cols.index("상품 순번")
        idx_final= cols.index("최종 점수")

        tup_list = re.findall(r"\((.*?)\)", vals_raw, flags=re.S)
        for t in tup_list:
            parts = [x.strip() for x in t.split(",")]

            def to_int(x):
                return -1 if x.upper() == "NULL" else int(float(x))
            def to_float(x):
                return 0.0 if x.upper() == "NULL" else float(x)

            u   = to_int(parts[idx_user])
            it  = to_int(parts[idx_item])
            fin = to_float(parts[idx_final])
            if u >= 0 and it >= 0:
                rows.append((u, it, fin))

    df = pd.DataFrame(rows, columns=["user_no", "item_no", "final_score"])
    df["user_no"] = pd.to_numeric(df["user_no"], errors="coerce").fillna(-1).astype(int)
    df["item_no"] = pd.to_numeric(df["item_no"], errors="coerce").fillna(-1).astype(int)
    df["final_score"] = pd.to_numeric(df["final_score"], errors="coerce").fillna(0.0).astype(float)
    df = df[(df["user_no"] >= 0) & (df["item_no"] >= 0)].copy()
    return df

# df_score = load_score_sql_fast(SCORE_SQL)
# print("\n===== SCORE SQL =====")
# print("df_score:", df_score.shape,
#       "| final_score min/max:", float(df_score.final_score.min()), float(df_score.final_score.max()))

# =========================================================
# 4) ITEM SQL 파싱 (카테고리 + 상품명)
# =========================================================
def parse_insert_tuples(vals_raw: str):
    s = vals_raw
    i, n = 0, len(s)
    while i < n:
        if s[i] != "(":
            i += 1
            continue
        i += 1
        parts = []
        tok = []
        in_str = False
        esc = False
        while i < n:
            ch = s[i]
            if in_str:
                tok.append(ch)
                if esc:
                    esc = False
                else:
                    if ch == "\\":
                        esc = True
                    elif ch == "'":
                        in_str = False
            else:
                if ch == "'":
                    in_str = True
                    tok.append(ch)
                elif ch == ",":
                    parts.append("".join(tok).strip())
                    tok = []
                elif ch == ")":
                    parts.append("".join(tok).strip())
                    tok = []
                    break
                else:
                    tok.append(ch)
            i += 1
        i += 1
        yield parts

def parse_sql_value(x: str):
    x = x.strip()
    if x.upper() == "NULL":
        return None
    if len(x) >= 2 and x[0] == "'" and x[-1] == "'":
        return x[1:-1].replace("\\'", "'").replace("\\\\", "\\")
    try:
        if "." in x:
            return float(x)
        return int(x)
    except:
        return x

def load_categories_and_products_from_db(engine):
    # -------------------
    # CATEGORY (대문자)
    # -------------------
    df_cat = pd.read_sql(
        """
        SELECT
            category_id,
            category_name,
            parent_id
        FROM CATEGORY
        """,
        engine
    )

    df_cat["category_id"] = pd.to_numeric(df_cat["category_id"], errors="coerce").fillna(-1).astype(int)
    df_cat["parent_id"]   = pd.to_numeric(df_cat["parent_id"], errors="coerce").fillna(-1).astype(int)
    df_cat["category_name"] = df_cat["category_name"].fillna("").astype(str)
    df_cat = df_cat[df_cat["category_id"] >= 0].copy()

    # -------------------
    # PRODUCT (대문자)
    # -------------------
    df_prod = pd.read_sql(
        """
        SELECT
            product_id AS item_no,
            category_id,
            product_name,
            brand,
            price
        FROM PRODUCT
        """,
        engine
    )

    df_prod["item_no"] = pd.to_numeric(df_prod["item_no"], errors="coerce").fillna(-1).astype(int)
    df_prod["category_id"] = pd.to_numeric(df_prod["category_id"], errors="coerce").fillna(-1).astype(int)
    df_prod["product_name"] = df_prod["product_name"].fillna("").astype(str)
    df_prod["brand"] = df_prod["brand"].fillna("UNKNOWN").astype(str)
    df_prod["price"] = pd.to_numeric(df_prod["price"], errors="coerce")

    df_prod = df_prod[df_prod["item_no"] >= 0].copy()

    return df_cat, df_prod


df_cat, df_prod = load_categories_and_products_from_db(engine)


cat_parent = df_cat.set_index("category_id")["parent_id"].to_dict()
cat_name   = df_cat.set_index("category_id")["category_name"].to_dict()

def get_topcat(cat_id):
    if cat_id is None:
        return -1
    try:
        if isinstance(cat_id, float) and (not np.isfinite(cat_id)):
            return -1
        cur = int(cat_id)
    except:
        return -1
    if cur < 0:
        return -1
    seen = set()
    while True:
        if cur in seen:
            return cur
        seen.add(cur)
        p = cat_parent.get(cur, None)
        if p is None:
            return cur
        try:
            cur = int(p)
        except:
            return cur

df_prod["topcat_id"] = df_prod["category_id"].astype(int)
df_prod["category_name"] = ""
df_prod["topcat_name"] = ""

print("\n===== ITEM SQL =====")
print("df_cat :", df_cat.shape, "| n_cats:", df_cat.category_id.nunique())
print("df_prod:", df_prod.shape, "| n_items:", df_prod.item_no.nunique())

# =========================================================
# 5) merge (implicit + final_score) + split leave-k-out
# =========================================================
BETA_FINAL = 1.0
df = df_ui.merge(df_score, on=["user_no","item_no"], how="left")
df["final_score"] = df["final_score"].fillna(0.0)
df = df.merge(df_prod[["item_no","category_id","topcat_id"]], on="item_no", how="left")
df["category_id"] = pd.to_numeric(df["category_id"], errors="coerce").fillna(-1).astype(int)
df["topcat_id"]   = pd.to_numeric(df["topcat_id"], errors="coerce").fillna(-1).astype(int)
df["w"] = df["implicit_score"] + BETA_FINAL * df["final_score"]

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

gt_val  = build_gt(df_val)
gt_test = build_gt(df_test)
seen_train = df_train.groupby("user_no")["item_no"].apply(lambda s: set(map(int, s.values))).to_dict()

# id maps
all_item_ids = np.array(sorted(df_ui["item_no"].unique()), dtype=np.int32)
i2pos = {int(i): p for p, i in enumerate(all_item_ids)}
n_items = len(all_item_ids)

all_users = np.array(sorted(df_ui["user_no"].unique()), dtype=np.int32)
u2idx = {int(u): i for i, u in enumerate(all_users)}
n_users = len(all_users)

# meta maps
prod_meta = df_prod.set_index("item_no")[["category_id","topcat_id","brand","product_name","price","category_name","topcat_name"]].to_dict("index")

# =========================================================
# 6) popularity (train 기반)
# =========================================================
item_pop = df_train.groupby("item_no")["w"].sum()
item_pop = (item_pop / (item_pop.max() + 1e-12)).to_dict()
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

# tail pools (pop 하위 60%에서 랜덤)
def tail_pool(sorted_pos, tail_frac=0.6):
    if sorted_pos is None or len(sorted_pos) == 0:
        return np.array([], dtype=np.int32)
    cut = int(len(sorted_pos) * (1.0 - tail_frac))
    cut = max(0, min(cut, len(sorted_pos)-1))
    return sorted_pos[cut:]

topcat_tail_pool = {tc: tail_pool(arr, tail_frac=0.6) for tc, arr in topcat_pop_sorted.items()}
fine_tail_pool   = {fc: tail_pool(arr, tail_frac=0.6) for fc, arr in fine_pop_sorted.items()}

# 유저 topcat/fine 선호
u_topcats = {}
u_finecats = {}
for u, g in df_train.groupby("user_no"):
    g_tc = g[g["topcat_id"] >= 0].groupby("topcat_id")["w"].sum().sort_values(ascending=False)
    tcs = [int(x) for x in g_tc.index.tolist()][:USER_TOPCAT_N]
    u_topcats[int(u)] = tcs

    g_fc = g[g["category_id"] >= 0].groupby("category_id")["w"].sum().sort_values(ascending=False)
    fcs = [int(x) for x in g_fc.index.tolist()][:USER_FINECAT_N]
    u_finecats[int(u)] = fcs

# =========================================================
# 7) item co-occurrence neighbors (train 기반, 샘플링 버전)
# =========================================================
print("Item cooc (sampling) ...")
rng = np.random.default_rng(SEED)

# user -> train item positions (w 상위 MAX_ITEMS_PER_USER만)
train_user_items_pos = [None] * n_users
for u, g in df_train.groupby("user_no"):
    ui = u2idx.get(int(u))
    if ui is None:
        continue
    g2 = g.sort_values("w", ascending=False)
    pos = g2["item_no"].map(i2pos).dropna().astype(int).to_numpy()
    pos = pos[(pos >= 0) & (pos < n_items)]
    if len(pos) > MAX_ITEMS_PER_USER:
        pos = pos[:MAX_ITEMS_PER_USER]
    train_user_items_pos[ui] = pos

# counts per item (dict) but bounded by sampling
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
        k = min(PAIR_SAMPLES_PER_ITEM, m-1)
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

# finalize neighbor arrays
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
# 8) 후보 생성 (v16)
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

    # 3) neighbors from top interacted items
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
    if n_glob > 0:
        tail = global_pop_pos[int(n_items*0.4):]
        cand.append(safe_choice(tail, n_glob, replace=False))

    if EVAL_SCENARIO == "GLOBAL":
        cand.append(global_pop_pos[:min(CAND_PER_USER, n_items)])

    if cand:
        cand_pos = np.unique(np.concatenate(cand)).astype(np.int32)
    else:
        cand_pos = np.array([], dtype=np.int32)

    if len(cand_pos) < CAND_PER_USER:
        need = CAND_PER_USER - len(cand_pos)
        fill = global_pop_pos[:need]
        cand_pos = np.unique(np.concatenate([cand_pos, fill])).astype(np.int32)

    if len(cand_pos) > CAND_PER_USER:
        keep_pop = int(CAND_PER_USER * 0.8)
        keep_rnd = CAND_PER_USER - keep_pop
        cand_sorted = cand_pos[np.argsort(-pop_vec[cand_pos])]
        a = cand_sorted[:keep_pop]
        b_pool = cand_sorted[keep_pop:]
        b = safe_choice(b_pool, keep_rnd, replace=False)
        cand_pos = np.unique(np.concatenate([a, b])).astype(np.int32)
        if len(cand_pos) > CAND_PER_USER:
            cand_pos = cand_pos[:CAND_PER_USER]

    return np.sort(cand_pos).astype(np.int32)

cand_pos_list = [None] * n_users
for u in all_users:
    ui = u2idx[int(u)]
    cand_pos_list[ui] = build_candidates_for_user(int(u))

print("\n===== CANDIDATES =====")
sizes = np.array([len(cand_pos_list[i]) for i in range(n_users)], dtype=int)
print("scenario:", EVAL_SCENARIO, "| avg cand:", float(sizes.mean()), "| min/max:", int(sizes.min()), int(sizes.max()))

def coverage_report(gt_dict, label):
    total_items = 0
    hit_items = 0
    hit_users = 0
    for u, gt in gt_dict.items():
        ui = u2idx.get(int(u))
        if ui is None:
            continue
        cand = cand_pos_list[ui]
        if cand is None or len(cand) == 0:
            continue
        cand_set = set(map(int, cand))
        any_hit = False
        for it in gt:
            total_items += 1
            p = i2pos.get(int(it), -1)
            if p >= 0 and p in cand_set:
                hit_items += 1
                any_hit = True
        if any_hit:
            hit_users += 1
    item_cov = hit_items / (total_items + 1e-12)
    user_cov = hit_users / (len(gt_dict) + 1e-12)
    print(f"✅ Candidate item-coverage ({label}):  {item_cov:.4f}  ({hit_items}/{total_items})")
    print(f"✅ Candidate user-coverage ({label}):  {user_cov:.4f}  ({hit_users}/{len(gt_dict)})")

coverage_report(gt_val, "VAL")
coverage_report(gt_test, "TEST")

# =========================================================
# 9) MF score 준비 (SQL 기반, per-user normalize)
# =========================================================
if len(df_score) == 0:
    mf_pos_list = [None] * n_users
    mf_val_list = [None] * n_users
else:
    df_score2 = df_score[df_score["item_no"].isin(all_item_ids)].copy()
    df_score2["u_idx"] = df_score2["user_no"].map(u2idx).astype(int)
    df_score2["i_pos"] = df_score2["item_no"].map(i2pos).astype(int)

    mx = df_score2.groupby("u_idx")["final_score"].max().to_dict()
    df_score2["mf_norm"] = df_score2.apply(
        lambda r: (r["final_score"] / (mx.get(int(r["u_idx"]), 1.0) + 1e-12)), axis=1
    ).astype(np.float32)

    mf_pos_list = [None] * n_users
    mf_val_list = [None] * n_users
    for ui, g in df_score2.groupby("u_idx"):
        mf_pos_list[int(ui)] = g["i_pos"].to_numpy(dtype=np.int32)
        mf_val_list[int(ui)] = g["mf_norm"].to_numpy(dtype=np.float32)
# =========================================================
# 10) Word2Vec corpus
# =========================================================
def repeat_count(weight, max_rep=8, alpha=2.0):
    w = max(float(weight), 0.0)
    r = int(1 + alpha * math.log1p(w))
    return int(min(max(r, 1), max_rep))

def build_corpus(df_train_local, n_sessions, max_items_per_user):
    rng2 = np.random.default_rng(SEED)
    corpus = []
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
            p = p / (p.sum() + 1e-12)  # 합=1 보장

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
                corpus.append(sent)

    for iid in all_item_ids:
        corpus.append([f"ITEM_{int(iid)}"])
    return corpus

corpus = build_corpus(df_train, n_sessions=N_SESSIONS_PER_USER, max_items_per_user=MAX_ITEMS_PER_USER)
print("\ncorpus size:", len(corpus))

# =========================================================
# 11) Word2Vec train (stage1 -> final) + cache
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

train_u = df_train["user_no"].map(u2idx).astype(int).to_numpy()
train_i = df_train["item_no"].map(i2pos).astype(int).to_numpy()
train_w = df_train["w"].astype(np.float32).to_numpy()

def build_user_matrix(item_mat):
    user_mat = np.zeros((n_users, item_mat.shape[1]), dtype=np.float32)
    contrib = item_mat[train_i] * train_w[:, None]
    np.add.at(user_mat, train_u, contrib)
    return user_mat / (np.linalg.norm(user_mat, axis=1, keepdims=True) + 1e-12)

# cache file paths
w2v_best_path = os.path.join(CACHE_DIR, "w2v_final.model")
item_mat_path = os.path.join(CACHE_DIR, "item_mat.npy")
user_mat_path = os.path.join(CACHE_DIR, "user_mat.npy")
best_json_path = os.path.join(CACHE_DIR, "best_weights.json")

def cache_exists():
    return (os.path.exists(w2v_best_path) and os.path.exists(item_mat_path) and os.path.exists(user_mat_path))

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

def score_user_on_candidates(ui, user_vec, item_mat, cand_pos, w_w2v, w_mf, w_pop):
    cand_vec = item_mat[cand_pos]
    s = (cand_vec @ user_vec).astype(np.float32) * float(w_w2v)

    if w_pop != 0:
        s += float(w_pop) * pop_vec[cand_pos]

    if w_mf != 0:
        mp = mf_pos_list[ui]
        mv = mf_val_list[ui]
        if mp is not None and mv is not None and len(mp) > 0:
            j = np.searchsorted(cand_pos, mp)
            cand_pad = np.append(cand_pos, -1)  # pad
            ok = (cand_pad[j] == mp)
            if ok.any():
                s[j[ok]] += float(w_mf) * mv[ok]

    return s

def eval_hybrid(user_mat, item_mat, gt_dict, k, w_w2v, w_mf, w_pop, user_sample=None):
    users_list = list(gt_dict.keys())
    if user_sample is not None and len(users_list) > user_sample:
        rng2 = np.random.default_rng(SEED)
        users_list = rng2.choice(users_list, size=user_sample, replace=False).tolist()

    HRs, Rs, Ns = [], [], []
    for u in users_list:
        ui = u2idx.get(int(u), None)
        if ui is None:
            continue

        cand_pos = cand_pos_list[ui]
        if cand_pos is None or len(cand_pos) == 0:
            continue

        seen = seen_train.get(int(u), None)
        scores = score_user_on_candidates(ui, user_mat[ui], item_mat, cand_pos,
                                          w_w2v=w_w2v, w_mf=w_mf, w_pop=w_pop)

        if seen:
            seen_pos = np.array([i2pos.get(int(it), -1) for it in seen], dtype=np.int32)
            seen_pos = seen_pos[(seen_pos >= 0) & (seen_pos < n_items)]
            if len(seen_pos) > 0:
                j = np.searchsorted(cand_pos, seen_pos)
                cand_pad = np.append(cand_pos, -1)
                ok = (cand_pad[j] == seen_pos)
                if ok.any():
                    scores[j[ok]] = -1e9

        kk = min(k, len(cand_pos))
        top_idx = np.argpartition(-scores, kk-1)[:kk]
        top_idx = top_idx[np.argsort(-scores[top_idx])]
        top_items = all_item_ids[cand_pos[top_idx]]

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
# 13) Stage1 window tune / Final train or load cache
# =========================================================
if USE_CACHE and cache_exists():
    print("\n✅ Cache found. Loading item_mat/user_mat from:", CACHE_DIR)
    model_final = Word2Vec.load(w2v_best_path)
    item_mat_final = np.load(item_mat_path)
    user_mat_final = np.load(user_mat_path)
else:
    print("\n==============================")
    print("Stage1: quick tune (window) on sampled VAL users")
    print("==============================")

    best_stage1 = None
    for win in WINDOW_GRID_STAGE1:
        model = train_w2v(window=win, vector_size=BEST_VECTOR_SIZE, epochs=EPOCHS_STAGE1, negative=NEGATIVE)
        item_mat = build_item_matrix(model)
        user_mat = build_user_matrix(item_mat)

        m = eval_hybrid(user_mat, item_mat, gt_val, k=10, w_w2v=0.6, w_mf=0.4, w_pop=0.0, user_sample=800)
        print(f"[S1] win={win:2d} -> HR@10={m['HR@10']:.4f}, Recall@10={m['Recall@10']:.4f}, NDCG@10={m['NDCG@10']:.4f} (n={m['n_users_eval']})")

        if (best_stage1 is None) or (m["HR@10"] + m["Recall@10"] > best_stage1["score"]):
            best_stage1 = {"win": win, "score": m["HR@10"] + m["Recall@10"], "m": m}

    BEST_WINDOW = best_stage1["win"]
    print("\n✅ BEST_WINDOW:", BEST_WINDOW, "| picked by HR+Recall on sampled VAL")

    print("\n==============================")
    print("Training FINAL Word2Vec (more epochs)")
    print("==============================")

    model_final = train_w2v(window=BEST_WINDOW, vector_size=BEST_VECTOR_SIZE, epochs=EPOCHS_FINAL, negative=NEGATIVE)
    item_mat_final = build_item_matrix(model_final)
    user_mat_final = build_user_matrix(item_mat_final)

    if USE_CACHE:
        model_final.save(w2v_best_path)
        np.save(item_mat_path, item_mat_final)
        np.save(user_mat_path, user_mat_final)
        print("✅ Saved cache to:", CACHE_DIR)

# =========================================================
# 14) Stage2 weight tune (sampled VAL) + cache
# =========================================================
best = None
if USE_CACHE and os.path.exists(best_json_path):
    try:
        import json
        best = json.load(open(best_json_path, "r", encoding="utf-8"))
        print("\n✅ Loaded best weights from cache:", best_json_path)
    except:
        best = None

if best is None:
    print("\n==============================")
    print("Stage2: tuning weights (sampled VAL)")
    print("==============================")

    for w_w2v in W_W2V_GRID:
        for w_mf in W_MF_GRID:
            for w_pop in W_POP_GRID:
                m = eval_hybrid(user_mat_final, item_mat_final, gt_val, k=10,
                                w_w2v=w_w2v, w_mf=w_mf, w_pop=w_pop, user_sample=1200)
                print(f"w2v={w_w2v:.1f} mf={w_mf:.1f} pop={w_pop:.1f} -> "
                      f"HR@10={m['HR@10']:.4f} R@10={m['Recall@10']:.4f} N@10={m['NDCG@10']:.4f} (n={m['n_users_eval']})")

                obj = (m["HR@10"] + m["Recall@10"] + 0.3*m["NDCG@10"])
                if (best is None) or (obj > best["obj"]):
                    best = {"obj": float(obj), "w_w2v": float(w_w2v), "w_mf": float(w_mf), "w_pop": float(w_pop), "m": m}

    print("\n==============================")
    print("CHOSEN BEST WEIGHTS")
    print("==============================")
    print(best)

    if USE_CACHE:
        import json
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
                     w_w2v=best["w_w2v"], w_mf=best["w_mf"], w_pop=best["w_pop"], user_sample=None)
    mt = eval_hybrid(user_mat_final, item_mat_final, gt_test, k=k,
                     w_w2v=best["w_w2v"], w_mf=best["w_mf"], w_pop=best["w_pop"], user_sample=None)
    print(f"\n[VAL @ {k}]  ", {kk:v for kk,v in mv.items() if kk!='n_users_eval'}, "| n_users:", mv["n_users_eval"])
    print(f"[TEST @ {k}] ", {kk:v for kk,v in mt.items() if kk!='n_users_eval'}, "| n_users:", mt["n_users_eval"])

# =========================================================
# 16) 추천 생성 (Top10 보장 + threshold 우선 + soft-cap reranker)
# =========================================================
def minmax_0_100(arr):
    arr = arr.astype(np.float32)
    mn = float(arr.min())
    mx = float(arr.max())
    if mx - mn < 1e-12:
        return np.full_like(arr, 50.0, dtype=np.float32)
    return ((arr - mn) / (mx - mn) * 100.0).astype(np.float32)

prod_name_map = df_prod.set_index("item_no")["product_name"].to_dict()
brand_map     = df_prod.set_index("item_no")["brand"].to_dict()
topcat_map    = df_prod.set_index("item_no")["topcat_name"].to_dict()
cat_map       = df_prod.set_index("item_no")["category_name"].to_dict()
price_map     = df_prod.set_index("item_no")["price"].to_dict()
finecat_id_map = df_prod.set_index("item_no")["category_id"].to_dict()
topcat_id_map  = df_prod.set_index("item_no")["topcat_id"].to_dict()

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

    # pass1: caps
    for iid in item_ids:
        if ok_add(iid):
            add(iid)
        if len(picked) >= TOPN_SAVE:
            return picked

    # pass2: fill
    for iid in item_ids:
        if iid in picked:
            continue
        add(iid)
        if len(picked) >= TOPN_SAVE:
            break
    return picked

rows_out = []

print("\n==============================")
print("Generating recommendations (threshold>=70 preferred) WITH product names + reranker")
print("==============================")
print(f"RERANK caps: topcat<={CAP_TOPCAT}, finecat<={CAP_FINECAT}, brand<={CAP_BRAND}")
print(f"CAND_PER_USER={CAND_PER_USER}, TOPN_SAVE={TOPN_SAVE}, THRESHOLD={THRESHOLD_0_100}")

for u in tqdm(all_users, desc="Recommend"):
    ui = u2idx[int(u)]
    cand_pos = cand_pos_list[ui]
    if cand_pos is None or len(cand_pos) == 0:
        continue

    # scoring
    s = score_user_on_candidates(ui, user_mat_final[ui], item_mat_final, cand_pos,
                                 w_w2v=best["w_w2v"], w_mf=best["w_mf"], w_pop=best["w_pop"])

    # remove seen
    seen = seen_train.get(int(u), None)
    if seen:
        seen_pos = np.array([i2pos.get(int(it), -1) for it in seen], dtype=np.int32)
        seen_pos = seen_pos[(seen_pos >= 0) & (seen_pos < n_items)]
        if len(seen_pos) > 0:
            j = np.searchsorted(cand_pos, seen_pos)
            cand_pad = np.append(cand_pos, -1)
            ok = (cand_pad[j] == seen_pos)
            if ok.any():
                s[j[ok]] = -1e9

    scaled = minmax_0_100(s)

    # rank (top M)
    M = min(300, len(cand_pos))
    top_idx = np.argpartition(-scaled, M-1)[:M]
    top_idx = top_idx[np.argsort(-scaled[top_idx])]

    item_ids_ranked = [int(all_item_ids[int(cand_pos[i])]) for i in top_idx]
    scores_ranked = scaled[top_idx]

    above = [iid for iid, sc in zip(item_ids_ranked, scores_ranked) if float(sc) >= THRESHOLD_0_100]
    below = [iid for iid, sc in zip(item_ids_ranked, scores_ranked) if float(sc) < THRESHOLD_0_100]
    item_ids_pref = above + below

    picked = rerank_soft_caps(item_ids_pref)

    # store
    score_map = {iid: float(sc) for iid, sc in zip(item_ids_ranked, scores_ranked)}
    for rank, item_id in enumerate(picked, start=1):
        rows_out.append((
            int(u),
            int(item_id),
            prod_name_map.get(item_id, f"ITEM_{item_id}"),
            brand_map.get(item_id, "UNKNOWN"),
            topcat_map.get(item_id, ""),
            cat_map.get(item_id, ""),
            float(price_map.get(item_id, np.nan)),
            float(score_map.get(item_id, np.nan)),
            int(rank),
        ))

out_path = os.path.join(OUT_DIR, OUT_NAME)
df_out = pd.DataFrame(rows_out, columns=[
    "user_no","item_no","product_name","brand","topcat_name","category_name","price","score_0_100","rank"
])
df_out.to_csv(out_path, index=False, encoding="utf-8-sig")

df_db = df_out.rename(columns={
    "score_0_100": "score",
    "rank": "rec_rank"
})

df_db = df_db[["user_no", "item_no", "score", "rec_rank"]]

df_db.to_sql(
    "user_recommendations",
    engine,
    if_exists="replace",   # 운영에서는 append
    index=False
)


print("\n✅ Saved:", out_path)
print("rows:", len(df_out), "| users_with_rec:", df_out.user_no.nunique())
print(df_out.head(30))
