import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEV_API_PORT = 5000;

const resolveDevApiUrl = (): string => {
  const hostUri = (Constants as any).expoConfig?.hostUri || (Constants as any).debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${DEV_API_PORT}/api`;
    }
  }
  return Platform.OS === 'android'
    ? `http://10.0.2.2:${DEV_API_PORT}/api`
    : `http://localhost:${DEV_API_PORT}/api`;
};

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? resolveDevApiUrl() : 'https://api.talentscope.app/api');

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

const apiRequest = async (
  endpoint: string,
  method: string = 'GET',
  body: any = null,
  opts: { timeoutMs?: number } = {}
) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
      signal: controller.signal
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('Network request timed out');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new Error('Malformed response: server returned non-JSON payload');
  }

  if (!response.ok) {
    const err: any = new Error(data?.message || 'API request failed');
    err.status = response.status;
    throw err;
  }
  return data;
};

// Auth endpoints
export const registerAthlete = async (userData: any) => {
  const res = await apiRequest('/auth/register', 'POST', userData);
  if (res.token) setAuthToken(res.token);
  return res;
};

export const loginUser = async (credentials: { phone?: string; email?: string; password: string }) => {
  const res = await apiRequest('/auth/login', 'POST', credentials);
  if (res.token) setAuthToken(res.token);
  return res;
};

export const getProfile = async () => {
  return await apiRequest('/auth/profile', 'GET');
};

// Athlete Dashboard & Progress endpoints (Phase 8)
export const getAthleteDashboard = async () => {
  return await apiRequest('/athletes/dashboard', 'GET');
};

export const getAthleteProgress = async () => {
  return await apiRequest('/athletes/progress', 'GET');
};

export const getAthleteStats = async () => {
  return await apiRequest('/athletes/stats', 'GET');
};

export const updateAthleteProfile = async (updates: any) => {
  return await apiRequest('/athletes/profile', 'PUT', updates);
};

// Assessment Lifecycle endpoints (Phase 7)
export const createAssessment = async (assessmentData: any) => {
  return await apiRequest('/assessments', 'POST', assessmentData);
};

export const getAssessmentById = async (id: string) => {
  return await apiRequest(`/assessments/${id}`, 'GET');
};

export const updateAssessmentStatus = async (id: string, status: string) => {
  return await apiRequest(`/assessments/${id}/status`, 'PATCH', { status });
};

export const saveAssessmentResults = async (id: string, results: any) => {
  return await apiRequest(`/assessments/${id}/results`, 'PUT', results);
};

export const markAssessmentCompleted = async (id: string) => {
  return await apiRequest(`/assessments/${id}/complete`, 'PATCH');
};

export const markAssessmentFailed = async (id: string, errorDetails: any) => {
  return await apiRequest(`/assessments/${id}/fail`, 'PATCH', errorDetails);
};

export const getAssessmentHistory = async (params: { sport?: string; testType?: string } = {}) => {
  const query = new URLSearchParams(params as any).toString();
  const endpoint = query ? `/assessments/history?${query}` : '/assessments/history';
  return await apiRequest(endpoint, 'GET');
};

export const getLatestAssessment = async () => {
  return await apiRequest('/assessments/latest', 'GET');
};

const buildQuery = (params: Record<string, any>) => {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
};

// Coach endpoints
export const getCoaches = async (params: { search?: string; specialty?: string } = {}) => {
  const query = buildQuery(params);
  return await apiRequest(query ? `/coaches?${query}` : '/coaches', 'GET');
};

export const getCoachById = async (id: string) => {
  return await apiRequest(`/coaches/${id}`, 'GET');
};

// Consultation booking endpoints
export const bookConsultation = async (payload: {
  coachId: string;
  assessmentId?: string;
  athleteNotes?: string;
  scheduledDate?: string | null;
}) => {
  return await apiRequest('/consultations', 'POST', payload);
};

export const getMyConsultations = async () => {
  return await apiRequest('/consultations/mine', 'GET');
};

export const getCoachConsultations = async () => {
  return await apiRequest('/coaches/me/consultations', 'GET');
};

// Coach dashboard endpoints
export const getCoachMe = async () => {
  return await apiRequest('/coaches/me', 'GET');
};

export const getCoachDashboard = async () => {
  return await apiRequest('/coaches/me/dashboard', 'GET');
};

export const getMyCoachAthletes = async () => {
  return await apiRequest('/coaches/me/athletes', 'GET');
};

export const getCoachAthleteOverview = async (athleteId: string) => {
  return await apiRequest(`/coaches/me/athletes/${athleteId}/overview`, 'GET');
};

export const getCoachAthleteProgress = async (athleteId: string) => {
  return await apiRequest(`/coaches/me/athletes/${athleteId}/progress`, 'GET');
};

export const getCoachAthleteInjuryRisk = async (athleteId: string) => {
  return await apiRequest(`/coaches/me/athletes/${athleteId}/injury-risk`, 'GET');
};
