import { Capacitor, CapacitorHttp } from '@capacitor/core';

export const apiFija = Boolean(import.meta.env.VITE_API_URL);
const defaultOrigin = import.meta.env.VITE_API_URL ||
  (Capacitor.isNativePlatform() ? 'http://192.168.1.76:5080' : 'http://localhost:5080');
const originKey = 'saaap.api-origin';
let token;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function apiOrigin() {
  return apiFija ? defaultOrigin : localStorage.getItem(originKey) || defaultOrigin;
}

export function setApiOrigin(value) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash) {
    throw new Error('Ingresa la dirección de la API, por ejemplo http://192.168.1.50:5080.');
  }
  localStorage.setItem(originKey, url.href.replace(/\/+$/, ''));
}

export function setToken(value) {
  token = value;
}

export async function request(path, { method = 'GET', body } = {}) {
  const url = apiOrigin() + path;
  const headers = { Accept: 'application/json, application/problem+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  let status;
  let payload;
  try {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url, method, headers, data: body, connectTimeout: 8_000, readTimeout: 15_000,
        disableRedirects: true,
      });
      status = response.status;
      payload = response.data;
    } else {
      const response = await fetch(url, {
        method, headers, body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(15_000), redirect: 'error',
      });
      status = response.status;
      const type = response.headers.get('Content-Type') || '';
      payload = type.includes('json') ? await response.json() : null;
    }
  } catch {
    throw new Error('No se pudo conectar con la API. Revisa la dirección y la conexión de red.');
  }
  if (status < 200 || status >= 300) {
    const message = {
      401: 'La sesión no es válida.',
      429: 'Demasiados intentos. Espera un minuto y vuelve a intentar.',
    }[status];
    throw new ApiError(status, payload?.mensaje || payload?.title || message || 'La API no pudo completar la solicitud.');
  }
  return payload;
}

export function apiPath(path, values) {
  return path + '?' + new URLSearchParams(values).toString();
}
