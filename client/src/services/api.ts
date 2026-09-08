import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tp_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (data: { identifier: string; password: string }) => api.post('/auth/login', data),
  register: (data: { username: string; email: string; password: string }) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
};

export const roomApi = {
  createRoom: (data: { room_name: string; privacy?: string; max_users?: number; initial_video?: string }) =>
    api.post('/rooms', data),
  getRoomByCode: (code: string) => api.get(`/rooms/${code}`),
  getMyRooms: () => api.get('/rooms/my'),
  getRoomMessages: (roomId: string) => api.get(`/rooms/${roomId}/messages`),
  getWatchHistory: () => api.get('/rooms/history'),
  saveWatchHistory: (data: { video_url: string; video_title?: string; room_id?: string; last_position?: number }) =>
    api.post('/rooms/history', data),
};

export default api;
