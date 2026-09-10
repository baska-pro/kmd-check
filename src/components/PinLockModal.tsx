import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, Unlock, Shield, LogOut, AlertCircle, Eye, EyeOff, Sparkles, Clock, AlertOctagon, ShieldCheck } from 'lucide-react';
import { useStore } from '../lib/store';
import { toast } from 'sonner';

interface PinLockOverlayProps {
  isLocked: boolean;
  onUnlock: () => void;
}

export function getStoredPin(username?: string, usersList?: any[]): string {
  if (username) {
    if (usersList && usersList.length > 0) {
      const match = usersList.find((u: any) => u.username?.toLowerCase() === username.toLowerCase());
      if (match && match.pin) return match.pin.toString().trim();
    }
    const userPin = localStorage.getItem(`kmd_pin_${username.toLowerCase()}`);
    if (userPin) return userPin.trim();
  }
  return (localStorage.getItem('kmd_custom_pin') || '1234').trim();
}

export function setStoredPin(pin: string, username?: string): void {
  const cleanPin = pin.trim();
  if (username) {
    localStorage.setItem(`kmd_pin_${username.toLowerCase()}`, cleanPin);
  }
  localStorage.setItem('kmd_custom_pin', cleanPin);
}

export function getAutoLockTimeout(): number {
  const val = localStorage.getItem('kmd_auto_lock_timeout');
  return val ? parseInt(val, 10) : 3; // Default 3 minutes
}

export function setAutoLockTimeout(minutes: number): void {
  localStorage.setItem('kmd_auto_lock_timeout', minutes.toString());
}

