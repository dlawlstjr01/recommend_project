// transform.js
const fs = require("fs");
const path = require("path");

// 1) 키 번역표 (필요한 만큼 계속 추가)
const KEY_MAP = {
  "Spec.ReleaseDate": "출시일",
  "Spec.Type": "색상",

  "Spec.Spec.rows_열": "라디에이터 열(열)",
  "Spec.Spec.length_mm": "라디에이터 길이(mm)",
  "Spec.Spec.thickness_mm": "라디에이터 두께(mm)",
  "Spec.Spec.hose_length_mm": "호스 길이(mm)",

  "Spec.compatibility.intel": "지원 인텔 소켓",
  "Spec.compatibility.amd": "지원 AMD 소켓",

  "Spec.fan.size_mm": "팬 크기(mm)",
  "Spec.fan.count_개": "팬 개수(개)",
  "Spec.fan.bearing": "팬 베어링",
  "Spec.fan.rpm_RPM": "팬 속도(RPM)",
  "Spec.fan.airflow_CFM": "풍량(CFM)",
  "Spec.fan.static_pressure_mmH₂O": "정압(mmH₂O)",
  "Spec.fan.noise_dBA": "소음(dBA)",

  "Spec.features.has_lcd": "LCD 탑재",
  "Spec.features.has_led": "LED(ARGB) 지원",
  "Spec.features.daisy_chain": "데이지 체인",
  "Spec.features.pwm_support": "PWM 지원",
  "Spec.features.leak_compensation": "누수 보상",
};

function renameKeysDeep(value, map) {
  if (Array.isArray(value)) return value.map((v) => renameKeysDeep(v, map));
  if (!value || typeof value !== "object") return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const newKey = map[k] ?? k; // 매핑 없으면 원래 키 유지(이미 한글인 키 포함)
    out[newKey] = renameKeysDeep(v, map);
  }
  return out;
}

function transformProduct(p) {
  if (!p || typeof p !== "object") return p;
  const out = { ...p };
  if (out.Spec && typeof out.Spec === "object") {
    out.Spec = renameKeysDeep(out.Spec, KEY_MAP);
  }
  return out;
}

// ---- CLI 사용법 ----
// node transform.js input.json output.json
const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  const script = path.basename(process.argv[1]);
  console.error(`사용법: node ${script} input.json output.json`);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
const data = JSON.parse(raw);

const result = Array.isArray(data) ? data.map(transformProduct) : transformProduct(data);

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
console.log(`완료: ${inputPath} -> ${outputPath}`);
