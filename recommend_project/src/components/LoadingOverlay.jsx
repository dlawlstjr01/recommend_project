import React from "react";

export default function LoadingOverlay({ text = "로딩중..." }) {
  return (
    <div className="loading-overlay">
      <div className="loading-box">
        <div className="spinner" />
        <p>{text}</p>
      </div>
    </div>
  );
}
