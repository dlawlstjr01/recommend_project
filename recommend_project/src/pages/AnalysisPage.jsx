import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';

import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import * as am5radar from "@amcharts/amcharts5/radar";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";

// Mock Data 
const MOCK_DATA = {
  "status": "success",
  "data": [
    {
      "Product": { "id": 1, "Model": "Galaxy S24", "Version": "Ultra", "Brand": "Samsung", "Category": "Smartphone" },
      "PriceInfo": { "currentPrice": 1690000 },
      "Specs": { "display": 6.8, "battery": 5000, "ram": 12, "benchmark": 15000 }
    },
    {
      "Product": { "id": 2, "Model": "iPhone 15", "Version": "Pro Max", "Brand": "Apple", "Category": "Smartphone" },
      "PriceInfo": { "currentPrice": 1900000 },
      "Specs": { "display": 6.7, "battery": 4422, "ram": 8, "benchmark": 16000 }
    },
    {
      "Product": { "id": 3, "Model": "Pixel 8", "Version": "Pro", "Brand": "Google", "Category": "Smartphone" },
      "PriceInfo": { "currentPrice": 1300000 },
      "Specs": { "display": 6.7, "battery": 5050, "ram": 12, "benchmark": 14000 }
    },
    {
      "Product": { "id": 4, "Model": "Gram 17", "Version": "2024", "Brand": "LG", "Category": "Laptop" },
      "PriceInfo": { "currentPrice": 2100000 },
      "Specs": { "display": 17, "battery": 7200, "ram": 32, "benchmark": 12000 }
    },
    {
      "Product": { "id": 5, "Model": "MacBook Air", "Version": "M3", "Brand": "Apple", "Category": "Laptop" },
      "PriceInfo": { "currentPrice": 1590000 },
      "Specs": { "display": 13.6, "battery": 6000, "ram": 16, "benchmark": 13500 }
    }
  ]
};

