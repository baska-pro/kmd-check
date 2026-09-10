/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { useStore, getWIBDayIndex, getWIBDateString } from './lib/store';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { LogOut, Activity, Moon, Sun, AlertTriangle, Volume2, VolumeX, Bell, BellOff, MonitorPlay, Menu, X, WifiOff, Link2, KeyRound, Lock, Clock, Shield, RefreshCw } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { differenceInSeconds, differenceInMinutes, format } from 'date-fns';
import { parsePinToken } from './lib/pinToken';
import { SubUrlDirectoryModal } from './components/SubUrlDirectoryModal';
import { PinLockOverlay, getAutoLockTimeout } from './components/PinLockModal';

const getWIBDateStr = (dateOrStr: Date | string = new Date()) => {
  const d = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
  if (isNaN(d.getTime())) return '';
  const utc = d.getTime();
  // WIB is UTC+7
  const wib = new Date(utc + 7 * 3600 * 1000);
  const year = wib.getUTCFullYear();
  const month = (wib.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = wib.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function App() {
  const { user, systemStatus, logout, fetchData, theme, toggleTheme, voiceNotification, toggleVoiceNotification, pushNotification, togglePushNotification, isKioskMode, toggleKioskMode, isLoading, syncOfflineQueue, login, resetAppCache } = useStore();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSubUrlModal, setShowSubUrlModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isScreenLocked, setIsScreenLocked] = useState(() => {
    return localStorage.getItem('kmd_screen_locked') === 'true';
  });
  const [showAutoLockWarning, setShowAutoLockWarning] = useState(false);
  const [autoLockCountdown, setAutoLockCountdown] = useState(15);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname || '/summary');

  // Click outside listener to dismiss hamburger menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showMenu]);

  // Sync screen lock state to localStorage
  useEffect(() => {
    if (!user) {
      setIsScreenLocked(false);
      localStorage.removeItem('kmd_screen_locked');
    } else if (isScreenLocked) {
      localStorage.setItem('kmd_screen_locked', 'true');
    } else {
      localStorage.removeItem('kmd_screen_locked');
    }
  }, [isScreenLocked, user]);

  // Inactivity auto lock effect with early warning countdown
  useEffect(() => {
    if (!user) {
      setIsScreenLocked(false);
      setShowAutoLockWarning(false);
      return;
    }

    let warningTimer: any;
    let lockTimer: any;
    let intervalId: any;

    const resetInactivityTimer = () => {
      clearTimeout(warningTimer);
      clearTimeout(lockTimer);
      clearInterval(intervalId);
      setShowAutoLockWarning(false);

      const timeoutMins = getAutoLockTimeout();
      if (timeoutMins > 0 && !isScreenLocked) {
        const totalMs = timeoutMins * 60 * 1000;
        const warningLeadMs = Math.min(15000, totalMs - 5000); // 15s warning lead

        if (warningLeadMs > 0) {
          const warningStartMs = totalMs - warningLeadMs;
          const leadSeconds = Math.round(warningLeadMs / 1000);

          warningTimer = setTimeout(() => {
            setShowAutoLockWarning(true);
            setAutoLockCountdown(leadSeconds);

            let currentSec = leadSeconds;
            intervalId = setInterval(() => {
              currentSec -= 1;
              setAutoLockCountdown(currentSec);
              if (currentSec <= 0) {
                clearInterval(intervalId);
              }
            }, 1000);
          }, warningStartMs);
        }

        lockTimer = setTimeout(() => {
          setShowAutoLockWarning(false);
          setIsScreenLocked(true);
          toast.info('Layar terkunci otomatis karena tidak ada aktivitas.');
        }, totalMs);
      }
    };

    const handleManualLock = () => {
      clearTimeout(warningTimer);
      clearTimeout(lockTimer);
      clearInterval(intervalId);
      setShowAutoLockWarning(false);
      setIsScreenLocked(true);
      toast.info('Layar berhasil dikunci.');
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetInactivityTimer));
    window.addEventListener('trigger-lock-screen', handleManualLock);

    resetInactivityTimer();

    return () => {
      clearTimeout(warningTimer);
      clearTimeout(lockTimer);
      clearInterval(intervalId);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetInactivityTimer));
      window.removeEventListener('trigger-lock-screen', handleManualLock);
    };
  }, [user, isScreenLocked]);

  // Auto login via PIN Token parameter ?pin=... in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pinToken = urlParams.get('pin');
    if (pinToken) {
      const creds = parsePinToken(pinToken);
      if (creds) {
        // Clean query parameter from URL address bar
        const cleanPath = window.location.pathname || '/summary';
        window.history.replaceState({}, '', cleanPath);

        login(creds.username, creds.pass)
          .then(() => {
            setIsScreenLocked(false);
            localStorage.removeItem('kmd_screen_locked');
            toast.success(`Akses Otomatis PIN Sukses! Masuk sebagai ${creds.username.toUpperCase()}`);
          })
          .catch((err) => {
            toast.error(`Gagal otentikasi PIN: ${err.message || 'Token tidak valid'}`);
          });
      }
    }
  }, []);

  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    setCurrentPath(path);
    setShowMenu(false);
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/summary');
    };
    const handleOpenModal = () => setShowSubUrlModal(true);

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('open-suburl-modal', handleOpenModal);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('open-suburl-modal', handleOpenModal);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineQueue]);

  useEffect(() => {
    document.title = "KMD Check";
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    // Always fetch latest spreadsheet data on app load
    fetchData(true).catch(console.error);

    if (user) {
      // Real-time polling every 5 seconds for high responsiveness
      const interval = setInterval(() => {
        fetchData(true);
      }, 5000);
      
      // Instantly fetch fresh data from Google Sheets when the tab is focused or returns from background
      const handleFocusRefresh = () => {
        console.log('[Real-Time] App focused/visible. Fetching latest data from Google Sheets...');
        fetchData(true).catch(console.error);
      };

      window.addEventListener('focus', handleFocusRefresh);
      
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          handleFocusRefresh();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        clearInterval(interval);
        window.removeEventListener('focus', handleFocusRefresh);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [user, fetchData]);

  // Automatic Holiday Check
  useEffect(() => {
    const checkDailyTasks = async () => {
      const { systemStatus, updateSystemStatus } = useStore.getState();
      
      if (user?.role === 'ADMIN') {
        const today = new Date();
        
        // Holiday Check (WIB Timezone)
        if (systemStatus) {
          const day = getWIBDayIndex(today);
          // 0 is Sunday, 6 is Saturday
          if ((day === 0 || day === 6) && systemStatus.statusKantor !== 'Libur') {
            try {
              await updateSystemStatus({ statusKantor: 'Libur' });
            } catch (error) {
              console.error("Failed to update holiday status:", error);
            }
          }
        }
      }
    };
    
    if (user) {
      checkDailyTasks();
    }
  }, [user]);

  // Automatic Day Change & Midnight Reset Check
  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;

    const checkAndTriggerReset = async () => {
      const todayStr = getWIBDateString(new Date());
      const lastReset = localStorage.getItem('kmd_last_reset_date');
      const { systemStatus, resetProgress } = useStore.getState();
      
      // If the server itself tells us that today has already been reset,
      // update our localStorage immediately to match, and don't trigger anything!
      if (systemStatus?.lastResetDate === todayStr) {
        if (lastReset !== todayStr) {
          console.log(`[Auto-Reset] Server already reset today (${todayStr}). Syncing local storage.`);
          localStorage.setItem('kmd_last_reset_date', todayStr);
        }
        return;
      }
      
      // Initialize if not set
      if (!lastReset) {
        localStorage.setItem('kmd_last_reset_date', todayStr);
        return;
      }
      
      // If the day changed, trigger auto-reset on the server
      if (lastReset !== todayStr) {
        console.log(`[Auto-Reset] Day changed locally from ${lastReset} to ${todayStr}. Triggering server-side checked reset.`);
        try {
          // Trigger the server-side auto reset which is 100% thread-safe and prevents duplicate runs
          await resetProgress(true, todayStr);
          localStorage.setItem('kmd_last_reset_date', todayStr);
        } catch (err) {
          console.error('[Auto-Reset] Failed to perform automatic daily reset:', err);
        }
      }
    };

    // Run the check on initial mount
    checkAndTriggerReset();

    // Schedule check for local 00:00 midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Next 00:00 local time
    const msToMidnight = midnight.getTime() - now.getTime();

    const timeoutId = setTimeout(() => {
      checkAndTriggerReset();
    }, msToMidnight);

    // Keep backup check every 30 seconds (resilient to CPU/tab sleeping)
    const intervalId = setInterval(() => {
      checkAndTriggerReset();
    }, 30000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [user]);

  // Unlock audio and speech synthesis on first interaction
  useEffect(() => {
    const unlockAudio = () => {
      // Unlock Web Audio API
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(0);
        osc.stop(0.01);
      }
      
      // Unlock Speech Synthesis
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance('');
        utterance.volume = 0;
        window.speechSynthesis.speak(utterance);
      }

      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };

    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  if (!user) {
    return (
      <>
        <Toaster position="top-center" richColors closeButton theme={theme} />
        <Login />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans selection:bg-indigo-100 selection:text-indigo-900 dark:selection:bg-indigo-950 dark:selection:text-indigo-200 transition-colors duration-200">
      <Toaster position="top-center" richColors closeButton theme={theme} />
      
      {/* Background Dashboard Content (Blurred when screen is locked) */}
      <div className={`transition-all duration-300 ${isScreenLocked ? 'filter blur-xl grayscale opacity-25 pointer-events-none select-none' : ''}`}>
        <header className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 sticky top-0 z-50 transition-colors duration-200 pt-safe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[4rem] py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Elegant official brand logo */}
            <div className="relative group cursor-pointer shrink-0">
              <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl p-0.5 flex items-center justify-center shadow-md shadow-indigo-600/10 border border-slate-200/80 dark:border-slate-700/80 transition-transform group-hover:scale-105 overflow-hidden">
                <img 
                  src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT25l4XHSuvlhJIchUegRDneslG2PUL77cGiZvfElcYrk3tW1eF_0YVFQzD&s=10" 
                  alt="KMD Logo" 
                  className="w-full h-full object-contain rounded-lg"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span className="text-indigo-600 dark:text-indigo-400">KMD</span>
                  <span>Check</span>
                </h1>
                {systemStatus?.namaCabang && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 tracking-wider font-mono">
                    {systemStatus.namaCabang.match(/\d+/)?.[0] || 'CABANG'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold tracking-wide truncate max-w-[200px] sm:max-w-none">
                Cibeunying, Kota Bandung
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={() => setIsScreenLocked(true)}
              className="px-2 sm:px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50/80 hover:bg-amber-100/90 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-200/80 dark:border-amber-800/60 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0"
              title="Kunci Layar dengan PIN"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Kunci PIN</span>
            </button>

            <button
              onClick={() => setShowSubUrlModal(true)}
              className="px-2 sm:px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 hover:bg-indigo-100/90 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0"
              title="Lihat Daftar Sub-URL & Link PIN"
            >
              <Link2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="hidden sm:inline">Sub-URL</span>
            </button>

            <div className="text-right hidden sm:block pl-1.5 border-l border-slate-200 dark:border-slate-800">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 capitalize">{user.username}</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.25 text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40 rounded-full border border-emerald-200/60 dark:border-emerald-800/50 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {user.role}
              </span>
            </div>
            
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Menu Pengaturan"
              >
                {showMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {showMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 sm:hidden mb-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{user.username}</p>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40 rounded-full border border-emerald-200/60 dark:border-emerald-800/50 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {user.role}
                      </span>
                    </div>

                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Navigasi Langsung</p>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          onClick={() => navigateTo('/summary')}
                          className="px-2.5 py-1.5 text-left text-xs font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-between transition-colors"
                        >
                          <span>Ringkasan</span>
                          <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">/summary</span>
                        </button>
                        <button
                          onClick={() => navigateTo('/staf')}
                          className="px-2.5 py-1.5 text-left text-xs font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-between transition-colors"
                        >
                          <span>Staf FO</span>
                          <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">/staf</span>
                        </button>
                        <button
                          onClick={() => navigateTo('/sistem')}
                          className="px-2.5 py-1.5 text-left text-xs font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-between transition-colors"
                        >
                          <span>Sistem</span>
                          <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">/sistem</span>
                        </button>
                        <button
                          onClick={() => navigateTo('/perusahaan')}
                          className="px-2.5 py-1.5 text-left text-xs font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-between transition-colors"
                        >
                          <span>Profil</span>
                          <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">/perusahaan</span>
                        </button>
                        {user.role === 'ADMIN' && (
                          <>
                            <button
                              onClick={() => navigateTo('/pengguna')}
                              className="px-2.5 py-1.5 text-left text-xs font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-between transition-colors"
                            >
                              <span>Pengguna</span>
                              <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">/pengguna</span>
                            </button>
                            <button
                              onClick={() => navigateTo('/logs')}
                              className="px-2.5 py-1.5 text-left text-xs font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-between transition-colors"
                            >
                              <span>Logs</span>
                              <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">/logs</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => { setIsScreenLocked(true); setShowMenu(false); }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center gap-3 hover:bg-amber-50/80 dark:hover:bg-amber-950/30 text-amber-800 dark:text-amber-300 transition-colors"
                    >
                      <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Kunci Layar (PIN)</span>
                    </button>

                    <button
                      onClick={() => { setShowSubUrlModal(true); setShowMenu(false); }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center gap-3 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 transition-colors"
                    >
                      <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Daftar Sub-URL & Direct PIN</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowMenu(false);
                        resetAppCache();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center gap-3 hover:bg-emerald-50/80 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Update & Reset Cache Staf</span>
                    </button>

                    <button
                      onClick={() => { toggleKioskMode(); setShowMenu(false); }}
                      className="w-full px-4 py-2 text-left text-xs font-medium flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      <MonitorPlay className={`w-4 h-4 ${isKioskMode ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                      <span>{isKioskMode ? 'Matikan Full Screen' : 'Full Screen Aktif'}</span>
                    </button>

                    <button
                      onClick={() => { togglePushNotification(); setShowMenu(false); }}
                      className="w-full px-4 py-2 text-left text-xs font-medium flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      {pushNotification ? <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <BellOff className="w-4 h-4 text-slate-400 dark:text-slate-500" />}
                      <span>{pushNotification ? 'Matikan Push Notif' : 'Nyalakan Push Notif'}</span>
                    </button>

                    <button
                      onClick={() => { toggleVoiceNotification(); setShowMenu(false); }}
                      className="w-full px-4 py-2 text-left text-xs font-medium flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      {voiceNotification ? <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <VolumeX className="w-4 h-4 text-slate-400 dark:text-slate-500" />}
                      <span>{voiceNotification ? 'Matikan Suara' : 'Nyalakan Suara'}</span>
                    </button>

                    <button
                      onClick={() => { toggleTheme(); setShowMenu(false); }}
                      className="w-full px-4 py-2 text-left text-xs font-medium flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
                      <span>{theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}</span>
                    </button>

                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-1.5"></div>

                    <button
                      onClick={() => { setShowLogoutModal(true); setShowMenu(false); }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold flex items-center gap-3 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-yellow-500 text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-sm">
          <WifiOff className="w-4 h-4" />
          Anda sedang offline. Perubahan akan disimpan dan dikirim saat koneksi kembali.
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <Dashboard />
      </main>
      </div>

      {/* Global Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/20 dark:bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-gray-100 dark:border-gray-700">
            <div className="w-6 h-6 border-4 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="font-medium text-gray-900 dark:text-white">Memproses data...</span>
          </div>
        </div>
      )}

      {/* Auto-Lock Early Warning Banner */}
      {showAutoLockWarning && !isScreenLocked && (
        <div className="fixed bottom-6 right-6 z-50 bg-amber-500 text-slate-950 px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-amber-300 flex items-center gap-4 animate-bounce">
          <div className="p-2 bg-slate-950 text-amber-400 rounded-xl shrink-0">
            <Clock className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-950 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Peringatan Auto-Lock
            </p>
            <p className="text-xs font-bold text-slate-950">
              Layar akan terkunci dalam <span className="font-mono font-black text-sm underline">{autoLockCountdown} detik</span>
            </p>
          </div>
          <button
            onClick={() => {
              setShowAutoLockWarning(false);
              window.dispatchEvent(new Event('mousemove'));
            }}
            className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-amber-300 rounded-xl font-black text-xs shadow-md transition-all cursor-pointer shrink-0"
          >
            Tetap Aktif
          </button>
        </div>
      )}

      {/* Pin Lock Screen Overlay */}
      <PinLockOverlay
        isLocked={isScreenLocked}
        onUnlock={() => setIsScreenLocked(false)}
      />

      {/* Sub-URL & Direct PIN Access Modal */}
      <SubUrlDirectoryModal
        isOpen={showSubUrlModal}
        onClose={() => setShowSubUrlModal(false)}
      />

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full overflow-hidden border border-gray-100 dark:border-gray-700 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Konfirmasi Logout</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Apakah Anda yakin ingin keluar dari aplikasi?
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setShowLogoutModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Batal</button>
              <button onClick={() => { setShowLogoutModal(false); logout(); }} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm">Ya, Keluar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
