const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const router = express.Router();
const DATA_DIR = path.join(__dirname, "..", "data");

// ✅ 화면 표시용(원하면 더 추가/수정 가능)
const LABEL_MAP = {
  laptop: "노트북",
  cpu: "CPU",
  gpu: "그래픽카드",
  motherboard: "메인보드",
  ram: "RAM",
  ssd: "SSD",
  hdd: "HDD",
  psu: "파워서플라이",
  case: "PC 케이스",
  aio_cooler: "수랭 쿨러(AIO)",
  air_cooler: "공랭 쿨러",
  ai_cooler: "AI 쿨러",
  monitor: "모니터",
  keyboard: "키보드",
  mouse: "마우스",
  headset: "헤드셋",
  speakers: "스피커",
  controller: "컨트롤러",
  gpu_holder: "GPU 지지대",
  portable_ssd: "외장 SSD",
  portable_hdd: "외장 HDD",
};

const cache = new Map();

// 파일명 -> 카테고리 key 만들기 (대소문자/공백/언더스코어 통일)
function fileBaseToCategoryKey(fileBase) {
  return String(fileBase)
    .trim()
    .replace(/\s+/g, "_")      // 공백 -> _
    .replace(/-+/g, "_")
    .toLowerCase();
}

// ✅ data 폴더에 있는 json들을 자동으로 category->filename 맵으로 생성
function buildFileMap() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"));

  const map = {};
  for (const f of files) {
    const base = path.basename(f, path.extname(f)); // Portable_SSD
    const key = fileBaseToCategoryKey(base);        // portable_ssd
    map[key] = f;                                   // 실제 파일명 그대로
  }

  // (선택) 기존 키 호환용 alias (원하면 더 추가)
  // 예: speaker -> speakers
  if (map.speakers && !map.speaker) map.speaker = map.speakers;

  return map;
}

function getCategories() {
  const FILE_MAP = buildFileMap();
  return Object.keys(FILE_MAP).sort();
}

function getLabel(categoryKey) {
  return LABEL_MAP[categoryKey] || categoryKey;
}

function loadCategory(category) {
  const FILE_MAP = buildFileMap();
  const file = FILE_MAP[category];
  if (!file) return null;

  if (cache.has(category)) return cache.get(category);

  const fullPath = path.join(DATA_DIR, file);
  if (!fs.existsSync(fullPath)) return null;

  const raw = fs.readFileSync(fullPath, "utf-8");
  const parsed = JSON.parse(raw);

  const data = Array.isArray(parsed) ? parsed : (parsed.data || parsed.items || null);
  if (!Array.isArray(data)) return null;

  cache.set(category, data);
  return data;
}

// ✅ true 판정: boolean/number/string 다 허용
function isTrue(v) {
  return v === true || v === 1 || v === 1.0 || v === "1" || v === "true" || v === "True";
}

function pickOneHotTrueKey(obj, prefix) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.startsWith(prefix) && isTrue(v)) return k.slice(prefix.length);
  }
  return null;
}

function getName(obj) {
  if (!obj) return "Unknown";
  return (
    obj.model_name ||
    obj.Name ||
    obj.name ||
    obj.Product ||
    obj.product_name ||
    obj.title ||
    obj.Title ||
    obj["제품명"] ||
    pickOneHotTrueKey(obj, "Name_") ||
    "Unknown"
  );
}

function getPrice(obj) {
  if (!obj) return 0;

  const v =
    obj.price_krw ??
    obj.Price ??
    obj.price ??
    obj.lowest_price ??
    obj.lowestPrice ??
    obj["가격"] ??
    obj["최저가"] ??
    obj["price.value"];

  if (v === null || v === undefined || v === "") return 0;

  const cleaned = typeof v === "string" ? v.replace(/,/g, "").trim() : v;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function getImage(obj) {
  if (!obj) return null;
  return (
    obj.BaseImageURL ||
    (Array.isArray(obj.Images) && obj.Images[0]) ||
    obj.img ||
    obj.image ||
    null
  );
}

function getUrl(obj) {
  if (!obj) return null;
  return (
    (Array.isArray(obj.URLs) && obj.URLs[0]) ||
    obj.purchase_url ||
    obj.url ||
    null
  );
}

function getBrand(obj) {
  if (!obj) return null;

  if (obj.brand || obj.Brand) return obj.brand || obj.Brand;

  const name = obj.model_name || obj.Name || obj.name || "";
  const first = String(name).trim().split(" ")[0];

  const MAP = {
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
  };

  return MAP[first] || first || null;
}

function makeId(category, obj, idx = 0) {
  if (category === "laptop" && obj?.pcode) {
    return `laptop:p${obj.pcode}`;
  }

  const name = getName(obj);
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const hash = crypto
    .createHash("sha1")
    .update(JSON.stringify(obj))
    .digest("hex")
    .slice(0, 8);

  return `${category}:${slug || "item"}-${hash}-${idx}`;
}

/**
 * ✅ GET /api/products/categories
 * data 폴더 기준 카테고리 목록 (필터 UI용)
 */
router.get("/categories", (req, res) => {
  const FILE_MAP = buildFileMap();

  const list = Object.keys(FILE_MAP)
    .filter((k) => k !== "speaker") // alias 숨기고 싶으면
    .map((k) => ({
      key: k,
      label: getLabel(k),
      file: FILE_MAP[k],
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));

  res.json(list);
});

/**
 *  GET /api/products?category=laptop
 *  GET /api/products?category=cpu&category=gpu (여러개)
 *  GET /api/products (category 없으면 전체)
 */
router.get("/", (req, res) => {
  const FILE_MAP = buildFileMap();

  // category 파라미터: string | array | undefined
  const q = req.query.category;
  let categories = [];

  if (Array.isArray(q)) categories = q.map((x) => String(x).toLowerCase());
  else if (typeof q === "string" && q.trim()) categories = [q.toLowerCase()];
  else categories = Object.keys(FILE_MAP).filter((k) => k !== "speaker"); // 전체

  // 유효한 것만
  categories = categories.filter((c) => FILE_MAP[c]);
  if (categories.length === 0) {
    return res.status(404).json({ message: "unknown category or file missing" });
  }

  const list = [];
  for (const category of categories) {
    const items = loadCategory(category);
    if (!items) continue;

    items.forEach((x, i) => {
      const name = getName(x);
      const id = x.id || makeId(category, x, i);
      const price = getPrice(x);
      const img = getImage(x);
      const url = getUrl(x);
      const brand = getBrand(x);

      list.push({ id, category, name, price, brand, img, url });
    });
  }

  res.json(list);
});

/**
 * GET /api/products/:id
 * 상세
 */
router.get("/:id", (req, res) => {
  const { id } = req.params;

  const [category] = String(id).split(":");
  const items = loadCategory(category);
  if (!items) return res.status(404).json({ message: "unknown category" });

  const found = items.find((x, i) => {
    const xid = x.id || makeId(category, x, i);
    return String(xid) === String(id);
  });

  if (!found) return res.status(404).json({ message: "not found" });

  const name = getName(found);
  const price = getPrice(found);
  const img = getImage(found);
  const url = getUrl(found);
  const brand = getBrand(found);

  return res.json({ id, category, name, price, brand, img, url, raw: found });
});

module.exports = router;
