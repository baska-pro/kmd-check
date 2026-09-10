const PERSIST_KEY = 'kmd-check-storage';
const SNAPSHOT_KEY = 'kmd-check-server-snapshot-v1';
const LEGACY_API_CACHE = 'gas-api-cache';
const MIN_BACKGROUND_FETCH_GAP_MS = 3500;

const getWIBDateStringSafe = (value: Date | string | number = new Date()): string => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';

  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}-${String(wib.getUTCDate()).padStart(2, '0')}`;
  }
};

const safeUser = (user: any) => {
  if (!user || typeof user !== 'object') return null;
  return {
    username: String(user.username || ''),
    role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
  };
};

const safePersistedSlice = (state: any) => ({
  user: safeUser(state?.user),
  offlineQueue: Array.isArray(state?.offlineQueue) ? state.offlineQueue : [],
  theme: state?.theme === 'dark' ? 'dark' : 'light',
  voiceNotification: !!state?.voiceNotification,
});

/**
 * Server/Spreadsheet data must never be restored from Zustand persistence.
 * Only user session metadata, UI preferences and the offline write queue survive reloads.
 */
export const sanitizePersistedServerState = () => {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;

    const envelope = JSON.parse(raw);
    const state = envelope?.state || {};
    localStorage.setItem(PERSIST_KEY, JSON.stringify({
      ...envelope,
      state: safePersistedSlice(state),
    }));
  } catch (error) {
    console.warn('[Sync] Invalid persisted state removed:', error);
    try { localStorage.removeItem(PERSIST_KEY); } catch {}
  }
};

const sanitizeSystemStatusForOffline = (systemStatus: any) => {
  if (!systemStatus || typeof systemStatus !== 'object') return null;
  const {
    telegramBotToken: _telegramBotToken,
    telegramChatId: _telegramChatId,
    ...safeStatus
  } = systemStatus;
  return safeStatus;
};

const saveSameDaySnapshot = (state: any) => {
  try {
    const today = getWIBDateStringSafe();
    const snapshot = {
      date: today,
      savedAt: Date.now(),
      staff: Array.isArray(state.staff) ? state.staff : [],
      systemStatus: sanitizeSystemStatusForOffline(state.systemStatus),
      options: state.options || {},
      companyProfile: Array.isArray(state.companyProfile) ? state.companyProfile : [],
      activityLogs: Array.isArray(state.activityLogs) ? state.activityLogs.slice(0, 150) : [],
      lastUpdatedStaff: state.lastUpdatedStaff || null,
      lastUpdatedSystem: state.lastUpdatedSystem || null,
      lastUpdatedCompany: state.lastUpdatedCompany || null,
      lastUpdatedUsers: state.lastUpdatedUsers || null,
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[Sync] Could not save offline snapshot:', error);
  }
};

const readSameDaySnapshot = () => {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (snapshot?.date !== getWIBDateStringSafe()) {
      localStorage.removeItem(SNAPSHOT_KEY);
      return null;
    }
    return snapshot;
  } catch {
    try { localStorage.removeItem(SNAPSHOT_KEY); } catch {}
    return null;
  }
};

const clearLegacyApiCaches = async () => {
  if (!('caches' in window)) return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name === LEGACY_API_CACHE || /gas[-_]?api/i.test(name))
        .map(name => caches.delete(name))
    );
  } catch (error) {
    console.warn('[Sync] Failed to clear old API caches:', error);
  }
};

const datePrefix = (value: any): string => {
  if (!value) return '';
  if (value instanceof Date) return getWIBDateStringSafe(value);
  const text = String(value).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : getWIBDateStringSafe(parsed);
};

const hasMeaningfulActivityToday = (state: any, today: string): boolean => {
  const staffTouchedToday = Array.isArray(state?.staff) && state.staff.some((staff: any) =>
    datePrefix(staff?.tanggalUpdate) === today
  );
  if (staffTouchedToday) return true;

  if (!Array.isArray(state?.activityLogs)) return false;
  return state.activityLogs.some((log: any) => {
    if (!log?.timestamp || getWIBDateStringSafe(log.timestamp) !== today) return false;
    const action = String(log.action || '').toLowerCase();
    if (!action) return false;
    return !['login', 'logout', 'sistem aktif'].some(ignored => action.includes(ignored));
  });
};

const postGas = async (payload: any): Promise<any | null> => {
  const gasUrl = String(import.meta.env.VITE_GAS_URL || '').trim();
  if (!gasUrl || !navigator.onLine) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const url = gasUrl + (gasUrl.includes('?') ? '&' : '?') + '_sync=' + Date.now();
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('[Sync] GAS reconciliation failed:', error);
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
};

/**
 * Reconcile a missed daily reset without destroying work already entered today.
 * - If today already has activity: mark today as acknowledged (no destructive reset).
 * - If no activity exists: perform the normal server-side daily reset before rendering.
 */
const reconcileDailyBoundary = async (store: any, baseFetch: (silent?: boolean) => Promise<void>) => {
  const today = getWIBDateStringSafe();
  const state = store.getState();
  const serverMarker = datePrefix(state?.systemStatus?.lastResetDate);

  if (!today) return;
  if (serverMarker === today) {
    localStorage.setItem('kmd_last_reset_date', today);
    return;
  }

  const todayAlreadyStarted = hasMeaningfulActivityToday(state, today);

  if (todayAlreadyStarted) {
    console.warn(`[Sync] Server daily marker is ${serverMarker || 'empty'}, but work exists for ${today}. Reconciling without reset.`);

    // Prevent the legacy App effect from running a late destructive reset while reconciliation is in flight.
    localStorage.setItem('kmd_last_reset_date', today);
    if (state.systemStatus) {
      store.setState({
        systemStatus: { ...state.systemStatus, lastResetDate: today },
      });
    }

    const result = await postGas({
      action: 'updateSystem',
      updates: { lastResetDate: today },
    });

    if (result?.success) {
      await baseFetch(true);
    }
    return;
  }

  console.info(`[Sync] No activity found for ${today}; requesting server-side daily reset before UI render.`);
  const resetResult = await postGas({
    action: 'resetProgress',
    isAuto: true,
    todayStr: today,
  });

  if (resetResult?.success) {
    localStorage.setItem('kmd_last_reset_date', today);

    // If ScriptProperties caused a duplicate-reset skip while the sheet marker remained stale,
    // repair only the marker and preserve existing values.
    const returnedMarker = datePrefix(resetResult?.data?.systemStatus?.lastResetDate);
    if (returnedMarker !== today) {
      await postGas({ action: 'updateSystem', updates: { lastResetDate: today } });
    }
    await baseFetch(false);
  }
};

/**
 * Install synchronization hardening before the React tree renders.
 * This makes Google Sheets/GAS authoritative while retaining a same-day offline snapshot.
 */
export const bootstrapDataSynchronization = async (store: any) => {
  await clearLegacyApiCaches();

  // Change Zustand's persistence policy at runtime so future writes cannot re-persist server data.
  try {
    store.persist?.setOptions?.({
      partialize: safePersistedSlice,
    });
  } catch (error) {
    console.warn('[Sync] Could not update persist policy:', error);
  }

  sanitizePersistedServerState();

  const initialState = store.getState();
  const baseFetch = initialState.fetchData as (silent?: boolean) => Promise<void>;
  let inFlight: Promise<void> | null = null;
  let lastCompletedAt = 0;

  const coalescedFetch = async (silent = false) => {
    if (inFlight) return inFlight;
    if (silent && Date.now() - lastCompletedAt < MIN_BACKGROUND_FETCH_GAP_MS) return;

    inFlight = (async () => {
      await baseFetch(silent);
      const next = store.getState();
      if (!next.error && Array.isArray(next.staff) && next.staff.length > 0) {
        lastCompletedAt = Date.now();
        saveSameDaySnapshot(next);
      }
    })();

    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  };

  // App.tsx and Dashboard.tsx both currently poll. Coalesce them into one network read window.
  store.setState({ fetchData: coalescedFetch });

  // Never render DEFAULT_STAFF_LIST or yesterday's persisted server state as if it were live.
  store.setState({
    staff: [],
    systemStatus: null,
    options: {},
    companyProfile: [],
    usersList: [],
    activityLogs: [],
    lastUpdatedStaff: null,
    lastUpdatedSystem: null,
    lastUpdatedCompany: null,
    lastUpdatedUsers: null,
    error: null,
  });

  await coalescedFetch(false);
  let current = store.getState();
  const hasFreshServerData = !current.error && Array.isArray(current.staff) && current.staff.length > 0;

  if (!hasFreshServerData) {
    const snapshot = readSameDaySnapshot();
    if (snapshot) {
      store.setState({
        staff: snapshot.staff || [],
        systemStatus: snapshot.systemStatus || null,
        options: snapshot.options || {},
        companyProfile: snapshot.companyProfile || [],
        activityLogs: snapshot.activityLogs || [],
        usersList: [],
        lastUpdatedStaff: snapshot.lastUpdatedStaff || null,
        lastUpdatedSystem: snapshot.lastUpdatedSystem || null,
        lastUpdatedCompany: snapshot.lastUpdatedCompany || null,
        lastUpdatedUsers: snapshot.lastUpdatedUsers || null,
      });
      console.warn('[Sync] GAS unavailable. Restored same-day offline snapshot only.');
    }
    return;
  }

  await reconcileDailyBoundary(store, baseFetch);
  current = store.getState();
  if (!current.error && Array.isArray(current.staff) && current.staff.length > 0) {
    saveSameDaySnapshot(current);
  }

  // Ensure the persisted Zustand payload remains preference/queue-only after rehydration and bootstrap writes.
  sanitizePersistedServerState();
};
