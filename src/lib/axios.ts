import axios from "axios";

// Tạo một instance axios với cấu hình mặc định
const apiClient = axios.create({
  baseURL: "http://localhost:5000/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Biến để lưu token
let authToken: string | null = null;

// Hàm để cập nhật token
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

// Thêm request interceptor để thêm token xác thực vào mỗi request
apiClient.interceptors.request.use(async (config) => {
  try {
    if (authToken) {
      config.headers["Authorization"] = `Bearer ${authToken}`;
    }
  } catch (error) {
    console.error("Error adding auth token to request:", error);
  }
  return config;
});

// Thêm response interceptor toàn cục
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 403) {
      // Lưu thông tin lỗi 403 vào localStorage để sử dụng trong AccountContext
      localStorage.setItem("account_locked", "true");
      localStorage.setItem(
        "account_locked_reason",
        error.response.data?.message || "Tài khoản của bạn đang bị khóa"
      );
    }
    return Promise.reject(error);
  }
);

export default apiClient;
