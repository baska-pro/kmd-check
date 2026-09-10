import { installRuntimeHardening, fetchServerDataOnce } from './runtimeHardening';

const PERSIST_KEY = 'kmd-check-storage';
const LEGACY_API_CACHE = 'gas-api-cache';

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
  pushNotification: !!state?.pushNotification,
});

export const sanitizePersistedServerState = () => {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const envelope = JSON.parse(raw);
    localStorage.setItem(PERSIST_KEY, JSON.stringify({
      ...envelope,
      state: safePersistedSlice(envelope?.state || {}),
    }));
  } catch (error) {
    console.warn('[KMD] Persisted state rusak, dibersihkan.', error);
    try { localStorage.removeItem(PERSIST_KEY); } catch {}
  }
};

const clearLegacyCaches = async () => {
  if (!('caches' in window)) return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name === LEGACY_API_CACHE || /gas[-_]?api/i.test(name))
        .map((name) => caches.delete(name)),
    );
  } catch (error) {
    console.warn('[KMD] Gagal membersihkan cache lama.', error);
  }
};

export const bootstrapDataSynchronization = async (store: any) => {
  // Install the safe runtime functions first. Never clear visible dashboard data here.
  installRuntimeHardening(store);

  try {
    store.persist?.setOptions?.({ partialize: safePersistedSlice });
  } catch {}

  sanitizePersistedServerState();
  await clearLegacyCaches();

  // Initial sync is silent and has a hard timeout in runtimeHardening.
  // It can fail without blocking the app or leaving a global loading overlay behind.
  await fetchServerDataOnce(store);

  // Defensive cleanup for stale legacy loading flags.
  const state = store.getState();
  if (!state.isUpdating && state.isLoading) {
    store.setState({ isLoading: false });
  }

  sanitizePersistedServerState();
};
