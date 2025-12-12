import axios from 'axios';

const API_BASE = 'http://localhost:5000/api/techspecs';

export const searchProducts = async (query) => {
  const response = await axios.get(`${API_BASE}/search?query=${encodeURIComponent(query)}`);
  return response.data;
};

export const getProductDetail = async (productId) => {
  const response = await axios.get(`${API_BASE}/detail/${productId}`);
  return response.data;
};

export const getLocalProducts = async () => {
  const res = await axios.get(`${API_BASE}/local-products`);
  return res.data; // 배열
};
