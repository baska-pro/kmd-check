import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';

export type Role = 'ADMIN' | 'USER';

export interface User {
  username: string;
  role: Role;
  password?: string;
  pin?: string;
}

export interface CompanyProfile {
  id: string;
  kategori: string;
  informasi: string;
  icon: string;
}

export interface Staff {
  nik: string;
  nama: string;
  jabatan: string;
  statusKerja: 'Di Kantor' | 'Di Lapangan' | 'Pulang';
  jamBerangkat: string;
  jamPulang: string;
  jumlahCenter: number;
  progressCenter: number;
  statusUpload: 'Belum upload' | 'Sebagian upload' | 'Sudah upload semua' | 'Tidak ada Center';
  keterangan?: string;
  senin?: number;
  selasa?: number;
  rabu?: number;
  kamis?: number;
  jumat?: number;
  tanggalUpdate?: string;
}

export interface SystemStatus {
  statusKantor: string;
  statusSistem: string;
  statusMSA: string;
  statusFSA: string;
  statusBalancing: string;
  statusManager?: string;
  statusAsistenManager?: string;
  pengumuman?: string;
  aliasMSA?: string;
  aliasFSA?: string;
  aliasManager?: string;
  aliasAsistenManager?: string;
  namaCabang?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramAutoDelete?: number;
  telegramProgressAutoDelete?: number;
  resetDefaultStatusKerja?: string;
  resetDefaultStatusUpload?: string;
  resetDefaultStatusKantor?: string;
  resetDefaultStatusSistem?: string;
  resetDefaultStatusMSA?: string;
  resetDefaultStatusFSA?: string;
  resetDefaultStatusBalancing?: string;
  resetDefaultStatusManager?: string;
  resetDefaultStatusAsistenManager?: string;
  companyVisi?: string;
  companyTahun?: string;
  companyRegulasi?: string;
  lastResetDate?: string;
  sembunyikanStatusKerja?: string;
  [key: string]: any;
}

export interface Options {
  [category: string]: string[];
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export const getWIBDayIndex = (d: Date = new Date()): number => {
  try {
    const day = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      weekday: 'short',
    }).format(d).toLowerCase();
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].findIndex((name) => day.startsWith(name));
  } catch {
    return new Date(d.getTime() + 7 * 3600 * 1000).getUTCDay();
  }
};

