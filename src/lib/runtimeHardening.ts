import {
  normalizeCompanyProfile,
  normalizeLogsArray,
  findLogsInData,
  normalizeOptions,
  normalizeStaffArray,
  normalizeSystemStatus,
  normalizeNikForMatch,
} from './store';

const GAS_URL = String(import.meta.env.VITE_GAS_URL || '').trim();
const REQUEST_TIMEOUT_MS = 15000;
const SILENT_FETCH_GAP_MS = 5000;

type StoreApi = {
  getState: () => any;
  setState: (partial: any) => void;
};

let requestInFlight: Promise<void> | null = null;
let lastSuccessfulFetch = 0;

const postGas = async (payload: Record<string, unknown>, timeoutMs = REQUEST_TIMEOUT_MS) => {
  if (!GAS_URL) throw new Error('VITE_GAS_URL belum dikonfigurasi di deployment aplikasi.');
  if (!navigator.onLine) throw new Error('Tidak ada koneksi internet. Data KMD hanya dibaca dari Spreadsheet, jadi mode offline tidak digunakan.');

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
    if (!response.ok) throw new Error(`GAS HTTP ${response.status}`);
    const text = await response.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Respons GAS bukan JSON. Periksa URL deployment Web App dan akses deploy-nya.');
    }
    if (!json?.success) throw new Error(json?.error || 'Permintaan ke GAS gagal.');
    return json.data;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('Server GAS timeout. Coba lagi beberapa saat.');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
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
      nik: String(raw.nik ?? item.nik ?? '').trim(),
      jumlahCenter: target,
      progressCenter: progress,
      statusUpload,
    };
  });
};

const applyServerData = (store: StoreApi, data: any) => {
  if (!data || typeof data !== 'object') throw new Error('Data GAS kosong atau tidak valid.');
  const rawStaff = Array.isArray(data.staff) ? data.staff : [];
  const activityLogs = normalizeLogsArray(findLogsInData(data));
  const now = new Date();

  store.setState({
    staff: normalizeAuthoritativeStaff(rawStaff),
    systemStatus: normalizeSystemStatus(data.systemStatus || {}),
    options: normalizeOptions(data.options || {}),
    companyProfile: normalizeCompanyProfile(data.companyProfile || []),
    usersList: Array.isArray(data.usersList) ? data.usersList : [],
    activityLogs,
    lastUpdatedStaff: now,
    lastUpdatedSystem: now,
    lastUpdatedCompany: now,
    lastUpdatedUsers: now,
    error: null,
  });
};

