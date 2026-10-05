import api from "./index";
import { ENDPOINTS } from "./endpoints";

// Global search (ADR-016). `signal` lets the header search cancel a request
// the user has already typed past.
export const globalSearch = async (q, signal) => api.get(ENDPOINTS.SEARCH, { params: { q }, signal });