export const getWIBDateString = (d: Date = new Date()): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    const wib = new Date(d.getTime() + 7 * 3600 * 1000);
    return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}-${String(wib.getUTCDate()).padStart(2, '0')}`;
  }
};

export const normalizeNikForMatch = (value: any): string => String(value ?? '')
  .trim()
  .replace(/^'/, '')
  .replace(/\.0+$/, '')
  .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
  .trim()
  .toLowerCase();

export const parseNIKForSort = (nik: string) => {
  if (!nik) return 0;
  const parts = String(nik).split('/');
  if (parts.length === 2) {
    return 100000000000000 + ((parseInt(parts[1], 10) || 0) * 100000000) + (parseInt(parts[0], 10) || 0);
  }
  if (parts.length === 3) {
    let year = parseInt(parts[2], 10) || 0;
    if (year < 100) year += 2000;
    return 200000000000000 + (year * 100000000) + ((parseInt(parts[1], 10) || 0) * 1000000) + (parseInt(parts[0], 10) || 0);
  }
  return 0;
};

export function cleanEmojiString(value: any): string {
  let text = String(value ?? '').trim();
  if (!text) return '';
  const fixes: Array<[RegExp, string]> = [
    [/^(\?+|�+)?\s*Bekerja$/i, '💻 Bekerja'],
    [/^(\?+|�+)?\s*Shalat$/i, '🕌 Shalat'],
    [/^(\?+|�+)?\s*Makan$/i, '🍽️ Makan'],
    [/^(\?+|�+)?\s*Keluar\s*kantor$/i, '🚶 Keluar kantor'],
    [/^(\?+|�+)?\s*Diskusi$/i, '💬 Diskusi'],
    [/^(\?+|�+)?\s*Kumpul$/i, '👥 Kumpul'],
  ];
  for (const [pattern, replacement] of fixes) {
    if (pattern.test(text)) return replacement;
  }
  return text.replace(/^(\?+|�+)\s*/, '');
}

export function normalizeStaffItem(raw: any): Staff {
  const target = Math.max(0, Number(raw?.jumlahCenter ?? raw?.JumlahCenter ?? raw?.targetCenter ?? raw?.target ?? 0) || 0);
  const progress = Math.max(0, Number(raw?.progressCenter ?? raw?.ProgressCenter ?? raw?.progress ?? 0) || 0);
  let statusUpload: Staff['statusUpload'] = 'Belum upload';
  if (target === 0) statusUpload = 'Tidak ada Center';
  else if (progress >= target) statusUpload = 'Sudah upload semua';
  else if (progress > 0) statusUpload = 'Sebagian upload';

  const work = String(raw?.statusKerja ?? raw?.StatusKerja ?? 'Di Kantor').trim().toLowerCase();
  const statusKerja: Staff['statusKerja'] = work.includes('lapangan')
    ? 'Di Lapangan'
    : work.includes('pulang')
      ? 'Pulang'
      : 'Di Kantor';

  return {
    ...raw,
    nik: String(raw?.nik ?? raw?.NIK ?? '').trim(),
    nama: String(raw?.nama ?? raw?.Nama ?? '').trim(),
    jabatan: String(raw?.jabatan ?? raw?.Jabatan ?? 'FIELD OFFICER').trim(),
    statusKerja,
    jamBerangkat: String(raw?.jamBerangkat ?? raw?.JamBerangkat ?? '').trim(),
    jamPulang: String(raw?.jamPulang ?? raw?.JamPulang ?? '').trim(),
    jumlahCenter: target,
    progressCenter: progress,
    statusUpload,
    keterangan: String(raw?.keterangan ?? raw?.Keterangan ?? '').trim(),
    senin: Number(raw?.senin ?? raw?.Senin ?? 0) || 0,
    selasa: Number(raw?.selasa ?? raw?.Selasa ?? 0) || 0,
    rabu: Number(raw?.rabu ?? raw?.Rabu ?? 0) || 0,
    kamis: Number(raw?.kamis ?? raw?.Kamis ?? 0) || 0,
    jumat: Number(raw?.jumat ?? raw?.Jumat ?? 0) || 0,
    tanggalUpdate: String(raw?.tanggalUpdate ?? raw?.TanggalUpdate ?? '').trim(),
  };
}

export const normalizeStaffArray = (raw: any): Staff[] => (
  Array.isArray(raw) ? raw : raw ? [raw] : []
).map(normalizeStaffItem).filter((staff) => staff.nik || staff.nama);

export function isFieldOfficer(staff?: Staff | null): boolean {
  if (!staff) return false;
  const job = String(staff.jabatan || '').trim().toLowerCase();
  if (['manager', 'administrator', 'admin', 'mis support', 'finance system', 'branch'].some((item) => job.includes(item))) {
    return false;
  }
  return job.includes('field officer') || job.includes('staf lapang') || job === 'fo' || job.includes('officer');
}

export function normalizeLogItem(raw: any): ActivityLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const sourceTimestamp = raw.timestamp ?? raw.Timestamp ?? raw.Waktu ?? raw.Tanggal ?? '';
  let timestamp = String(sourceTimestamp || '');
  const parsed = new Date(sourceTimestamp);
  if (sourceTimestamp && !Number.isNaN(parsed.getTime())) timestamp = parsed.toISOString();
  const user = String(raw.user ?? raw.User ?? raw.Pengguna ?? 'System');
  const action = String(raw.action ?? raw.Action ?? raw.Aktivitas ?? '-');
  return {
    id: String(raw.id ?? raw.ID ?? `log-${timestamp}-${user}-${action}`),
    timestamp: timestamp || new Date().toISOString(),
    user,
    action,
    details: String(raw.details ?? raw.Details ?? raw.Keterangan ?? ''),
  };
}

export const normalizeLogsArray = (raw: any): ActivityLog[] => (
  Array.isArray(raw) ? raw : raw ? [raw] : []
).map(normalizeLogItem).filter((item): item is ActivityLog => item !== null);

export function findLogsInData(data: any): any[] {
  if (!data || typeof data !== 'object') return [];
  for (const [key, value] of Object.entries(data)) {
    const cleanKey = key.toLowerCase().replace(/[\s_-]+/g, '');
    if (['activitylog', 'activitylogs', 'log', 'logs'].includes(cleanKey) && Array.isArray(value)) return value;
  }
  return [];
}

export function normalizeSystemStatus(raw: any): SystemStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const system: SystemStatus = { ...raw };
  [
    'statusMSA', 'statusManager', 'statusAsistenManager', 'resetDefaultStatusMSA',
    'resetDefaultStatusManager', 'resetDefaultStatusAsistenManager', 'statusKantor',
    'statusSistem', 'statusFSA', 'statusBalancing',
  ].forEach((key) => {
    if (system[key]) system[key] = cleanEmojiString(system[key]);
  });
  return system;
}

export function normalizeOptions(raw: any): Options {
  if (!raw || typeof raw !== 'object') return {};
  const result: Options = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      result[key] = [...new Set(value.map(cleanEmojiString).filter(Boolean))];
    }
  });
  return result;
}

export function normalizeCompanyProfile(raw: any[]): CompanyProfile[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(Boolean).map((item: any) => ({
    ...item,
    id: String(item.id ?? item.ID ?? ''),
    kategori: String(item.kategori ?? item.Kategori ?? ''),
    informasi: String(item.informasi ?? item.Informasi ?? ''),
    icon: cleanEmojiString(item.icon ?? item.Icon ?? '') || '🏢',
  }));
}

interface AppState {
  user: User | null;
  staff: Staff[];
  systemStatus: SystemStatus | null;
  options: Options;
  companyProfile: CompanyProfile[];
  usersList: User[];
  activityLogs: ActivityLog[];
  offlineQueue: any[];
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;
  lastUpdatedStaff: Date | string | null;
  lastUpdatedSystem: Date | string | null;
  lastUpdatedCompany: Date | string | null;
  lastUpdatedUsers: Date | string | null;
  lastWriteTime: number;
  systemStatusWrites: Partial<SystemStatus>;
  systemStatusWriteTime: number;
  theme: 'light' | 'dark';
  voiceNotification: boolean;
  pushNotification: boolean;
  isKioskMode: boolean;
  setUser: (user: User | null) => void;
  fetchData: (silent?: boolean) => Promise<void>;
  updateStaff: (nik: string, updates: Partial<Staff>) => Promise<void>;
  updateMultipleStaff: (updates: { nik: string; updates: Partial<Staff> }[]) => Promise<void>;
  updateSystemStatus: (updates: Partial<SystemStatus>) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  resetProgress: (isAuto?: boolean, todayStr?: string) => Promise<void>;
  manageCompanyProfile: (payload: any) => Promise<void>;
  manageUser: (payload: any) => Promise<void>;
  manageStaff: (payload: any) => Promise<void>;
  toggleTheme: () => void;
  toggleVoiceNotification: () => void;
  togglePushNotification: () => void;
  toggleKioskMode: () => void;
  setKioskMode: (mode: boolean) => void;
  addLog: (action: string, details: string) => Promise<void>;
  sendTelegramNotification: (...args: any[]) => Promise<void>;
  sendTelegramProgressUpdate: (...args: any[]) => Promise<void>;
  sendWhatsAppNotification: (...args: any[]) => Promise<void>;
  sendWhatsAppProgressUpdate: (...args: any[]) => Promise<void>;
  syncOfflineQueue: () => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
  resetAppCache: () => Promise<void>;
}

const runtimePending = async (): Promise<void> => {
  throw new Error('Koneksi GAS belum siap. Muat ulang aplikasi.');
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: (() => {
        try { return JSON.parse(localStorage.getItem('user') || 'null'); }
        catch { return null; }
      })(),
      staff: [],
      systemStatus: null,
      options: {},
      companyProfile: [],
      usersList: [],
      activityLogs: [],
      offlineQueue: [],
      isLoading: false,
      isUpdating: false,
      error: null,
      lastUpdatedStaff: null,
      lastUpdatedSystem: null,
      lastUpdatedCompany: null,
      lastUpdatedUsers: null,
      lastWriteTime: 0,
      systemStatusWrites: {},
      systemStatusWriteTime: 0,
      theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
      voiceNotification: localStorage.getItem('voiceNotification') === 'true',
      pushNotification: localStorage.getItem('pushNotification') === 'true',
      isKioskMode: false,

      setUser: (user) => {
        if (user) localStorage.setItem('user', JSON.stringify(user));
        else localStorage.removeItem('user');
        set({ user });
      },

      logout: () => {
        localStorage.removeItem('user');
        set({
          user: null,
          staff: [],
          systemStatus: null,
          options: {},
          companyProfile: [],
          usersList: [],
          activityLogs: [],
          offlineQueue: [],
          error: null,
        });
      },

      toggleTheme: () => set((state) => {
        const theme = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
        return { theme };
      }),

      toggleVoiceNotification: () => set((state) => {
        const enabled = !state.voiceNotification;
        localStorage.setItem('voiceNotification', String(enabled));
        toast.success(enabled ? 'Notifikasi suara diaktifkan' : 'Notifikasi suara dinonaktifkan');
        return { voiceNotification: enabled };
      }),

      togglePushNotification: () => {
        const enabled = !get().pushNotification;
        if (enabled && 'Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then((permission) => {
            const granted = permission === 'granted';
            localStorage.setItem('pushNotification', String(granted));
            set({ pushNotification: granted });
            if (granted) toast.success('Push notification diaktifkan');
            else toast.error('Izin notifikasi tidak diberikan');
          });
          return;
        }
        localStorage.setItem('pushNotification', String(enabled));
        set({ pushNotification: enabled });
      },

      toggleKioskMode: () => {
        const enabled = !get().isKioskMode;
        if (enabled) document.documentElement.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        set({ isKioskMode: enabled });
      },

      setKioskMode: (mode) => set({ isKioskMode: mode }),

      resetAppCache: async () => {
        set({ isLoading: true });
        try {
          if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.map((name) => caches.delete(name)));
          }
          localStorage.removeItem('kmd-check-storage');
          sessionStorage.clear();
          set({
            staff: [],
            systemStatus: null,
            options: {},
            companyProfile: [],
            usersList: [],
            activityLogs: [],
            offlineQueue: [],
            error: null,
          });
          toast.success('Cache lokal dibersihkan. Memuat data Spreadsheet...');
          setTimeout(() => window.location.reload(), 250);
        } finally {
          set({ isLoading: false });
        }
      },

      fetchData: runtimePending,
      updateStaff: runtimePending,
      updateMultipleStaff: runtimePending,
      updateSystemStatus: runtimePending,
      login: runtimePending,
      resetProgress: runtimePending,
      manageCompanyProfile: runtimePending,
      manageUser: runtimePending,
      manageStaff: runtimePending,
      addLog: runtimePending,
      deleteLog: runtimePending,
      syncOfflineQueue: async () => {},
      sendTelegramNotification: async () => {},
      sendTelegramProgressUpdate: async () => {},
      sendWhatsAppNotification: async () => {},
      sendWhatsAppProgressUpdate: async () => {},
    }),
    {
      name: 'kmd-check-storage',
      version: 3,
      partialize: (state) => ({
        user: state.user,
        theme: state.theme,
        voiceNotification: state.voiceNotification,
        pushNotification: state.pushNotification,
      }),
    },
  ),
);
