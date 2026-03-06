import Constants from "expo-constants";

const BASE_URL =
  Constants.expoConfig?.extra?.BASE_URL || "https://rest-saas.gt.tc/api";

// Custom Error Class for structured error handling
export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...options.headers,
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Future-proofing: Handle empty responses for DELETE/No-Content endpoints
    if (response.status === 204) return null;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Throw structured error instead of just a string
      throw new ApiError(
        errorData.message || `API Error: ${response.status}`,
        response.status,
        errorData,
      );
    }

    return await response.json();
  } catch (error) {
    console.error(`[API Call Failed] ${endpoint}:`, error);
    throw error;
  }
};
