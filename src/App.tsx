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
  Database,
  ShieldCheck,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useStore } from './lib/store';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { SubUrlDirectoryModal } from './components/SubUrlDirectoryModal';
import { PinLockOverlay, getAutoLockTimeout } from './components/PinLockModal';
import { parsePinToken } from './lib/pinToken';

const LOGO_URL = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT25l4XHSuvlhJIchUegRDneslG2PUL77cGiZvfElcYrk3tW1eF_0YVFQzD&s=10';

const NAV_ITEMS = [
  { path: '/summary', label: 'Ringkasan', icon: LayoutDashboard },
  { path: '/staf', label: 'Staf', icon: Users },
  { path: '/sistem', label: 'Sistem', icon: MonitorPlay },
] as const;

function BrandLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <div className={`${dimensions} shrink-0 overflow-hidden rounded-2xl border border-white/80 bg-white p-1 shadow-lg shadow-indigo-500/15 ring-1 ring-slate-200/70 dark:ring-slate-700/70`}>
      {!failed ? (
        <img src={LOGO_URL} alt="Koperasi Mitra Dhuafa" className="h-full w-full object-contain" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-sm font-black text-white">KMD</div>
      )}
    </div>
  );
}

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
    error,
  } = useStore();

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSubUrlModal, setShowSubUrlModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname || '/summary');
  const [isScreenLocked, setIsScreenLocked] = useState(() => localStorage.getItem('kmd_screen_locked') === 'true');
  const menuRef = useRef<HTMLDivElement>(null);

  const branchLabel = useMemo(() => systemStatus?.namaCabang || 'Cibeunying, Kota Bandung', [systemStatus?.namaCabang]);

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
      if (!useStore.getState().error) toast.success('Data Spreadsheet terbaru dimuat.');
    } catch (e: any) {
      toast.error(e?.message || 'Refresh gagal.');
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('pin');
    if (!token) return;
    const creds = parsePinToken(token);
    if (!creds) return;
    window.history.replaceState({}, '', window.location.pathname || '/summary');
    login(creds.username, creds.pass).catch((e) => toast.error(e?.message || 'Akses PIN gagal.'));
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.08),transparent_34%),linear-gradient(to_bottom,#f8fafc,#eef2ff_45%,#f8fafc)] text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.14),transparent_32%),linear-gradient(to_bottom,#020617,#0f172a)] dark:text-slate-100">
      <Toaster position="top-center" richColors closeButton theme={theme} />

      <div className={isScreenLocked ? 'pointer-events-none select-none blur-lg opacity-30' : ''}>
        <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 shadow-[0_8px_30px_rgba(15,23,42,0.04)] backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-950/85">
          <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-3 px-3 sm:px-6">
            <button onClick={() => navigateTo('/summary')} className="group flex min-w-0 items-center gap-3 text-left">
              <BrandLogo />
              <div className="min-w-0">
                <div className="truncate bg-gradient-to-r from-violet-700 via-indigo-600 to-sky-600 bg-clip-text text-base font-black tracking-tight text-transparent sm:text-lg">KMD Check</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className="truncate">{branchLabel}</span>
                </div>
              </div>
            </button>

            <nav className="hidden items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/70 p-1.5 shadow-sm md:flex dark:border-slate-800 dark:bg-slate-900/70">
              {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
                <button key={path} onClick={() => navigateTo(path)} className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${currentPath === path ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-1.5">
              <div className="hidden items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-1.5 text-[10px] font-extrabold text-emerald-700 sm:flex dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                <Database className="h-3.5 w-3.5" /> LIVE SHEET
              </div>
              <button onClick={refreshNow} disabled={refreshing} className="rounded-xl border border-slate-200/80 bg-white p-2.5 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" title="Refresh dari Spreadsheet">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setIsScreenLocked(true)} className="rounded-xl border border-slate-200/80 bg-white p-2.5 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" title="Kunci layar"><Lock className="h-4 w-4" /></button>

              <div ref={menuRef} className="relative">
                <button onClick={() => setShowMenu((value) => !value)} className="rounded-xl border border-slate-200/80 bg-white p-2.5 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" title="Menu">
                  {showMenu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-2.5 shadow-2xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-900/95">
                    <div className="mb-2 rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 px-3.5 py-3 dark:from-violet-950/30 dark:to-indigo-950/20">
                      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-indigo-600" /><div className="text-xs font-black">{user.username}</div></div>
                      <div className="mt-1 text-[10px] font-bold text-slate-500">{user.role} · {isOnline ? 'Terhubung Spreadsheet' : 'Offline'}</div>
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

          {error && (
            <div className="border-t border-rose-200 bg-rose-50 px-3 py-2 text-center text-[11px] font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>
          )}
          {!isOnline && (
            <div className="flex items-center justify-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              <WifiOff className="h-3.5 w-3.5" /> Offline · data lokal tidak digunakan dan perubahan dinonaktifkan
            </div>
          )}
        </header>

        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6"><Dashboard /></main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-3 py-2 backdrop-blur-2xl md:hidden dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto grid max-w-md grid-cols-3 gap-1.5">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <button key={path} onClick={() => navigateTo(path)} className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-extrabold transition ${currentPath === path ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'text-slate-500 dark:text-slate-400'}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <PinLockOverlay isLocked={isScreenLocked} onUnlock={() => setIsScreenLocked(false)} />
      <SubUrlDirectoryModal isOpen={showSubUrlModal} onClose={() => setShowSubUrlModal(false)} />

      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-black">Keluar dari KMD Check?</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sesi aplikasi akan diakhiri. Data Spreadsheet tidak diubah.</p>
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
      {icon}<span>{label}</span>
    </button>
  );
}
