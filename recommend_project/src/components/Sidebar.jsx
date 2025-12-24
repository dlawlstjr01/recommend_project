import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaUndo, FaSearch, FaChevronDown, FaChevronRight } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

const Sidebar = ({ filters, setFilters }) => {
  const [localKeyword, setLocalKeyword] = useState("");

  // ✅ 서버에서 카테고리 목록 받아오기
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [catsLoading, setCatsLoading] = useState(false);

  // ✅ 그룹 펼침 상태
  const [openDesktop, setOpenDesktop] = useState(false);
  const [openPeripheral, setOpenPeripheral] = useState(false);
  const [openExternal, setOpenExternal] = useState(false);
  const [openOther, setOpenOther] = useState(false);

  useEffect(() => {
    if (filters && filters.keyword !== undefined) {
      setLocalKeyword(filters.keyword);
    }
  }, [filters]);

  const safeFilters = filters || {
    keyword: "",
    category: [], // ✅ category는 이제 'cpu' 같은 key 배열로 사용
    brand: [],
    price: "all",
    sortOrder: "latest",
  };

  // ✅ categories fetch
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

  // key -> label 빠른 조회용
  const labelByKey = useMemo(() => {
    const m = {};
    for (const c of categoryOptions) m[c.key] = c.label || c.key;
    return m;
  }, [categoryOptions]);

  // ✅ 그룹 정의(데스크탑 부품 / 주변기기 / 외장 저장장치)
  const desktopKeys = useMemo(() => {
    const keys = [
      "cpu",
      "gpu",
      "motherboard",
      "ram",
      "psu",
      "case",
      "ssd",
      "hdd",
      "aio_cooler",
      "air_cooler",
      "ai_cooler",
      "gpu_holder",
    ];
    return keys.filter((k) => labelByKey[k]); // 서버에 존재하는 것만
  }, [labelByKey]);

  const peripheralKeys = useMemo(() => {
    const keys = ["keyboard", "mouse", "headset", "speakers", "controller"];
    return keys.filter((k) => labelByKey[k]);
  }, [labelByKey]);

  const externalKeys = useMemo(() => {
    const keys = ["portable_ssd", "portable_hdd"];
    return keys.filter((k) => labelByKey[k]);
  }, [labelByKey]);

  // ✅ 노트북/모니터 같은 “단일 카테고리”
  const singleKeys = useMemo(() => {
    const keys = ["laptop", "monitor"];
    return keys.filter((k) => labelByKey[k]);
  }, [labelByKey]);

  // ✅ 위 그룹/단일에 포함되지 않은 카테고리는 기타로
  const otherKeys = useMemo(() => {
    const used = new Set([
      ...desktopKeys,
      ...peripheralKeys,
      ...externalKeys,
      ...singleKeys,
    ]);
    return categoryOptions
      .map((c) => c.key)
      .filter((k) => !used.has(k))
      .sort((a, b) => (labelByKey[a] || a).localeCompare(labelByKey[b] || b, "ko"));
  }, [categoryOptions, desktopKeys, peripheralKeys, externalKeys, singleKeys, labelByKey]);

  // ✅ 검색 적용
  const applySearch = () => {
    if (setFilters) setFilters((prev) => ({ ...prev, keyword: localKeyword }));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") applySearch();
  };

  // ✅ 체크박스(단일 key) 토글
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

  // ✅ 그룹 전체 토글(모두 선택/모두 해제)
  const toggleGroup = (keys) => {
    if (!setFilters) return;
    setFilters((prev) => {
      const cur = prev.category || [];
      const hasAny = keys.some((k) => cur.includes(k));
      // 하나라도 선택되어 있으면 -> 전부 제거 / 아니면 -> 전부 추가
      if (hasAny) {
        return { ...prev, category: cur.filter((x) => !keys.includes(x)) };
      }
      return { ...prev, category: Array.from(new Set([...cur, ...keys])) };
    });
  };

  // ✅ 그룹 체크 상태(전체/부분)
  const groupState = (keys) => {
    const cur = safeFilters.category || [];
    const selectedCount = keys.filter((k) => cur.includes(k)).length;
    const all = keys.length > 0 && selectedCount === keys.length;
    const some = selectedCount > 0 && !all;
    return { all, some, selectedCount };
  };

  // indeterminate 적용(부분 선택일 때 체크박스 중간상태)
  const desktopRef = useRef(null);
  const peripheralRef = useRef(null);
  const externalRef = useRef(null);

  useEffect(() => {
    const { some } = groupState(desktopKeys);
    if (desktopRef.current) desktopRef.current.indeterminate = some;
  }, [desktopKeys, safeFilters.category]);

  useEffect(() => {
    const { some } = groupState(peripheralKeys);
    if (peripheralRef.current) peripheralRef.current.indeterminate = some;
  }, [peripheralKeys, safeFilters.category]);

  useEffect(() => {
    const { some } = groupState(externalKeys);
    if (externalRef.current) externalRef.current.indeterminate = some;
  }, [externalKeys, safeFilters.category]);

  // ✅ 브랜드/가격/정렬 기존 로직 유지
  const handleCheckboxChange = (type, value) => {
    if (!setFilters) return;
    setFilters((prev) => {
      const currentList = prev[type] || [];
      return {
        ...prev,
        [type]: currentList.includes(value)
          ? currentList.filter((item) => item !== value)
          : [...currentList, value],
      };
    });
  };

  const handlePriceChange = (value) => {
    if (setFilters) setFilters((prev) => ({ ...prev, price: value }));
  };

  const handleSortChange = (value) => {
  if (!setFilters) return;

  setFilters((prev) => ({
    ...prev,
    sortOrder: prev.sortOrder === value ? null : value,
  }));
};


  const resetFilters = () => {
  if (!setFilters) return;

  setFilters(() => ({
    keyword: "",
    category: [],   //  카테고리 초기화
    brand: [],
    price: "all",
    sortOrder: null,
  }));

  setLocalKeyword("");

  //  그룹 UI 상태도 초기화
  setOpenDesktop(false);
  setOpenPeripheral(false);
  setOpenExternal(false);
  setOpenOther(false);
};


  // UI 보조: 그룹 타이틀 버튼
const GroupHeader = ({ title, open, setOpen, checkboxRef, checked, onToggleAll }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    {/* 기존 노트북/모니터랑 같은 체크박스 줄 */}
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

    {/* 오른쪽 화살표: 펼치기/접기 표시 + 클릭 영역 */}
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!open);
      }}
      aria-label={open ? "접기" : "펼치기"}
      title={open ? "접기" : "펼치기"}
      style={{
        width: 24,
        height: 24,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
        lineHeight: 1,
        color: "rgba(0,0,0,0.55)",
        flexShrink: 0,
      }}
    >
      {open ? "▾" : "▸"}
    </button>
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
            {/* ✅ 단일 카테고리(노트북/모니터 등) */}
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

            {/* ✅ 데스크탑(부품) 그룹 */}
            {desktopKeys.length > 0 && (
              <div style={{ width: "100%" }}>
                {(() => {
                  const { all } = groupState(desktopKeys);
                  return (
                    <>
                      <GroupHeader
                        title="데스크탑(부품)"
                        open={openDesktop}
                        setOpen={setOpenDesktop}
                        checkboxRef={desktopRef}
                        checked={all}
                        onToggleAll={() => toggleGroup(desktopKeys)}
                      />

                      {openDesktop && (
                        <div style={{ marginLeft: 18, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          {desktopKeys.map((k) => (
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
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* ✅ 주변기기 그룹 */}
            {peripheralKeys.length > 0 && (
              <div style={{ width: "100%", marginTop: 10 }}>
                {(() => {
                  const { all } = groupState(peripheralKeys);
                  return (
                    <>
                      <GroupHeader
                        title="주변기기"
                        open={openPeripheral}
                        setOpen={setOpenPeripheral}
                        checkboxRef={peripheralRef}
                        checked={all}
                        onToggleAll={() => toggleGroup(peripheralKeys)}
                      />

                      {openPeripheral && (
                        <div style={{ marginLeft: 18, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          {peripheralKeys.map((k) => (
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
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* ✅ 외장 저장장치 그룹 */}
            {externalKeys.length > 0 && (
              <div style={{ width: "100%", marginTop: 10 }}>
                {(() => {
                  const { all } = groupState(externalKeys);
                  return (
                    <>
                      <GroupHeader
                        title="외장 저장장치"
                        open={openExternal}
                        setOpen={setOpenExternal}
                        checkboxRef={externalRef}
                        checked={all}
                        onToggleAll={() => toggleGroup(externalKeys)}
                      />

                      {openExternal && (
                        <div style={{ marginLeft: 18, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          {externalKeys.map((k) => (
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
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* ✅ 기타(남은 카테고리 전부) */}
            {otherKeys.length > 0 && (
              <div style={{ width: "100%", marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, opacity: 0.85 }}>기타</span>
                  <button
                    type="button"
                    onClick={() => setOpenOther(!openOther)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", opacity: 0.7 }}
                  >
                    {openOther ? "접기" : "펼치기"}
                  </button>
                </div>

                {openOther && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {otherKeys.map((k) => (
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
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. 브랜드 */}
      <div className="sidebar-section">
        <span className="filter-title">브랜드</span>
        <div className="filter-list">
          {["삼성전자", "LG전자", "Apple", "ASUS", "Lenovo"].map((brand) => (
            <label key={brand} className="filter-item">
              <input
                type="checkbox"
                className="filter-checkbox"
                checked={(safeFilters.brand || []).includes(brand)}
                onChange={() => handleCheckboxChange("brand", brand)}
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
              checked={safeFilters.sortOrder === null}
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
