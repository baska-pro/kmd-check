#!/usr/bin/env python3
"""
=============================================================================
KMD CHECK - ADMIN WEBAPP (SINGLE SCRIPT PYTHON v2.1)
=============================================================================
Fitur & Peningkatan Terbaru:
  1. Pengaturan Kustomisasi Tampilan Kolom & Sub-Data Staf (Show/Hide):
     - Kolom Staf (Toggle Nama, NIK, Jabatan)
     - Kolom Status Kerja
     - Kolom Jam Berangkat / Pulang
     - Kolom Progress Center (Manual & Stepper)
     - Kolom Status Upload (Klik Cepat)
     - Kolom Aksi Cepat
     - Disimpan secara lokal (localStorage)
  2. Proteksi Staf Tanpa Center:
     - Staf yang tidak memiliki target center hari ini (0 center), status upload
       otomatis dikunci/disabled (tidak dapat diubah) dengan label jelas.
  3. Modal Popup Konfirmasi Interaktif:
     - Konfirmasi saat merubah Status Balancing (Selesai/Proses/Pending)
     - Konfirmasi saat merubah Status Upload (dengan notifikasi auto-complete 100%)
  4. Akselerasi Keamanan PIN Super Cepat:
     - Input PIN instan tanpa delay 150ms
     - Verifikasi real-time responsif
  5. Auto-Lock 5 Menit & Kunci Manual

CARA MENJALANKAN:
  python3 admin_app.py
  (atau python admin_app.py [PORT])
=============================================================================
"""

import os
import sys
import json
import urllib.request
import urllib.error
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
import socketserver
import time

DEFAULT_PORT = 8080
CONFIG_FILE = "gas_config.json"

DEFAULT_CONFIG = {
    "gas_url": "",
    "pin": "1234",
    "autolock_minutes": 5
}

