import React, { useEffect, useMemo, useRef, useState } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

// ✅ ProductDetailPage와 동일해야 함
const COMPARE_KEY = "compare_products_v1";

function readCompareList() {
  try {
    const raw = localStorage.getItem(COMPARE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeCompareList(list) {
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
  } catch {}
}

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, " ");
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function extractBrand(item) {
  return item?.brand ?? item?.Brand ?? item?.raw?.brand ?? "";
}
function extractCategory(item) {
  return item?.category ?? item?.Category ?? item?.raw?.category ?? "기타";
}
function extractName(item) {
  if (item?.name) return String(item.name);
  if (item?.raw?.model_name) return String(item.raw.model_name);
  return "Unknown";
}
function extractPrice(detail, raw) {
  return (
    toNumberOrNull(detail?.price) ??
    toNumberOrNull(detail?.PriceInfo?.currentPrice) ??
    toNumberOrNull(raw?.PriceInfo?.currentPrice) ??
    toNumberOrNull(raw?.price) ??
    0
  ) || 0;
}

// ✅ “제품 상세정보의 스펙 컬럼” 그대로 specMap 생성
function buildSpecMapFromDetail(detail, raw) {
  // 노트북류(core_spec/display 구조)
  if (raw?.core_spec || raw?.display) {
    const cs = raw.core_spec || {};
    const d = raw.display || {};
    return {
      CPU: cs.cpu_model,
      "RAM(GB)": cs.ram_gb,
      GPU: cs.gpu_chipset,
      "VRAM(GB)": cs.vram_gb,
      "Display(inch)": d.inch,
      "RefreshRate(Hz)": d.refresh_rate_hz,
      "Brightness(nit)": d.brightness_nit,
    };
  }

  // 일반: raw.Spec가 핵심
  if (raw?.Spec && typeof raw.Spec === "object") return raw.Spec;

  // fallback
  if (detail?.Specs && typeof detail.Specs === "object") return detail.Specs;

  return {};
}

// ✅ 같은 카테고리 내 “공통 숫자 스펙” 자동 선정
function pickNumericSpecKeys(products, maxKeys = 12) {
  const allKeys = new Set();
  products.forEach((p) => {
    Object.keys(p.specMap || {}).forEach((k) => allKeys.add(k));
  });

  const stats = [];
  for (const key of allKeys) {
    const vals = products
      .map((p) => toNumberOrNull(p.specMap?.[key]))
      .filter((v) => v != null);

    if (!vals.length) continue;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;

    stats.push({ key, count: vals.length, range });
  }

  stats.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count; // 채워진 제품 수 우선
    return b.range - a.range; // 변화 폭 큰 스펙 우선
  });

  return stats.slice(0, maxKeys).map((s) => s.key);
}

function hashStr(s) {
  const str = String(s ?? "");
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `c${h}`;
}