const AnalysisPage = () => {
  const location = useLocation(); // ★ URL 감지용
  const context = useOutletContext();
  const filters = context && context.filters ? context.filters : {};

  const [allProducts, setAllProducts] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);

  // 체크박스 상태 (초기값은 모두 true지만 useEffect로 덮어씌워짐)
  const [showOptions, setShowOptions] = useState({
    specs: true,
    price: true,
    benchmark: true
  });

  const priceChartRef = useRef(null);
  const benchChartRef = useRef(null);
  const specChartRef = useRef(null);

  // ★ 핵심: URL 경로에 따라 체크박스 상태 자동 변경
  useEffect(() => {
    const path = location.pathname;

    if (path.includes('/specs')) {
      // 스펙 비교 메뉴로 들어온 경우
      setShowOptions({ specs: true, price: false, benchmark: false });
    } else if (path.includes('/price')) {
      // 가격 변동 차트 메뉴로 들어온 경우
      setShowOptions({ specs: false, price: true, benchmark: false });
    } else if (path.includes('/benchmark')) {
      // 벤치마크 메뉴로 들어온 경우
      setShowOptions({ specs: false, price: false, benchmark: true });
    } else {
      // 그냥 /analysis로 들어오면 다 보여줌 (기본값)
      setShowOptions({ specs: true, price: true, benchmark: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    setAllProducts(MOCK_DATA.data);
  }, []);

  useEffect(() => {
    if (!allProducts.length) return;
    const keyword = (filters.keyword || '').toLowerCase();
    let results = [...allProducts];

    if (keyword) {
      results = results.filter(item => (item.Product?.Model || '').toLowerCase().includes(keyword));
    }
    if (filters.category?.length) {
      results = results.filter(item => filters.category.includes(item.Product?.Category));
    }
    if (filters.brand?.length) {
      results = results.filter(item => filters.brand.includes(item.Product?.Brand));
    }
    setSearchResults(results);
  }, [filters, allProducts]);

  const handleSelectProduct = (item) => {
    const id = item.Product?.id;
    if (!id) return;
    const exists = selectedProducts.find(prod => prod.id === id);
    if (exists) {
      setSelectedProducts(prev => prev.filter(prod => prod.id !== id));
      return;
    }
    if (selectedProducts.length >= 5) {
      alert('최대 5개까지만 비교 가능합니다.');
      return;
    }
    const normalized = {
      id,
      name: `${item.Product.Model} ${item.Product.Version}`.trim(),
      price: item.PriceInfo?.currentPrice || 0,
      benchmark: item.Specs?.benchmark || 0,
      specs: item.Specs || {}
    };
    setSelectedProducts(prev => [...prev, normalized]);
  };

  const toggleOption = (key) => {
    setShowOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // --- 차트 생성 함수들 (기존과 동일) ---
  const createChart = (divId, data, valueField, categoryField, rootRef) => {
    if (rootRef.current) rootRef.current.dispose();
    const root = am5.Root.new(divId);
    rootRef.current = root;
    root.setThemes([am5themes_Animated.new(root)]);
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, { panX: false, panY: false, wheelX: "none", wheelY: "none" })
    );
    const xAxis = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: categoryField,
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 30 })
      })
    );
    const yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, { renderer: am5xy.AxisRendererY.new(root, {}) })
    );
    const series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        name: "Series", xAxis, yAxis, valueYField: valueField, categoryXField: categoryField,
        tooltip: am5.Tooltip.new(root, { labelText: "{valueY}" })
      })
    );
    series.columns.template.setAll({ cornerRadiusTL: 5, cornerRadiusTR: 5 });
    series.columns.template.adapters.add("fill", (_f, target) => chart.get("colors").getIndex(series.columns.indexOf(target)));
    xAxis.data.setAll(data);
    series.data.setAll(data);
  };

  const createRadarChart = (divId, data, rootRef) => {
    if (rootRef.current) rootRef.current.dispose();
    const root = am5.Root.new(divId);
    rootRef.current = root;
    root.setThemes([am5themes_Animated.new(root)]);
    const chart = root.container.children.push(
      am5radar.RadarChart.new(root, { panX: false, panY: false, wheelX: "none", wheelY: "none" })
    );
    const xRenderer = am5radar.AxisRendererCircular.new(root, {});
    const xAxis = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        maxDeviation: 0, categoryField: "category", renderer: xRenderer
      })
    );
    const yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, { renderer: am5radar.AxisRendererRadial.new(root, {}) })
    );
    if (data.length > 0) {
      data.forEach((p) => {
        const series = chart.series.push(
          am5radar.RadarLineSeries.new(root, {
            name: p.name, xAxis, yAxis, valueYField: "value", categoryXField: "category",
            tooltip: am5.Tooltip.new(root, { labelText: "{name}: {valueY}" })
          })
        );
        series.strokes.template.setAll({ strokeWidth: 2 });
        const radarData = [
          { category: "Display", value: p.specs.display || 0 },
          { category: "Battery", value: (p.specs.battery || 0) / 1000 },
          { category: "RAM", value: p.specs.ram || 0 }
        ];
        series.data.setAll(radarData);
        xAxis.data.setAll(radarData);
      });
    }
  };

  useEffect(() => {
    if (selectedProducts.length === 0) return;
    if (showOptions.price) createChart("chartdiv_price", selectedProducts, "price", "name", priceChartRef);
    if (showOptions.benchmark) createChart("chartdiv_bench", selectedProducts, "benchmark", "name", benchChartRef);
    if (showOptions.specs) createRadarChart("chartdiv_spec", selectedProducts, specChartRef);

    return () => {
      if (priceChartRef.current) priceChartRef.current.dispose();
      if (benchChartRef.current) benchChartRef.current.dispose();
      if (specChartRef.current) specChartRef.current.dispose();
    };
  }, [selectedProducts, showOptions]); // showOptions가 바뀔 때마다 차트 다시 그림

  return (
    <div className="analysis-container">
      <div className="dashboard-options">
        <label className={`option-label ${showOptions.specs ? 'checked' : ''}`}>
          <div className="check-icon">✓</div>
          <input type="checkbox" style={{ display: 'none' }} checked={showOptions.specs} onChange={() => toggleOption('specs')} />
          스펙 비교
        </label>
        <label className={`option-label ${showOptions.price ? 'checked' : ''}`}>
          <div className="check-icon">✓</div>
          <input type="checkbox" style={{ display: 'none' }} checked={showOptions.price} onChange={() => toggleOption('price')} />
          가격 차트
        </label>
        <label className={`option-label ${showOptions.benchmark ? 'checked' : ''}`}>
          <div className="check-icon">✓</div>
          <input type="checkbox" style={{ display: 'none' }} checked={showOptions.benchmark} onChange={() => toggleOption('benchmark')} />
          벤치마크
        </label>
      </div>

      <div className="analysis-content-wrapper">
        <div className="product-list-sidebar">
          <div className="list-header">제품 목록</div>
          <ul className="product-list">
            {searchResults.map((item) => {
              const p = item.Product;
              const isSelected = selectedProducts.some(s => s.id === p.id);
              return (
                <li
                  key={p.id}
                  onClick={() => handleSelectProduct(item)}
                  className={`product-item ${isSelected ? 'active' : ''}`}
                >
                  {p.Brand} {p.Model} {p.Version}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="dashboard-main">
          <div className="charts-grid">
            {showOptions.specs && (
              <div className="chart-card">
                <h3>📊 스펙 비교</h3>
                {selectedProducts.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
                    제품을 선택하면 비교 차트가 나타납니다.
                  </div>
                ) : (
                  <div id="chartdiv_spec" className="chart-area"></div>
                )}
              </div>
            )}

            {showOptions.price && (
              <div className="chart-card">
                <h3>💰 가격 비교</h3>
                {selectedProducts.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
                    제품을 선택하면 가격 추이가 나타납니다.
                  </div>
                ) : (
                  <div id="chartdiv_price" className="chart-area"></div>
                )}
              </div>
            )}

            {showOptions.benchmark && (
              <div className="chart-card">
                <h3>🚀 벤치마크</h3>
                {selectedProducts.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
                    제품을 선택하면 성능 점수가 나타납니다.
                  </div>
                ) : (
                  <div id="chartdiv_bench" className="chart-area"></div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisPage;
