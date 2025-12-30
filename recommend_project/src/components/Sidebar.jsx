import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaUndo, FaSearch } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

// ✅ "기타"는 제외 브랜드 기준이 될 애들이라서 목록은 그대로 두고
// UI에서 "기타"를 따로 추가로 렌더링합니다.
const BRAND_OPTIONS = ["삼성전자", "LG전자", "로지텍", "ASUS", "Lenovo"];
const BRAND_OTHER_LABEL = "기타";

const Sidebar = ({ filters, setFilters }) => {
  const [localKeyword, setLocalKeyword] = useState("");

  // 서버에서 카테고리 목록
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [catsLoading, setCatsLoading] = useState(false);

  // 그룹 펼침 상태 (✅ PC부품 안에 전원/케이스/쿨링 통합)
  const [open, setOpen] = useState({
    pcParts: false,
    storage: false,
    peripherals: false,
    misc: false,
  });

  // 필터 기본값
  const safeFilters = filters || {
    keyword: "",
    category: [],
    brand: [],
    brandOther: false, // ✅ 추가: 브랜드 "기타" (지정 브랜드 제외)
    price: "all",
    sortOrder: "latest",
  };

  // 로컬 검색어 동기화
  useEffect(() => {
    if (filters && filters.keyword !== undefined) {
      setLocalKeyword(filters.keyword || "");
    }
  }, [filters]);

  // 카테고리 fetch
  useEffect(() => {
    let ignore = false;
    async function fetchCats() {
      try {
        setCatsLoading(true);
        const res = await fetch(`${API_BASE}/api/products/categories`);
        const json = await res.json();
        if (!ignore) setCategoryOptions(Array.isArray(json) ? json : []);
      } catch (e) {
        if (!ignore) setCategoryOptions([]);
      } finally {
        if (!ignore) setCatsLoading(false);
      }
    }
    fetchCats();
    return () => {
      ignore = true;
    };
  }, []);

  // key -> label
  const labelByKey = useMemo(() => {
    const m = {};
    for (const c of categoryOptions) {
      if (c?.key) m[c.key] = c.label || c.key;
    }
    return m;
  }, [categoryOptions]);

  // 존재하는 key만 남기기
  const onlyExisting = (keys) => keys.filter((k) => labelByKey[k]);

  /** ---------------------------
   *  ✅ 쿨링: "공랭/수랭" 2개로 통합
   * --------------------------*/
  const coolingItems = useMemo(() => {
    const airKeys = onlyExisting(["air_cooler2", "air_cooler"]);
    const aioKeys = onlyExisting(["aio_cooler2", "aio_cooler", "ai_cooler"]);

    return [
      airKeys.length ? { id: "cool_air", label: "공랭 쿨러", keys: airKeys } : null,
      aioKeys.length ? { id: "cool_aio", label: "수랭 쿨러(AIO)", keys: aioKeys } : null,
    ].filter(Boolean);
  }, [labelByKey]);

  const coolingAllKeys = useMemo(() => coolingItems.flatMap((it) => it.keys), [coolingItems]);

  const toggleKeys = (keys) => {
    if (!setFilters) return;
    setFilters((prev) => {
      const cur = prev.category || [];
      const hasAny = keys.some((k) => cur.includes(k));
      if (hasAny) {
        return { ...prev, category: cur.filter((x) => !keys.includes(x)) };
      }
      return { ...prev, category: Array.from(new Set([...cur, ...keys])) };
    });
  };

  const keysChecked = (keys) => {
    const cur = safeFilters.category || [];
    return keys.some((k) => cur.includes(k));
  };

  /** ---------------------------
   *  카테고리 그룹
   * --------------------------*/
  const singleKeys = useMemo(() => onlyExisting(["laptop", "monitor"]), [labelByKey]);

  const pcPartsBaseKeys = useMemo(
    () => onlyExisting(["cpu", "gpu", "motherboard", "ram"]),
    [labelByKey]
  );

  const powerCaseKeys = useMemo(() => onlyExisting(["psu", "case"]), [labelByKey]);

  // ✅ PC부품 그룹 토글/체크 기준이 될 "전체 키"
  const pcPartsAllKeys = useMemo(
    () => Array.from(new Set([...pcPartsBaseKeys, ...powerCaseKeys, ...coolingAllKeys])),
    [pcPartsBaseKeys, powerCaseKeys, coolingAllKeys]
  );

  const storageKeys = useMemo(
    () => onlyExisting(["ssd", "hdd", "portable_ssd", "portable_hdd"]),
    [labelByKey]
  );

  const peripheralsKeys = useMemo(
    () => onlyExisting(["keyboard", "mouse", "headset", "speakers", "controller"]),
    [labelByKey]
  );

  const accessoryKeys = useMemo(() => onlyExisting(["gpu_holder"]), [labelByKey]);

  // 위에서 사용한 키 제외하고 남는 건 전부 misc(기타)
  const miscKeys = useMemo(() => {
    const used = new Set([
      ...singleKeys,
      ...pcPartsBaseKeys,
      ...powerCaseKeys,
      ...coolingAllKeys,
      ...storageKeys,
      ...peripheralsKeys,
      ...accessoryKeys,
    ]);

    return categoryOptions
      .map((c) => c.key)
      .filter((k) => k && !used.has(k))
      .sort((a, b) => (labelByKey[a] || a).localeCompare(labelByKey[b] || b, "ko"));
  }, [
    categoryOptions,
    singleKeys,
    pcPartsBaseKeys,
    powerCaseKeys,
    coolingAllKeys,
    storageKeys,
    peripheralsKeys,
    accessoryKeys,
    labelByKey,
  ]);

  /** ---------------------------
   *  검색
   * --------------------------*/
  const applySearch = () => {
    if (!setFilters) return;
    setFilters((prev) => ({ ...prev, keyword: localKeyword }));
  };

  useEffect(() => {
    if (!setFilters) return;
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, keyword: localKeyword }));
    }, 300);
    return () => clearTimeout(timer);
  }, [localKeyword, setFilters]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") applySearch();
  };

  /** ---------------------------
   *  카테고리 단일 토글
   * --------------------------*/
  const toggleKey = (key) => {
    if (!setFilters) return;
    setFilters((prev) => {
      const cur = prev.category || [];
      return {
        ...prev,
        category: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key],
      };
    });
  };

  const toggleGroup = (keys) => {
    if (!setFilters) return;
    setFilters((prev) => {
      const cur = prev.category || [];
      const allSelected = keys.length > 0 && keys.every((k) => cur.includes(k));
      if (allSelected) {
        return { ...prev, category: cur.filter((x) => !keys.includes(x)) };
      }
      return { ...prev, category: Array.from(new Set([...cur, ...keys])) };
    });
  };

  const groupState = (keys) => {
    const cur = safeFilters.category || [];
    const selectedCount = keys.filter((k) => cur.includes(k)).length;
    const all = keys.length > 0 && selectedCount === keys.length;
    const some = selectedCount > 0 && !all;
    return { all, some };
  };

  /** ---------------------------
   *  indeterminate refs
   * --------------------------*/
  const pcPartsRef = useRef(null);
  const storageRef = useRef(null);
  const peripheralsRef = useRef(null);
  const miscRef = useRef(null);

  useEffect(() => {
    if (pcPartsRef.current) pcPartsRef.current.indeterminate = groupState(pcPartsAllKeys).some;
  }, [pcPartsAllKeys, safeFilters.category]);

  useEffect(() => {
    if (storageRef.current) storageRef.current.indeterminate = groupState(storageKeys).some;
  }, [storageKeys, safeFilters.category]);

  useEffect(() => {
    if (peripheralsRef.current)
      peripheralsRef.current.indeterminate = groupState(peripheralsKeys).some;
  }, [peripheralsKeys, safeFilters.category]);

  useEffect(() => {
    const merged = [...accessoryKeys, ...miscKeys];
    if (miscRef.current) miscRef.current.indeterminate = groupState(merged).some;
  }, [accessoryKeys, miscKeys, safeFilters.category]);

  /** ---------------------------
   *  ✅ 브랜드 (기타 = 지정 브랜드 제외)
   * --------------------------*/
  const handleBrandToggle = (brand) => {
    if (!setFilters) return;

    // ✅ "기타" 클릭: 지정 브랜드들(checkbox들) 대신 '제외 모드'로 전환
    if (brand === BRAND_OTHER_LABEL) {
      setFilters((prev) => {
        const nextOther = !prev.brandOther;
        return {
          ...prev,
          brandOther: nextOther,
          brand: [], // 기타 모드면 include 브랜드는 비움(충돌 방지)
        };
      });
      return;
    }

    // ✅ 일반 브랜드 클릭: 기타 모드 해제 + include 브랜드 토글
    setFilters((prev) => {
      const cur = prev.brand || [];
      const next = cur.includes(brand) ? cur.filter((b) => b !== brand) : [...cur, brand];
      return {
        ...prev,
        brandOther: false,
        brand: next,
      };
    });
  };

  /** ---------------------------
   *  가격/정렬
   * --------------------------*/
  const handlePriceChange = (value) => {
    if (!setFilters) return;
    setFilters((prev) => ({ ...prev, price: value }));
  };

  const handleSortChange = (value) => {
    if (!setFilters) return;
    setFilters((prev) => ({ ...prev, sortOrder: value }));
  };

  /** ---------------------------
   *  초기화
   * --------------------------*/
  const resetFilters = () => {
    if (!setFilters) return;

    setFilters(() => ({
      keyword: "",
      category: [],
      brand: [],
      brandOther: false, // ✅ 추가
      price: "all",
      sortOrder: "latest",
    }));

    setLocalKeyword("");
    setOpen({
      pcParts: false,
      storage: false,
      peripherals: false,
      misc: false,
    });
  };

  /** ---------------------------
   *  UI: 그룹 헤더 / 바디
   * --------------------------*/
  const GroupHeader = ({ title, openKey, checkboxRef, checked, onToggleAll }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
      <label className="filter-item" style={{ margin: 0, flex: 1 }}>
        <input
          ref={checkboxRef}
          type="checkbox"
          className="filter-checkbox"
          checked={checked}
          onChange={onToggleAll}
        />
        {title}
      </label>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => ({ ...prev, [openKey]: !prev[openKey] }));
        }}
        aria-label={open[openKey] ? "접기" : "펼치기"}
        title={open[openKey] ? "접기" : "펼치기"}
        style={{
          width: 32,
          height: 32,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 30,
          lineHeight: 1,
          color: "rgba(0,0,0,0.55)",
          flexShrink: 0,
        }}
      >
        {open[openKey] ? "▾" : "▸"}
      </button>
    </div>
  );

  const GroupBody = ({ keys }) => (
    <div
      style={{
        marginLeft: 18,
        marginTop: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {keys.map((k) => (
        <label key={k} className="filter-item" style={{ margin: 0 }}>
          <input
            type="checkbox"
            className="filter-checkbox"
            checked={(safeFilters.category || []).includes(k)}
            onChange={() => toggleKey(k)}
          />
          {labelByKey[k] || k}
        </label>
      ))}
    </div>
  );

  return (
    <aside className="sidebar-container">
      <div className="sidebar-title">
        <h2>필터</h2>
        <button className="reset-btn" onClick={resetFilters}>
          <FaUndo /> 초기화
        </button>
      </div>

      {/* 1. 검색 */}
      <div className="sidebar-section">
        <span className="filter-title">검색</span>
        <div className="sidebar-search-box">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="검색어 입력..."
            value={localKeyword}
            onChange={(e) => setLocalKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="search-btn" onClick={applySearch}>
            검색
          </button>
        </div>
      </div>

      {/* 2. 카테고리 */}
      <div className="sidebar-section">
        <span className="filter-title">카테고리</span>

        {catsLoading ? (
          <div style={{ padding: "8px 0", opacity: 0.7 }}>카테고리 불러오는 중...</div>
        ) : (
          <div className="filter-list">
            {/* 단일(상단 고정) */}
            {singleKeys.map((k) => (
              <label key={k} className="filter-item">
                <input
                  type="checkbox"
                  className="filter-checkbox"
                  checked={(safeFilters.category || []).includes(k)}
                  onChange={() => toggleKey(k)}
                />
                {labelByKey[k] || k}
              </label>
            ))}

            {/* ✅ PC 부품 (전원/케이스/쿨링까지 통합) */}
            {pcPartsAllKeys.length > 0 && (
              <div style={{ width: "100%", marginTop: singleKeys.length ? 10 : 0 }}>
                <GroupHeader
                  title="PC 부품"
                  openKey="pcParts"
                  checkboxRef={pcPartsRef}
                  checked={groupState(pcPartsAllKeys).all}
                  onToggleAll={() => toggleGroup(pcPartsAllKeys)}
                />

                {open.pcParts && (
                  <div
                    style={{
                      marginLeft: 18,
                      marginTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {/* 1) 기본 부품 */}
                    {pcPartsBaseKeys.length > 0 && (
                      <div style={{ marginLeft: -18 }}>
                        <GroupBody keys={pcPartsBaseKeys} />
                      </div>
                    )}

                    {/* 2) 케이스/파워 */}
                    {powerCaseKeys.length > 0 && (
                      <div style={{ marginLeft: -18 }}>
                        <GroupBody keys={powerCaseKeys} />
                      </div>
                    )}

                    {/* 3) 쿨링 (공랭/수랭 2개만 노출) */}
                    {coolingItems.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {coolingItems.map((it) => (
                          <label key={it.id} className="filter-item" style={{ margin: 0 }}>
                            <input
                              type="checkbox"
                              className="filter-checkbox"
                              checked={keysChecked(it.keys)}
                              onChange={() => toggleKeys(it.keys)}
                            />
                            {it.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 저장장치 */}
            {storageKeys.length > 0 && (
              <div style={{ width: "100%", marginTop: 10 }}>
                <GroupHeader
                  title="저장장치"
                  openKey="storage"
                  checkboxRef={storageRef}
                  checked={groupState(storageKeys).all}
                  onToggleAll={() => toggleGroup(storageKeys)}
                />
                {open.storage && <GroupBody keys={storageKeys} />}
              </div>
            )}

            {/* 주변기기 */}
            {peripheralsKeys.length > 0 && (
              <div style={{ width: "100%", marginTop: 10 }}>
                <GroupHeader
                  title="주변기기"
                  openKey="peripherals"
                  checkboxRef={peripheralsRef}
                  checked={groupState(peripheralsKeys).all}
                  onToggleAll={() => toggleGroup(peripheralsKeys)}
                />
                {open.peripherals && <GroupBody keys={peripheralsKeys} />}
              </div>
            )}

            {/* 액세서리 / 기타 */}
            {(accessoryKeys.length > 0 || miscKeys.length > 0) && (
              <div style={{ width: "100%", marginTop: 10 }}>
                {(() => {
                  const merged = [...accessoryKeys, ...miscKeys];
                  return (
                    <>
                      <GroupHeader
                        title="액세서리 / 기타"
                        openKey="misc"
                        checkboxRef={miscRef}
                        checked={groupState(merged).all}
                        onToggleAll={() => toggleGroup(merged)}
                      />
                      {open.misc && <GroupBody keys={merged} />}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. 브랜드 */}
      <div className="sidebar-section">
        <span className="filter-title">브랜드</span>
        <div className="filter-list">
          {/* ✅ 기타 (지정 브랜드 제외) */}
          <label className="filter-item">
            <input
              type="checkbox"
              className="filter-checkbox"
              checked={!!safeFilters.brandOther}
              onChange={() => handleBrandToggle(BRAND_OTHER_LABEL)}
            />
            {BRAND_OTHER_LABEL}
          </label>

          {/* 일반 브랜드들 */}
          {BRAND_OPTIONS.map((brand) => (
            <label key={brand} className="filter-item">
              <input
                type="checkbox"
                className="filter-checkbox"
                disabled={!!safeFilters.brandOther} // ✅ 기타 켜면 일반 브랜드 선택 비활성화(원하면 제거 가능)
                checked={(safeFilters.brand || []).includes(brand)}
                onChange={() => handleBrandToggle(brand)}
              />
              {brand}
            </label>
          ))}
        </div>
      </div>

      {/* 4. 가격대 */}
      <div className="sidebar-section">
        <span className="filter-title">가격대</span>
        <div className="filter-list">
          <label className="filter-item">
            <input
              type="radio"
              name="price"
              className="filter-checkbox"
              checked={!safeFilters.price || safeFilters.price === "all"}
              onChange={() => handlePriceChange("all")}
            />
            전체
          </label>

          <label className="filter-item">
            <input
              type="radio"
              name="price"
              className="filter-checkbox"
              checked={safeFilters.price === "50_down"}
              onChange={() => handlePriceChange("50_down")}
            />
            50만원 이하
          </label>

          <label className="filter-item">
            <input
              type="radio"
              name="price"
              className="filter-checkbox"
              checked={safeFilters.price === "100_down"}
              onChange={() => handlePriceChange("100_down")}
            />
            100만원 이하
          </label>

          <label className="filter-item">
            <input
              type="radio"
              name="price"
              className="filter-checkbox"
              checked={safeFilters.price === "200_down"}
              onChange={() => handlePriceChange("200_down")}
            />
            200만원 이하
          </label>

          <label className="filter-item">
            <input
              type="radio"
              name="price"
              className="filter-checkbox"
              checked={safeFilters.price === "300_down"}
              onChange={() => handlePriceChange("300_down")}
            />
            300만원 이하
          </label>

          <label className="filter-item">
            <input
              type="radio"
              name="price"
              className="filter-checkbox"
              checked={safeFilters.price === "400_down"}
              onChange={() => handlePriceChange("400_down")}
            />
            400만원 이하
          </label>
        </div>
      </div>

      {/* 5. 정렬 */}
      <div className="sidebar-section">
        <span className="filter-title">정렬</span>
        <div className="filter-list">
          <label className="filter-item">
            <input
              type="radio"
              name="sort"
              className="filter-checkbox"
              checked={!safeFilters.sortOrder || safeFilters.sortOrder === "latest"}
              onChange={() => handleSortChange("latest")}
            />
            최신순 (기본)
          </label>

          <label className="filter-item">
            <input
              type="radio"
              name="sort"
              className="filter-checkbox"
              checked={safeFilters.sortOrder === "lowPrice"}
              onChange={() => handleSortChange("lowPrice")}
            />
            낮은 가격순
          </label>

          <label className="filter-item">
            <input
              type="radio"
              name="sort"
              className="filter-checkbox"
              checked={safeFilters.sortOrder === "highPrice"}
              onChange={() => handleSortChange("highPrice")}
            />
            높은 가격순
          </label>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
