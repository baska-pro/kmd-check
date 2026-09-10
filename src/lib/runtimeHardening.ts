import {
  normalizeCompanyProfile,
  normalizeLogsArray,
  findLogsInData,
  normalizeOptions,
  normalizeStaffArray,
  normalizeSystemStatus,
} from './store';

const GAS_URL = String(import.meta.env.VITE_GAS_URL || '').trim();
const REQUEST_TIMEOUT_MS = 12000;
const SILENT_FETCH_GAP_MS = 8000;

type StoreApi = {
  getState: () => any;
  setState: (partial: any) => void;
};

let requestInFlight: Promise<void> | null = null;
let lastSuccessfulFetch = 0;

const postGas = async (payload: Record<string, unknown>, timeoutMs = REQUEST_TIMEOUT_MS) => {
  if (!GAS_URL) throw new Error('VITE_GAS_URL belum dikonfigurasi.');
  if (!navigator.onLine) throw new Error('Perangkat sedang offline.');

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${GAS_URL}${GAS_URL.includes('?') ? '&' : '?'}_=${Date.now()}`;
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (!json?.success) throw new Error(json?.error || 'Respons GAS tidak valid.');
    return json.data;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Server GAS terlalu lama merespons. Coba refresh beberapa saat lagi.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
};

const mergeLogs = (current: any[], incoming: any[]) => {
  const map = new Map<string, any>();
  [...(current || []), ...(incoming || [])].forEach((item: any) => {
    if (!item) return;
    const key = item.id || `${item.timestamp || ''}-${item.user || ''}-${item.action || ''}-${item.details || ''}`;
    map.set(String(key), item);
  });
  return Array.from(map.values())
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 300);
};

const normalizeAuthoritativeStaff = (rawStaff: any[]) => {
  const normalized = normalizeStaffArray(rawStaff || []);

  return normalized.map((item: any, index: number) => {
    const raw = rawStaff?.[index] || {};
    const rawTarget = raw.jumlahCenter ?? raw.JumlahCenter ?? raw.targetCenter ?? raw.target;
    const parsedTarget = Number(rawTarget);
    const target = Number.isFinite(parsedTarget) && rawTarget !== '' && rawTarget !== null && rawTarget !== undefined
      ? Math.max(0, parsedTarget)
      : Math.max(0, Number(item.jumlahCenter) || 0);

    const progress = Math.max(0, Number(item.progressCenter) || 0);
    let statusUpload: 'Belum upload' | 'Sebagian upload' | 'Sudah upload semua' | 'Tidak ada Center' = 'Belum upload';

    if (target === 0) statusUpload = 'Tidak ada Center';
    else if (progress >= target) statusUpload = 'Sudah upload semua';
    else if (progress > 0) statusUpload = 'Sebagian upload';

    return {
      ...item,
      jumlahCenter: target,
      progressCenter: progress,
      statusUpload,
    };
  });
};

export const installRuntimeHardening = (store: StoreApi) => {
  const fetchData = async (silent = false) => {
    if (!GAS_URL || !navigator.onLine) return;
    const state = store.getState();
    if (state.isUpdating) return;
    if (silent && Date.now() - lastSuccessfulFetch < SILENT_FETCH_GAP_MS) return;
    if (requestInFlight) return requestInFlight;

    if (!silent) store.setState({ error: null });

    requestInFlight = (async () => {
      try {
        const data = await postGas({ action: 'getData' });
        const current = store.getState();
        if (current.isUpdating) return;

        const rawStaff = Array.isArray(data?.staff) ? data.staff : [];
        const staff = normalizeAuthoritativeStaff(rawStaff);
        const systemStatus = normalizeSystemStatus(data?.systemStatus || {});
        const options = normalizeOptions(data?.options || {});
        const companyProfile = normalizeCompanyProfile(data?.companyProfile || []);
        const usersList = Array.isArray(data?.usersList) ? data.usersList : [];
        const activityLogs = normalizeLogsArray(findLogsInData(data));
        const now = new Date();

        store.setState({
          staff,
          systemStatus,
          options,
          companyProfile,
          usersList,
          activityLogs: mergeLogs(current.activityLogs, activityLogs),
          lastUpdatedStaff: now,
          lastUpdatedSystem: now,
          lastUpdatedCompany: current.lastUpdatedCompany || now,
          lastUpdatedUsers: current.lastUpdatedUsers || now,
          error: null,
        });
        lastSuccessfulFetch = Date.now();
      } catch (error: any) {
        console.error('[KMD Sync]', error);
        if (!silent) store.setState({ error: error?.message || 'Gagal mengambil data.' });
      }
    })();

    try {
      await requestInFlight;
    } finally {
      requestInFlight = null;
    }
  };

  store.setState({
    fetchData,
    sendTelegramNotification: async () => undefined,
    sendTelegramProgressUpdate: async () => undefined,
    sendWhatsAppNotification: async () => undefined,
    sendWhatsAppProgressUpdate: async () => undefined,
  });
};

export const fetchServerDataOnce = async (store: StoreApi) => {
  await store.getState().fetchData(true);
};