export default function AnalysisPage() {
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // ✅ 벤치마크 삭제 → 옵션은 specs/price만
  const [showOptions, setShowOptions] = useState({
    specs: true,
    price: true,
  });

  const priceChartRef = useRef(null);
  const specRootsRef = useRef({}); // category별 spec 차트 루트들

  const toggleOption = (key) => {
    setShowOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  async function fetchDetailById(id) {
    const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("detail fetch failed");
    return await res.json();
  }

  // ✅ 비교목록(localStorage) -> 상세 fetch -> selectedProducts 로드
  useEffect(() => {
    let ignore = false;

    async function hydrate() {
      setLoading(true);

      const saved = readCompareList()
        .map((x) => (typeof x === "object" ? x.id : x))
        .filter(Boolean)
        .slice(0, 5);

      if (!saved.length) {
        setSelectedProducts([]);
        setLoading(false);
        return;
      }

      try {
        const details = await Promise.all(
          saved.map(async (id) => {
            try {
              const detail = await fetchDetailById(id);
              const raw = detail?.raw || null;

              return {
                id: detail?.id ?? id,
                name: detail?.name
                  ? String(detail.name)
                  : `${extractBrand(detail)} ${extractName(detail)}`.trim(),
                brand: detail?.brand ?? extractBrand(detail),
                category: detail?.category ?? extractCategory(detail),
                price: extractPrice(detail, raw),
                specMap: buildSpecMapFromDetail(detail, raw),
              };
            } catch {
              return null;
            }
          })
        );

        if (ignore) return;

        setSelectedProducts(details.filter(Boolean));
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    hydrate();
    return () => {
      ignore = true;
    };
  }, []);

  // ✅ selectedProducts 변경 시 compare list 동기화 (삭제/정리)
  useEffect(() => {
    const next = selectedProducts.map((p) => ({ id: p.id, category: p.category }));
    writeCompareList(next);
  }, [selectedProducts]);

  // ✅ “제품 목록”은 선택된 제품만 (카테고리별 그룹)
  const groupedSelected = useMemo(() => {
    const map = {};
    for (const p of selectedProducts) {
      const cat = p.category || "기타";
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedProducts]);

  // ✅ spec 차트 그룹(카테고리별)
  const specGroups = useMemo(() => {
    return groupedSelected.map(([category, products]) => {
      const specKeys = pickNumericSpecKeys(products, 12);
      const divId = `chartdiv_spec_${hashStr(category)}`;
      return { category, products, specKeys, divId };
    });
  }, [groupedSelected]);

  const createPriceChart = (divId, data, rootRef) => {
    if (rootRef.current) rootRef.current.dispose();

    const root = am5.Root.new(divId);
    rootRef.current = root;
    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(
      am5xy.XYChart.new(root, { panX: false, panY: false, wheelX: "none", wheelY: "none" })
    );

    const xAxis = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "name",
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 30 }),
      })
    );

    const yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, { renderer: am5xy.AxisRendererY.new(root, {}) })
    );

    const series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        name: "price",
        xAxis,
        yAxis,
        valueYField: "price",
        categoryXField: "name",
        tooltip: am5.Tooltip.new(root, { labelText: "{valueY}" }),
      })
    );

    series.columns.template.setAll({ cornerRadiusTL: 5, cornerRadiusTR: 5 });

    xAxis.data.setAll(data);
    series.data.setAll(data);
  };

  const createSpecCompareChart = (divId, products, specKeys) => {
    // dispose existing
    if (specRootsRef.current[divId]) {
      specRootsRef.current[divId].dispose();
      delete specRootsRef.current[divId];
    }

    if (!specKeys?.length) return;

    const root = am5.Root.new(divId);
    specRootsRef.current[divId] = root;
    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false,
        panY: false,
        wheelX: "none",
        wheelY: "none",
        layout: root.verticalLayout,
      })
    );

    const xAxis = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "spec",
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 25 }),
      })
    );

    const yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, { renderer: am5xy.AxisRendererY.new(root, {}) })
    );

    const rows = specKeys.map((k) => {
      const row = { spec: k };
      products.forEach((p) => {
        const field = `v_${p.id}`;
        const num = toNumberOrNull(p.specMap?.[k]);
        row[field] = num == null ? null : num;
      });
      return row;
    });

    xAxis.data.setAll(rows);

    products.forEach((p) => {
      const field = `v_${p.id}`;
      const series = chart.series.push(
        am5xy.ColumnSeries.new(root, {
          name: p.name,
          xAxis,
          yAxis,
          valueYField: field,
          categoryXField: "spec",
          tooltip: am5.Tooltip.new(root, { labelText: "{name}: {valueY}" }),
        })
      );

      series.data.setAll(rows);
      series.columns.template.setAll({
        width: am5.percent(90),
        cornerRadiusTL: 4,
        cornerRadiusTR: 4,
      });
    });

    const legend = chart.children.push(
      am5.Legend.new(root, { centerX: am5.p50, x: am5.p50 })
    );
    legend.data.setAll(chart.series.values);
  };

  // ✅ price chart render
  useEffect(() => {
    if (!showOptions.price) {
      if (priceChartRef.current) {
        priceChartRef.current.dispose();
        priceChartRef.current = null;
      }
      return;
    }

    if (!selectedProducts.length) return;
    createPriceChart("chartdiv_price", selectedProducts, priceChartRef);

    return () => {
      if (priceChartRef.current) priceChartRef.current.dispose();
    };
  }, [showOptions.price, selectedProducts]);

  // ✅ spec charts render (category별 여러 개)
  useEffect(() => {
    // clear all spec roots
    for (const k of Object.keys(specRootsRef.current)) {
      try {
        specRootsRef.current[k].dispose();
      } catch {}
      delete specRootsRef.current[k];
    }

    if (!showOptions.specs) return;
    if (!selectedProducts.length) return;

    specGroups.forEach((g) => {
      if (!g.specKeys.length) return;
      createSpecCompareChart(g.divId, g.products, g.specKeys);
    });

    return () => {
      for (const k of Object.keys(specRootsRef.current)) {
        try {
          specRootsRef.current[k].dispose();
        } catch {}
        delete specRootsRef.current[k];
      }
    };
  }, [showOptions.specs, specGroups, selectedProducts.length]);

  const removeOne = (id) => {
    setSelectedProducts((prev) => prev.filter((p) => String(p.id) !== String(id)));
  };

  const clearAll = () => {
    setSelectedProducts([]);
    writeCompareList([]);
  };

  return (
    <div className="analysis-container">
      <div className="dashboard-options">
        <label className={`option-label ${showOptions.specs ? "checked" : ""}`}>
          <div className="check-icon">✓</div>
          <input
            type="checkbox"
            style={{ display: "none" }}
            checked={showOptions.specs}
            onChange={() => toggleOption("specs")}
          />
          스펙 비교
        </label>

        <label className={`option-label ${showOptions.price ? "checked" : ""}`}>
          <div className="check-icon">✓</div>
          <input
            type="checkbox"
            style={{ display: "none" }}
            checked={showOptions.price}
            onChange={() => toggleOption("price")}
          />
          가격 차트
        </label>
      </div>

      <div className="analysis-content-wrapper">
        {/* ✅ 제품 목록(비교목록만) */}
        <div className="product-list-sidebar">
          <div className="list-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>비교 목록</span>
            <button
              type="button"
              onClick={clearAll}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "white",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              전체 비우기
            </button>
          </div>

          {loading && <div style={{ padding: 12, color: "#6b7280" }}>불러오는 중...</div>}

          {!loading && selectedProducts.length === 0 && (
            <div style={{ padding: 12, color: "#9ca3af", lineHeight: 1.5 }}>
              아직 담긴 제품이 없어요.
              <br />
              제품 상세에서 <b>“비교 분석하기”</b>를 눌러 담아주세요.
            </div>
          )}

          {!loading && selectedProducts.length > 0 && (
            <div style={{ padding: "6px 0" }}>
              {groupedSelected.map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      padding: "8px 10px",
                      fontWeight: 900,
                      fontSize: 12,
                      color: "#374151",
                      background: "#f3f4f6",
                      borderRadius: 8,
                      margin: "6px 10px",
                    }}
                  >
                    {cat} ({items.length})
                  </div>

                  <ul className="product-list">
                    {items.map((p) => (
                      <li key={p.id} className="product-item active" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ paddingRight: 8 }}>{p.name}</span>
                        <button
                          type="button"
                          onClick={() => removeOne(p.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: "white",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                        >
                          삭제
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ✅ 차트 영역 */}
        <div className="dashboard-main">
          <div className="charts-grid">
            {showOptions.specs && (
              <div className="chart-card">
                <h3>📊 스펙 비교 (카테고리별)</h3>

                {selectedProducts.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>
                    비교 목록에 제품을 담으면 스펙 차트가 나타납니다.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {specGroups.map((g) => (
                      <div key={g.category} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>
                          {g.category} ({g.products.length})
                        </div>

                        {g.specKeys.length === 0 ? (
                          <div style={{ color: "#9ca3af", padding: 10 }}>
                            숫자 형태로 비교 가능한 스펙이 부족해서 그래프로 표시할 수 없어요.
                            <br />
                            (텍스트 스펙은 그래프 축에 못 올립니다)
                          </div>
                        ) : (
                          <div id={g.divId} className="chart-area" style={{ height: 340 }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showOptions.price && (
              <div className="chart-card">
                <h3>💰 가격 비교</h3>

                {selectedProducts.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>
                    비교 목록에 제품을 담으면 가격 차트가 나타납니다.
                  </div>
                ) : (
                  <div id="chartdiv_price" className="chart-area"></div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