export const installRuntimeHardening = (store: StoreApi) => {
  const fetchData = async (silent = false) => {
    if (!GAS_URL) {
      if (!silent) store.setState({ error: 'VITE_GAS_URL belum dikonfigurasi.' });
      return;
    }
    if (!navigator.onLine) {
      if (!silent) store.setState({ error: 'Offline. Data lokal tidak digunakan.' });
      return;
    }
    if (store.getState().isUpdating) return;
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
        store.setState({ error: error?.message || 'Gagal mengambil data Spreadsheet.' });
        if (!silent) throw error;
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
    const cleanPassword = String(password || '').trim();
    if (!cleanUsername || !cleanPassword) throw new Error('Username dan password wajib diisi.');

    store.setState({ isLoading: true, error: null });
    try {
      const user = await postGas({ action: 'login', username: cleanUsername, password: cleanPassword }, 15000);
      if (!user?.username || !user?.role) throw new Error('Respons login dari GAS tidak valid.');
      store.getState().setUser({ username: String(user.username), role: user.role === 'ADMIN' ? 'ADMIN' : 'USER' });
      await fetchData(true);
    } catch (error: any) {
      const message = error?.message || 'Login gagal.';
      store.setState({ error: message });
      throw new Error(message);
    } finally {
      store.setState({ isLoading: false });
    }
  };

  const updateStaff = async (nik: string, updates: Record<string, unknown>) => {
    if (!navigator.onLine) throw new Error('Update membutuhkan koneksi ke Spreadsheet.');
    const originalNik = String(nik || '').trim();
    if (!originalNik) throw new Error('NIK staf tidak valid.');

    store.setState({ isUpdating: true, error: null, lastWriteTime: Date.now() });
    try {
      const data = await postGas({ action: 'updateStaff', nik: originalNik, updates });
      applyServerData(store, data);
    } catch (error: any) {
      store.setState({ error: error?.message || 'Gagal memperbarui staf.' });
      throw error;
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
  };

  const updateMultipleStaff = async (updatesList: any[]) => {
    if (!navigator.onLine) throw new Error('Update membutuhkan koneksi ke Spreadsheet.');
    const safeList = (updatesList || []).filter((item: any) => item?.nik && item?.updates);
    if (!safeList.length) return;
    store.setState({ isUpdating: true, error: null });
    try {
      const data = await postGas({ action: 'bulkUpdateStaff', updatesList: safeList });
      applyServerData(store, data);
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
  };

  const updateSystemStatus = async (updates: Record<string, unknown>) => {
    if (!navigator.onLine) throw new Error('Update membutuhkan koneksi ke Spreadsheet.');
    store.setState({ isUpdating: true, error: null });
    try {
      const data = await postGas({ action: 'updateSystem', updates });
      applyServerData(store, data);
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
  };

  const resetProgress = async (isAuto = false, todayStr?: string) => {
    if (!navigator.onLine) throw new Error('Reset membutuhkan koneksi ke Spreadsheet.');
    store.setState({ isUpdating: true, error: null });
    try {
      const data = await postGas({ action: 'resetProgress', isAuto, todayStr });
      applyServerData(store, data);
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
  };

  const runManagementAction = async (action: string, payload: any) => {
    if (!navigator.onLine) throw new Error('Perubahan data membutuhkan koneksi ke Spreadsheet.');
    store.setState({ isUpdating: true, error: null });
    try {
      const data = await postGas({ action, payload });
      if (data && typeof data === 'object') applyServerData(store, data);
      else await fetchData(false);
    } catch (error: any) {
      store.setState({ error: error?.message || 'Perubahan data gagal.' });
      throw error;
    } finally {
      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });
    }
  };

  const addLog = async (actionName: string, details: string) => {
    if (!navigator.onLine) return;
    const user = store.getState().user?.username || 'System';
    try {
      const data = await postGas({ action: 'addLog', actionName, details, user });
      if (data && typeof data === 'object') applyServerData(store, data);
    } catch (error) {
      console.error('[KMD Log]', error);
    }
  };

  const deleteLog = async (id: string) => {
    if (!navigator.onLine) throw new Error('Hapus log membutuhkan koneksi ke Spreadsheet.');
    const data = await postGas({ action: 'deleteLog', id });
    if (data && typeof data === 'object') applyServerData(store, data);
  };

  // Offline queue is intentionally disabled. The app must never pretend local data is authoritative.
  const syncOfflineQueue = async () => {
    if ((store.getState().offlineQueue || []).length) store.setState({ offlineQueue: [] });
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
    manageStaff: async (payload: any) => {
      if (payload?.originalNik) payload.originalNik = String(payload.originalNik).trim();
      if (payload?.nik) payload.nik = String(payload.nik).trim();
      return runManagementAction('manageStaff', payload);
    },
    addLog,
    deleteLog,
    syncOfflineQueue,
    sendTelegramNotification: async () => undefined,
    sendTelegramProgressUpdate: async () => undefined,
    sendWhatsAppNotification: async () => undefined,
    sendWhatsAppProgressUpdate: async () => undefined,
  });

  // Remove any stale local operational state immediately after runtime install.
  const current = store.getState();
  if (Array.isArray(current.staff) && current.staff.some((s: any) => !normalizeNikForMatch(s?.nik))) {
    store.setState({ staff: [] });
  }
};

export const fetchServerDataOnce = async (store: StoreApi) => {
  await store.getState().fetchData(true);
};
