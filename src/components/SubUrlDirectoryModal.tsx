import React, { useState, useEffect } from 'react';
import { X, Copy, ExternalLink, Check, Link2, KeyRound, Shield, Sparkles, LayoutDashboard, Users, Server, Building2, Activity, Info, Lock, Clock, Settings, Save, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { generatePinToken } from '../lib/pinToken';
import { useStore } from '../lib/store';
import { toast } from 'sonner';
import { getStoredPin, setStoredPin, getAutoLockTimeout, setAutoLockTimeout } from './PinLockModal';

interface SubUrlDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SubUrlDirectoryModal({ isOpen, onClose }: SubUrlDirectoryModalProps) {
  const { user } = useStore();
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<'standard' | 'pin'>('pin');
  const [selectedUserRole, setSelectedUserRole] = useState<'admin' | 'user'>('user');
  const [customPassword, setCustomPassword] = useState('123456');
  const [showCustomPassword, setShowCustomPassword] = useState(false);

  // PIN settings state
  const [pinValue, setPinValue] = useState(() => getStoredPin(user?.username));
  const [autoLockMinutes, setAutoLockMinutes] = useState(() => getAutoLockTimeout());
  const [showPinSettings, setShowPinSettings] = useState(false);

  // Update PIN value when user changes
  useEffect(() => {
    setPinValue(getStoredPin(user?.username));
  }, [user]);

  // Keyboard shortcut ESC to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const baseUrl = window.location.origin;

  const handleSavePinSettings = () => {
    if (!pinValue || pinValue.trim().length !== 4) {
      toast.error('PIN harus tepat 4 digit angka!');
      return;
    }
    setStoredPin(pinValue.trim(), user?.username);
    setAutoLockTimeout(autoLockMinutes);
    toast.success(`Pengaturan PIN (${pinValue}) & Auto-Lock (${autoLockMinutes} menit) berhasil disimpan untuk ${user ? user.username.toUpperCase() : 'aplikasi'}!`);
  };

  const handleTriggerLockScreen = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('trigger-lock-screen'));
  };

  const handleNavigateDirect = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    onClose();
    toast.success(`Pindah ke sub-URL: ${path}`);
  };

  const getFullUrl = (path: string) => {
    if (linkType === 'standard') {
      return `${baseUrl}${path}`;
    }
    const targetUsername = selectedUserRole === 'admin' ? 'admin' : 'user';
    const pinToken = generatePinToken(targetUsername, customPassword || '123456');
    return `${baseUrl}${path}?pin=${pinToken}`;
  };

  const handleCopy = (path: string) => {
    const fullUrl = getFullUrl(path);
    navigator.clipboard.writeText(fullUrl);
    setCopiedPath(path);
    toast.success(`URL ${path} berhasil disalin ke clipboard!`);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleOpen = (path: string) => {
    const fullUrl = getFullUrl(path);
    window.open(fullUrl, '_blank');
  };

  const subUrlList = [
    {
      path: '/summary',
      title: 'Ringkasan & Overview',
      subtitle: 'Halaman utama grafik, indikator KPI, dan statistik real-time',
      icon: LayoutDashboard,
      color: 'text-violet-500 bg-violet-500/10 border-violet-500/20',
      badge: 'Utama',
      badgeColor: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
    },
    {
      path: '/staf',
      title: 'Monitoring Staf FO',
      subtitle: 'Monitoring keberangkatan, kepulangan, center, dan status upload',
      icon: Users,
      color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
      badge: 'Staf / FO',
      badgeColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
    },
    {
      path: '/sistem',
      title: 'Sistem Status & Kontrol',
      subtitle: 'Pengaturan status operasional kantor, balancing, MSA, dan FSA',
      icon: Server,
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      badge: 'Kontrol',
      badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    },
    {
      path: '/perusahaan',
      title: 'Profil & Kebijakan Perusahaan',
      icon: Building2,
      subtitle: 'Visi, regulasi operasional, struktur organisasi, dan kontak cabang',
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      badge: 'Informasi',
      badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
    },
    {
      path: '/pengguna',
      title: 'Manajemen Pengguna',
      subtitle: 'Pengaturan akun user, reset password, dan hak akses admin',
      icon: Shield,
      color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      badge: 'Khusus Admin',
      badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
    },
    {
      path: '/logs',
      title: 'Riwayat Audit Trail Log',
      subtitle: 'Catatan log aktivitas real-time perubahan data dan login pengguna',
      icon: Activity,
      color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
      badge: 'Khusus Admin',
      badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10 my-8">
        {/* Sticky Modal Header */}
        <div className="sticky top-0 z-30 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-600/10 text-violet-600 dark:text-violet-400 rounded-2xl border border-violet-200/50 dark:border-violet-900/50 shrink-0">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2 flex-wrap">
                Daftar Sub-URL & Direct Access
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
                  PIN Auto-Access
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 hidden sm:block">
                Pilih menu target, salin URL khusus, atau navigasi langsung dengan otentikasi otomatis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 sm:px-3 sm:py-2 bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white rounded-2xl border border-rose-200 dark:border-rose-900/50 transition-all cursor-pointer shadow-sm flex items-center gap-1.5 font-bold text-xs shrink-0"
              title="Tutup Modal (Atau tekan tombol ESC)"
            >
              <X className="w-5 h-5" />
              <span className="hidden sm:inline">Tutup</span>
            </button>
          </div>
        </div>

        {/* Configuration Bar for PIN Auto-Login & Lock Settings */}
        <div className="p-6 bg-slate-100/60 dark:bg-slate-950/40 border-b border-slate-200/60 dark:border-slate-800/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-violet-500" />
                Mode Format Link URL
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pilih apakah link membutuhkan login manual atau langsung otomatis login via Token PIN
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPinSettings(!showPinSettings)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  showPinSettings
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Pengaturan 4-Digit PIN</span>
              </button>

              <div className="flex items-center bg-slate-200 dark:bg-slate-800 p-1 rounded-2xl border border-slate-300 dark:border-slate-700">
                <button
                  onClick={() => setLinkType('pin')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    linkType === 'pin'
                      ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Auto-Login PIN</span>
                </button>
                <button
                  onClick={() => setLinkType('standard')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    linkType === 'standard'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Link Standar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Expanded PIN Lock Customization Box */}
          {showPinSettings && (
            <div className="p-4 bg-amber-500/10 dark:bg-amber-950/30 border border-amber-300/80 dark:border-amber-900/50 rounded-2xl space-y-4 animate-in fade-in duration-200 mt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-amber-200/50 dark:border-amber-900/50 pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                    Pengaturan 4-Digit PIN Lock & Auto-Lock
                  </span>
                </div>
                <button
                  onClick={handleTriggerLockScreen}
                  className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 active:scale-95"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Kunci Layar Sekarang</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    PIN Keamanan Aplikasi (4-Digit Angka):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={pinValue}
                      onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="1234"
                      maxLength={4}
                      className="w-full px-3 py-1.5 text-xs font-mono font-black bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Masukkan 4-digit angka PIN rahasia untuk akun Anda.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    Batas Waktu Auto-Lock Inaktivitas:
                  </label>
                  <select
                    value={autoLockMinutes}
                    onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value={1}>1 Menit Tidak Ada Aktivitas</option>
                    <option value={3}>3 Menit Tidak Ada Aktivitas (Rekomendasi)</option>
                    <option value={5}>5 Menit Tidak Ada Aktivitas</option>
                    <option value={10}>10 Menit Tidak Ada Aktivitas</option>
                    <option value={0}>Nonaktifkan Auto-Lock</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">Layar akan terkunci otomatis saat Anda meninggalkan aplikasi.</p>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={handleSavePinSettings}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan PIN 4-Digit</span>
                </button>
              </div>
            </div>
          )}

          {linkType === 'pin' && (
            <div className="p-4 bg-violet-500/10 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-900/50 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-violet-900 dark:text-violet-200">Akses Otomatis Sebagai:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedUserRole('user')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        selectedUserRole === 'user'
                          ? 'bg-violet-600 text-white border-violet-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      User / Staf FO
                    </button>
                    <button
                      onClick={() => setSelectedUserRole('admin')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        selectedUserRole === 'admin'
                          ? 'bg-violet-600 text-white border-violet-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Admin
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Kata Sandi Akun:</span>
                  <div className="relative flex items-center">
                    <input
                      type={showCustomPassword ? 'text' : 'password'}
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="123456"
                      className="w-28 pr-8 pl-2.5 py-1 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCustomPassword(!showCustomPassword)}
                      className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                      title={showCustomPassword ? 'Sembunyikan Kata Sandi' : 'Tampilkan Kata Sandi'}
                    >
                      {showCustomPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-violet-800 dark:text-violet-300 leading-relaxed font-medium flex items-start gap-1.5">
                <Info className="w-4 h-4 shrink-0 text-violet-600 dark:text-violet-400 mt-0.5" />
                <span>
                  <strong>Keamanan PIN Encrypted:</strong> Password tidak ditulis mentah di URL, melainkan dikodekan secara terenkripsi unik (<code className="font-mono bg-violet-200/50 dark:bg-violet-900/50 px-1 rounded">?pin=kmd_v2_...</code>). Pengguna yang membuka link akan langsung dapat mengakses menu secara instan.
                </span>
              </p>
            </div>
          )}
        </div>

        {/* List of Sub-URLs */}
        <div className="p-6 max-h-[50vh] overflow-y-auto space-y-3">
          {subUrlList.map((item) => {
            const ItemIcon = item.icon;
            const fullUrl = getFullUrl(item.path);
            const isCopied = copiedPath === item.path;

            return (
              <div
                key={item.path}
                className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-300 dark:hover:border-violet-800/80 transition-all shadow-xs group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className={`p-3 rounded-2xl border shrink-0 ${item.color}`}>
                      <ItemIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                          {item.title}
                        </h4>
                        <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                        <span className="text-xs font-mono font-bold text-violet-600 dark:text-violet-400">
                          {item.path}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap self-end md:self-center shrink-0">
                    {user && (
                      <button
                        onClick={() => handleNavigateDirect(item.path)}
                        className="px-3 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Langsung buka menu di aplikasi tanpa refresh"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Pindah Ke Menu Ini</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleCopy(item.path)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Link</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleOpen(item.path)}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Buka URL di Tab Baru"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Buka Tab Baru</span>
                    </button>
                  </div>
                </div>

                {/* Display Full Generated URL Box */}
                <div className="mt-3 p-2.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200/60 dark:border-slate-800 rounded-xl flex items-center justify-between gap-2 overflow-hidden">
                  <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate select-all">
                    {fullUrl}
                  </div>
                  <span className="text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase shrink-0">
                    {linkType === 'pin' ? 'PIN Token' : 'Direct'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200/60 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center sm:text-left">
            💡 Tips: Anda dapat membagikan link ini ke staf atau manager untuk akses instan ke menu tanpa mengetik PIN.
          </p>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shrink-0"
          >
            <X className="w-4 h-4" />
            <span>Tutup & Kembali ke Aplikasi</span>
          </button>
        </div>
      </div>
    </div>
  );
}
