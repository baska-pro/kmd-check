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
      throw new Error('Server GAS terlalu lama merespons. Coba beberapa saat lagi.');
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

    return { ...item, jumlahCenter: target, progressCenter: progress, statusUpload };
  });
};

const applyServerData = (store: StoreApi, data: any) => {
  if (!data || typeof data !== 'object') return;
  const current = store.getState();
  const rawStaff = Array.isArray(data.staff) ? data.staff : [];
  const activityLogs = normalizeLogsArray(findLogsInData(data));
  const now = new Date();

  store.setState({
    staff: normalizeAuthoritativeStaff(rawStaff),
    systemStatus: normalizeSystemStatus(data.systemStatus || {}),
    options: normalizeOptions(data.options || {}),
    companyProfile: normalizeCompanyProfile(data.companyProfile || []),
    usersList: Array.isArray(data.usersList) ? data.usersList : [],
    activityLogs: mergeLogs(current.activityLogs, activityLogs),
    lastUpdatedStaff: now,
    lastUpdatedSystem: now,
    lastUpdatedCompany: current.lastUpdatedCompany || now,
    lastUpdatedUsers: current.lastUpdatedUsers || now,
    error: null,
  });
};

const queueOffline = (store: StoreApi, payload: Record<string, unknown>) => {
  store.setState({
    offlineQueue: [...(store.getState().offlineQueue || []), payload],
    isUpdating: false,
    isLoading: false,
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
        if (!store.getState().isUpdating) {
          applyServerData(store, data);
          lastSuccessfulFetch = Date.now();
        }
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

  const login = async (username: string, password: string) => {
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '');
    if (!cleanUsername || !cleanPassword) throw new Error('Username dan password wajib diisi.');

    store.setState({ isLoading: true, error: null });
    try {
      const user = await postGas({ action: 'login', username: cleanUsername, password: cleanPassword }, 12000);
      if (!user?.username || !user?.role) throw new Error('Respons login tidak valid.');
      store.getState().setUser({
        username: String(user.username),
        role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
      });
      await fetchData(true);
    } catch (error: any) {
      store.setState({ error: error?.message || 'Login gagal.' });
      throw error;
    } finally {
      store.setState({ isLoading: false });
    }
  };

  const updateStaff = async (nik: string, updates: Record<string, unknown>) => {
    const before = store.getState().staff || [];
    const optimistic = before.map((item: any) => item.nik === nik ? { ...item, ...updates } : item);
    store.setState({ staff: optimistic, isUpdating: true, lastWriteTime: Date.now(), error: null });

    const payload = { action: 'updateStaff', nik, updates };
    if (!navigator.onLine) {
      queueOffline(store, payload);
      return;
    }

    try {
      const data = await postGas(payload);
      applyServerData(store, data);
    } catch (error: any) {
      store.setState({ staff: before, error: error?.message || 'Gagal memperbarui staf.' });
      throw error;
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
  };

  const updateMultipleStaff = async (updatesList: any[]) => {
    const payload = { action: 'bulkUpdateStaff', updatesList };
    if (!navigator.onLine) {
      queueOffline(store, payload);
      return;
    }
    store.setState({ isUpdating: true, error: null });
    try {
      const data = await postGas(payload);
      applyServerData(store, data);
    } catch (error: any) {
      store.setState({ error: error?.message || 'Gagal memperbarui staf secara massal.' });
      throw error;
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
  };

  const updateSystemStatus = async (updates: Record<string, unknown>) => {
    const previous = store.getState().systemStatus;
    store.setState({
      systemStatus: { ...(previous || {}), ...updates },
      isUpdating: true,
      error: null,
    });
    const payload = { action: 'updateSystem', updates };
    if (!navigator.onLine) {
      queueOffline(store, payload);
      return;
    }
    try {
      const data = await postGas(payload);
      applyServerData(store, data);
    } catch (error: any) {
      store.setState({ systemStatus: previous, error: error?.message || 'Gagal memperbarui sistem.' });
      throw error;
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
  };

  const resetProgress = async (isAuto = false, todayStr?: string) => {
    store.setState({ isUpdating: true, error: null });
    try {
      const data = await postGas({ action: 'resetProgress', isAuto, todayStr });
      applyServerData(store, data);
    } catch (error: any) {
      store.setState({ error: error?.message || 'Reset progress gagal.' });
      throw error;
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
  };

  const runManagementAction = async (action: string, payload: any) => {
    if (!navigator.onLine) throw new Error('Fitur ini membutuhkan koneksi server.');
    store.setState({ isUpdating: true, error: null });
    try {
      const data = await postGas({ action, payload });
      if (data && typeof data === 'object' && Array.isArray(data.staff)) {
        applyServerData(store, data);
      }
    } catch (error: any) {
      store.setState({ error: error?.message || 'Perubahan data gagal.' });
      throw error;
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
    await fetchData(false);
  };

  const addLog = async (actionName: string, details: string) => {
    if (!navigator.onLine) return;
    const user = store.getState().user?.username || 'System';
    try {
      await postGas({ action: 'addLog', actionName, details, user });
      await fetchData(true);
    } catch (error) {
      console.error('[KMD Log]', error);
    }
  };

  const deleteLog = async (id: string) => {
    if (!navigator.onLine) throw new Error('Hapus log membutuhkan koneksi server.');
    await postGas({ action: 'deleteLog', id });
    await fetchData(false);
  };

  const syncOfflineQueue = async () => {
    if (!navigator.onLine) return;
    const originalQueue = [...(store.getState().offlineQueue || [])];
    if (originalQueue.length === 0) return;

    const remaining = [...originalQueue];
    store.setState({ isUpdating: true, error: null });
    try {
      while (remaining.length > 0) {
        await postGas(remaining[0]);
        remaining.shift();
        store.setState({ offlineQueue: [...remaining] });
      }
    } catch (error: any) {
      store.setState({ error: error?.message || 'Sinkronisasi antrean offline gagal.' });
      throw error;
    } finally {
      store.setState({ isUpdating: false, isLoading: false });
    }
    await fetchData(false);
  };

  store.setState({
    fetchData,
    login,
    updateStaff,
    updateMultipleStaff,
    updateSystemStatus,
    resetProgress,
    manageCompanyProfile: (payload: any) => runManagementAction('manageCompanyProfile', payload),
    manageUser: (payload: any) => runManagementAction('manageUser', payload),
    manageStaff: (payload: any) => runManagementAction('manageStaff', payload),
    addLog,
    deleteLog,
    syncOfflineQueue,
    sendTelegramNotification: async () => undefined,
    sendTelegramProgressUpdate: async () => undefined,
    sendWhatsAppNotification: async () => undefined,
    sendWhatsAppProgressUpdate: async () => undefined,
  });
};

export const fetchServerDataOnce = async (store: StoreApi) => {
  await store.getState().fetchData(true);
};
