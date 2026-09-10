import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../lib/store';
import { Building2, Loader2, AlertCircle, KeyRound, User, ChevronRight, Eye, EyeOff, ShieldCheck, Sparkles, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { getStoredPin } from './PinLockModal';

export function Login() {
  const [authMode, setAuthMode] = useState<'password' | 'pin'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // PIN Mode state
  const [pinUsername, setPinUsername] = useState('');
  const [pinDigits, setPinDigits] = useState('');
  const [showPinDigits, setShowPinDigits] = useState(false);
  const [pinError, setPinError] = useState('');
  
  const { login, isLoading, error, systemStatus, usersList } = useStore();
  const hasGasUrl = !!import.meta.env.VITE_GAS_URL;

  const pinDigitsRef = useRef(pinDigits);
  pinDigitsRef.current = pinDigits;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    await login(username, password);
  };

  const handlePinAuth = useCallback(async (codeToTest?: string) => {
    const code = (codeToTest !== undefined ? codeToTest : pinDigitsRef.current).trim();
    if (code.length < 4) {
      setPinError('Masukkan 4 digit PIN lengkap');
      return;
    }

    const targetUser = pinUsername.trim() || 'admin';
    const storedPin = getStoredPin(targetUser, usersList);
    const customPin = (localStorage.getItem('kmd_custom_pin') || '1234').trim();

    // Check if code matches user PIN, custom master PIN, or fallback 1234
    const isPinMatch = code === storedPin || code === customPin || code === '1234';

    if (isPinMatch) {
      setPinError('');
      // Find matching user password from cached usersList or login with targetUser
      const userObj = usersList.find((u: any) => u.username?.toLowerCase() === targetUser.toLowerCase());
      const pass = userObj?.password || 'admin123';
      try {
        await login(targetUser, pass);
        toast.success(`Akses PIN Berhasil! Selamat datang, ${targetUser.toUpperCase()}`);
      } catch (err: any) {
        setPinError(err.message || 'Gagal login dengan PIN');
      }
    } else {
      setPinError('PIN salah! Coba periksa kembali PIN Anda.');
      setPinDigits('');
    }
  }, [pinUsername, usersList, login]);

  const handleKeypadPress = useCallback((num: string) => {
    if (pinDigitsRef.current.length < 4) {
      const next = pinDigitsRef.current + num;
      setPinDigits(next);
      setPinError('');
      if (next.length === 4) {
        handlePinAuth(next);
      }
    }
  }, [handlePinAuth]);

  const handleKeypadDelete = useCallback(() => {
    setPinDigits(prev => prev.slice(0, -1));
    setPinError('');
  }, []);

  const handleKeypadClear = useCallback(() => {
    setPinDigits('');
    setPinError('');
  }, []);

  // Keyboard shortcut support when PIN tab is active
  useEffect(() => {
    if (authMode !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'INPUT' && target.id === 'pin-username-input') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeypadDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleKeypadClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handlePinAuth();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authMode, handleKeypadPress, handleKeypadDelete, handleKeypadClear, handlePinAuth]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-950 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 select-none">
      {/* Dynamic Ambient Background Aura */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[35%] right-[5%] w-[35%] h-[35%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Cyber Subtle Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Minimalist Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-2.5 bg-slate-900 border border-slate-800/80 rounded-2xl shadow-xl shadow-black/30 mb-4 relative group">
            <div className="w-14 h-14 bg-white rounded-xl p-1 flex items-center justify-center shadow-md shadow-indigo-600/20 overflow-hidden">
              <img
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT25l4XHSuvlhJIchUegRDneslG2PUL77cGiZvfElcYrk3tW1eF_0YVFQzD&s=10"
                alt="Koperasi Mitra Dhuafa Logo"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Koperasi Mitra Dhuafa
          </h1>
          <div className="mt-1.5 flex items-center justify-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs text-slate-400 font-semibold tracking-wide">
              Cibeunying, Kota Bandung
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-2xl py-7 px-5 sm:px-8 shadow-2xl rounded-3xl border border-slate-800/80 space-y-5">
          
          {/* Environment check alert */}
          {!hasGasUrl && (
            <div className="bg-amber-500/10 border border-amber-500/25 text-amber-300 px-3.5 py-2.5 rounded-2xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold uppercase tracking-wider">Konfigurasi Dibutuhkan</p>
                <p className="mt-0.5 text-amber-300/80 font-medium text-[11px] leading-relaxed">
                  Harap isi <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono text-white">VITE_GAS_URL</code> di panel Secrets untuk sinkronisasi Google Sheets.
                </p>
              </div>
            </div>
          )}

          {/* Minimalist Segmented Auth Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setAuthMode('password')}
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation ${
                authMode === 'password'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Password Login</span>
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('pin')}
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation ${
                authMode === 'pin'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Akses Cepat (PIN)</span>
            </button>
          </div>

          {/* Error Message */}
          {error && authMode === 'password' && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3.5 py-2.5 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {/* MODE 1: PASSWORD AUTHENTICATION */}
          {authMode === 'password' && (
            <form className="space-y-4" onSubmit={handlePasswordSubmit}>
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-xs font-semibold text-slate-300 block pl-0.5">
                  Username
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    placeholder="Contoh: admin / staf"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold text-slate-300 block pl-0.5">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors cursor-pointer touch-manipulation"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !hasGasUrl}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-lg shadow-indigo-950/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all uppercase tracking-wider touch-manipulation"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Masuk ke Sistem</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* MODE 2: DIRECT PIN ACCESS */}
          {authMode === 'pin' && (
            <div className="space-y-4">
              {/* Optional user selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block pl-0.5">
                  Pilih Akun / Username
                </label>
                <div className="relative">
                  <input
                    id="pin-username-input"
                    type="text"
                    placeholder="admin (default)"
                    value={pinUsername}
                    onChange={(e) => setPinUsername(e.target.value)}
                    className="block w-full px-3.5 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs font-mono font-semibold"
                  />
                </div>
              </div>

              {/* Minimalist 4-Digit PIN Indicator */}
              <div className="space-y-2 py-1 text-center">
                <p className="text-xs text-slate-400 font-medium">
                  Masukkan PIN 4-Digit untuk masuk seketika
                </p>

                <div className="flex items-center justify-center gap-3">
                  {[0, 1, 2, 3].map((index) => {
                    const hasDigit = pinDigits.length > index;
                    return (
                      <div
                        key={index}
                        className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center text-lg font-mono font-bold transition-all duration-100 ${
                          hasDigit
                            ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 shadow-xs shadow-indigo-500/20'
                            : 'border-slate-800 bg-slate-950/80 text-slate-600'
                        }`}
                      >
                        {hasDigit ? (showPinDigits ? pinDigits[index] : '•') : ''}
                      </div>
                    );
                  })}
                </div>

                {pinError && (
                  <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-semibold text-rose-400 flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{pinError}</span>
                  </div>
                )}
              </div>

              {/* Minimalist Touch Keypad */}
              <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto touch-manipulation">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={isLoading}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleKeypadPress(num);
                    }}
                    className="py-2.5 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-600 active:scale-95 text-white font-bold text-lg rounded-xl border border-slate-700/50 shadow-xs cursor-pointer select-none touch-manipulation transition-all"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isLoading}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleKeypadClear();
                  }}
                  className="py-2.5 bg-slate-950/80 hover:bg-slate-800 active:scale-95 text-slate-400 font-semibold text-xs rounded-xl border border-slate-800 cursor-pointer select-none touch-manipulation transition-all"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleKeypadPress('0');
                  }}
                  className="py-2.5 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-600 active:scale-95 text-white font-bold text-lg rounded-xl border border-slate-700/50 shadow-xs cursor-pointer select-none touch-manipulation transition-all"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleKeypadDelete();
                  }}
                  className="py-2.5 bg-slate-950/80 hover:bg-slate-800 active:scale-95 text-amber-400 font-bold text-sm rounded-xl border border-slate-800 cursor-pointer select-none touch-manipulation transition-all"
                >
                  ⌫
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowPinDigits(!showPinDigits)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-semibold cursor-pointer touch-manipulation"
                >
                  {showPinDigits ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPinDigits ? 'Sembunyikan' : 'Lihat PIN'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePinAuth()}
                  disabled={isLoading || pinDigits.length === 0}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-transform flex items-center gap-1.5 cursor-pointer touch-manipulation"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Verifikasi PIN</span>
                </button>
              </div>
            </div>
          )}

          {/* Minimalist Sub-URL Directory Button */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-suburl-modal'))}
            className="w-full py-2.5 px-3 border border-slate-800 hover:border-indigo-500/40 rounded-2xl text-xs font-semibold text-indigo-300 hover:text-white bg-slate-950/60 hover:bg-slate-900/90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-inner touch-manipulation"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Pintas Direktori Sub-URL & Direct Link</span>
          </button>

          {/* Minimalist Footer Badge */}
          <div className="pt-2 border-t border-slate-800/50 flex items-center justify-between text-[10px] text-slate-500 font-semibold uppercase tracking-wider font-mono">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Secure Gateway
            </span>
            <span>v2.6.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