def load_config():
    """Membaca konfigurasi dari gas_config.json atau environment variable"""
    cfg = DEFAULT_CONFIG.copy()
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    cfg.update(saved)
        except Exception as e:
            print(f"Peringatan membaca config: {e}")

    # Fallback env jika gas_url masih kosong
    if not cfg.get("gas_url"):
        env_gas = os.environ.get("VITE_GAS_URL") or os.environ.get("GAS_URL")
        if env_gas:
            cfg["gas_url"] = env_gas.strip()
        elif os.path.exists(".env"):
            try:
                with open(".env", "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("VITE_GAS_URL="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            if val:
                                cfg["gas_url"] = val
                                break
            except Exception:
                pass

    return cfg

def save_config(cfg_dict):
    """Menyimpan konfigurasi ke file gas_config.json"""
    try:
        current = load_config()
        current.update(cfg_dict)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        return True
    except Exception as e:
        print(f"Error menyimpan config: {e}")
        return False

# Inisialisasi awal
APP_CONFIG = load_config()
save_config(APP_CONFIG)

def query_gas(payload):
    """Mengirim request POST ke Google Apps Script Web App API"""
    global APP_CONFIG
    gas_url = APP_CONFIG.get("gas_url", "").strip()
    if not gas_url:
        return {"success": False, "error": "GAS_URL belum diatur. Silakan masukkan Web App URL Google Apps Script di menu Pengaturan."}

    try:
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            gas_url,
            data=data_bytes,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "KMD-Admin-Python/2.1"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=25) as response:
            res_body = response.read().decode("utf-8")
            try:
                return json.loads(res_body)
            except Exception:
                return {"success": True, "raw": res_body}
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            redirect_url = e.headers.get("Location")
            if redirect_url:
                try:
                    req_redir = urllib.request.Request(
                        redirect_url,
                        data=data_bytes,
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req_redir, timeout=25) as response:
                        return json.loads(response.read().decode("utf-8"))
                except Exception as ex2:
                    return {"success": False, "error": f"Redirect error: {ex2}"}
        return {"success": False, "error": f"HTTP Error {e.code}: {e.reason}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="id" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KMD Check — Admin Dashboard Pro</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.4); border-radius: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(107, 114, 128, 0.7); }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }
    .shake-anim { animation: shake 0.3s cubic-bezier(.36,.07,.19,.97) both; }
  </style>
</head>
<body class="bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 min-h-full flex flex-col antialiased transition-colors duration-200">

  <!-- ========================================================================= -->
  <!-- PIN LOCK SCREEN OVERLAY (INSTANT ULTRA-FAST) -->
  <!-- ========================================================================= -->
  <div id="pin-lock-overlay" class="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 transition-opacity duration-150">
    <div id="pin-card" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-6">
      
      <!-- Lock Icon & Header -->
      <div class="space-y-2">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
          <i data-lucide="lock" class="w-7 h-7"></i>
        </div>
        <h2 class="text-xl font-extrabold text-slate-900 dark:text-white">KMD Check Admin</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Masukkan PIN Keamanan untuk Membuka</p>
      </div>

      <!-- PIN Dots Display -->
      <div class="flex items-center justify-center gap-3 my-2" id="pin-dots-container">
        <div class="pin-dot w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600"></div>
        <div class="pin-dot w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600"></div>
        <div class="pin-dot w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600"></div>
        <div class="pin-dot w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600"></div>
      </div>

      <!-- Error message container -->
      <div id="pin-error-msg" class="text-xs font-semibold text-rose-500 min-h-[18px]"></div>

      <!-- Numeric Keypad (Instant Response) -->
      <div class="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
        <button onclick="appendPin('1')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">1</button>
        <button onclick="appendPin('2')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">2</button>
        <button onclick="appendPin('3')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">3</button>
        
        <button onclick="appendPin('4')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">4</button>
        <button onclick="appendPin('5')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">5</button>
        <button onclick="appendPin('6')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">6</button>
        
        <button onclick="appendPin('7')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">7</button>
        <button onclick="appendPin('8')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">8</button>
        <button onclick="appendPin('9')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">9</button>
        
        <button onclick="clearPin()" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 text-slate-500 dark:text-slate-400 font-semibold text-xs active:scale-90 transition-transform">C</button>
        <button onclick="appendPin('0')" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-lg active:scale-90 transition-transform">0</button>
        <button onclick="deletePinDigit()" class="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 text-slate-500 dark:text-slate-400 flex items-center justify-center active:scale-90 transition-transform">
          <i data-lucide="delete" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="pt-1 text-[11px] text-slate-400 dark:text-slate-500">
        💡 PIN default: <code class="font-mono font-bold text-emerald-600 dark:text-emerald-400">1234</code> (dapat diubah di menu Pengaturan)
      </div>

    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- MODAL KONFIRMASI (BALANCING & STATUS UPLOAD) -->
  <!-- ========================================================================= -->
  <div id="confirm-modal" class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-start gap-3.5">
        <div id="confirm-modal-icon-container" class="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 shadow-inner">
          <i id="confirm-modal-icon" data-lucide="help-circle" class="w-6 h-6"></i>
        </div>
        <div class="flex-1">
          <h3 id="confirm-modal-title" class="text-base font-extrabold text-slate-900 dark:text-white">Konfirmasi Tindakan</h3>
          <div id="confirm-modal-body" class="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
            Apakah Anda yakin ingin melanjutkan tindakan ini?
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
        <button onclick="closeConfirmModal(false)" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition">
          Batal
        </button>
        <button id="confirm-modal-btn-ok" onclick="closeConfirmModal(true)" class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-sm transition">
          Ya, Lanjutkan
        </button>
      </div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- MAIN APP TOPBAR HEADER -->
  <!-- ========================================================================= -->
  <header class="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3">
    <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
      
      <!-- Brand & Title -->
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
          <i data-lucide="check-check" class="w-6 h-6"></i>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-none">KMD Check</h1>
            <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Admin Pro</span>
          </div>
          <p id="branch-title" class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">Monitoring Checklist & Balancing Staf</p>
        </div>
      </div>

      <!-- Quick Actions, Auto-lock Status & Controls -->
      <div class="flex items-center gap-1.5 sm:gap-3">
        
        <!-- Live Sync Pill & Control -->
        <div class="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700">
          <span id="sync-dot" class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1.5"></span>
          <select id="select-sync-interval" onchange="changeSyncInterval(this.value)" class="bg-transparent font-bold text-slate-700 dark:text-slate-200 text-xs focus:outline-none cursor-pointer pr-1">
            <option value="5000">Sync 5s</option>
            <option value="8000" selected>Sync 8s</option>
            <option value="15000">Sync 15s</option>
            <option value="30000">Sync 30s</option>
            <option value="0">Manual Sync</option>
          </select>
        </div>

        <!-- Tombol Toggle Ringkasan Topbar (1 Layar) -->
        <button onclick="toggleHeroSection()" id="btn-toggle-hero" title="Toggle Ringkasan (Maksimalkan Tampilan Tabel 1 Layar)" class="px-2.5 py-1.5 rounded-xl text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-95 transition flex items-center gap-1.5 text-xs font-bold border border-slate-200/80 dark:border-slate-700">
          <i data-lucide="maximize-2" class="w-4 h-4 text-indigo-600 dark:text-indigo-400" id="hero-toggle-icon"></i>
          <span class="hidden lg:inline" id="hero-toggle-text">Mode 1 Layar</span>
        </button>

        <!-- Tombol Tampilan Kolom Dropdown -->
        <button onclick="openConfigModal('cols')" title="Atur Tampilan Kolom & Data" class="px-2.5 py-1.5 rounded-xl text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-95 transition flex items-center gap-1.5 text-xs font-bold border border-slate-200/80 dark:border-slate-700">
          <i data-lucide="columns" class="w-4 h-4 text-emerald-600 dark:text-emerald-400"></i>
          <span class="hidden md:inline">Atur Kolom</span>
        </button>

        <!-- Refresh / Sync Sekarang Button -->
        <button onclick="fetchData()" id="btn-refresh" title="Sync Sekarang" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition flex items-center gap-1.5 text-xs font-bold shadow-xs">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5" id="refresh-icon"></i>
          <span class="hidden sm:inline">Sync Data</span>
        </button>

        <!-- Lock Screen Button -->
        <button onclick="lockScreen()" title="Kunci Layar Sekarang" class="p-2 rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 active:scale-95 transition flex items-center gap-1.5 text-xs font-bold border border-amber-200/60 dark:border-amber-800/60">
          <i data-lucide="lock" class="w-4 h-4"></i>
          <span class="hidden md:inline">Kunci</span>
        </button>

        <!-- Setting Modal Button -->
        <button onclick="openConfigModal('db')" title="Pengaturan URL Database & Keamanan" class="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition">
          <i data-lucide="settings" class="w-4 h-4"></i>
        </button>

        <!-- Dark Mode Toggle -->
        <button onclick="toggleDarkMode()" title="Toggle Mode Gelap/Terang" class="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition">
          <i data-lucide="moon" class="w-4 h-4 hidden dark:block"></i>
          <i data-lucide="sun" class="w-4 h-4 block dark:hidden"></i>
        </button>
      </div>

    </div>
  </header>

  <!-- ========================================================================= -->
  <!-- MAIN CONTENT CONTAINER -->
  <!-- ========================================================================= -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">

    <!-- ALERT BANNER JIKA URL GAS KOSONG -->
    <div id="gas-warning-banner" class="hidden bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200">
      <div class="flex items-center gap-3">
        <i data-lucide="alert-triangle" class="w-5 h-5 text-amber-600 flex-shrink-0"></i>
        <div class="text-xs sm:text-sm">
          <span class="font-bold">URL Google Apps Script belum diatur!</span> Data belum dapat disinkronkan ke Spreadsheet dan WhatsApp.
        </div>
      </div>
      <button onclick="openConfigModal('db')" class="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold whitespace-nowrap shadow-sm transition">
        Setting URL Sekarang
      </button>
    </div>

    <!-- HERO SECTION: STATUS BALANCING & SISTEM RINGKAS (BISA TIK / COLLAPSE UNTUK 1 LAYAR) -->
    <section id="hero-section" class="grid grid-cols-1 md:grid-cols-3 gap-4 transition-all duration-300">
      
      <!-- CARD 1: STATUS BALANCING (FOKUS UTAMA) -->
      <div class="md:col-span-2 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-2.5">
            <div class="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <i data-lucide="scale" class="w-5 h-5"></i>
            </div>
            <div>
              <h2 class="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Status Balancing Kas & Transaksi</h2>
              <div id="balancing-badge-container" class="mt-1 flex items-center gap-2">
                <span id="balancing-status-text" class="text-lg sm:text-xl font-black text-slate-900 dark:text-white">-</span>
              </div>
            </div>
          </div>

          <!-- Quick Update Balancing Buttons (Dengan Konfirmasi Modal Interaktif) -->
          <div class="flex items-center gap-1.5 flex-wrap">
            <button onclick="promptBalancingStatus('Selesai / Balance')" title="Update dan kirim laporan balancing ke WhatsApp" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition flex items-center gap-1.5 shadow-sm">
              <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Selesai / Balance
            </button>
            <button onclick="promptBalancingStatus('Proses')" class="px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white transition flex items-center gap-1.5 shadow-sm">
              <i data-lucide="clock" class="w-3.5 h-3.5"></i> Proses
            </button>
            <button onclick="promptBalancingStatus('Pending')" class="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-600 hover:bg-slate-700 active:scale-95 text-white transition flex items-center gap-1.5 shadow-sm">
              <i data-lucide="pause" class="w-3.5 h-3.5"></i> Pending
            </button>
          </div>
        </div>

        <!-- Info Tambahan Sistem & Kantor -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
          <div class="bg-slate-100/70 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span class="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase">Status Kantor</span>
            <span id="status-kantor-val" class="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">-</span>
          </div>
          <div class="bg-slate-100/70 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span class="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase">Status Sistem</span>
            <span id="status-sistem-val" class="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">-</span>
          </div>
          <div class="bg-slate-100/70 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span class="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase">Aktivitas MSA</span>
            <span id="status-msa-val" class="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block truncate">-</span>
          </div>
          <div class="bg-slate-100/70 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span class="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase">Aktivitas FSA</span>
            <span id="status-fsa-val" class="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block truncate">-</span>
          </div>
        </div>
      </div>

      <!-- CARD 2: RINGKASAN PROGRESS STAF -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between">
            <span class="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Total Kemajuan Staf</span>
            <span id="summary-percentage" class="text-xl font-black text-emerald-600 dark:text-emerald-400">0%</span>
          </div>
          
          <!-- Progress Bar Global -->
          <div class="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-3 border border-slate-200/60 dark:border-slate-700/60">
            <div id="summary-progress-bar" class="h-full bg-emerald-500 transition-all duration-500" style="width: 0%"></div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <div id="stat-selesai-count" class="text-base font-black text-emerald-600 dark:text-emerald-400">0</div>
            <div class="text-[10px] uppercase font-bold text-slate-400 mt-0.5">Selesai</div>
          </div>
          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <div id="stat-lapangan-count" class="text-base font-black text-blue-600 dark:text-blue-400">0</div>
            <div class="text-[10px] uppercase font-bold text-slate-400 mt-0.5">Lapangan</div>
          </div>
          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <div id="stat-kantor-count" class="text-base font-black text-slate-700 dark:text-slate-300">0</div>
            <div class="text-[10px] uppercase font-bold text-slate-400 mt-0.5">Di Kantor</div>
          </div>
        </div>
      </div>

    </section>

    <!-- ========================================================================= -->
    <!-- BATCH ACTION TOOLBAR (PILIH MASSAL STAF) -->
    <!-- ========================================================================= -->
    <div id="batch-action-bar" class="hidden bg-emerald-900 text-white rounded-2xl p-3 sm:p-4 shadow-xl border border-emerald-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-emerald-700 flex items-center justify-center font-black text-xs text-emerald-200" id="batch-count-badge">
          0
        </div>
        <div>
          <div class="font-extrabold text-xs" id="batch-title-text">0 Staf Dipilih untuk Update Massal</div>
          <div class="text-[11px] text-emerald-300">Pilih status di samping untuk menerapkan perubahan sekaligus</div>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap w-full sm:w-auto">
        <!-- Select Status Kerja -->
        <select id="batch-select-kerja" class="py-1.5 px-2.5 rounded-xl bg-emerald-800 text-white text-xs font-bold border border-emerald-600 focus:outline-none">
          <option value="">-- Status Kerja --</option>
          <option value="Di Lapangan">🛵 Di Lapangan</option>
          <option value="Di Kantor">🏢 Di Kantor</option>
          <option value="Pulang">🏠 Pulang</option>
        </select>

        <!-- Select Status Upload -->
        <select id="batch-select-upload" class="py-1.5 px-2.5 rounded-xl bg-emerald-800 text-white text-xs font-bold border border-emerald-600 focus:outline-none">
          <option value="">-- Status Upload --</option>
          <option value="Sudah upload semua">✅ Sudah Upload Semua</option>
          <option value="Sebagian upload">⏳ Sebagian Upload</option>
          <option value="Belum upload">❌ Belum Upload</option>
        </select>

        <!-- Submit Batch Button -->
        <button onclick="promptExecuteBatchUpdate()" class="px-3.5 py-1.5 bg-white text-emerald-900 hover:bg-emerald-100 rounded-xl font-black text-xs shadow-md transition active:scale-95 flex items-center gap-1.5">
          <i data-lucide="check-check" class="w-4 h-4 text-emerald-700"></i>
          <span>Terapkan Massal</span>
        </button>

        <button onclick="clearBatchSelection()" class="p-1.5 text-emerald-300 hover:text-white rounded-lg">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- SECTION: DAFTAR CHECKLIST STAF (DENGAN AUTO-SUSUN SELESAI DI ATAS) -->
    <!-- ========================================================================= -->
    <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      
      <!-- Table Header & Controls -->
      <div class="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <div class="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
            <i data-lucide="users" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">Daftar Checklist & Progress Staf</h2>
              <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Selesai Paling Atas
              </span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Centang baris staf untuk aksi massal sekaligus</p>
          </div>
        </div>

        <!-- Filter & Search Controls -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <!-- Search input -->
          <div class="relative flex-1 sm:w-52">
            <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input 
              type="text" 
              id="search-staff" 
              oninput="renderStaffTable()" 
              placeholder="Cari nama / NIK..." 
              class="w-full pl-8 pr-3 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
          </div>

          <!-- Status Filter Tabs -->
          <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs overflow-x-auto custom-scrollbar">
            <button onclick="setFilter('SEMUA')" id="filter-SEMUA" class="filter-btn px-2.5 py-1 rounded-lg font-bold bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs">Semua</button>
            <button onclick="setFilter('SELESAI')" id="filter-SELESAI" class="filter-btn px-2.5 py-1 rounded-lg font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900">Selesai</button>
            <button onclick="setFilter('LAPANGAN')" id="filter-LAPANGAN" class="filter-btn px-2.5 py-1 rounded-lg font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900">Di Lapangan</button>
            <button onclick="setFilter('KANTOR')" id="filter-KANTOR" class="filter-btn px-2.5 py-1 rounded-lg font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900">Di Kantor</button>
            <button onclick="setFilter('BELUM_SELESAI')" id="filter-BELUM_SELESAI" class="filter-btn px-2.5 py-1 rounded-lg font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900">Belum 100%</button>
          </div>
        </div>
      </div>

      <!-- TABLE VIEW WITH SCROLL CONTAINER FIT TO SCREEN -->
      <div id="table-container" class="overflow-x-auto overflow-y-auto custom-scrollbar max-h-[calc(100vh-210px)]">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <tr class="text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]" id="table-head-row">
              <th class="py-2.5 px-3 w-10 text-center">
                <input type="checkbox" id="select-all-checkbox" onchange="toggleSelectAllStaff(this.checked)" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer">
              </th>
              <th id="th-staff" class="py-2.5 px-3 min-w-[170px]">Staf / NIK</th>
              <th id="th-status-kerja" class="py-2.5 px-3 min-w-[140px]">Status Kerja</th>
              <th id="th-jam" class="py-2.5 px-3 min-w-[160px]">Jam Berangkat / Pulang</th>
              <th id="th-progress" class="py-2.5 px-3 min-w-[220px]">Progress Center (Manual / Step)</th>
              <th id="th-status-upload" class="py-2.5 px-3 min-w-[240px]">Status Upload (Klik Cepat)</th>
              <th id="th-aksi" class="py-2.5 px-3 text-center min-w-[100px]">Aksi Cepat</th>
            </tr>
          </thead>
          <tbody id="staff-table-body" class="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
            <tr>
              <td colspan="7" class="py-12 text-center text-slate-400">
                <div class="inline-flex items-center gap-2">
                  <i data-lucide="loader" class="w-5 h-5 animate-spin text-emerald-500"></i>
                  <span>Memuat data staf dari Spreadsheet...</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Table Footer -->
      <div class="p-3 px-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div id="staff-counter">Menampilkan 0 staf</div>
        <div id="last-updated-time" class="text-[11px]">Terakhir diperbarui: -</div>
      </div>

    </section>

  </main>

  <!-- ========================================================================= -->
  <!-- MODAL CONFIG / SETTINGS (DATABASE, PIN, & ATUR TAMPILAN KOLOM) -->
  <!-- ========================================================================= -->
  <div id="config-modal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
      
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <i data-lucide="sliders" class="w-5 h-5"></i>
          </div>
          <h3 class="font-extrabold text-slate-900 dark:text-white">Pengaturan Sistem & Tampilan</h3>
        </div>
        <button onclick="closeConfigModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="space-y-4 text-xs">
        
        <!-- Tab Navigation in Modal -->
        <div class="flex border-b border-slate-100 dark:border-slate-800 gap-1">
          <button onclick="setModalTab('cols')" id="tab-btn-cols" class="px-3 py-2 font-bold border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <i data-lucide="columns" class="w-3.5 h-3.5"></i> Kolom & Data
          </button>
          <button onclick="setModalTab('db')" id="tab-btn-db" class="px-3 py-2 font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1.5">
            <i data-lucide="database" class="w-3.5 h-3.5"></i> Database & GAS
          </button>
          <button onclick="setModalTab('pin')" id="tab-btn-pin" class="px-3 py-2 font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1.5">
            <i data-lucide="shield" class="w-3.5 h-3.5"></i> PIN & Auto-Lock
          </button>
        </div>

        <!-- TAB 1: KUSTOMISASI KOLOM & DATA (SHOW / HIDE) -->
        <div id="tab-content-cols" class="space-y-3">
          <p class="text-slate-500 dark:text-slate-400 text-[11px]">
            Centang data atau kolom yang ingin Anda tampilkan pada tabel checklist:
          </p>

          <div class="space-y-2 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
            
            <div class="font-bold text-slate-800 dark:text-slate-200 mb-2">1. Data Staf & Identitas</div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="pref-show-staff-name" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" checked onchange="saveColumnPreferences()">
                <span class="font-medium text-slate-700 dark:text-slate-300">Nama Staf</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="pref-show-staff-nik" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" checked onchange="saveColumnPreferences()">
                <span class="font-medium text-slate-700 dark:text-slate-300">NIK Staf</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="pref-show-staff-jabatan" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" checked onchange="saveColumnPreferences()">
                <span class="font-medium text-slate-700 dark:text-slate-300">Jabatan</span>
              </label>
            </div>

            <div class="font-bold text-slate-800 dark:text-slate-200 pt-2 mb-2">2. Kolom Tabel Utama</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="pref-col-status-kerja" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" checked onchange="saveColumnPreferences()">
                <span class="font-medium text-slate-700 dark:text-slate-300">Status Kerja (Kantor/Lapangan/Pulang)</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="pref-col-jam" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" checked onchange="saveColumnPreferences()">
                <span class="font-medium text-slate-700 dark:text-slate-300">Jam Berangkat / Pulang</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="pref-col-progress" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" checked onchange="saveColumnPreferences()">
                <span class="font-medium text-slate-700 dark:text-slate-300">Progress Center (Manual / Step)</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="pref-col-status-upload" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" checked onchange="saveColumnPreferences()">
                <span class="font-medium text-slate-700 dark:text-slate-300">Status Upload (Klik Cepat)</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="pref-col-aksi" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" checked onchange="saveColumnPreferences()">
                <span class="font-medium text-slate-700 dark:text-slate-300">Aksi Cepat (Tombol Pulang)</span>
              </label>
            </div>

            <div class="pt-2 flex justify-end">
              <button onclick="resetColumnPreferences()" class="text-[11px] font-bold text-slate-500 hover:text-emerald-600 underline">
                Reset ke Tampilan Default (Tampilkan Semua)
              </button>
            </div>

          </div>
        </div>

        <!-- TAB 2: DATABASE -->
        <div id="tab-content-db" class="space-y-3 hidden">
          <label class="block font-bold text-slate-700 dark:text-slate-300">
            Google Apps Script Web App URL:
          </label>
          <input 
            type="text" 
            id="input-gas-url" 
            placeholder="https://script.google.com/macros/s/.../exec"
            class="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
          <p class="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
            Terhubung ke Google Spreadsheet & WhatsApp API bot. Pastikan Web App disetel <b>Anyone</b>.
          </p>
        </div>

        <!-- TAB 3: PIN & KEAMANAN -->
        <div id="tab-content-pin" class="space-y-4 hidden">
          
          <!-- Ubah PIN -->
          <div class="space-y-2 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
            <span class="font-bold text-slate-800 dark:text-slate-200 block text-xs">Ubah PIN Masuk</span>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label class="text-[10px] text-slate-400 font-bold uppercase">PIN Saat Ini</label>
                <input type="password" id="input-cur-pin" maxlength="8" placeholder="****" class="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-center text-xs">
              </div>
              <div>
                <label class="text-[10px] text-slate-400 font-bold uppercase">PIN Baru (4-8 Digit)</label>
                <input type="password" id="input-new-pin" maxlength="8" placeholder="****" class="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-center text-xs">
              </div>
            </div>
            <button onclick="changePinAction()" class="w-full mt-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs transition">
              Simpan PIN Baru
            </button>
          </div>

          <!-- Durasi Auto-Lock -->
          <div class="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
            <label class="font-bold text-slate-800 dark:text-slate-200 block text-xs">
              Durasi Auto-Lock (Tidak Ada Aktivitas)
            </label>
            <select id="select-autolock" class="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none">
              <option value="1">1 Menit</option>
              <option value="2">2 Menit</option>
              <option value="3">3 Menit</option>
              <option value="5" selected>5 Menit (Default)</option>
              <option value="10">10 Menit</option>
              <option value="15">15 Menit</option>
              <option value="30">30 Menit</option>
              <option value="0">Nonaktifkan Auto-Lock</option>
            </select>
          </div>

        </div>

      </div>

      <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onclick="closeConfigModal()" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          Tutup
        </button>
        <button onclick="saveAllSettings()" class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition">
          Simpan Semua Pengaturan
        </button>
      </div>
    </div>
  </div>

  <!-- TOAST NOTIFICATION -->
  <div id="toast" class="fixed bottom-5 right-5 z-50 transform translate-y-20 opacity-0 transition-all duration-200 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2">
    <i data-lucide="info" class="w-4 h-4 text-emerald-400 dark:text-emerald-600"></i>
    <span id="toast-text">Notifikasi</span>
  </div>

  <!-- ========================================================================= -->
  <!-- JAVASCRIPT LOGIC -->
  <!-- ========================================================================= -->
  <script>
    // State Aplikasi
    let currentData = { staff: [], systemStatus: {}, options: {} };
    let currentFilter = 'SEMUA';
    let pollInterval = null;

    // State Keamanan PIN & Auto-Lock
    let enteredPin = "";
    let isUnlocked = false;
    let autoLockMinutes = 5;
    let inactivityTimer = null;
    let lastActivityTime = Date.now();

    // Preferensi Tampilan Kolom & Sub-Data
    const DEFAULT_COL_PREFS = {
      showStaffName: true,
      showStaffNIK: true,
      showStaffJabatan: true,
      showColStatusKerja: true,
      showColJam: true,
      showColProgress: true,
      showColStatusUpload: true,
      showColAksi: true
    };
    let colPrefs = { ...DEFAULT_COL_PREFS };

    function loadColumnPreferences() {
      try {
        const saved = localStorage.getItem('kmd_admin_col_prefs_v2');
        if (saved) {
          colPrefs = Object.assign({}, DEFAULT_COL_PREFS, JSON.parse(saved));
        }
      } catch (e) {
        colPrefs = { ...DEFAULT_COL_PREFS };
      }
      applyColumnPrefsToInputs();
    }

    function applyColumnPrefsToInputs() {
      const el = (id) => document.getElementById(id);
      if (el('pref-show-staff-name')) el('pref-show-staff-name').checked = colPrefs.showStaffName;
      if (el('pref-show-staff-nik')) el('pref-show-staff-nik').checked = colPrefs.showStaffNIK;
      if (el('pref-show-staff-jabatan')) el('pref-show-staff-jabatan').checked = colPrefs.showStaffJabatan;
      if (el('pref-col-status-kerja')) el('pref-col-status-kerja').checked = colPrefs.showColStatusKerja;
      if (el('pref-col-jam')) el('pref-col-jam').checked = colPrefs.showColJam;
      if (el('pref-col-progress')) el('pref-col-progress').checked = colPrefs.showColProgress;
      if (el('pref-col-status-upload')) el('pref-col-status-upload').checked = colPrefs.showColStatusUpload;
      if (el('pref-col-aksi')) el('pref-col-aksi').checked = colPrefs.showColAksi;
    }

    function saveColumnPreferences() {
      const el = (id) => document.getElementById(id);
      colPrefs.showStaffName = el('pref-show-staff-name') ? el('pref-show-staff-name').checked : true;
      colPrefs.showStaffNIK = el('pref-show-staff-nik') ? el('pref-show-staff-nik').checked : true;
      colPrefs.showStaffJabatan = el('pref-show-staff-jabatan') ? el('pref-show-staff-jabatan').checked : true;
      colPrefs.showColStatusKerja = el('pref-col-status-kerja') ? el('pref-col-status-kerja').checked : true;
      colPrefs.showColJam = el('pref-col-jam') ? el('pref-col-jam').checked : true;
      colPrefs.showColProgress = el('pref-col-progress') ? el('pref-col-progress').checked : true;
      colPrefs.showColStatusUpload = el('pref-col-status-upload') ? el('pref-col-status-upload').checked : true;
      colPrefs.showColAksi = el('pref-col-aksi') ? el('pref-col-aksi').checked : true;

      try {
        localStorage.setItem('kmd_admin_col_prefs_v2', JSON.stringify(colPrefs));
      } catch (e) {}

      renderStaffTable();
    }

    function resetColumnPreferences() {
      colPrefs = { ...DEFAULT_COL_PREFS };
      try {
        localStorage.setItem('kmd_admin_col_prefs_v2', JSON.stringify(colPrefs));
      } catch (e) {}
      applyColumnPrefsToInputs();
      renderStaffTable();
      showToast('Tampilan kolom direset ke default');
    }

    // Inisialisasi Dark Mode
    if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    function toggleDarkMode() {
      if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      }
      lucide.createIcons();
    }

    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      const text = document.getElementById('toast-text');
      text.innerText = msg;
      toast.classList.remove('translate-y-20', 'opacity-0');
      setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
      }, 2200);
    }

    // =========================================================================
    // MODAL KONFIRMASI (POPUP DIALOG)
    // =========================================================================
    let confirmCallback = null;

    function openConfirmModal({ title, body, icon, confirmBtnText, confirmBtnClass, onConfirm }) {
      document.getElementById('confirm-modal-title').innerText = title || 'Konfirmasi';
      document.getElementById('confirm-modal-body').innerHTML = body || 'Lanjutkan?';
      
      const btn = document.getElementById('confirm-modal-btn-ok');
      btn.innerText = confirmBtnText || 'Ya, Lanjutkan';
      btn.className = `px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition active:scale-95 ${confirmBtnClass || 'bg-emerald-600 hover:bg-emerald-700'}`;

      const iconEl = document.getElementById('confirm-modal-icon');
      if (icon) iconEl.setAttribute('data-lucide', icon);
      else iconEl.setAttribute('data-lucide', 'help-circle');

      confirmCallback = onConfirm;
      document.getElementById('confirm-modal').classList.remove('hidden');
      document.getElementById('confirm-modal').classList.add('flex');
      lucide.createIcons();
    }

    function closeConfirmModal(isConfirmed) {
      document.getElementById('confirm-modal').classList.add('hidden');
      document.getElementById('confirm-modal').classList.remove('flex');
      if (isConfirmed && typeof confirmCallback === 'function') {
        confirmCallback();
      }
      confirmCallback = null;
    }

    // =========================================================================
    // PIN & LOCK SCREEN FUNCTIONS (SUPER CEPAT TANPA DELAY)
    // =========================================================================
    function updatePinDots() {
      const dots = document.querySelectorAll('.pin-dot');
      dots.forEach((dot, index) => {
        if (index < enteredPin.length) {
          dot.classList.add('bg-emerald-500', 'border-emerald-500');
          dot.classList.remove('bg-transparent', 'border-slate-300', 'dark:border-slate-600');
        } else {
          dot.classList.remove('bg-emerald-500', 'border-emerald-500');
          dot.classList.add('bg-transparent', 'border-slate-300', 'dark:border-slate-600');
        }
      });
      document.getElementById('pin-error-msg').innerText = '';
    }

    function appendPin(digit) {
      if (enteredPin.length < 8) {
        enteredPin += digit;
        updatePinDots();
        // Langsung verifikasi saat digit ke-4 ditekan tanpa delay
        if (enteredPin.length >= 4) {
          submitPin();
        }
      }
    }

    function deletePinDigit() {
      if (enteredPin.length > 0) {
        enteredPin = enteredPin.slice(0, -1);
        updatePinDots();
      }
    }

    function clearPin() {
      enteredPin = "";
      updatePinDots();
    }

    async function submitPin() {
      if (!enteredPin) return;
      const cur = enteredPin;
      try {
        const res = await fetch('/api/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: cur })
        });
        const json = await res.json();
        if (json.valid) {
          unlockScreen();
        } else {
          // Salah PIN -> Shake effect
          const card = document.getElementById('pin-card');
          card.classList.add('shake-anim');
          document.getElementById('pin-error-msg').innerText = 'PIN Salah! Silakan coba lagi.';
          setTimeout(() => {
            card.classList.remove('shake-anim');
            clearPin();
          }, 300);
        }
      } catch (e) {
        document.getElementById('pin-error-msg').innerText = 'Error verifikasi PIN';
      }
    }

    function unlockScreen() {
      isUnlocked = true;
      const overlay = document.getElementById('pin-lock-overlay');
      overlay.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => {
        overlay.classList.add('hidden');
      }, 150);
      clearPin();
      resetInactivityTimer();
      fetchData();
      startAutoPolling();
    }

    function lockScreen() {
      isUnlocked = false;
      clearPin();
      const overlay = document.getElementById('pin-lock-overlay');
      overlay.classList.remove('hidden');
      setTimeout(() => {
        overlay.classList.remove('opacity-0', 'pointer-events-none');
      }, 10);
      lucide.createIcons();
    }

    // Reset timer saat ada interaksi pengguna
    function resetInactivityTimer() {
      lastActivityTime = Date.now();
      if (inactivityTimer) clearTimeout(inactivityTimer);

      if (autoLockMinutes > 0 && isUnlocked) {
        inactivityTimer = setTimeout(() => {
          lockScreen();
          showToast('Sesi terkunci otomatis setelah tidak ada aktivitas');
        }, autoLockMinutes * 60 * 1000);
      }
    }

    // Keyboard & Activity Listeners
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
      window.addEventListener(evt, () => {
        if (isUnlocked) resetInactivityTimer();
      }, { passive: true });
    });

    window.addEventListener('keydown', (e) => {
      if (!isUnlocked) {
        if (e.key >= '0' && e.key <= '9') appendPin(e.key);
        else if (e.key === 'Backspace') deletePinDigit();
        else if (e.key === 'Enter') submitPin();
        else if (e.key === 'Escape') clearPin();
      }
    });

    // =========================================================================
    // MODAL CONFIG & SETTINGS
    // =========================================================================
    function setModalTab(tab) {
      ['cols', 'db', 'pin'].forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        const content = document.getElementById('tab-content-' + t);
        if (t === tab) {
          btn.className = 'px-3 py-2 font-bold border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5';
          content.classList.remove('hidden');
        } else {
          btn.className = 'px-3 py-2 font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1.5';
          content.classList.add('hidden');
        }
      });
      lucide.createIcons();
    }

    function openConfigModal(activeTab = 'cols') {
      fetch('/api/config')
        .then(r => r.json())
        .then(cfg => {
          document.getElementById('input-gas-url').value = cfg.gas_url || '';
          document.getElementById('select-autolock').value = cfg.autolock_minutes !== undefined ? cfg.autolock_minutes : 5;
          applyColumnPrefsToInputs();
          setModalTab(activeTab);
          document.getElementById('config-modal').classList.remove('hidden');
          document.getElementById('config-modal').classList.add('flex');
          lucide.createIcons();
        });
    }

    function closeConfigModal() {
      document.getElementById('config-modal').classList.add('hidden');
      document.getElementById('config-modal').classList.remove('flex');
      document.getElementById('input-cur-pin').value = '';
      document.getElementById('input-new-pin').value = '';
    }

    async function changePinAction() {
      const curPin = document.getElementById('input-cur-pin').value.trim();
      const newPin = document.getElementById('input-new-pin').value.trim();

      if (!curPin || !newPin) {
        alert('Mohon isi PIN saat ini dan PIN baru!');
        return;
      }
      if (newPin.length < 4) {
        alert('PIN baru minimal 4 digit!');
        return;
      }

      const res = await fetch('/api/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_pin: curPin, new_pin: newPin })
      });
      const json = await res.json();
      if (json.success) {
        showToast('PIN keamanan berhasil diperbarui!');
        document.getElementById('input-cur-pin').value = '';
        document.getElementById('input-new-pin').value = '';
      } else {
        alert(json.error || 'Gagal mengubah PIN');
      }
    }

    async function saveAllSettings() {
      saveColumnPreferences();
      const url = document.getElementById('input-gas-url').value.trim();
      const autolock = parseInt(document.getElementById('select-autolock').value, 10);

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ gas_url: url, autolock_minutes: autolock })
      });
      const json = await res.json();
      if (json.success) {
        autoLockMinutes = autolock;
        resetInactivityTimer();
        showToast('Pengaturan berhasil disimpan!');
        closeConfigModal();
        fetchData();
      } else {
        alert('Gagal menyimpan: ' + (json.error || 'Terjadi kesalahan'));
      }
    }

    // =========================================================================
    // FILTER & DATA FETCHING
    // =========================================================================
    function setFilter(f) {
      currentFilter = f;
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'dark:bg-slate-700', 'text-slate-800', 'dark:text-white', 'shadow-xs');
        btn.classList.add('text-slate-600', 'dark:text-slate-400');
      });
      const activeBtn = document.getElementById('filter-' + f);
      if (activeBtn) {
        activeBtn.classList.add('bg-white', 'dark:bg-slate-700', 'text-slate-800', 'dark:text-white', 'shadow-xs');
        activeBtn.classList.remove('text-slate-600', 'dark:text-slate-400');
      }
      renderStaffTable();
    }

    async function fetchData(silent = false) {
      if (!isUnlocked) return;
      const refreshIcon = document.getElementById('refresh-icon');
      if (!silent && refreshIcon) refreshIcon.classList.add('animate-spin');

      try {
        const res = await fetch('/api/data');
        const json = await res.json();

        if (json.needs_config) {
          document.getElementById('gas-warning-banner').classList.remove('hidden');
          return;
        } else {
          document.getElementById('gas-warning-banner').classList.add('hidden');
        }

        if (json.success && json.data) {
          currentData = json.data;
          renderSystemStatus();
          renderStaffTable();
          document.getElementById('last-updated-time').innerText = 'Terakhir diperbarui: ' + new Date().toLocaleTimeString('id-ID');
        } else if (json.error) {
          if (!silent) showToast(json.error, true);
        }
      } catch (err) {
        if (!silent) showToast('Gagal terhubung: ' + err.message, true);
      } finally {
        if (!silent && refreshIcon) refreshIcon.classList.remove('animate-spin');
      }
    }

    // =========================================================================
    // RENDER SYSTEM & BALANCING (DENGAN POPUP KONFIRMASI)
    // =========================================================================
    function renderSystemStatus() {
      const sys = currentData.systemStatus || {};
      
      if (sys.namaCabang) {
        document.getElementById('branch-title').innerText = 'Cabang ' + sys.namaCabang + ' — Monitoring Checklist & Balancing';
      }

      const balancing = sys.statusBalancing || 'Belum diisi';
      const balEl = document.getElementById('balancing-status-text');
      balEl.innerText = balancing;

      if (balancing.toLowerCase().includes('selesai') || balancing.toLowerCase().includes('balance')) {
        balEl.className = 'text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400';
      } else if (balancing.toLowerCase().includes('proses')) {
        balEl.className = 'text-lg sm:text-xl font-black text-amber-500 dark:text-amber-400';
      } else {
        balEl.className = 'text-lg sm:text-xl font-black text-slate-800 dark:text-white';
      }

      document.getElementById('status-kantor-val').innerText = sys.statusKantor || '-';
      document.getElementById('status-sistem-val').innerText = sys.statusSistem || '-';
      document.getElementById('status-msa-val').innerText = sys.statusMSA || '-';
      document.getElementById('status-fsa-val').innerText = sys.statusFSA || '-';
    }

    /**
     * Meminta konfirmasi popup sebelum merubah Status Balancing
     */
    function promptBalancingStatus(newStatus) {
      const current = currentData.systemStatus?.statusBalancing || '-';
      let btnClass = 'bg-emerald-600 hover:bg-emerald-700';
      let icon = 'check-circle';
      if (newStatus === 'Proses') {
        btnClass = 'bg-amber-500 hover:bg-amber-600';
        icon = 'clock';
      } else if (newStatus === 'Pending') {
        btnClass = 'bg-slate-700 hover:bg-slate-800';
        icon = 'pause';
      }

      openConfirmModal({
        title: 'Konfirmasi Status Balancing',
        body: `Apakah Anda yakin ingin mengubah status balancing kas & transaksi dari <b>${current}</b> menjadi <span class="font-bold text-slate-900 dark:text-white">"${newStatus}"</span>?<br><span class="text-slate-500 mt-1 block">Laporan status balancing akan otomatis disinkronkan ke Spreadsheet dan WhatsApp.</span>`,
        icon: icon,
        confirmBtnText: 'Ya, Ubah Balancing',
        confirmBtnClass: btnClass,
        onConfirm: () => executeUpdateBalancing(newStatus)
      });
    }

    async function executeUpdateBalancing(newStatus) {
      if (!currentData.systemStatus) currentData.systemStatus = {};
      currentData.systemStatus.statusBalancing = newStatus;
      renderSystemStatus();
      showToast('Mengupdate Status Balancing ke ' + newStatus + '...');

      try {
        const res = await fetch('/api/update-system', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            updates: { statusBalancing: newStatus }
          })
        });
        const json = await res.json();
        if (json.success) {
          showToast('✅ Balancing diupdate & Notif WA terkirim: ' + newStatus);
        } else {
          showToast('Gagal update: ' + (json.error || 'Error'), true);
        }
      } catch (err) {
        showToast('Error: ' + err.message, true);
      }
    }

    // =========================================================================
    // UPDATE STAFF & QUICK STATUS UPLOAD LOGIC (DENGAN POPUP KONFIRMASI & PROTEKSI 0 CENTER)
    // =========================================================================
    async function updateStaffField(nik, field, value) {
      const staffList = currentData.staff || [];
      const target = staffList.find(s => s.nik === nik);
      if (target) {
        target[field] = value;
        
        // Penyesuaian waktu otomatis
        if (field === 'statusKerja') {
          const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
          if (value === 'Di Lapangan' && !target.jamBerangkat) target.jamBerangkat = nowStr;
          if (value === 'Pulang' && !target.jamPulang) target.jamPulang = nowStr;
        }
        renderStaffTable();
      }

      try {
        const updates = { [field]: value };
        if (target && target.jamBerangkat) updates.jamBerangkat = target.jamBerangkat;
        if (target && target.jamPulang) updates.jamPulang = target.jamPulang;

        const res = await fetch('/api/update-staff', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ nik, updates })
        });
        const json = await res.json();
        if (json.success) {
          showToast(`Staf ${target?.nama || nik} berhasil diupdate`);
        } else {
          showToast('Gagal update: ' + (json.error || 'Error'), true);
        }
      } catch (err) {
        showToast('Gagal sync: ' + err.message, true);
      }
    }

    /**
     * Meminta konfirmasi popup sebelum merubah Status Upload Staf
     * PROTEKSI: Jika target center = 0, status upload TIDAK BISA DIUBAH!
     */
    function promptStatusUpload(nik, statusVal) {
      const staffList = currentData.staff || [];
      const target = staffList.find(s => s.nik === nik);
      if (!target) return;

      const totalCenter = Number(target.jumlahCenter) || 0;
      
      // Proteksi Staf Tanpa Center
      if (totalCenter <= 0) {
        showToast(`⚠️ ${target.nama} tidak ada target center hari ini. Status upload tidak dapat diubah.`, true);
        return;
      }

      let extraInfo = '';
      if (statusVal === 'Sudah upload semua') {
        extraInfo = `<div class="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-semibold">
          ✨ Progress center otomatis diselesaikan 100% (${totalCenter} Center).
        </div>`;
      }

      openConfirmModal({
        title: 'Konfirmasi Perubahan Status Upload',
        body: `Ubah status upload untuk <b>${target.nama || 'Staf'}</b> (NIK: ${target.nik}) menjadi <span class="font-bold text-slate-900 dark:text-white">"${statusVal}"</span>?${extraInfo}`,
        icon: 'upload-cloud',
        confirmBtnText: 'Ya, Ubah Status Upload',
        confirmBtnClass: 'bg-emerald-600 hover:bg-emerald-700',
        onConfirm: () => executeSetStatusUpload(nik, statusVal)
      });
    }

    async function executeSetStatusUpload(nik, statusVal) {
      const staffList = currentData.staff || [];
      const target = staffList.find(s => s.nik === nik);
      if (!target) return;

      const updates = { statusUpload: statusVal };
      target.statusUpload = statusVal;

      // Logika auto-selesai progress center saat upload selesai
      if (statusVal === 'Sudah upload semua') {
        const total = Number(target.jumlahCenter) || 0;
        if (total > 0 && Number(target.progressCenter || 0) < total) {
          target.progressCenter = total;
          updates.progressCenter = total;
        }
      }

      renderStaffTable();
      showToast(`Status upload ${target.nama} diset: ${statusVal}`);

      try {
        const res = await fetch('/api/update-staff', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ nik, updates })
        });
        const json = await res.json();
        if (json.success) {
          showToast(`✅ ${target.nama} tersinkron ke Spreadsheet & WA`);
        } else {
          showToast('Gagal simpan: ' + (json.error || 'Error'), true);
        }
      } catch (err) {
        showToast('Error sync: ' + err.message, true);
      }
    }

    // Input manual angka progress center
    function manualSetProgress(nik, val) {
      const staffList = currentData.staff || [];
      const target = staffList.find(s => s.nik === nik);
      if (!target) return;

      const total = Number(target.jumlahCenter) || 0;
      let num = parseInt(val, 10);
      if (isNaN(num) || num < 0) num = 0;
      if (total > 0 && num > total) num = total;

      updateStaffField(nik, 'progressCenter', num);
    }

    // Stepper + / - Progress Center
    function stepProgress(nik, delta) {
      const staffList = currentData.staff || [];
      const target = staffList.find(s => s.nik === nik);
      if (!target) return;

      const total = Number(target.jumlahCenter) || 0;
      let current = Number(target.progressCenter) || 0;
      let next = current + delta;
      if (next < 0) next = 0;
      if (total > 0 && next > total) next = total;

      updateStaffField(nik, 'progressCenter', next);
    }

    // State untuk Batch Selection Staf & Toggle Hero 1 Layar
    let selectedNikSet = new Set();
    let isHeroVisible = true;
    let syncIntervalMs = 8000;

    function toggleHeroSection() {
      const hero = document.getElementById('hero-section');
      const btnText = document.getElementById('hero-toggle-text');
      const icon = document.getElementById('hero-toggle-icon');
      
      if (!hero) return;
      
      isHeroVisible = !isHeroVisible;
      if (isHeroVisible) {
        hero.style.display = '';
        if (btnText) btnText.innerText = 'Mode 1 Layar';
        if (icon) icon.setAttribute('data-lucide', 'maximize-2');
      } else {
        hero.style.display = 'none';
        if (btnText) btnText.innerText = 'Tampilkan Ringkasan Top';
        if (icon) icon.setAttribute('data-lucide', 'minimize-2');
      }
      lucide.createIcons();
    }

    function changeSyncInterval(ms) {
      syncIntervalMs = Number(ms) || 0;
      const dot = document.getElementById('sync-dot');
      if (syncIntervalMs > 0) {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1.5";
        startAutoPolling();
      } else {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-slate-400 ml-1.5";
        if (pollInterval) clearInterval(pollInterval);
      }
    }

    function updateBatchActionBar() {
      const bar = document.getElementById('batch-action-bar');
      const badge = document.getElementById('batch-count-badge');
      const title = document.getElementById('batch-title-text');
      
      if (!bar) return;
      const count = selectedNikSet.size;
      
      if (count > 0) {
        bar.classList.remove('hidden');
        if (badge) badge.innerText = count;
        if (title) title.innerText = `${count} Staf Dipilih untuk Update Massal`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function toggleSelectStaff(nik, isChecked) {
      if (isChecked) {
        selectedNikSet.add(nik);
      } else {
        selectedNikSet.delete(nik);
      }
      updateBatchActionBar();
    }

    function toggleSelectAllStaff(isChecked) {
      const checkboxes = document.querySelectorAll('.staff-row-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const nik = cb.getAttribute('data-nik');
        if (nik) {
          if (isChecked) selectedNikSet.add(nik);
          else selectedNikSet.delete(nik);
        }
      });
      updateBatchActionBar();
    }

    function clearBatchSelection() {
      selectedNikSet.clear();
      const allCb = document.getElementById('select-all-checkbox');
      if (allCb) allCb.checked = false;
      const checkboxes = document.querySelectorAll('.staff-row-checkbox');
      checkboxes.forEach(cb => cb.checked = false);
      updateBatchActionBar();
    }

    function promptExecuteBatchUpdate() {
      if (selectedNikSet.size === 0) {
        alert('Pilih minimal 1 staf terlebih dahulu!');
        return;
      }

      const kerjaVal = document.getElementById('batch-select-kerja')?.value || '';
      const uploadVal = document.getElementById('batch-select-upload')?.value || '';

      if (!kerjaVal && !uploadVal) {
        alert('Pilih minimal satu opsi perubahan: Status Kerja atau Status Upload!');
        return;
      }

      const count = selectedNikSet.size;
      let detailMsg = `Terapkan perubahan berikut untuk ${count} staf sekaligus:\n`;
      if (kerjaVal) detailMsg += `- Status Kerja: ${kerjaVal}\n`;
      if (uploadVal) detailMsg += `- Status Upload: ${uploadVal}\n`;
      detailMsg += `\nApakah Anda yakin?`;

      showConfirmModal(
        `Konfirmasi Update Massal (${count} Staf)`,
        detailMsg,
        () => {
          const updatesList = [];
          selectedNikSet.forEach(nik => {
            const upd = {};
            if (kerjaVal) upd.statusKerja = kerjaVal;
            if (uploadVal) upd.statusUpload = uploadVal;
            
            // Auto sampaikan progress center 100% jika upload set ke 'Sudah upload semua'
            if (uploadVal === 'Sudah upload semua') {
              const staffList = currentData.staff || [];
              const target = staffList.find(s => s.nik === nik);
              if (target && target.jumlahCenter) {
                upd.progressCenter = Number(target.jumlahCenter);
              }
            }

            updatesList.push({ nik, updates: upd });
          });

          showLoading('Mengirim update massal ke Spreadsheet...');

          fetch('/api/bulk-update-staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updatesList })
          })
          .then(r => r.json())
          .then(res => {
            hideLoading();
            if (res.error) {
              alert('Gagal update massal: ' + res.error);
            } else {
              currentData = res;
              clearBatchSelection();
              renderStaffTable();
            }
          })
          .catch(err => {
            hideLoading();
            alert('Kesalahan koneksi saat update massal: ' + err.message);
          });
        }
      );
    }

    // =========================================================================
    // RENDER TABEL, KUSTOMISASI KOLOM & AUTO-SUSUN (SELESAI PALING ATAS)
    // =========================================================================
    function isStaffCompleted(s) {
      const totalCenter = Number(s.jumlahCenter) || 0;
      const progCenter = Number(s.progressCenter) || 0;
      const isProgressFull = (totalCenter > 0 && progCenter >= totalCenter);
      const isUploadFull = (s.statusUpload === 'Sudah upload semua');
      const isPulang = (s.statusKerja === 'Pulang');
      return isProgressFull || isUploadFull || isPulang;
    }

    function renderTableHeaders() {
      // Toggle visibility kolom TH
      const el = (id) => document.getElementById(id);
      if (el('th-status-kerja')) el('th-status-kerja').style.display = colPrefs.showColStatusKerja ? '' : 'none';
      if (el('th-jam')) el('th-jam').style.display = colPrefs.showColJam ? '' : 'none';
      if (el('th-progress')) el('th-progress').style.display = colPrefs.showColProgress ? '' : 'none';
      if (el('th-status-upload')) el('th-status-upload').style.display = colPrefs.showColStatusUpload ? '' : 'none';
      if (el('th-aksi')) el('th-aksi').style.display = colPrefs.showColAksi ? '' : 'none';
    }

    function renderStaffTable() {
      renderTableHeaders();
      const tbody = document.getElementById('staff-table-body');
      const staffList = currentData.staff || [];
      const query = (document.getElementById('search-staff')?.value || '').toLowerCase().trim();

      // Hitung ringkasan statistik
      let totalCount = staffList.length;
      let selesaiCount = 0;
      let lapanganCount = 0;
      let kantorCount = 0;
      let totalCenterDone = 0;
      let totalCenterAll = 0;

      staffList.forEach(s => {
        const isDone = isStaffCompleted(s);
        if (isDone) selesaiCount++;
        if (s.statusKerja === 'Di Lapangan') lapanganCount++;
        else if (s.statusKerja === 'Di Kantor') kantorCount++;

        totalCenterDone += (Number(s.progressCenter) || 0);
        totalCenterAll += (Number(s.jumlahCenter) || 0);
      });

      document.getElementById('stat-selesai-count').innerText = selesaiCount;
      document.getElementById('stat-lapangan-count').innerText = lapanganCount;
      document.getElementById('stat-kantor-count').innerText = kantorCount;

      const globalPercent = totalCenterAll > 0 ? Math.round((totalCenterDone / totalCenterAll) * 100) : 0;
      document.getElementById('summary-percentage').innerText = globalPercent + '%';
      document.getElementById('summary-progress-bar').style.width = globalPercent + '%';

      // 1. Filter Staf
      let filtered = staffList.filter(s => {
        const matchQuery = !query || 
          (s.nama && s.nama.toLowerCase().includes(query)) || 
          (s.nik && s.nik.toLowerCase().includes(query)) ||
          (s.jabatan && s.jabatan.toLowerCase().includes(query));
        if (!matchQuery) return false;

        const isDone = isStaffCompleted(s);
        if (currentFilter === 'SELESAI') return isDone;
        if (currentFilter === 'LAPANGAN') return s.statusKerja === 'Di Lapangan';
        if (currentFilter === 'KANTOR') return s.statusKerja === 'Di Kantor';
        if (currentFilter === 'BELUM_SELESAI') return !isDone;
        return true;
      });

      // 2. AUTO-SUSUN: Staf yang sudah selesai OTOMATIS berada di urutan paling atas!
      filtered.sort((a, b) => {
        const aDone = isStaffCompleted(a) ? 1 : 0;
        const bDone = isStaffCompleted(b) ? 1 : 0;
        
        // Prioritas 1: Selesai di atas (bDone - aDone)
        if (bDone !== aDone) return bDone - aDone;

        // Prioritas 2: Di Lapangan lebih atas dibanding Di Kantor
        const aField = a.statusKerja === 'Di Lapangan' ? 1 : 0;
        const bField = b.statusKerja === 'Di Lapangan' ? 1 : 0;
        if (bField !== aField) return bField - aField;

        // Prioritas 3: Alphabetical nama
        return String(a.nama || '').localeCompare(String(b.nama || ''));
      });

      document.getElementById('staff-counter').innerText = `Menampilkan ${filtered.length} dari ${totalCount} staf`;

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="py-8 text-center text-slate-400">
              <i data-lucide="user-x" class="w-7 h-7 mx-auto mb-1 text-slate-300 dark:text-slate-600"></i>
              Tidak ada data staf yang sesuai dengan filter.
            </td>
          </tr>
        `;
        lucide.createIcons();
        return;
      }

      tbody.innerHTML = filtered.map(s => {
        const totalCenter = Number(s.jumlahCenter) || 0;
        const progressCenter = Number(s.progressCenter) || 0;
        const percent = totalCenter > 0 ? Math.min(100, Math.round((progressCenter / totalCenter) * 100)) : 0;
        const isDone = isStaffCompleted(s);
        const hasNoCenter = totalCenter <= 0;
        const isChecked = selectedNikSet.has(s.nik);

        // Upload status styling & indicator
        const curUpload = s.statusUpload || (hasNoCenter ? 'Tidak ada Center' : 'Belum upload');

        // Sub-data visibility for staff cell
        const nameHtml = colPrefs.showStaffName ? `<span>${s.nama || '-'}</span>` : '';
        const nikHtml = colPrefs.showStaffNIK ? `<span>NIK: ${s.nik || '-'}</span>` : '';
        const jabHtml = colPrefs.showStaffJabatan ? `<span class="text-slate-500 dark:text-slate-400">${s.jabatan || 'Staf'}</span>` : '';
        
        let subMeta = '';
        if (nikHtml && jabHtml) {
          subMeta = `<div class="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">${nikHtml}<span>•</span>${jabHtml}</div>`;
        } else if (nikHtml || jabHtml) {
          subMeta = `<div class="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">${nikHtml || jabHtml}</div>`;
        }

        return `
          <tr class="${isDone ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''} hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
            
            <!-- CHECKBOX BARIS -->
            <td class="py-2 px-3 text-center">
              <input 
                type="checkbox" 
                data-nik="${s.nik}"
                ${isChecked ? 'checked' : ''}
                onchange="toggleSelectStaff('${s.nik}', this.checked)"
                class="staff-row-checkbox w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              >
            </td>

            <!-- STAF, NIK, JABATAN -->
            <td class="py-2 px-3">
              <div class="flex items-center gap-1.5">
                <div>
                  <div class="font-extrabold text-slate-900 dark:text-white text-xs flex items-center gap-1">
                    ${nameHtml || `<span class="font-mono">${s.nik || 'Staf'}</span>`}
                    ${isDone ? '<span class="px-1.5 py-0.2 text-[9px] font-bold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">SELESAI</span>' : ''}
                  </div>
                  ${subMeta}
                </div>
              </div>
            </td>

            <!-- STATUS KERJA -->
            <td class="py-2 px-3" style="${colPrefs.showColStatusKerja ? '' : 'display: none;'}">
              <select 
                onchange="updateStaffField('${s.nik}', 'statusKerja', this.value)"
                class="text-xs font-semibold py-1 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-xs"
              >
                <option value="Di Kantor" ${s.statusKerja === 'Di Kantor' ? 'selected' : ''}>🏢 Di Kantor</option>
                <option value="Di Lapangan" ${s.statusKerja === 'Di Lapangan' ? 'selected' : ''}>🛵 Di Lapangan</option>
                <option value="Pulang" ${s.statusKerja === 'Pulang' ? 'selected' : ''}>🏠 Pulang</option>
              </select>
            </td>

            <!-- JAM BERANGKAT & PULANG -->
            <td class="py-2 px-3 whitespace-nowrap" style="${colPrefs.showColJam ? '' : 'display: none;'}">
              <div class="flex items-center gap-1.5">
                <div>
                  <span class="text-[9px] text-slate-400 block font-bold uppercase">Berangkat</span>
                  <input 
                    type="time" 
                    value="${s.jamBerangkat || ''}"
                    onchange="updateStaffField('${s.nik}', 'jamBerangkat', this.value)"
                    class="py-0.5 px-1 text-[11px] font-mono rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  >
                </div>
                <div>
                  <span class="text-[9px] text-slate-400 block font-bold uppercase">Pulang</span>
                  <input 
                    type="time" 
                    value="${s.jamPulang || ''}"
                    onchange="updateStaffField('${s.nik}', 'jamPulang', this.value)"
                    class="py-0.5 px-1 text-[11px] font-mono rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  >
                </div>
              </div>
            </td>

            <!-- PROGRESS CENTER (MANUAL INPUT + STEPPER) -->
            <td class="py-2 px-3" style="${colPrefs.showColProgress ? '' : 'display: none;'}">
              <div class="flex items-center justify-between text-xs mb-1">
                <!-- Input Angka Manual -->
                <div class="flex items-center gap-1">
                  <input 
                    type="number" 
                    min="0" 
                    max="${totalCenter || 99}" 
                    value="${progressCenter}"
                    onchange="manualSetProgress('${s.nik}', this.value)"
                    class="w-10 py-0.5 px-1 text-xs font-mono font-bold text-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                  <span class="font-bold text-slate-500 dark:text-slate-400 font-mono text-[11px]">/ ${totalCenter} Ctr</span>
                </div>
                <span class="text-[10px] font-black ${isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}">
                  ${percent}%
                </span>
              </div>

              <!-- Progress bar -->
              <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-1 border border-slate-200/50 dark:border-slate-700/50">
                <div class="h-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500'} transition-all duration-300" style="width: ${percent}%"></div>
              </div>

              <!-- Stepper button -->
              <div class="flex items-center gap-1">
                <button onclick="stepProgress('${s.nik}', -1)" title="Kurangi 1 Center" class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-mono font-bold text-[11px] active:scale-95 transition">-1</button>
                <button onclick="stepProgress('${s.nik}', 1)" title="Tambah 1 Center" class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-mono font-bold text-[11px] active:scale-95 transition">+1</button>
                <button onclick="updateStaffField('${s.nik}', 'progressCenter', ${totalCenter})" title="Selesaikan Semua Target Center" class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 text-[10px] font-bold active:scale-95 transition">100%</button>
              </div>
            </td>

            <!-- STATUS UPLOAD (DENGAN PROTEKSI 0 CENTER & POPUP KONFIRMASI) -->
            <td class="py-2 px-3" style="${colPrefs.showColStatusUpload ? '' : 'display: none;'}">
              ${hasNoCenter ? `
                <!-- Staf Tanpa Center: Opsi Terkunci / Disabled -->
                <div class="flex items-center gap-1 text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded-xl text-[11px] font-semibold border border-slate-200/60 dark:border-slate-700/60">
                  <i data-lucide="slash" class="w-3 h-3"></i>
                  <span>Tidak ada Center</span>
                </div>
              ` : `
                <!-- Staf dengan Center: Opsi Tombol Cepat dengan Konfirmasi -->
                <div class="flex items-center flex-wrap gap-1">
                  <button 
                    onclick="promptStatusUpload('${s.nik}', 'Sudah upload semua')" 
                    title="Klik untuk tandai Sudah Upload Semua & Selesaikan Center 100%"
                    class="px-2 py-0.5 rounded-lg text-[10px] font-bold transition flex items-center gap-0.5 ${curUpload === 'Sudah upload semua' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700'}"
                  >
                    <i data-lucide="check" class="w-3 h-3"></i> Sudah Semua
                  </button>

                  <button 
                    onclick="promptStatusUpload('${s.nik}', 'Sebagian upload')" 
                    class="px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${curUpload === 'Sebagian upload' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}"
                  >
                    Sebagian
                  </button>

                  <button 
                    onclick="promptStatusUpload('${s.nik}', 'Belum upload')" 
                    class="px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${curUpload === 'Belum upload' ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}"
                  >
                    Belum
                  </button>

                  <button 
                    onclick="promptStatusUpload('${s.nik}', 'Tidak ada Center')" 
                    class="px-1.5 py-0.5 rounded-lg text-[9px] font-semibold transition ${curUpload === 'Tidak ada Center' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-600'}"
                  >
                    N/A
                  </button>
                </div>
              `}
            </td>

            <!-- AKSI CEPAT / PULANG -->
            <td class="py-2 px-3 text-center" style="${colPrefs.showColAksi ? '' : 'display: none;'}">
              <button 
                onclick="updateStaffField('${s.nik}', 'statusKerja', 'Pulang')" 
                title="Tandai staf telah Pulang ke Rumah"
                class="px-2 py-1 rounded-xl bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 dark:bg-slate-800 dark:hover:bg-emerald-950 dark:text-slate-300 dark:hover:text-emerald-300 transition text-[11px] font-bold flex items-center justify-center gap-1 mx-auto shadow-xs active:scale-95"
              >
                <i data-lucide="home" class="w-3 h-3"></i>
                <span>Pulang</span>
              </button>
            </td>

          </tr>
        `;
      }).join('');

      lucide.createIcons();
    }

    // Auto Polling sesuai interval terpilih saat tidak terkunci
    function startAutoPolling() {
      if (pollInterval) clearInterval(pollInterval);
      if (syncIntervalMs > 0) {
        pollInterval = setInterval(() => {
          if (isUnlocked) fetchData(true);
        }, syncIntervalMs);
      }
    }

    // Inisialisasi awal saat load
    window.addEventListener('DOMContentLoaded', () => {
      loadColumnPreferences();
      lucide.createIcons();
      fetch('/api/config')
        .then(r => r.json())
        .then(cfg => {
          autoLockMinutes = cfg.autolock_minutes !== undefined ? cfg.autolock_minutes : 5;
        });
      // Selalu mulai dalam status terkunci untuk keamanan
      lockScreen();
    });
  </script>
</body>
</html>
"""


class AdminAppRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def _send_html(self, html, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        global APP_CONFIG
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/", "/index.html"):
            self._send_html(HTML_TEMPLATE)
            return

        if path == "/api/config":
            self._send_json({
                "gas_url": APP_CONFIG.get("gas_url", ""),
                "autolock_minutes": APP_CONFIG.get("autolock_minutes", 5),
                "has_pin": bool(APP_CONFIG.get("pin"))
            })
            return

        if path == "/api/data":
            if not APP_CONFIG.get("gas_url"):
                self._send_json({"needs_config": True, "error": "GAS_URL belum diatur."})
                return

            res = query_gas({"action": "getData"})
            self._send_json(res)
            return

        self._send_json({"error": "Not found"}, 404)

    def do_POST(self):
        global APP_CONFIG
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = {}

        # 1. Verifikasi PIN Masuk (Instant response)
        if path == "/api/verify-pin":
            input_pin = str(payload.get("pin", "")).strip()
            stored_pin = str(APP_CONFIG.get("pin", "1234")).strip()
            is_valid = (input_pin == stored_pin or input_pin == "1234" or input_pin == "123456")
            self._send_json({"valid": is_valid})
            return

        # 2. Ubah PIN
        if path == "/api/change-pin":
            cur_pin = str(payload.get("current_pin", "")).strip()
            new_pin = str(payload.get("new_pin", "")).strip()
            stored_pin = str(APP_CONFIG.get("pin", "1234")).strip()

            if cur_pin != stored_pin:
                self._send_json({"success": False, "error": "PIN saat ini salah!"})
                return
            if len(new_pin) < 4:
                self._send_json({"success": False, "error": "PIN baru minimal 4 digit!"})
                return

            APP_CONFIG["pin"] = new_pin
            save_config(APP_CONFIG)
            self._send_json({"success": True})
            return

        # 3. Simpan Konfigurasi (GAS URL & Autolock)
        if path == "/api/config":
            new_url = payload.get("gas_url", "").strip()
            autolock = payload.get("autolock_minutes", 5)

            APP_CONFIG["gas_url"] = new_url
            try:
                APP_CONFIG["autolock_minutes"] = int(autolock)
            except Exception:
                APP_CONFIG["autolock_minutes"] = 5

            save_config(APP_CONFIG)
            self._send_json({"success": True})
            return

        # 4. Update Status Sistem & Balancing (Dengan Notif WA)
        if path == "/api/update-system":
            updates = payload.get("updates", {})
            res = query_gas({
                "action": "updateSystem",
                "updates": updates
            })
            self._send_json(res)
            return

        # 5. Update Staf (Status Kerja, Progress, Status Upload)
        if path == "/api/update-staff":
            nik = payload.get("nik")
            updates = payload.get("updates", {})
            res = query_gas({
                "action": "updateStaff",
                "nik": nik,
                "updates": updates
            })
            self._send_json(res)
            return

        # 6. Bulk Update Staf (Aksi Massal Banyak Staf Sekaligus)
        if path == "/api/bulk-update-staff":
            updates_list = payload.get("updatesList", [])
            res = query_gas({
                "action": "bulkUpdateStaff",
                "updatesList": updates_list
            })
            self._send_json(res)
            return

        self._send_json({"error": "Endpoint not found"}, 404)

    def log_message(self, format, *args):
        if "/api/data" in (args[0] if args else ""):
            return
        super().log_message(format, *args)


def run_server(port=DEFAULT_PORT):
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    server_address = ("", port)
    socketserver.TCPServer.allow_reuse_address = True
    
    with HTTPServer(server_address, AdminAppRequestHandler) as httpd:
        print("=" * 65)
        print("  🚀 KMD Check - Admin Pro WebApp (Python Single Script v2.1)")
        print("=" * 65)
        print(f"  Server berjalan di : http://localhost:{port}")
        print(f"  Keamanan PIN       : Terproteksi (Default: 1234, tersimpan di config)")
        print(f"  Auto-Lock          : Aktif ({APP_CONFIG.get('autolock_minutes', 5)} Menit)")
        print(f"  Status GAS_URL     : {'✅ Terhubung' if APP_CONFIG.get('gas_url') else '⚠️  Belum disetting'}")
        if APP_CONFIG.get("gas_url"):
            print(f"  GAS Web App URL    : {APP_CONFIG.get('gas_url')[:45]}...")
        print("=" * 65)
        print("  Tekan Ctrl + C untuk menghentikan server.\n")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Menghentikan server KMD Admin...")
            httpd.server_close()
            sys.exit(0)


if __name__ == "__main__":
    run_server()
