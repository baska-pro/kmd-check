/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  BellOff,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  Menu,
  Moon,
  MonitorPlay,
  RefreshCw,
  Sun,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useStore } from './lib/store';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { SubUrlDirectoryModal } from './components/SubUrlDirectoryModal';
import { PinLockOverlay, getAutoLockTimeout } from './components/PinLockModal';
import { parsePinToken } from './lib/pinToken';

const NAV_ITEMS = [
  { path: '/summary', label: 'Ringkasan', icon: LayoutDashboard },
  { path: '/staf', label: 'Staf', icon: Users },
  { path: '/sistem', label: 'Sistem', icon: MonitorPlay },
] as const;

export default function App() {
  const {
    user,
    theme,
    toggleTheme,
    voiceNotification,
    toggleVoiceNotification,
    pushNotification,
    togglePushNotification,
    isKioskMode,
    toggleKioskMode,
    fetchData,
    syncOfflineQueue,
    login,
    logout,
    resetAppCache,
    systemStatus,
  } = useStore();

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSubUrlModal, setShowSubUrlModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname || '/summary');
  const [isScreenLocked, setIsScreenLocked] = useState(() => localStorage.getItem('kmd_screen_locked') === 'true');
  const menuRef = useRef<HTMLDivElement>(null);

  const branchLabel = useMemo(() => systemStatus?.namaCabang || 'Cibeunying', [systemStatus?.namaCabang]);

  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    setCurrentPath(path);
    setShowMenu(false);
  };

  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchData(false);
      toast.success('Data terbaru sudah dimuat.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    document.title = 'KMD Check';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname || '/summary');
    const onOpenSubUrl = () => setShowSubUrlModal(true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('open-suburl-modal', onOpenSubUrl);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('open-suburl-modal', onOpenSubUrl);
    };
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      syncOfflineQueue().catch(console.error);
      fetchData(true).catch(console.error);
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [fetchData, syncOfflineQueue]);

  // Dashboard owns interval polling. App only refreshes when the tab becomes active.
  useEffect(() => {
    if (!user) return;
    const onFocus = () => fetchData(true).catch(console.error);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, fetchData]);

  // Direct PIN-token access remains supported without a global blocking overlay.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('pin');
    if (!token) return;
    const creds = parsePinToken(token);
    if (!creds) return;
    window.history.replaceState({}, '', window.location.pathname || '/summary');
    login(creds.username, creds.pass).catch((error) => {
      toast.error(error?.message || 'Akses PIN gagal.');
    });
  }, [login]);

  useEffect(() => {
    if (!user) {
      setIsScreenLocked(false);
      localStorage.removeItem('kmd_screen_locked');
      return;
    }
    if (isScreenLocked) localStorage.setItem('kmd_screen_locked', 'true');
    else localStorage.removeItem('kmd_screen_locked');
  }, [user, isScreenLocked]);

  // Lightweight inactivity lock; avoids a per-second countdown render loop.
  useEffect(() => {
    if (!user || isScreenLocked) return;
    const minutes = getAutoLockTimeout();
    if (!minutes || minutes <= 0) return;
    let timer = window.setTimeout(() => setIsScreenLocked(true), minutes * 60 * 1000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIsScreenLocked(true), minutes * 60 * 1000);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [user, isScreenLocked]);

  useEffect(() => {
    if (!showMenu) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMenu]);

  if (!user) {
    return (
      <>
        <Toaster position="top-center" richColors closeButton theme={theme} />
        <Login />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Toaster position="top-center" richColors closeButton theme={theme} />

      <div className={isScreenLocked ? 'pointer-events-none select-none blur-lg opacity-30' : ''}>
        <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/88">
          <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:px-6">
            <button onClick={() => navigateTo('/summary')} className="flex min-w-0 items-center gap-3 text-left">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 font-black text-white shadow-sm">K</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-black tracking-tight sm:text-base">KMD Check</div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className="truncate">{branchLabel}</span>
                </div>
              </div>
            </button>

            <nav className="hidden items-center gap-1 rounded-2xl border border-slate-200 bg-slate-100/70 p-1 md:flex dark:border-slate-800 dark:bg-slate-900/70">
              {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
                <button
                  key={path}
                  onClick={() => navigateTo(path)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${currentPath === path ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-1.5">
              <button onClick={refreshNow} disabled={refreshing} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900" title="Refresh">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setIsScreenLocked(true)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900" title="Kunci layar">
                <Lock className="h-4 w-4" />
              </button>

              <div ref={menuRef} className="relative">
                <button onClick={() => setShowMenu((value) => !value)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900" title="Menu">
                  {showMenu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950">
                      <div className="text-xs font-black">{user.username}</div>
                      <div className="text-[10px] font-bold text-slate-500">{user.role} · {isOnline ? 'Online' : 'Offline'}</div>
                    </div>
                    <MenuButton label="Sub-URL & Direct Link" icon={<Link2 className="h-4 w-4" />} onClick={() => { setShowSubUrlModal(true); setShowMenu(false); }} />
                    <MenuButton label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'} icon={theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} onClick={toggleTheme} />
                    <MenuButton label={voiceNotification ? 'Matikan suara' : 'Aktifkan suara'} icon={voiceNotification ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} onClick={toggleVoiceNotification} />
                    <MenuButton label={pushNotification ? 'Matikan push' : 'Aktifkan push'} icon={pushNotification ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />} onClick={togglePushNotification} />
                    <MenuButton label={isKioskMode ? 'Keluar kiosk' : 'Kiosk mode'} icon={<MonitorPlay className="h-4 w-4" />} onClick={toggleKioskMode} />
                    <MenuButton label="Bersihkan cache aplikasi" icon={<RefreshCw className="h-4 w-4" />} onClick={() => resetAppCache().catch(console.error)} />
                    <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
                    <MenuButton label="Keluar" icon={<LogOut className="h-4 w-4" />} onClick={() => { setShowLogoutModal(true); setShowMenu(false); }} danger />
                  </div>
                )}
              </div>
            </div>
          </div>

          {!isOnline && (
            <div className="flex items-center justify-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              <WifiOff className="h-3.5 w-3.5" /> Mode offline · perubahan akan masuk antrean sinkronisasi
            </div>
          )}
        </header>

        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <Dashboard />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-xl md:hidden dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <button key={path} onClick={() => navigateTo(path)} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold ${currentPath === path ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <PinLockOverlay isLocked={isScreenLocked} onUnlock={() => setIsScreenLocked(false)} />
      <SubUrlDirectoryModal isOpen={showSubUrlModal} onClose={() => setShowSubUrlModal(false)} />

      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-black">Keluar dari KMD Check?</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sesi lokal akan diakhiri. Data Spreadsheet tidak dihapus.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowLogoutModal(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button>
              <button onClick={() => { setShowLogoutModal(false); logout(); }} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">Keluar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({ label, icon, onClick, danger = false }: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${danger ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