export function PinLockOverlay({ isLocked, onUnlock }: PinLockOverlayProps) {
  const { user, logout, usersList } = useStore();
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  
  // Use ref to keep latest state accessible to physical keyboard listener without delay
  const pinInputRef = useRef(pinInput);
  pinInputRef.current = pinInput;
  const lockoutSecondsRef = useRef(lockoutSeconds);
  lockoutSecondsRef.current = lockoutSeconds;
  const failedAttemptsRef = useRef(failedAttempts);
  failedAttemptsRef.current = failedAttempts;

  // Check persistent lockout on lock or user change
  useEffect(() => {
    if (isLocked && user) {
      setPinInput('');
      setErrorMsg('');

      const lockoutKey = `kmd_lockout_until_${user.username.toLowerCase()}`;
      const storedLockout = localStorage.getItem(lockoutKey);
      if (storedLockout) {
        const remainingMs = parseInt(storedLockout, 10) - Date.now();
        if (remainingMs > 0) {
          const secs = Math.ceil(remainingMs / 1000);
          setLockoutSeconds(secs);
          setFailedAttempts(3);
          setErrorMsg('Akses masih dikunci sementara! Silakan tunggu countdown berakhir.');
        } else {
          localStorage.removeItem(lockoutKey);
          setLockoutSeconds(0);
          setFailedAttempts(0);
        }
      }
    }
  }, [isLocked, user]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setFailedAttempts(0);
          setErrorMsg('');
          if (user) {
            localStorage.removeItem(`kmd_lockout_until_${user.username.toLowerCase()}`);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutSeconds, user]);

  const handleVerifyPin = useCallback((inputToTest?: string) => {
    if (lockoutSecondsRef.current > 0) {
      toast.error(`Akses dikunci sementara! Silakan tunggu ${lockoutSecondsRef.current} detik.`);
      return;
    }

    const code = (inputToTest !== undefined ? inputToTest : pinInputRef.current).trim();
    const storedPin = (user ? getStoredPin(user.username, usersList) : '1234').trim();
    const customPin = (localStorage.getItem('kmd_custom_pin') || '1234').trim();
    
    // Accept valid user PIN, stored PIN, custom PIN, or master backup '1234'
    const isCorrect = 
      code === storedPin || 
      code === customPin || 
      code === '1234' || 
      (user?.password && code === user.password.trim());

    if (isCorrect) {
      // Immediate 0ms unlock response
      onUnlock();
      setPinInput('');
      setErrorMsg('');
      setFailedAttempts(0);
      setLockoutSeconds(0);
      if (user) {
        localStorage.removeItem(`kmd_lockout_until_${user.username.toLowerCase()}`);
      }
      toast.success(`Layar dibuka! Selamat datang kembali, ${user ? user.username.toUpperCase() : ''}`);
    } else {
      const nextFail = failedAttemptsRef.current + 1;
      setFailedAttempts(nextFail);
      setPinInput('');

      if (nextFail >= 3) {
        const lockoutUntil = Date.now() + 30000;
        if (user) {
          localStorage.setItem(`kmd_lockout_until_${user.username.toLowerCase()}`, lockoutUntil.toString());
        }
        setLockoutSeconds(30);
        setErrorMsg('Terlalu banyak percobaan salah! Akses dikunci selama 30 detik.');
        toast.error('Gagal 3x! Kunci keamanan diaktifkan selama 30 detik.');
      } else {
        const remaining = 3 - nextFail;
        setErrorMsg(`PIN salah! Kesempatan tersisa: ${remaining} kali.`);
      }
    }
  }, [user, usersList, onUnlock]);

  const handleKeyPress = useCallback((num: string) => {
    if (lockoutSecondsRef.current > 0) return;
    const current = pinInputRef.current;
    if (current.length < 4) {
      const next = current + num;
      setPinInput(next);
      setErrorMsg('');
      if (next.length === 4) {
        // Immediate verification without waiting for next render
        handleVerifyPin(next);
      }
    }
  }, [handleVerifyPin]);

  const handleDelete = useCallback(() => {
    if (lockoutSecondsRef.current > 0) return;
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMsg('');
  }, []);

  const handleClear = useCallback(() => {
    if (lockoutSecondsRef.current > 0) return;
    setPinInput('');
    setErrorMsg('');
  }, []);

  // Listen for physical keyboard events
  useEffect(() => {
    if (!isLocked || !user) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (lockoutSecondsRef.current > 0) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleVerifyPin();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLocked, user, handleKeyPress, handleDelete, handleClear, handleVerifyPin]);

  if (!isLocked || !user) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 backdrop-blur-2xl p-4 select-none touch-manipulation">
      {/* Background Soft Glow */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-violet-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl text-center space-y-4 relative overflow-hidden backdrop-blur-xl">
        
        {/* Minimalist Security Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[10px] font-extrabold uppercase tracking-widest">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Screen Lock Active</span>
        </div>

        {/* Minimalist Lock & Brand Header */}
        <div className="flex flex-col items-center">
          <div className="relative mb-2">
            <div className="w-14 h-14 bg-white rounded-2xl p-1 flex items-center justify-center shadow-lg shadow-indigo-900/30 border border-slate-700/80 overflow-hidden">
              <img
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT25l4XHSuvlhJIchUegRDneslG2PUL77cGiZvfElcYrk3tW1eF_0YVFQzD&s=10"
                alt="KMD Logo"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-indigo-600 border-2 border-slate-900 flex items-center justify-center text-white shadow-xs">
              <Lock className="w-3 h-3" />
            </div>
          </div>
          <h2 className="text-base font-extrabold text-white tracking-tight">
            Masukkan PIN Keamanan
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            Otentikasi untuk akun <span className="text-indigo-300 font-bold uppercase">{user.username}</span>
          </p>
        </div>

        {/* User Badge Info */}
        <div className="p-2 bg-slate-950/70 rounded-2xl border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5 pl-1">
            <div className="w-7 h-7 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300 font-black text-xs">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="text-left">
              <p className="text-xs font-black text-slate-200 uppercase leading-none">{user.username}</p>
              <p className="text-[9px] font-mono font-bold text-violet-400 uppercase mt-0.5">{user.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onUnlock();
              logout();
            }}
            className="px-2.5 py-1 text-[11px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl border border-rose-500/20 transition-colors flex items-center gap-1 cursor-pointer touch-manipulation"
          >
            <LogOut className="w-3 h-3" />
            <span>Keluar</span>
          </button>
        </div>

        {/* Lockout Countdown Alert */}
        {lockoutSeconds > 0 ? (
          <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 space-y-1.5 animate-pulse">
            <div className="flex items-center justify-center gap-1.5 font-black text-xs uppercase tracking-wider">
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              <span>Terkunci Sementara</span>
            </div>
            <p className="text-[11px] font-medium text-rose-300/80">
              Terlalu banyak percobaan. Coba lagi dalam:
            </p>
            <div className="text-xl font-mono font-black text-white flex items-center justify-center gap-1">
              <Clock className="w-4 h-4 text-rose-400 animate-spin" />
              <span>{lockoutSeconds}s</span>
            </div>
          </div>
        ) : (
          /* Modern Minimalist PIN Cells */
          <div className="space-y-2 py-0.5">
            <div className="flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((index) => {
                const hasDigit = pinInput.length > index;
                return (
                  <div
                    key={index}
                    className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center text-lg font-mono font-bold select-none transition-all duration-75 ${
                      hasDigit
                        ? 'border-violet-500 bg-violet-500/20 text-violet-300 shadow-sm shadow-violet-500/20'
                        : 'border-slate-800 bg-slate-950/80 text-slate-600'
                    }`}
                  >
                    {hasDigit ? (showPassword ? pinInput[index] : '•') : ''}
                  </div>
                );
              })}
            </div>

            {errorMsg && (
              <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-bold text-rose-400 flex items-center justify-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* Minimalist Instant Touch Keypad */}
        <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto touch-manipulation">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              disabled={lockoutSeconds > 0}
              onPointerDown={(e) => {
                e.preventDefault();
                handleKeyPress(num);
              }}
              className="py-2.5 bg-slate-800/80 active:bg-violet-600 hover:bg-slate-700 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-white font-black text-lg rounded-xl border border-slate-700/50 shadow-xs cursor-pointer select-none touch-manipulation transition-all"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            disabled={lockoutSeconds > 0}
            onPointerDown={(e) => {
              e.preventDefault();
              handleClear();
            }}
            className="py-2.5 bg-slate-950/80 active:bg-slate-800 hover:bg-slate-800 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-slate-400 font-bold text-xs rounded-xl border border-slate-800 cursor-pointer select-none touch-manipulation transition-all"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={lockoutSeconds > 0}
            onPointerDown={(e) => {
              e.preventDefault();
              handleKeyPress('0');
            }}
            className="py-2.5 bg-slate-800/80 active:bg-violet-600 hover:bg-slate-700 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-white font-black text-lg rounded-xl border border-slate-700/50 shadow-xs cursor-pointer select-none touch-manipulation transition-all"
          >
            0
          </button>
          <button
            type="button"
            disabled={lockoutSeconds > 0}
            onPointerDown={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            className="py-2.5 bg-slate-950/80 active:bg-slate-800 hover:bg-slate-800 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-amber-400 font-bold text-sm rounded-xl border border-slate-800 cursor-pointer select-none touch-manipulation transition-all"
          >
            ⌫
          </button>
        </div>

        {/* Toggle Show/Hide PIN & Unlock Button */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-semibold cursor-pointer select-none touch-manipulation"
          >
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showPassword ? 'Sembunyikan' : 'Lihat PIN'}</span>
          </button>

          <button
            type="button"
            disabled={lockoutSeconds > 0}
            onClick={() => handleVerifyPin()}
            className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-white font-bold text-xs rounded-xl shadow-md shadow-violet-950/40 transition-all flex items-center gap-1.5 cursor-pointer touch-manipulation select-none"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>Buka Layar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
