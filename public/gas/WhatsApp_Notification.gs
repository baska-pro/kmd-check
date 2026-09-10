/**
 * +------------------------------------------------------------------+
 *  GAS — UNIFIED NOTIFICATION ENGINE v6.5 (WHATSAPP + TELEGRAM)
 *  KMD Check | Koperasi Mitra Dhuafa - Cabang Cibeunying
 * ¦------------------------------------------------------------------¦
 *
 *  FITUR UTAMA:
 *  ------------------------------------------------------------------
 *  1. NOTIFIKASI GANDA: WhatsApp (Wuzapi + Fonnte) & Telegram Bot.
 *  2. DEBOUNCE & BATCHING: Jeda 8 detik otomatis sejak perubahan terakhir
 *     (baik dari Web App maupun EDIT MANUAL langsung di Google Sheet),
 *     merangkum semua baris/kolom yang diedit menjadi 1 pesan ringkas.
 *  3. REAL-TIME MANUAL EDIT TRIGGER: Otomatis menangkap editan staf
 *     (progress, jam berangkat/pulang, status kerja, status upload, target)
 *     dan SystemStatus (kantor, sistem, MSA, FSA, Manager, balancing, pengumuman).
 *  4. UPDATE-ONLY MODE: Laporan terjadwal pagi/siang/sore/closing tidak dibuat.
 *     Hanya perubahan data, event selesai/balancing, pengumuman, dan reset yang dikirim.
 *  5. AUTO RESET 1 HARI SEKALI: Terkunci rapat dengan proteksi ganda
 *     (Script Properties + SystemStatus sheet) sehingga dipastikan
 *     hanya tereksekusi 1 kali per hari, tidak pernah berulang.
 *  6. MENU SPREADSHEET (onOpen): Menu kustom di Google Sheet untuk
 *     aktivasi trigger 1-klik, tes kirim WhatsApp, tes Telegram, dan cek status.
 *  7. SMART PROGRESS LIFECYCLE: progress WhatsApp memakai edit-first; jika edit
 *     sudah tidak tersedia, kirim progress baru lalu hapus progress lama.
 *  8. CLEANUP & IDEMPOTENCY: hash progress, anti-duplikat lintas trigger,
 *     dan antrean cleanup ID lama menjaga chat tetap bersih.
 *
 *  SETUP SCRIPT PROPERTIES (Settings ? ? Script Properties) [Opsional]:
 *  ------------------------------------------------------------------
 *  WUZAPI_TOKEN         = baska_id
 *  WUZAPI_API_URL       = https://wa.lathifbaska.web.id
 *  WUZAPI_DEST_GROUPS   = 120363421876236225@g.us   (pisah koma jika >1)
 *  WUZAPI_DEST_PERSONAL = 6285117207414@s.whatsapp.net
 * *  FONNTE_TOKEN         = (token Fonnte — fallback otomatis jika Wuzapi gagal)
 *  FONNTE_TARGETS       = 6285117207414  (no HP pisah koma, tanpa +/-)
 *  TELEGRAM_BOT_TOKEN   = (token bot Telegram dari @BotFather)
 *  TELEGRAM_CHAT_ID     = (chat ID Telegram, pisah koma jika >1)
 *  DB_ID                = (opsional — ID spreadsheet jika bukan active sheet)
 *
 *  CARA AKTIFKAN TRIGGER OTOMATIS:
 *  ------------------------------------------------------------------
 *  1. Pastikan Time Zone Project = Asia/Jakarta (GMT+7).
 *  2. Buka Google Sheet ? Klik menu "\u25AA\uFE0F KMD System & Notifikasi" ?
 *     "\u25AA\uFE0F Sinkronkan Trigger Update-Only" (atau jalankan `setupRequiredTriggers`).
 * +------------------------------------------------------------------+
 */


// -------------------------------------------------------------------
//  A — KONFIGURASI GLOBAL
// -------------------------------------------------------------------

var WA_CFG = {
  // Kredensial fallback (override via Script Properties)
  TOKEN            : "baska_id",
  API_URL          : "https://wuz.lathifbaska.web.id",
  DEFAULT_GROUPS   : "120363145599759777@g.us",
  DEFAULT_PERSONAL : "",

  // Kredensial fallback Telegram (bisa di-override via Script Properties / SystemStatus)
  DEFAULT_TG_TOKEN : "",
  DEFAULT_TG_CHATS : "",

  // -- Debounce & Batching ------------------------------------------
  DEBOUNCE_DELAY_MS: 8000,   // Tunggu 8 detik sejak perubahan TERAKHIR agar edit beruntun tergabung

  // -- Anti-Spam & Rate Limiting ------------------------------------
  RATE_GAP_MS      : 500,    // Jeda minimum antar pesan (ms)
  MAX_PER_HOUR     : 500,    // Batas pesan per jam
  TYPING_DELAY_MS  : 400,    // Durasi typing indicator per tujuan (ms)
  DEST_GAP_MS      : 600,    // Jeda antar tujuan dalam satu pengiriman (ms)
  DEDUP_SECS       : 30,     // Anti-duplikat lintas trigger untuk pesan non-progress
  PROGRESS_EDIT_MAX_MS : 14 * 60 * 1000, // Safety window edit < 15 menit
  PROGRESS_BAR_SLOTS   : 10,               // Blok progress bar di baris pertama
  PROGRESS_HISTORY_MAX : 5,                // Maksimal ID lama yang ditahan untuk cleanup
  PROGRESS_EDIT_RETRIES: 2,                // Retry edit aman: pesan yang sama, body yang sama

  // -- Waktu Aktif (WIB = GMT+7) -----------------------------------
  QUIET_START      : 23,     // Diam mulai 23:00 WIB
  QUIET_END        : 5,      // Aktif kembali 05:00 WIB
  SEND_ON_WEEKEND  : true,   // Kirim saat weekend (agar operasional/tes tidak terblokir)
  UPDATES_ONLY     : true,   // Mode produksi: hanya notif karena perubahan data; laporan berkala dinonaktifkan
  UPDATE_ALLOW_QUIET: true,  // Update penting tetap dikirim walau terjadi pada jam tenang

  // -- Routing WhatsApp per jenis notifikasi -------------------------
  ROUTES : {
    PROGRESS_FLUSH  : "GROUP",
    ALL_DONE        : "ALL",
    PROGRESS_REPORT : "ALL",
    STATUS_CHANGE   : "GROUP",
    SISTEM_CHANGE   : "GROUP",
    TARGET_CHANGE   : "GROUP",
    BERANGKAT       : "GROUP",
    PULANG          : "GROUP",
    UPLOAD_DONE     : "GROUP",
    BALANCING_DONE  : "ALL",
    ANNOUNCEMENT    : "ALL",
    DAILY_OPENING   : "GROUP",
    MIDDAY_REPORT   : "ALL",
    MISSED_ALERT    : "ALL",
    DAILY_CLOSING   : "ALL",
    SYSTEM_RESET    : "ALL"
  },

  // URL web app untuk footer pesan
  WEB_URL : "https://kmd-check.pages.dev/"
};

// Konfigurasi Bot WhatsApp (Webhook)
var WA_BOT = {
  ENABLED         : true,
  PREFIX          : "/",
  CMD_COOLDOWN_S  : 15,
  ALLOWED_SENDERS : [],    // Kosong = semua anggota grup boleh
  GROUP_ONLY      : true,
  SHEET_STATUS    : "SystemStatus",
  SHEET_PROFILE   : "CompanyProfile",
  SHEET_ACTIVITY  : "ActivityLog"
};


// -------------------------------------------------------------------
//  B — SPREADSHEET CUSTOM MENU (onOpen)
// -------------------------------------------------------------------

/**
 * Menu otomatis muncul di Google Sheet saat spreadsheet dibuka
 */
function onOpen(e) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu("\u25AA\uFE0F KMD System & Notifikasi")
      .addItem("\u25AA\uFE0F Sinkronkan Trigger Update-Only (Wajib Sekali)", "setupRequiredTriggers")
      .addSeparator()
      .addItem("\u25AA\uFE0F Tes Kirim WhatsApp (Semua Tujuan)", "testSendWhatsApp")
      .addItem("\u25AA\uFE0F Tes Kirim Telegram (Bot)", "testSendTelegram")
      .addSeparator()
      .addItem("\u25AA\uFE0F Reset Rate Limit & Antrean", "waResetRateLimits")
      .addItem("\u25AA\uFE0F Cek Status Konfigurasi & Trigger", "waCheckStatus")
      .addToUi();
  } catch (err) {
    Logger.log("onOpen UI skip (non-UI context): " + err);
  }
}


// -------------------------------------------------------------------
//  C — CONFIG LOADERS (WHATSAPP & TELEGRAM)
// -------------------------------------------------------------------

function _waCfg() {
  var p   = PropertiesService.getScriptProperties().getProperties();
  var sys = _waReadKV("SystemStatus");

  var tok = p["WUZAPI_TOKEN"] || sys["wuzapiToken"] || WA_CFG.TOKEN;
  var url = (p["WUZAPI_API_URL"] || sys["wuzapiApiUrl"] || WA_CFG.API_URL).replace(/\/+$/, "");
  var gs  = p["WUZAPI_DEST_GROUPS"] || sys["wuzapiDestGroups"] || WA_CFG.DEFAULT_GROUPS;
  var ps  = p["WUZAPI_DEST_PERSONAL"] || sys["wuzapiDestPersonal"] || WA_CFG.DEFAULT_PERSONAL;
  return {
    token        : tok,
    apiUrl       : url,
    groups       : gs.split(",").map(function(s){ return _waFmtJid(s.trim(), false); }).filter(Boolean),
    personal     : ps ? ps.split(",").map(function(s){ return _waFmtJid(s.trim(), true); }).filter(Boolean) : [],
    fonnteToken  : p["FONNTE_TOKEN"] || sys["fonnteToken"] || "",
    fonnteTargets: (p["FONNTE_TARGETS"] || sys["fonnteTargets"] || "").split(",").map(function(s){ return s.trim(); }).filter(Boolean)
  };
}

function _tgCfg() {
  var p   = PropertiesService.getScriptProperties().getProperties();
  var sys = _waReadKV("SystemStatus");

  var tok = p["TELEGRAM_BOT_TOKEN"] || sys["telegramBotToken"] || WA_CFG.DEFAULT_TG_TOKEN || "";
  var cid = p["TELEGRAM_CHAT_ID"] || sys["telegramChatId"] || WA_CFG.DEFAULT_TG_CHATS || "";

  // Auto delete notifikasi Telegram: default 30 detik (atau sesuai pengaturan di SystemStatus)
  var delRaw = sys["telegramAutoDelete"];
  var del = (delRaw !== undefined && String(delRaw).trim() !== "") ? Number(delRaw) : 30;
  if (!isFinite(del) || del < 0) del = 30;

  // Auto delete progress Telegram: default 60 detik (atau sesuai pengaturan di SystemStatus)
  var pDelRaw = sys["telegramProgressAutoDelete"];
  var pDel = (pDelRaw !== undefined && String(pDelRaw).trim() !== "") ? Number(pDelRaw) : 60;
  if (!isFinite(pDel) || pDel < 0) pDel = 60;

  var chatIds = String(cid).split(",").map(function(s){ return s.trim(); }).filter(Boolean);
  chatIds = _waUniqueStrings(chatIds);

  return {
    botToken          : tok.trim(),
    chatIds           : chatIds,
    autoDelete        : del,
    progressAutoDelete: pDel
  };
}

function _waFmtJid(jid, isPersonal) {
  jid = String(jid || "").trim().replace(/\s+/g, "");
  if (!jid) return null;
  if (jid.indexOf("@") !== -1) return jid;
  return isPersonal ? (jid + "@s.whatsapp.net") : (jid + "@g.us");
}

function _waUniqueStrings(arr) {
  var seen = {};
  return (arr || []).filter(function(v) {
    v = String(v || "").trim();
    if (!v || seen[v]) return false;
    seen[v] = true;
    return true;
  });
}

function _waGetDests(cfg, route) {
  switch (String(route || "GROUP").toUpperCase()) {
    case "ALL":      return _waUniqueStrings(cfg.groups.concat(cfg.personal));
    case "PERSONAL": return _waUniqueStrings(cfg.personal);
    default:         return _waUniqueStrings(cfg.groups);
  }
}


// -------------------------------------------------------------------
//  D — TIME & RATE LIMIT MANAGEMENT
// -------------------------------------------------------------------

function _waIsQuiet() {
  var h = parseInt(Utilities.formatDate(new Date(), "GMT+7", "H"), 10);
  return (h >= WA_CFG.QUIET_START || h < WA_CFG.QUIET_END);
}
function _waIsWeekend() {
  var d = parseInt(Utilities.formatDate(new Date(), "GMT+7", "u"), 10);
  return (d === 6 || d === 7);
}
function _waIsTimeBlocked() {
  return _waIsQuiet() || (!WA_CFG.SEND_ON_WEEKEND && _waIsWeekend());
}

function _waHash(s) {
  s = String(s).substring(0, 200);
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (((h << 5) - h) + s.charCodeAt(i)) | 0;
  return String(h);
}

function _waCanSend(txt, force, allowQuiet) {
  if (force) return true;
  if (!allowQuiet && _waIsQuiet()) { Logger.log("WA[SKIP] Jam tenang."); return false; }
  if (!WA_CFG.SEND_ON_WEEKEND && _waIsWeekend()) { Logger.log("WA[SKIP] Weekend."); return false; }

  var p    = PropertiesService.getScriptProperties();
  var now  = Date.now();
  var last = parseInt(p.getProperty("WA_LAST_MS") || "0", 10);
  if (now - last < WA_CFG.RATE_GAP_MS) { Logger.log("WA[SKIP] Terlalu cepat."); return false; }

  var hk   = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMddHH");
  var sk   = p.getProperty("WA_HOUR_KEY") || "";
  var cnt  = (sk === hk) ? parseInt(p.getProperty("WA_HOUR_CNT") || "0", 10) : 0;
  if (cnt >= WA_CFG.MAX_PER_HOUR) { Logger.log("WA[SKIP] Batas jam tercapai."); return false; }

  var hash = _waHash(txt);
  var dts  = parseInt(p.getProperty("WA_DEDUP_TS") || "0", 10);
  if (p.getProperty("WA_DEDUP_HASH") === hash && (now - dts) < WA_CFG.DEDUP_SECS * 1000) {
    Logger.log("WA[SKIP] Duplikasi pesan dalam jeda " + WA_CFG.DEDUP_SECS + "s.");
    return false;
  }
  return true;
}

function _waRecordSend(txt) {
  var p   = PropertiesService.getScriptProperties();
  var now = Date.now();
  var hk  = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMddHH");
  var sk  = p.getProperty("WA_HOUR_KEY") || "";
  var cnt = (sk === hk) ? parseInt(p.getProperty("WA_HOUR_CNT") || "0", 10) : 0;
  p.setProperties({
    "WA_LAST_MS"    : String(now),
    "WA_HOUR_KEY"   : hk,
    "WA_HOUR_CNT"   : String(cnt + 1),
    "WA_DEDUP_HASH" : _waHash(txt),
    "WA_DEDUP_TS"   : String(now)
  });
}

function _waReservationKey(route) {
  return "WA_SEND_RES_" + _waHash(String(route || "GROUP").toUpperCase());
}

/**
 * Reservasi atomik untuk mencegah dua eksekusi/trigger mengirim isi yang sama
 * pada tujuan yang sama dalam jendela 30 detik.
 */
function _waReserveMessage(text, route) {
  var props = PropertiesService.getScriptProperties();
  var key = _waReservationKey(route);
  var sig = _waHash(String(route || "GROUP") + "|" + String(text || ""));
  var now = Date.now();
  var lock = LockService.getScriptLock();

  try {
    if (!lock.tryLock(5000)) return {allowed:false, busy:true, key:key, sig:sig};
    var old = {};
    try { old = JSON.parse(props.getProperty(key) || "{}"); } catch(e0) { old = {}; }
    if (old.sig === sig && (now - Number(old.ts || 0)) < 30000) {
      Logger.log("WA[DEDUP RESERVATION] route=" + route);
      return {allowed:false, duplicate:true, key:key, sig:sig};
    }
    props.setProperty(key, JSON.stringify({sig:sig, ts:now}));
    return {allowed:true, key:key, sig:sig};
  } finally {
    try { lock.releaseLock(); } catch(e1) {}
  }
}

function _waReleaseReservation(resv) {
  if (!resv || !resv.key || !resv.sig) return;
  var props = PropertiesService.getScriptProperties();
  try {
    var cur = JSON.parse(props.getProperty(resv.key) || "{}");
    if (cur.sig === resv.sig) props.deleteProperty(resv.key);
  } catch(e) {}
}


// -------------------------------------------------------------------
//  E — WHATSAPP TRANSMISSION (WUZAPI + FONNTE FAILOVER)
// -------------------------------------------------------------------

function _waTypingTo(cfg, jid) {
  try {
    UrlFetchApp.fetch(cfg.apiUrl + "/user/presence", {
      method: "post", contentType: "application/json",
      headers: {"Token": cfg.token},
      payload: JSON.stringify({"Phone": jid, "Presence": "composing"}),
      muteHttpExceptions: true
    });
  } catch(e) {}
  Utilities.sleep(WA_CFG.TYPING_DELAY_MS);
}

function _waSendViaWuzapi(cfg, jid, text) {
  _waTypingTo(cfg, jid);
  var msgId = ("KMD" + Utilities.getUuid().replace(/-/g, "")).substring(0, 28).toUpperCase();
  try {
    // Satu request per event. Tidak melakukan retry send ambigu agar timeout jaringan
    // tidak berpotensi menggandakan pesan yang sebenarnya sudah diterima WhatsApp.
    var res = UrlFetchApp.fetch(cfg.apiUrl + "/chat/send/text", {
      method: "post", contentType: "application/json",
      headers: {"Token": cfg.token},
      payload: JSON.stringify({"Phone": jid, "Body": text, "Id": msgId}),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText() || "";
    if (code >= 200 && code < 300) {
      try {
        var parsed = JSON.parse(body);
        if (parsed && parsed.success === false) {
          Logger.log("Wuzapi[REJECT] → " + jid + " " + body);
          return false;
        }
      } catch(e0) {}
      Logger.log("Wuzapi[OK] → " + jid + " id=" + msgId);
      return true;
    }
    Logger.log("Wuzapi[ERR] → " + jid + " [" + code + "] " + body);
  } catch(e) {
    Logger.log("Wuzapi[EXC] → " + jid + ": " + e);
  }
  return false;
}

function _waFonnteFallback(text) {
  var cfg = _waCfg();
  if (!cfg.fonnteToken || !cfg.fonnteTargets.length) {
    Logger.log("Fonnte: token/target tidak tersedia.");
    return false;
  }
  var sent = false;
  cfg.fonnteTargets.forEach(function(target, i) {
    if (i > 0) Utilities.sleep(1500);
    try {
      var res = UrlFetchApp.fetch("https://api.fonnte.com/send", {
        method: "post", contentType: "application/json",
        headers: {"Authorization": cfg.fonnteToken},
        payload: JSON.stringify({"target": target, "message": text, "countryCode": "62"}),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        Logger.log("Fonnte[OK] • " + target);
        sent = true;
      } else {
        Logger.log("Fonnte[ERR] • " + target + " [" + code + "]");
      }
    } catch(e) {
      Logger.log("Fonnte[EXC] • " + target + ": " + e);
    }
  });
  return sent;
}


function _waProgressStateKey(prefix, jid) {
  return prefix + "_" + _waHash(String(jid || ""));
}

function _waMakeProgressMessageId() {
  return ("KMDP" + Utilities.getUuid().replace(/-/g, "")).substring(0, 28).toUpperCase();
}

function _waProgressSemanticHash(text) {
  // Timestamp tampilan tidak dianggap perubahan isi progress.
  var normalized = String(text || "")
    .replace(/^_[^\n]*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s+WIB_$/gm, "_TIMESTAMP_")
    .replace(/[ \t]+$/gm, "")
    .trim();
  return _waHash(normalized);
}

function _waReadProgressHistory(props, jid) {
  props = props || PropertiesService.getScriptProperties();
  var key = _waProgressStateKey("WA_PROGRESS_HISTORY", jid);
  try {
    var arr = JSON.parse(props.getProperty(key) || "[]");
    if (!Array.isArray(arr)) return [];
    return _waUniqueStrings(arr.map(String)).slice(-WA_CFG.PROGRESS_HISTORY_MAX);
  } catch(e) {
    return [];
  }
}

function _waWriteProgressHistory(props, jid, arr) {
  props = props || PropertiesService.getScriptProperties();
  var key = _waProgressStateKey("WA_PROGRESS_HISTORY", jid);
  arr = _waUniqueStrings((arr || []).map(String)).slice(-WA_CFG.PROGRESS_HISTORY_MAX);
  if (!arr.length) props.deleteProperty(key);
  else props.setProperty(key, JSON.stringify(arr));
}

function _waRememberProgressForCleanup(props, jid, messageId) {
  if (!messageId) return;
  var arr = _waReadProgressHistory(props, jid);
  arr.push(String(messageId));
  _waWriteProgressHistory(props, jid, arr);
}

function _waSendProgressNewViaWuzapi(cfg, jid, text) {
  _waTypingTo(cfg, jid);
  var msgId = _waMakeProgressMessageId();
  try {
    var res = UrlFetchApp.fetch(cfg.apiUrl + "/chat/send/text", {
      method: "post",
      contentType: "application/json",
      headers: {"Token": cfg.token},
      payload: JSON.stringify({"Phone": jid, "Body": text, "Id": msgId}),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText() || "";
    if (code >= 200 && code < 300) {
      try {
        var parsed = JSON.parse(body);
        if (parsed && parsed.success === false) {
          Logger.log("Wuzapi[PROGRESS NEW REJECT] → " + jid + " " + body);
          return {ok:false, id:"", uncertain:false};
        }
        if (parsed && parsed.data && parsed.data.Id) msgId = String(parsed.data.Id);
      } catch(e0) {}
      Logger.log("Wuzapi[PROGRESS NEW OK] → " + jid + " id=" + msgId);
      return {ok:true, id:msgId, uncertain:false};
    }
    Logger.log("Wuzapi[PROGRESS NEW ERR] → " + jid + " [" + code + "] " + body);
    return {ok:false, id:"", uncertain:false};
  } catch(e) {
    // Jangan retry send pada exception/timeout: request pertama mungkin sudah diterima.
    Logger.log("Wuzapi[PROGRESS NEW UNCERTAIN] → " + jid + " id=" + msgId + ": " + e);
    return {ok:false, id:msgId, uncertain:true};
  }
}

/**
 * status:
 *   ok          = edit terkonfirmasi berhasil
 *   unavailable = edit terkonfirmasi ditolak/tidak tersedia; aman fallback replace
 *   unknown     = hasil jaringan ambigu; jangan membuat pesan baru agar tidak dobel
 */
function _waEditProgressViaWuzapi(cfg, jid, messageId, text) {
  if (!messageId) return {status:"unavailable"};
  var maxTry = Math.max(1, Number(WA_CFG.PROGRESS_EDIT_RETRIES || 1));

  for (var attempt = 1; attempt <= maxTry; attempt++) {
    try {
      var res = UrlFetchApp.fetch(cfg.apiUrl + "/chat/send/edit", {
        method: "post",
        contentType: "application/json",
        headers: {"Token": cfg.token},
        payload: JSON.stringify({"Phone": jid, "Id": String(messageId), "Body": text}),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      var body = res.getContentText() || "";
      var parsed = {};
      try { parsed = JSON.parse(body || "{}"); } catch(e0) {}

      if (code >= 200 && code < 300 && parsed.success !== false) {
        Logger.log("Wuzapi[PROGRESS EDIT OK] → " + jid + " id=" + messageId + " attempt=" + attempt);
        return {status:"ok"};
      }

      // Penolakan HTTP adalah hasil yang diketahui: fallback replace boleh dilakukan.
      Logger.log("Wuzapi[PROGRESS EDIT UNAVAILABLE] → " + jid + " [" + code + "] id=" + messageId + " " + body);
      return {status:"unavailable", code:code};
    } catch(e) {
      Logger.log("Wuzapi[PROGRESS EDIT EXC] → " + jid + " id=" + messageId + " attempt=" + attempt + ": " + e);
      // Retry edit aman karena target message ID dan body sama; tidak membuat pesan baru.
      if (attempt < maxTry) Utilities.sleep(650 * attempt);
    }
  }
  return {status:"unknown"};
}

function _waDeleteProgressViaWuzapi(cfg, jid, messageId) {
  if (!messageId) return true;
  try {
    var res = UrlFetchApp.fetch(cfg.apiUrl + "/chat/delete", {
      method: "post",
      contentType: "application/json",
      headers: {"Token": cfg.token},
      payload: JSON.stringify({"Phone": jid, "Id": String(messageId)}),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText() || "";
    var parsed = {};
    try { parsed = JSON.parse(body || "{}"); } catch(e0) {}
    if (code >= 200 && code < 300 && parsed.success !== false) {
      Logger.log("Wuzapi[PROGRESS DELETE OK] → " + jid + " id=" + messageId);
      return true;
    }
    Logger.log("Wuzapi[PROGRESS DELETE ERR] → " + jid + " [" + code + "] id=" + messageId + " " + body);
  } catch(e) {
    Logger.log("Wuzapi[PROGRESS DELETE EXC] → " + jid + " id=" + messageId + ": " + e);
  }
  return false;
}

function _waCleanupProgressHistory(cfg, jid, keepId) {
  var props = PropertiesService.getScriptProperties();
  var hist = _waReadProgressHistory(props, jid);
  if (!hist.length) return;
  var failed = [];

  hist.forEach(function(id) {
    if (!id || String(id) === String(keepId || "")) return;
    if (!_waDeleteProgressViaWuzapi(cfg, jid, id)) failed.push(String(id));
  });

  _waWriteProgressHistory(props, jid, failed);
}

function _waResetProgressDashboardState() {
  var props = PropertiesService.getScriptProperties();
  var cfg = null;
  try { cfg = _waCfg(); } catch(e0) {}

  // Sebelum state dihapus, bersihkan progress aktif + backlog lama best-effort.
  if (cfg) {
    var dests = _waUniqueStrings(cfg.groups.concat(cfg.personal));
    dests.forEach(function(jid) {
      var idKey = _waProgressStateKey("WA_PROGRESS_ID", jid);
      var oldId = props.getProperty(idKey) || "";
      var hist = _waReadProgressHistory(props, jid);
      if (oldId) hist.push(oldId);
      _waWriteProgressHistory(props, jid, hist);
      _waCleanupProgressHistory(cfg, jid, "");
    });
  }

  // Hapus state aktif/signature/timestamp. History gagal-delete dipertahankan agar
  // update berikutnya masih dapat melakukan cleanup.
  var all = props.getProperties();
  Object.keys(all).forEach(function(k) {
    if (k.indexOf("WA_PROGRESS_ID_") === 0 ||
        k.indexOf("WA_PROGRESS_TS_") === 0 ||
        k.indexOf("WA_PROGRESS_SIG_") === 0) {
      props.deleteProperty(k);
    }
  });
}

/**
 * SMART PROGRESS WHATSAPP
 * 1) Jika isi progress tidak berubah -> skip.
 * 2) Jika message lama masih editable -> edit message yang sama.
 * 3) Jika edit sudah tidak tersedia -> kirim message baru TERLEBIH DAHULU.
 * 4) Setelah message baru sukses -> hapus message lama + backlog cleanup.
 * 5) Jika hasil edit ambigu -> jangan membuat message baru (anti-duplikat).
 */
function sendWhatsAppProgressDashboard(text, opt) {
  opt  = opt || {};
  text = String(text || "").trim();
  if (!text) return false;
  if (!_waCanSend(text, !!opt.force, !!opt.allowQuiet)) return false;

  var cfg   = _waCfg();
  var dests = _waGetDests(cfg, opt.route || "GROUP");
  if (!dests.length) {
    Logger.log("WA Progress: Tidak ada tujuan untuk route [" + (opt.route || "GROUP") + "].");
    return false;
  }

  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var semanticSig = _waProgressSemanticHash(text);
  var anyAction = false;

  dests.forEach(function(jid, i) {
    if (i > 0) Utilities.sleep(WA_CFG.DEST_GAP_MS);

    var idKey  = _waProgressStateKey("WA_PROGRESS_ID", jid);
    var tsKey  = _waProgressStateKey("WA_PROGRESS_TS", jid);
    var sigKey = _waProgressStateKey("WA_PROGRESS_SIG", jid);
    var oldId  = props.getProperty(idKey) || "";
    var oldTs  = parseInt(props.getProperty(tsKey) || "0", 10);
    var oldSig = props.getProperty(sigKey) || "";
    var age    = oldTs ? (now - oldTs) : Number.MAX_SAFE_INTEGER;

    // Selalu coba bersihkan orphan/backlog lama; tidak menyentuh message aktif.
    _waCleanupProgressHistory(cfg, jid, oldId);

    // State sama = tidak perlu edit/kirim hanya karena timestamp berubah.
    if (oldId && oldSig === semanticSig) {
      Logger.log("WA[PROGRESS SKIP SAME] → " + jid + " id=" + oldId);
      return;
    }

    // Edit-first selama window aman.
    if (oldId && age < WA_CFG.PROGRESS_EDIT_MAX_MS) {
      var editResult = _waEditProgressViaWuzapi(cfg, jid, oldId, text);
      if (editResult.status === "ok") {
        props.setProperty(sigKey, semanticSig);
        anyAction = true;
        return;
      }
      if (editResult.status === "unknown") {
        Logger.log("WA[PROGRESS HOLD] Hasil edit ambigu; tidak membuat pesan baru untuk mencegah duplikat. jid=" + jid);
        return;
      }
      // unavailable -> lanjut replace di bawah.
    }

    // Edit expired/tidak tersedia: kirim yang BARU dulu agar progress lama tidak
    // hilang bila WuzAPI sedang bermasalah.
    var created = _waSendProgressNewViaWuzapi(cfg, jid, text);
    if (created.ok && created.id) {
      var newId = String(created.id);
      props.setProperty(idKey, newId);
      props.setProperty(tsKey, String(now));
      props.setProperty(sigKey, semanticSig);

      if (oldId && String(oldId) !== newId) {
        _waRememberProgressForCleanup(props, jid, oldId);
      }
      _waCleanupProgressHistory(cfg, jid, newId);
      anyAction = true;
      return;
    }

    // Bila send timeout/exception ambigu, jangan fallback Fonnte untuk progress.
    // Fonnte tidak mengembalikan lifecycle ID WuzAPI dan dapat membuat pesan dobel.
    if (created.uncertain) {
      Logger.log("WA[PROGRESS HOLD] Send baru ambigu; state lama dipertahankan. jid=" + jid);
      return;
    }

    Logger.log("WA[PROGRESS SEND FAILED] state lama tetap dipertahankan. jid=" + jid);
  });

  if (anyAction) _waRecordSend(text);
  return anyAction;
}

function sendWhatsAppMessage(text, opt) {
  opt  = opt || {};
  text = String(text || "").trim();
  if (!text) return false;
  if (!_waCanSend(text, !!opt.force, !!opt.allowQuiet)) return false;

  var route = opt.route || "GROUP";
  var reservation = _waReserveMessage(text, route);
  if (!reservation.allowed) return false;

  var cfg   = _waCfg();
  var dests = _waGetDests(cfg, route);
  if (!dests.length) {
    Logger.log("WA: Tidak ada nomor tujuan untuk route [" + route + "].");
    _waReleaseReservation(reservation);
    return false;
  }

  var wuzapiSent = false;
  dests.forEach(function(jid, i) {
    if (i > 0) Utilities.sleep(WA_CFG.DEST_GAP_MS);
    if (_waSendViaWuzapi(cfg, jid, text)) wuzapiSent = true;
  });

  var finalSent = wuzapiSent;
  if (!wuzapiSent && cfg.fonnteToken) {
    Logger.log("WA: Wuzapi gagal total • Menggunakan Fonnte fallback...");
    finalSent = _waFonnteFallback(text);
  }

  if (finalSent) _waRecordSend(text);
  else _waReleaseReservation(reservation);
  return finalSent;
}

function waSendSimpleNotif(body, opt) {
  return sendWhatsAppMessage(
    "🔔 *KMD CHECK UPDATE*\n━━━━━━━━━━━━━━━━━━━━━\n" + body +
    "\n━━━━━━━━━━━━━━━━━━━━━\n_" + WA_CFG.WEB_URL + "_",
    opt
  );
}

function _waDirectSend(jid, text) {
  if (!jid || !text) return;
  var cfg = _waCfg();
  if (!_waSendViaWuzapi(cfg, jid, text)) _waFonnteFallback(text);
}


// -------------------------------------------------------------------
//  F — TELEGRAM TRANSMISSION (BOT API)
// -------------------------------------------------------------------

function _tgEscapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function _tgKey(prefix, chatId) {
  return prefix + "_" + _waHash(String(chatId || ""));
}

function _tgDeleteMessage(cfg, chatId, messageId) {
  if (!cfg || !cfg.botToken || !chatId || !messageId) return false;
  try {
    var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + cfg.botToken + "/deleteMessage", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chat_id: chatId, message_id: Number(messageId) }),
      muteHttpExceptions: true
    });
    var body = {};
    try { body = JSON.parse(res.getContentText() || "{}"); } catch(parseErr) {}
    var ok = res.getResponseCode() >= 200 && res.getResponseCode() < 300 && body.ok === true;
    if (!ok) Logger.log("TG[DELETE ERR] " + chatId + "/" + messageId + " → " + res.getContentText());
    return ok;
  } catch (e) {
    Logger.log("TG[DELETE EXC] " + chatId + "/" + messageId + ": " + e);
    return false;
  }
}

function _tgReadDeleteQueue() {
  var raw = PropertiesService.getScriptProperties().getProperty("TG_DELETE_QUEUE") || "[]";
  try {
    var q = JSON.parse(raw);
    return Array.isArray(q) ? q : [];
  } catch(e) {
    return [];
  }
}

function _tgWriteDeleteQueue(queue) {
  var p = PropertiesService.getScriptProperties();
  if (!queue || !queue.length) p.deleteProperty("TG_DELETE_QUEUE");
  else p.setProperty("TG_DELETE_QUEUE", JSON.stringify(queue));
}

function _tgDeleteAutoDeleteTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "processTelegramAutoDeleteQueue") {
      try { ScriptApp.deleteTrigger(t); } catch(e) {}
    }
  });
}

function _tgScheduleAutoDeleteQueue(delayMs) {
  // after(ms) adalah waktu minimum; eksekusi dapat terjadi sedikit lebih lambat.
  delayMs = Math.max(1000, Number(delayMs) || 1000);
  _tgDeleteAutoDeleteTriggers();
  try {
    ScriptApp.newTrigger("processTelegramAutoDeleteQueue").timeBased().after(delayMs).create();
  } catch(e) {
    Logger.log("TG[SCHEDULE DELETE ERR]: " + e);
  }
}

function _tgQueueTransientDelete(chatId, messageId, delaySeconds) {
  delaySeconds = Number(delaySeconds);
  if (!isFinite(delaySeconds) || delaySeconds <= 0 || !messageId) return;

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    var q = _tgReadDeleteQueue();
    var due = Date.now() + Math.max(1, delaySeconds) * 1000;
    q.push({ chatId: String(chatId), messageId: Number(messageId), due: due });
    // Batasi antrean agar Script Properties tidak membengkak.
    if (q.length > 200) q = q.slice(q.length - 200);
    _tgWriteDeleteQueue(q);

    var earliest = q.reduce(function(min, x){ return Math.min(min, Number(x.due) || due); }, due);
    _tgScheduleAutoDeleteQueue(Math.max(1000, earliest - Date.now() + 250));
  } catch(e) {
    Logger.log("TG[QUEUE DELETE ERR]: " + e);
  } finally {
    try { lock.releaseLock(); } catch(e2) {}
  }
}

function _tgDeleteTrackedTransientForChat(cfg, chatId) {
  var lock = LockService.getScriptLock();
  var q = [];
  var keep = [];
  try {
    lock.waitLock(5000);
    q = _tgReadDeleteQueue();
    q.forEach(function(x) {
      if (String(x.chatId) === String(chatId)) {
        _tgDeleteMessage(cfg, x.chatId, x.messageId);
      } else {
        keep.push(x);
      }
    });
    _tgWriteDeleteQueue(keep);
  } catch(e) {
    Logger.log("TG[CLEAN TRANSIENT ERR]: " + e);
  } finally {
    try { lock.releaseLock(); } catch(e2) {}
  }
}

/**
 * Time-trigger untuk menghapus notif Telegram non-progress yang sudah kedaluwarsa.
 * Progress terbaru tidak pernah dimasukkan ke antrean ini.
 */
function processTelegramAutoDeleteQueue() {
  var cfg = _tgCfg();
  if (!cfg.botToken) return;

  var lock = LockService.getScriptLock();
  var nextDue = null;
  try {
    lock.waitLock(10000);
    _tgDeleteAutoDeleteTriggers();

    var now = Date.now();
    var q = _tgReadDeleteQueue();
    var keep = [];

    q.forEach(function(x) {
      var due = Number(x.due) || 0;
      if (due <= now) {
        _tgDeleteMessage(cfg, x.chatId, x.messageId);
      } else {
        keep.push(x);
        if (nextDue === null || due < nextDue) nextDue = due;
      }
    });

    _tgWriteDeleteQueue(keep);
  } catch(e) {
    Logger.log("TG[PROCESS DELETE ERR]: " + e);
  } finally {
    try { lock.releaseLock(); } catch(e2) {}
  }

  if (nextDue !== null) _tgScheduleAutoDeleteQueue(Math.max(1000, nextDue - Date.now() + 250));
}

function _tgKeepOnlyLatestProgress(cfg, chatId, newMessageId) {
  var p = PropertiesService.getScriptProperties();
  var key = _tgKey("TG_LAST_PROGRESS", chatId);
  var oldId = Number(p.getProperty(key) || 0);

  // Progress baru sukses dikirim → hapus progress lama, lalu simpan ID terbaru.
  if (oldId && oldId !== Number(newMessageId)) {
    _tgDeleteMessage(cfg, chatId, oldId);
  }
  p.setProperty(key, String(newMessageId));

  // Saat progress terbaru masuk, bersihkan notif sementara yang masih tertinggal.
  // Hasil akhirnya: progress staf TERBARU menjadi pesan permanen yang dipertahankan.
  _tgDeleteTrackedTransientForChat(cfg, chatId);
}

function _tgSendReservation(chatId, kind, htmlText) {
  var props = PropertiesService.getScriptProperties();
  var key = _tgKey("TG_LAST_SEND_" + String(kind || "transient").toUpperCase(), chatId);
  var sig = _waHash(String(kind || "transient") + "|" + String(htmlText || ""));
  var now = Date.now();
  var lock = LockService.getScriptLock();

  try {
    if (!lock.tryLock(5000)) return { allowed: false, key: key, sig: sig, busy: true };
    var old = {};
    try { old = JSON.parse(props.getProperty(key) || "{}"); } catch(e) { old = {}; }

    // Dua trigger/eksekusi yang mencoba mengirim pesan identik dalam 30 detik
    // dianggap satu event. Ini mencegah progress Telegram terkirim ganda.
    if (old.sig === sig && (now - Number(old.ts || 0)) < 30000) {
      Logger.log("TG[DEDUP] " + chatId + " kind=" + kind);
      return { allowed: false, key: key, sig: sig, duplicate: true };
    }

    props.setProperty(key, JSON.stringify({ sig: sig, ts: now }));
    return { allowed: true, key: key, sig: sig };
  } finally {
    try { lock.releaseLock(); } catch(e2) {}
  }
}

function _tgReleaseReservation(resv) {
  if (!resv || !resv.key || !resv.sig) return;
  var props = PropertiesService.getScriptProperties();
  try {
    var cur = JSON.parse(props.getProperty(resv.key) || "{}");
    if (cur.sig === resv.sig) props.deleteProperty(resv.key);
  } catch(e) {}
}

function sendTelegramMessage(htmlText, opt) {
  opt = opt || {};
  var cfg = _tgCfg();
  if (!cfg.botToken || !cfg.chatIds.length) {
    Logger.log("TG[SKIP]: Bot Token atau Chat ID belum diatur.");
    return false;
  }

  var kind = String(opt.kind || "transient").toLowerCase();
  var isProgress = (kind === "progress");
  var sentAny = false;
  var url = "https://api.telegram.org/bot" + cfg.botToken + "/sendMessage";

  cfg.chatIds.forEach(function(cid, idx) {
    if (idx > 0) Utilities.sleep(400);

    var reservation = _tgSendReservation(cid, kind, htmlText);
    if (!reservation.allowed) return;

    try {
      var payload = {
        chat_id: cid,
        text: htmlText,
        parse_mode: "HTML",
        disable_web_page_preview: true
      };

      // Satu request per event. Jangan retry otomatis pada exception/timeout karena
      // Telegram mungkin sudah menerima request pertama dan retry akan membuat duplikat.
      var res = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      var resCode = res.getResponseCode();
      var jsonRes = {};
      try { jsonRes = JSON.parse(res.getContentText() || "{}"); } catch(parseErr) {}

      if (resCode >= 200 && resCode < 300 && jsonRes.ok) {
        var messageId = jsonRes.result && jsonRes.result.message_id ? Number(jsonRes.result.message_id) : 0;
        Logger.log("TG[OK] → " + cid + " message_id=" + messageId + " kind=" + kind);
        sentAny = true;

        if (messageId) {
          if (isProgress) {
            _tgKeepOnlyLatestProgress(cfg, cid, messageId);
            if (cfg.progressAutoDelete > 0) {
              _tgQueueTransientDelete(cid, messageId, cfg.progressAutoDelete);
            }
          } else if (cfg.autoDelete > 0) {
            _tgQueueTransientDelete(cid, messageId, cfg.autoDelete);
          }
        }
      } else {
        Logger.log("TG[ERR] → " + cid + " [" + resCode + "] " + res.getContentText());
        _tgReleaseReservation(reservation);
      }
    } catch (e) {
      Logger.log("TG[EXC] → " + cid + ": " + e);
      // Exception dianggap gagal/tidak pasti. Reservation dibuka agar event berikutnya
      // dapat mencoba lagi, tetapi fungsi ini sendiri tidak mengirim request kedua.
      _tgReleaseReservation(reservation);
    }
  });

  return sentAny;
}

// -------------------------------------------------------------------
//  G — UNIFIED MESSAGE BUILDERS & SENDER
// -------------------------------------------------------------------

function _waGetSS() {
  try { var id = PropertiesService.getScriptProperties().getProperty("DB_ID"); if (id) return SpreadsheetApp.openById(id); } catch(e) {}
  try { return SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
  return null;
}

function _waGetWIBDayName(d) {
  var date = d || new Date();
  var jStr = Utilities.formatDate(date, "Asia/Jakarta", "yyyy-MM-dd-HH-mm-ss");
  var parts = jStr.split('-');
  var targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), parseInt(parts[3]), parseInt(parts[4]), parseInt(parts[5]));
  var days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return days[targetDate.getDay()];
}

function _waReadStaffAll() {
  var ss = _waGetSS(); if (!ss) return [];
  var sh = ss.getSheetByName("Staff"); if (!sh) return [];

  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  var hdr  = data[0];
  var lhdr = hdr.map(function(h){ return String(h || "").toLowerCase().replace(/\s+/g, ""); });

  var iNama   = lhdr.indexOf("nama");
  var iJab    = lhdr.indexOf("jabatan");
  var iKerja  = lhdr.indexOf("statuskerja");
  var iJamBrg = lhdr.indexOf("jamberangkat");
  var iJamPlg = lhdr.indexOf("jampulang");
  var iJmlCtr = lhdr.indexOf("jumlahcenter");
  var iProg   = lhdr.indexOf("progresscenter"); if (iProg === -1) iProg = lhdr.indexOf("progress");
  var iUpload = lhdr.indexOf("statusupload");
  var iTgl    = lhdr.indexOf("tanggalupdate");

  var DAYS  = ["senin","selasa","rabu","kamis","jumat","sabtu","minggu"];
  var iDays = DAYS.map(function(d){ return lhdr.indexOf(d); });

  var todayI = parseInt(Utilities.formatDate(new Date(), "GMT+7", "u"), 10) - 1;
  var iToday = (iDays[todayI] !== undefined) ? iDays[todayI] : -1;

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r    = data[i];
    var nama = String(r[iNama] || "").trim(); if (!nama) continue;
    var prog = iProg   !== -1 ? Number(r[iProg]   || 0) : 0;
    var tgt  = iToday  !== -1 ? Number(r[iToday]  || 0) : 0;

    var tgtVal = (iToday !== -1 && r[iToday] !== "" && r[iToday] !== null && !isNaN(Number(r[iToday]))) ? Number(r[iToday]) : null;
    var jmlCtrVal = (iJmlCtr !== -1 && r[iJmlCtr] !== "" && r[iJmlCtr] !== null && !isNaN(Number(r[iJmlCtr]))) ? Number(r[iJmlCtr]) : 0;
    var finalTarget = tgtVal !== null ? tgtVal : jmlCtrVal;

    var uploadStr = iUpload !== -1 ? String(r[iUpload] || "").trim() : "";
    if (!isNaN(Number(uploadStr)) && uploadStr !== "") {
      if (finalTarget === 0) uploadStr = "Tidak ada Center";
      else if (prog >= finalTarget && finalTarget > 0) uploadStr = "Sudah upload semua";
      else if (prog > 0) uploadStr = "Sebagian upload";
      else uploadStr = "Belum upload";
    }

    rows.push({
      nama        : nama,
      jab         : iJab    !== -1 ? String(r[iJab]    || "").trim() : "",
      statusKerja : iKerja  !== -1 ? String(r[iKerja]  || "").trim() : "",
      jamBerangkat: iJamBrg !== -1 ? String(r[iJamBrg] || "").trim() : "",
      jamPulang   : iJamPlg !== -1 ? String(r[iJamPlg] || "").trim() : "",
      jumlahCenter: jmlCtrVal,
      prog        : prog,
      target      : finalTarget,
      sisa        : Math.max(0, finalTarget - prog),
      done        : finalTarget > 0 && prog >= finalTarget,
      statusUpload: uploadStr,
      tglUpdate   : iTgl    !== -1 ? r[iTgl]                          : ""
    });
  }
  return rows;
}

function _waGetProgressDataRaw() {
  var rows = _waReadStaffAll().filter(function(r){
    var j = String(r.jab || "").toUpperCase();
    var isNotSpecial = j.indexOf("MANAGER") === -1 && j.indexOf("MIS") === -1 && j.indexOf("FINANCE") === -1 && j.indexOf("FSA") === -1 && j.indexOf("MSA") === -1;
    return (j.indexOf("FIELD") !== -1 || j.indexOf("FO") !== -1 || isNotSpecial) && r.target > 0;
  });

  // Format lama KMD: staf yang SUDAH SELESAI selalu tampil paling atas.
  // Array#sort pada V8 bersifat stabil, jadi urutan asli sheet tetap dipertahankan
  // di dalam kelompok selesai dan kelompok belum selesai.
  rows.sort(function(a, b) {
    if (!!a.done === !!b.done) return 0;
    return a.done ? -1 : 1;
  });
  return rows;
}

function _waReadKV(sheetName) {
  var ss = _waGetSS(); if (!ss) return {};
  var sh = ss.getSheetByName(sheetName); if (!sh) return {};
  var out = {};
  sh.getDataRange().getValues().forEach(function(row) {
    var k = String(row[0] || "").trim();
    var v = String(row[1] || "").trim();
    if (k && v) out[k] = v;
  });
  return out;
}

function _getBalancingStartTime() {
  try {
    var ss    = _waGetSS(); if (!ss) return null;
    var sheet = ss.getSheetByName("ActivityLog"); if (!sheet) return null;
    var data  = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      var action  = String(data[i][2] || "").trim();
      var details = String(data[i][3] || "").trim();
      var ts      = data[i][1];
      if (action === "Update System" && (
            details.indexOf("statusBalancing: Proses") !== -1 ||
            details.indexOf("statusBalancing: Selisih") !== -1 ||
            details.indexOf("statusBalancing: Error") !== -1
          )) {
        return ts instanceof Date ? ts : new Date(ts);
      }
      if (action === "Reset Progress" || action === "Auto Reset Progress") {
        return ts instanceof Date ? ts : new Date(ts);
      }
    }
  } catch(e) {}
  return null;
}


function _waBuildProgressBarLine(doneCount, totalCount) {
  totalCount = Number(totalCount || 0);
  doneCount  = Number(doneCount || 0);

  var pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  var slots = Math.max(1, Number(WA_CFG.PROGRESS_BAR_SLOTS || 10));
  var filled = totalCount > 0 ? Math.round((doneCount / totalCount) * slots) : 0;
  if (filled < 0) filled = 0;
  if (filled > slots) filled = slots;

  var bar = "";
  for (var i = 0; i < slots; i++) bar += (i < filled ? "🟩" : "⬜");
  return bar + " " + pct + "% • " + doneCount + "/" + totalCount + " selesai";
}

// -- WhatsApp Progress Text Builder ---------------------------------
function _waBuildProgressText(extraLines) {
  var rows = _waGetProgressDataRaw();
  if (!rows.length) return "❌ Tidak ada Field Officer dengan target center hari ini.";

  var done = [], proc = [], notyet = [], cDone = 0;
  rows.forEach(function(s) {
    var line = (s.done ? "✅" : "❌") + " *" + s.nama + "* — " + s.prog + "/" + s.target + " Ctr";
    if (s.done) { done.push(line); cDone++; }
    else if (s.prog > 0) proc.push(line);
    else notyet.push(line);
  });

  var now  = new Date();
  var hari = _waGetWIBDayName(now);
  var jam  = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm");

  var out = [
    _waBuildProgressBarLine(cDone, rows.length),
    "",
    "📋 *PROGRES STAF LAPANG*",
    "━━━━━━━━━━━━━━━━━━━━━",
    "_" + hari + ", " + jam + " WIB_",
    ""
  ];

  done.concat(proc, notyet).forEach(function(l) { out.push(l); });
  out.push("", "━━━━━━━━━━━━━━━━━━━━━", "✅ *" + cDone + "/" + rows.length + "* staf selesai");

  if (rows.length - cDone > 0) out.push("⏳ *" + (rows.length - cDone) + "* staf masih proses/belum mulai");
  else out.push("🎉 *Semua staf sudah selesai!*");

  if (extraLines && extraLines.length) extraLines.forEach(function(l) { out.push(l); });
  out.push("_" + WA_CFG.WEB_URL + "_");
  return out.join("\n");
}

// -- Telegram Progress HTML Builder ---------------------------------
function _tgBuildProgressHtml(extraLines) {
  var rows = _waGetProgressDataRaw();
  if (!rows.length) return "❌ <i>Tidak ada Field Officer dengan target center hari ini.</i>";

  var done = [], proc = [], notyet = [], doneCount = 0;
  rows.forEach(function(s) {
    var line = (s.done ? "✅" : "❌") + " <b>" + _tgEscapeHtml(s.nama) + "</b> — " + s.prog + "/" + s.target + " Ctr";
    if (s.done) { done.push(line); doneCount++; }
    else if (s.prog > 0) proc.push(line);
    else notyet.push(line);
  });

  var now  = new Date();
  var hari = _waGetWIBDayName(now);
  var jam  = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm");

  var out = [
    "📋 <b>PROGRES STAF LAPANG</b>",
    "━━━━━━━━━━━━━━━━━━━━━",
    "<i>" + hari + ", " + jam + " WIB</i>",
    ""
  ];

  done.concat(proc, notyet).forEach(function(l) { out.push(l); });
  out.push("", "━━━━━━━━━━━━━━━━━━━━━", "✅ <b>" + doneCount + "/" + rows.length + "</b> staf selesai");

  if (rows.length - doneCount > 0) out.push("⏳ <b>" + (rows.length - doneCount) + "</b> staf masih proses/belum mulai");
  else out.push("🎉 <b>Semua staf sudah selesai!</b>");

  if (extraLines && extraLines.length) extraLines.forEach(function(el) { out.push(el); });
  out.push("<i>" + _tgEscapeHtml(WA_CFG.WEB_URL) + "</i>");
  return out.join("\n");
}

// -- Broadcast Unified Progress Report (WA + Telegram) -------------
function sendUnifiedProgressReport(force) {
  var waText = _waBuildProgressText();
  var tgHtml = _tgBuildProgressHtml();

  sendWhatsAppProgressDashboard(waText, { route: WA_CFG.ROUTES.PROGRESS_REPORT, force: !!force });
  sendTelegramMessage(tgHtml, {kind:"progress"});
}

function sendWhatsAppProgressReport(force) {
  return sendUnifiedProgressReport(force);
}

function sendTelegramProgressReport(force) {
  return sendTelegramMessage(_tgBuildProgressHtml(), {kind:"progress"});
}


// -------------------------------------------------------------------
//  H — DEBOUNCE & BATCHING SYSTEM (UNIFIED QUEUE)
//
//  Semua perubahan data (baik dari Web App doPost maupun EDIT MANUAL
//  langsung di Google Sheet) masuk ke antrean ini:
//    - queueStaffProgress()
//    - queueSystemStatusUpdate()
//    - queueSimpleNotification()
//  Flush dijalankan setelah data stabil ±8 detik; time trigger menjadi safety-net.
// -------------------------------------------------------------------

function _waMarkPendingUpdate(props) {
  props = props || PropertiesService.getScriptProperties();
  props.setProperty("WA_PENDING_LAST_TS", String(Date.now()));
}

function _waDeleteFlushTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === "flushUnifiedNotifications" || fn === "flushWhatsAppStaffProgress") {
      try { ScriptApp.deleteTrigger(t); } catch(e) {}
    }
  });
}

function _waWaitRateGap() {
  var props = PropertiesService.getScriptProperties();
  var last = parseInt(props.getProperty("WA_LAST_MS") || "0", 10);
  var waitMs = WA_CFG.RATE_GAP_MS - (Date.now() - last) + 80;
  if (waitMs > 0) Utilities.sleep(waitMs);
}

function _manualDebounceFlush() {
  // Installable onEdit boleh menunggu beberapa detik. Eksekusi edit yang lebih
  // lama tidak akan mengirim jika masih ada edit baru di dalam jendela debounce.
  Utilities.sleep(WA_CFG.DEBOUNCE_DELAY_MS + 250);
  flushUnifiedNotifications();
}

function _waWithQueueLock(callback) {
  // doPost sudah memegang ScriptLock untuk operasi tulis. Mengambil ScriptLock lagi
  // dari eksekusi yang sama dapat membuat antrean notifikasi gagal/timeout.
  if (typeof KMD_WRITE_LOCK_HELD !== "undefined" && KMD_WRITE_LOCK_HELD) {
    return callback();
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(6000)) throw new Error("Notification queue lock timeout");
  try {
    return callback();
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function queueStaffProgress(namaStaf, newProg, target, oldProg, congrats, extraNote, statusKerja, statusUpload, jamBerangkat, jamPulang) {
  if (Number(target) > 0 && Number(newProg) >= Number(target)) {
    _waRecordStaffCompletion(namaStaf);
  } else if (Number(target) > 0 && Number(newProg) < Number(target)) {
    _waRemoveStaffCompletion(namaStaf);
  }

  var props = PropertiesService.getScriptProperties();
  try {
    _waWithQueueLock(function() {
      var pendingStaff = JSON.parse(props.getProperty("WA_PENDING_STAFF") || "{}");
      var prev = pendingStaff[namaStaf] || null;
      var note = String(extraNote || "").trim();
      var mergedNote = note;
      if (prev && prev.extraNote) {
        var prevNote = String(prev.extraNote).trim();
        if (note && prevNote.indexOf(note) === -1) mergedNote = prevNote + " | " + note;
        else if (!note) mergedNote = prevNote;
      }

      pendingStaff[namaStaf] = {
        nama        : namaStaf,
        prog        : Number(newProg),
        target      : Number(target),
        oldProg     : prev ? Number(prev.oldProg || 0) : Number(oldProg || 0),
        congrats    : !!congrats || !!(prev && prev.congrats),
        extraNote   : mergedNote,
        statusKerja : statusKerja || (prev ? prev.statusKerja : "") || "",
        statusUpload: statusUpload || (prev ? prev.statusUpload : "") || "",
        jamBerangkat: jamBerangkat || (prev ? prev.jamBerangkat : "") || "",
        jamPulang   : jamPulang || (prev ? prev.jamPulang : "") || "",
        ts          : Date.now()
      };
      props.setProperty("WA_PENDING_STAFF", JSON.stringify(pendingStaff));
      _waMarkPendingUpdate(props);
    });
    _scheduleUnifiedFlush();
  } catch(e) {
    Logger.log("queueStaffProgress ERROR: " + e);
  }
}

function queueSystemStatusUpdate(key, newVal, oldVal, actorInfo) {
  var props = PropertiesService.getScriptProperties();
  try {
    _waWithQueueLock(function() {
      var pendingSys = JSON.parse(props.getProperty("WA_PENDING_SYS") || "{}");
      var prev = pendingSys[key] || null;
      pendingSys[key] = {
        key      : key,
        newVal   : newVal,
        oldVal   : prev ? prev.oldVal : oldVal,
        actorInfo: actorInfo || (prev ? prev.actorInfo : "System") || "System",
        ts       : Date.now()
      };
      props.setProperty("WA_PENDING_SYS", JSON.stringify(pendingSys));
      _waMarkPendingUpdate(props);
    });
    _scheduleUnifiedFlush();
  } catch(e) {
    Logger.log("queueSystemStatusUpdate ERROR: " + e);
  }
}

function queueSimpleNotification(text, route) {
  var props = PropertiesService.getScriptProperties();
  try {
    _waWithQueueLock(function() {
      var pendingExtra = JSON.parse(props.getProperty("WA_PENDING_EXTRA") || "[]");
      var cleanText = String(text || "").trim();
      // Hindari duplikat identik di dalam satu jendela debounce.
      var duplicate = pendingExtra.some(function(ex) { return ex && ex.text === cleanText && ex.route === (route || "GROUP"); });
      if (!duplicate) pendingExtra.push({ text: cleanText, route: route || "GROUP", ts: Date.now() });
      props.setProperty("WA_PENDING_EXTRA", JSON.stringify(pendingExtra));
      _waMarkPendingUpdate(props);
    });
    _scheduleUnifiedFlush();
  } catch(e) {
    Logger.log("queueSimpleNotification ERROR: " + e);
  }
}

function _scheduleUnifiedFlush(delayMs) {
  delayMs = Math.max(1000, Number(delayMs || WA_CFG.DEBOUNCE_DELAY_MS));
  var triggers = ScriptApp.getProjectTriggers();
  var exists = triggers.some(function(t) {
    var fn = t.getHandlerFunction();
    return fn === "flushUnifiedNotifications" || fn === "flushWhatsAppStaffProgress";
  });

  if (!exists) {
    ScriptApp.newTrigger("flushUnifiedNotifications")
      .timeBased()
      .after(delayMs)
      .create();
    Logger.log("Unified Flush dijadwalkan minimal dalam " + Math.ceil(delayMs / 1000) + " detik.");
  }
}

function _rescheduleUnifiedFlush(delayMs) {
  _waDeleteFlushTriggers();
  _scheduleUnifiedFlush(Math.max(1000, delayMs));
}

/**
 * Flush eksekutor terpadu: membaca semua pending staf & sistem,
 * menyusun 1 pesan ringkas berbobot, dan mengirimkannya ke WhatsApp + Telegram.
 */
function flushUnifiedNotifications(force) {
  var props = PropertiesService.getScriptProperties();

  // True debounce: hitung dari perubahan TERAKHIR, bukan perubahan pertama.
  if (!force) {
    var lastPendingTs = parseInt(props.getProperty("WA_PENDING_LAST_TS") || "0", 10);
    if (lastPendingTs > 0) {
      var age = Date.now() - lastPendingTs;
      if (age < WA_CFG.DEBOUNCE_DELAY_MS) {
        _rescheduleUnifiedFlush((WA_CFG.DEBOUNCE_DELAY_MS - age) + 300);
        return;
      }
    }
  }

  var lock  = LockService.getScriptLock();
  var pendingStaff = {};
  var pendingSys   = {};
  var pendingExtra = [];

  try {
    if (!lock.tryLock(8000)) {
      _scheduleUnifiedFlush(2000);
      return;
    }

    // Re-check setelah lock supaya edit baru yang datang bersamaan tidak ikut terpotong.
    if (!force) {
      lastPendingTs = parseInt(props.getProperty("WA_PENDING_LAST_TS") || "0", 10);
      if (lastPendingTs > 0) {
        var lockedAge = Date.now() - lastPendingTs;
        if (lockedAge < WA_CFG.DEBOUNCE_DELAY_MS) {
          _rescheduleUnifiedFlush((WA_CFG.DEBOUNCE_DELAY_MS - lockedAge) + 300);
          return;
        }
      }
    }

    pendingStaff = JSON.parse(props.getProperty("WA_PENDING_STAFF") || "{}");
    pendingSys   = JSON.parse(props.getProperty("WA_PENDING_SYS") || "{}");
    pendingExtra = JSON.parse(props.getProperty("WA_PENDING_EXTRA") || "[]");

    props.deleteProperty("WA_PENDING_STAFF");
    props.deleteProperty("WA_PENDING_SYS");
    props.deleteProperty("WA_PENDING_EXTRA");
    props.deleteProperty("WA_PENDING_LAST_TS");
    _waDeleteFlushTriggers();
  } catch(e) {
    Logger.log("flushUnifiedNotifications Lock ERROR: " + e);
    _scheduleUnifiedFlush(3000);
    return;
  } finally {
    try { lock.releaseLock(); } catch(e2) {}
  }

  var hasStaff = Object.keys(pendingStaff).length > 0;
  var hasSys   = Object.keys(pendingSys).length > 0;
  var hasExtra = pendingExtra.length > 0;
  if (!hasStaff && !hasSys && !hasExtra) return;

  // Update operasional tidak diblokir jam tenang. Laporan berkala sudah dinonaktifkan.
  var updateOpt = { allowQuiet: !!WA_CFG.UPDATE_ALLOW_QUIET };

  // 1. Notifikasi update staf — template lama tetap dipertahankan.
  if (hasStaff) {
    var congrListWa = [];
    var congrListTg = [];

    Object.keys(pendingStaff).forEach(function(nama) {
      var item = pendingStaff[nama];
      if (!item) return;
      // Detail perubahan (Progress/Upload/Status/Jam) tetap disimpan di
      // ActivityLog, tetapi TIDAK ditambahkan ke notifikasi progres agar
      // format pesan tetap sama seperti versi lama.
      if (item.congrats && _waClaimStaffCompletionEvent(nama)) {
        congrListWa.push("🎉 Transaksi *" + nama + "*! Sudah Selesai!");
        congrListTg.push("🎉 Transaksi <b>" + _tgEscapeHtml(nama) + "</b>! Sudah Selesai!");
      }
    });

    var waReport = _waBuildProgressText(congrListWa);
    var tgReport = _tgBuildProgressHtml(congrListTg);

    _waWaitRateGap();
    sendWhatsAppProgressDashboard(waReport, { route: WA_CFG.ROUTES.PROGRESS_FLUSH, allowQuiet: updateOpt.allowQuiet });
    sendTelegramMessage(tgReport, {kind:"progress"});

    Utilities.sleep(700);
    _waCheckAndSendAllDone();
  }

  // 2. Notifikasi update status sistem.
  if (hasSys) {
    _waWaitRateGap();
    waSendConsolidatedSystemUpdates(pendingSys, updateOpt);
  }

  // 3. Notifikasi update target / pesan bebas. Gabungkan berdasarkan route agar
  // edit beberapa sel tidak menghasilkan banyak pesan terpisah.
  if (hasExtra) {
    var groupedExtra = {};
    pendingExtra.forEach(function(ex) {
      if (!ex || !ex.text) return;
      var route = ex.route || "GROUP";
      if (!groupedExtra[route]) groupedExtra[route] = [];
      groupedExtra[route].push(ex.text);
    });

    Object.keys(groupedExtra).forEach(function(route) {
      var body = groupedExtra[route].join("\n\n");
      _waWaitRateGap();
      waSendSimpleNotif(body, { route: route, allowQuiet: updateOpt.allowQuiet });
      sendTelegramMessage("🔔 <b>KMD CHECK UPDATE</b>\n━━━━━━━━━━━━━━━━━━\n" + _tgEscapeHtml(body));
    });
  }
}

/** Alias untuk kompatibilitas code lama */
function flushWhatsAppStaffProgress() {
  flushUnifiedNotifications();
}

function _waCheckAndSendAllDone() {
  var today = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  var p     = PropertiesService.getScriptProperties();
  if (p.getProperty("WA_ALLDONE_DATE") === today) return;

  var txt = _waBuildAllDoneMsg();
  if (!txt) return;

  p.setProperty("WA_ALLDONE_DATE", today);

  sendWhatsAppMessage(txt, { route: WA_CFG.ROUTES.ALL_DONE, allowQuiet: !!WA_CFG.UPDATE_ALLOW_QUIET });

  var tgAllDone = "🎉 <b>SEMUA STAF SUDAH SELESAI!</b> 🎉\n━━━━━━━━━━━━━━━━━━\n<i>Luar biasa! Seluruh staf lapang KMD Cibeunying hari ini SELESAI!</i> 🎉";
  sendTelegramMessage(tgAllDone);
}


// -------------------------------------------------------------------
//  I — SYSTEM STATUS & BALANCING NOTIFICATIONS
// -------------------------------------------------------------------

function waSendConsolidatedSystemUpdates(changedKeys, opt) {
  opt = opt || {};
  var sys      = _waReadKV("SystemStatus");
  var msaAlias = sys["aliasMSA"] || "MSA";
  var fsaAlias = sys["aliasFSA"] || "FSA";
  var mgrAlias = sys["aliasManager"] || "Manager";
  var asmAlias = sys["aliasAsistenManager"] || "Asisten Manager";
  var jam      = Utilities.formatDate(new Date(), "GMT+7", "HH:mm");

  var linesWa          = [];
  var linesTg          = [];
  var hasBalancingDone = false;
  var balancingVal     = "";

  for (var key in changedKeys) {
    var nv  = changedKeys[key].newVal;
    var ov  = changedKeys[key].oldVal;
    if (nv === ov) continue;
    var lnv = String(nv).toLowerCase();

    if (key === "statusBalancing") {
      var isSelesai = (lnv.indexOf("selesai") !== -1 || lnv.indexOf("balance") !== -1 ||
                       lnv.indexOf("tuntas")  !== -1 || lnv.indexOf("aman")    !== -1 || lnv === "ok");
      if (isSelesai) {
        hasBalancingDone = true;
        balancingVal = nv;
      } else {
        linesWa.push("• *Balancing*: " + nv);
        linesTg.push("• <b>Balancing:</b> " + _tgEscapeHtml(nv));
      }
    } else if (key === "statusKantor") {
      linesWa.push("• *Kantor*: " + nv);
      linesTg.push("• <b>Kantor:</b> " + _tgEscapeHtml(nv));
    } else if (key === "statusSistem") {
      linesWa.push("• *Sistem*: " + nv);
      linesTg.push("• <b>Sistem:</b> " + _tgEscapeHtml(nv));
    } else if (key === "statusMSA") {
      linesWa.push("• *" + msaAlias + "*: " + nv);
      linesTg.push("• <b>" + _tgEscapeHtml(msaAlias) + ":</b> " + _tgEscapeHtml(nv));
    } else if (key === "statusFSA") {
      linesWa.push("• *" + fsaAlias + "*: " + nv);
      linesTg.push("• <b>" + _tgEscapeHtml(fsaAlias) + ":</b> " + _tgEscapeHtml(nv));
    } else if (key === "statusManager") {
      linesWa.push("• *" + mgrAlias + "*: " + nv);
      linesTg.push("• <b>" + _tgEscapeHtml(mgrAlias) + ":</b> " + _tgEscapeHtml(nv));
    } else if (key === "statusAsistenManager") {
      linesWa.push("• *" + asmAlias + "*: " + nv);
      linesTg.push("• <b>" + _tgEscapeHtml(asmAlias) + ":</b> " + _tgEscapeHtml(nv));
    } else if (key === "pengumuman") {
      if (nv && nv !== "-" && nv.toLowerCase() !== "tidak ada") {
        sendWhatsAppMessage(
          "📢 *PENGUMUMAN — KMD CIBEUNYING*\n━━━━━━━━━━━━━━━━━━━━━\n" + nv +
          "\n━━━━━━━━━━━━━━━━━━━━━\n_KMD Cibeunying_",
          { route: WA_CFG.ROUTES.ANNOUNCEMENT, allowQuiet: !!opt.allowQuiet }
        );
        sendTelegramMessage("📢 <b>PENGUMUMAN — KMD CIBEUNYING</b>\n━━━━━━━━━━━━━━━━━━\n" + _tgEscapeHtml(nv));
      }
    } else {
      linesWa.push("• *" + key + "*: " + nv);
      linesTg.push("• <b>" + _tgEscapeHtml(key) + ":</b> " + _tgEscapeHtml(nv));
    }
  }

  if (hasBalancingDone) _waSendBalancingSelesai(balancingVal);

  if (linesWa.length > 0) {
    waSendSimpleNotif([
      "⚙️ *UPDATE STATUS SISTEM — KMD CIBEUNYING*",
      "━━━━━━━━━━━━━━━━━━━━━",
      "⏰ _" + jam + " WIB_",
      "",
      linesWa.join("\n"),
      "",
      "━━━━━━━━━━━━━━━━━━━━━",
      "_KMD Cibeunying_"
    ].join("\n"), { route: WA_CFG.ROUTES.SISTEM_CHANGE, allowQuiet: !!opt.allowQuiet });

    sendTelegramMessage([
      "⚙️ <b>UPDATE STATUS SISTEM — KMD CIBEUNYING</b>",
      "━━━━━━━━━━━━━━━━━━",
      "⏰ <i>" + jam + " WIB</i>",
      "",
      linesTg.join("\n"),
      "",
      "<i>KMD Cibeunying Dashboard</i>"
    ].join("\n"));
  }
}

function _waSendBalancingSelesai(newVal) {
  var now = new Date();
  var tgl = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");
  var jam = Utilities.formatDate(now, "GMT+7", "HH:mm");

  var staffList   = _waGetProgressDataRaw();
  var compMap     = _waGetStaffCompletionMap();
  var rincianStafWa = [];
  var rincianStafTg = [];
  var latestStaffDoneMs = 0;

  staffList.forEach(function(s) {
    var selesaiStr = "";
    var doneTs = 0;

    if (compMap[s.nama] && compMap[s.nama].jam) {
      selesaiStr = compMap[s.nama].jam;
      doneTs = compMap[s.nama].ts || 0;
    }

    if (!selesaiStr && s.tglUpdate) {
      var dt = (s.tglUpdate instanceof Date) ? s.tglUpdate : new Date(s.tglUpdate);
      if (!isNaN(dt.getTime())) {
        var hWib = parseInt(Utilities.formatDate(dt, "GMT+7", "H"), 10);
        var mWib = parseInt(Utilities.formatDate(dt, "GMT+7", "m"), 10);
        if (hWib !== 0 || mWib !== 0) {
          selesaiStr = Utilities.formatDate(dt, "GMT+7", "HH:mm");
          doneTs = dt.getTime();
        }
      }
    }

    if (!selesaiStr && s.jamPulang && String(s.jamPulang).trim() !== "00:00" && String(s.jamPulang).trim() !== "") {
      selesaiStr = String(s.jamPulang).trim();
      var parts = selesaiStr.split(":");
      if (parts.length >= 2) {
        var d = new Date();
        d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
        doneTs = d.getTime();
      }
    }

    if (doneTs > 0) {
      latestStaffDoneMs = Math.max(latestStaffDoneMs, doneTs);
    }

    var textJam = selesaiStr ? (selesaiStr + " WIB") : (s.done ? "Selesai" : "Belum Selesai");
    rincianStafWa.push("• *" + s.nama + "*: " + textJam);
    rincianStafTg.push("• <b>" + _tgEscapeHtml(s.nama) + ":</b> " + _tgEscapeHtml(textJam));
  });

  var logStartTime = _getBalancingStartTime();
  var startTime = null;

  if (logStartTime && latestStaffDoneMs > 0) {
    if (logStartTime.getTime() >= latestStaffDoneMs) {
      startTime = logStartTime;
    } else {
      startTime = new Date(latestStaffDoneMs);
    }
  } else if (latestStaffDoneMs > 0) {
    startTime = new Date(latestStaffDoneMs);
  } else if (logStartTime) {
    startTime = logStartTime;
  }

  var lamaProses = "—";
  if (startTime) {
    var diffMs   = now.getTime() - startTime.getTime();
    var diffMins = Math.max(0, Math.floor(diffMs / 60000));
    var hrs  = Math.floor(diffMins / 60);
    var mins = diffMins % 60;
    lamaProses = hrs > 0 ? (hrs + " jam " + mins + " menit") : (mins + " menit");
  }

  var outWa = [
    "🎉 *TRANSAKSI SUDAH SELESAI*",
    "━━━━━━━━━━━━━━━━━━━━━",
    "📅 Tanggal         : *" + tgl + "*",
    "🕒 System Balance  : *" + jam + " WIB*",
    "⏱️ Lama Proses     : *" + lamaProses + "*",
    "",
    "✅ *Pekerjaan SELESAI!*",
    "_Status Balancing: " + newVal + "_",
    "",
    "📋 *Rincian Waktu Penyelesaian Staf:*"
  ];
  rincianStafWa.forEach(function(l){ outWa.push(l); });
  outWa.push(
    "",
    "Alhamdulillah, laporan keuangan hari ini",
    "telah selesai dan balance. 🙏",
    "",
    "🏠 *bersiap untuk pulang.* 🏠",
    "━━━━━━━━━━━━━━━━━━━━━"
  );

  sendWhatsAppMessage(outWa.join("\n"), { route: WA_CFG.ROUTES.BALANCING_DONE, allowQuiet: !!WA_CFG.UPDATE_ALLOW_QUIET });

  var outTg = [
    "🎉 <b>BALANCING SELESAI — KMD CIBEUNYING</b>",
    "━━━━━━━━━━━━━━━━━━",
    "📅 <b>Tanggal:</b> " + tgl,
    "🕒 <b>Waktu Balance:</b> " + jam + " WIB",
    "⏱️ <b>Lama Proses:</b> " + lamaProses,
    "",
    "✅ <b>Pekerjaan SELESAI! Status: " + _tgEscapeHtml(newVal) + "</b>",
    "",
    "<b>Rincian Penyelesaian:</b>",
    rincianStafTg.join("\n"),
    "",
    "<i>Alhamdulillah, laporan telah selesai & balance. Bersiap untuk pulang. 🙏</i>"
  ];
  sendTelegramMessage(outTg.join("\n"));
}

function _waRecordStaffCompletion(nama) {
  if (!nama) return;
  var todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  var key = "STAFF_DONE_" + todayStr;
  var props = PropertiesService.getScriptProperties();
  try {
    var compMap = JSON.parse(props.getProperty(key) || "{}");
    if (!compMap[nama]) {
      var now = new Date();
      compMap[nama] = {
        jam: Utilities.formatDate(now, "GMT+7", "HH:mm"),
        ts: now.getTime()
      };
      props.setProperty(key, JSON.stringify(compMap));
    }
  } catch(e) {}
}

function _waRemoveStaffCompletion(nama) {
  if (!nama) return;
  var todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  var key = "STAFF_DONE_" + todayStr;
  var props = PropertiesService.getScriptProperties();
  try {
    var compMap = JSON.parse(props.getProperty(key) || "{}");
    if (compMap[nama]) {
      delete compMap[nama];
      props.setProperty(key, JSON.stringify(compMap));
    }
  } catch(e) {}
}

function _waGetStaffCompletionMap() {
  var todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  var key = "STAFF_DONE_" + todayStr;
  var props = PropertiesService.getScriptProperties();
  var compMap = {};
  try {
    compMap = JSON.parse(props.getProperty(key) || "{}");
  } catch(e) {
    compMap = {};
  }
  return compMap;
}

function _waClaimStaffCompletionEvent(nama) {
  nama = String(nama || "").trim();
  if (!nama) return false;
  var today = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  var key = "WA_CONGRATS_" + today + "_" + _waHash(nama);
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(5000)) return false;
    if (props.getProperty(key) === "1") return false;
    props.setProperty(key, "1");
    return true;
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function formatSystemStatusChange(key, newVal, oldVal) {
  if (!newVal || newVal === oldVal) return null;
  var v = String(newVal).trim();
  var sys = _waReadKV("SystemStatus");
  var msaAlias = sys["aliasMSA"] || "MSA";
  var fsaAlias = sys["aliasFSA"] || "FSA";
  var mgrAlias = sys["aliasManager"] || "Manager";
  var asmAlias = sys["aliasAsistenManager"] || "Asisten Manager";

  if (key === "statusKantor")          return "*Kantor* — " + v;
  if (key === "statusSistem")          return "*Sistem* — " + v;
  if (key === "statusMSA")             return "*" + msaAlias + "* — " + v;
  if (key === "statusFSA")             return "*" + fsaAlias + "* — " + v;
  if (key === "statusManager")         return "*" + mgrAlias + "* — " + v;
  if (key === "statusAsistenManager")  return "*" + asmAlias + "* — " + v;
  if (key === "statusBalancing")       return null;
  if (key === "pengumuman")            return null;
  return "*" + key + "* • " + v;
}

function formatStatusChange(key, val) {
  return formatSystemStatusChange(key, val, "");
}

function _waBuildAllDoneMsg() {
  var rows = _waGetProgressDataRaw();
  if (!rows.length || !rows.every(function(r){ return r.done; })) return null;
  var tgl = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  var out = ["🎉 *SEMUA STAF SELESAI!* 🎉", "━━━━━━━━━━━━━━━━━━━━━", "_" + tgl + "_", ""];
  rows.forEach(function(r){ out.push("✅ *" + r.nama + "* — " + r.prog + "/" + r.target + " Ctr"); });
  out.push("", "━━━━━━━━━━━━━━━━━━━━━");
  out.push("🎉 *Luar biasa! Seluruh staf lapang KMD Cibeunying hari ini SELESAI!* 🎉");
  out.push("_" + WA_CFG.WEB_URL + "_");
  return out.join("\n");
}


// -------------------------------------------------------------------
//  J — SCHEDULED ROUTINES & SYSTEM RESET NOTIFICATION
// -------------------------------------------------------------------

function sendDailyOpening(force) {
  if (WA_CFG.UPDATES_ONLY && !force) { Logger.log("sendDailyOpening: dinonaktifkan (UPDATES_ONLY)."); return; }
  if (!force && _waIsTimeBlocked()) return;
  var waText = _waBuildDailyOpening();
  sendWhatsAppMessage(waText, { route: WA_CFG.ROUTES.DAILY_OPENING });

  var rows  = _waGetProgressDataRaw();
  var total = rows.reduce(function(s, r){ return s + r.target; }, 0);
  var tgHtml = "\u25AA\uFE0F <b>SELAMAT PAGI</b>\n━━━━━━━━━━━━━━━━━━\n\u25AA\uFE0F <b>Target Hari Ini:</b>\n• Field Officer: <b>" + rows.length + "</b> orang\n• Total Target Center: <b>" + total + "</b> center\n\n<i>Semangat bertugas! \u25AA\uFE0F</i>";
  sendTelegramMessage(tgHtml);
}

function sendMiddayProgressReport(force) {
  if (WA_CFG.UPDATES_ONLY && !force) { Logger.log("sendMiddayProgressReport: dinonaktifkan (UPDATES_ONLY)."); return; }
  if (!force && _waIsTimeBlocked()) return;
  sendUnifiedProgressReport(force);
}

function sendMissedTargetAlert(force) {
  if (WA_CFG.UPDATES_ONLY && !force) { Logger.log("sendMissedTargetAlert: dinonaktifkan (UPDATES_ONLY)."); return; }
  if (!force && _waIsTimeBlocked()) return;
  var txt = _waBuildMissedAlert();
  if (!txt) { Logger.log("WA: Semua staf selesai, alert batal."); return; }
  sendWhatsAppMessage(txt, { route: WA_CFG.ROUTES.MISSED_ALERT, force: !!force });

  var rows    = _waGetProgressDataRaw();
  var pending = rows.filter(function(s){ return !s.done; });
  if (pending.length) {
    var lines = pending.map(function(s){ return "• <b>" + _tgEscapeHtml(s.nama) + "</b>: sisa " + s.sisa + " center (" + s.prog + "/" + s.target + ")"; });
    var tgAlert = "• <b>PENGINGAT CENTER — KMD CHECK</b>\n━━━━━━━━━━━━━━━━━━\n" + lines.join("\n") + "\n\n<i>Segera selesaikan sebelum closing sore!</i>";
    sendTelegramMessage(tgAlert);
  }
}

function sendDailyClosing(force) {
  if (WA_CFG.UPDATES_ONLY && !force) { Logger.log("sendDailyClosing: dinonaktifkan (UPDATES_ONLY)."); return; }
  if (!force && _waIsTimeBlocked()) return;
  var txt = _waBuildDailyClosing(); if (!txt) return;
  sendWhatsAppMessage(txt, { route: WA_CFG.ROUTES.DAILY_CLOSING, force: !!force });

  var rows = _waGetProgressDataRaw();
  var done = rows.filter(function(r){ return r.done; });
  var tgClosing = "\u25AA\uFE0F <b>RINGKASAN AKHIR HARI — KMD CHECK</b>\n━━━━━━━━━━━━━━━━━━\n• Selesai: <b>" + done.length + "/" + rows.length + "</b> Staf\n\n<i>KMD Cibeunying</i>";
  sendTelegramMessage(tgClosing);
}

function _waBuildDailyOpening() {
  var rows  = _waGetProgressDataRaw();
  var total = rows.reduce(function(s, r){ return s + r.target; }, 0);
  var hari  = _waGetWIBDayName(new Date());
  var tgl   = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  return ["\u25AA\uFE0F *SELAMAT PAGI — KMD CIBEUNYING*", "━━━━━━━━━━━━━━━━━━━━━",
    "_" + hari + ", " + tgl + "_", "",
    "\u25AA\uFE0F *Target Hari Ini:*",
    "• Field Officer : *" + rows.length + "* orang",
    "• Total center : *" + total + "* center", "",
    "━━━━━━━━━━━━━━━━━━━━━", "_Semoga Cepat Selesai! \u25AA\uFE0F_", "_" + WA_CFG.WEB_URL + "_"
  ].join("\n");
}

function _waBuildMissedAlert() {
  var rows    = _waGetProgressDataRaw();
  var pending = rows.filter(function(s){ return !s.done; });
  if (!pending.length) return null;
  var jam = Utilities.formatDate(new Date(), "GMT+7", "HH:mm");
  var out = ["• *PENGINGAT CENTER — KMD CHECK*", "━━━━━━━━━━━━━━━━━━━━━", "_" + jam + " WIB — Segera selesaikan!_", ""];
  pending.forEach(function(s){ out.push("• *" + s.nama + "* — sisa *" + s.sisa + "* center (" + s.prog + "/" + s.target + ")"); });
  out.push("", "━━━━━━━━━━━━━━━━━━━━━", "_Selesaikan sebelum 17:00 WIB!_", "_" + WA_CFG.WEB_URL + "_");
  return out.join("\n");
}

function _waBuildDailyClosing() {
  var rows = _waGetProgressDataRaw(); if (!rows.length) return null;
  var done = rows.filter(function(r){ return r.done; });
  var not  = rows.filter(function(r){ return !r.done; });
  var tgl  = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  var out  = ["\u25AA\uFE0F *RINGKASAN AKHIR HARI — KMD CHECK*", "━━━━━━━━━━━━━━━━━━━━━", "_" + tgl + "_", ""];
  done.forEach(function(r){ out.push("• *" + r.nama + "* — " + r.prog + "/" + r.target + " Ctr"); });
  if (not.length) { if (done.length) out.push(""); not.forEach(function(r){ out.push("• *" + r.nama + "* — " + r.prog + "/" + r.target + " (kurang " + r.sisa + ")"); }); }
  out.push("", "━━━━━━━━━━━━━━━━━━━━━");
  out.push("• Selesai: *" + done.length + "/" + rows.length + "* staf");
  out.push(!not.length ? "\u25AA\uFE0F *Pekerjaan hari ini selesai!*" : "\u25AA\uFE0F Belum selesai: *" + not.length + "* staf");
  out.push("_" + WA_CFG.WEB_URL + "_");
  return out.join("\n");
}

/** Dipanggil setelah reset progress harian */
function waSendSystemResetNotif(logDesc) {
  var waText = "🔄 *SYSTEM RESET*\n━━━━━━━━━━━━━━━━━━━━━\n" + logDesc + "\n━━━━━━━━━━━━━━━━━━━━━\n_" + WA_CFG.WEB_URL + "_";
  sendWhatsAppMessage(waText, { route: WA_CFG.ROUTES.SYSTEM_RESET, allowQuiet: !!WA_CFG.UPDATE_ALLOW_QUIET });

  var tgHtml = "🔄 <b>SYSTEM RESET HARIAN</b>\n━━━━━━━━━━━━━━━━━━\n" + _tgEscapeHtml(logDesc) + "\n\n<i>KMD Cibeunying</i>";
  sendTelegramMessage(tgHtml);
}


// -------------------------------------------------------------------
//  K — BULLETPROOF DAILY AUTO RESET (EXACTLY 1X PER DAY)
// -------------------------------------------------------------------

/**
 * Trigger rutin tengah malam (00:05 WIB).
 * Dijamin berjalan maksimal 1 KALI per hari dan tidak akan berulang.
 */
function checkAndPerformDailyReset() {
  var todayJakarta = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  var props = PropertiesService.getScriptProperties();

  // 1. Guard check di ScriptProperties
  var lastResetProp = props.getProperty("LAST_AUTO_RESET_DATE") || "";
  if (lastResetProp === todayJakarta) {
    Logger.log("checkAndPerformDailyReset: Skip (sudah dieksekusi hari ini via ScriptProperties: " + todayJakarta + ")");
    return;
  }

  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) {
      Logger.log("checkAndPerformDailyReset: Sedang diproses proses lain.");
      return;
    }

    // Double check setelah lock
    lastResetProp = props.getProperty("LAST_AUTO_RESET_DATE") || "";
    if (lastResetProp === todayJakarta) return;

    if (typeof resetProgress === 'function') {
      var result = resetProgress(true, todayJakarta);
      if (!result.isSkipped) {
        props.setProperty("LAST_AUTO_RESET_DATE", todayJakarta);
        _waResetProgressDashboardState();
        Logger.log("checkAndPerformDailyReset: Sukses reset harian untuk " + todayJakarta + " + cleanup state progress WA");
      }
    }
  } catch(e) {
    Logger.log("checkAndPerformDailyReset ERROR: " + e);
  } finally {
    try { lock.releaseLock(); } catch(e2) {}
  }
}


// -------------------------------------------------------------------
//  L — MANUAL SPREADSHEET EDIT TRIGGER HANDLER (onSpreadsheetEdit)
//
//  Menangkap semua editan manual dari manusia yang mengedit langsung
//  sel di Google Sheet (Staff / SystemStatus) dan memasukkannya
//  ke debounce queue terpadu.
// -------------------------------------------------------------------

function processStaffNotification(nama, jabatan, changedFields, currentVals, lhdr) {
  var iProg  = lhdr.indexOf("progresscenter"); if (iProg === -1) iProg = lhdr.indexOf("progress");
  var iKerja = lhdr.indexOf("statuskerja");
  var iJamBr = lhdr.indexOf("jamberangkat");
  var iJamPl = lhdr.indexOf("jampulang");
  var iUpld  = lhdr.indexOf("statusupload");

  var prog = iProg !== -1 ? Number(currentVals[iProg] || 0) : 0;

  var dayCode  = Utilities.formatDate(new Date(), "GMT+7", "u");
  var dayNames = ["senin","selasa","rabu","kamis","jumat","sabtu","minggu"];
  var iToday   = lhdr.indexOf(dayNames[parseInt(dayCode, 10) - 1]);
  var target   = iToday !== -1 ? Number(currentVals[iToday] || 0) : 0;
  if (target <= 0) {
    var iJmlCtr = lhdr.indexOf("jumlahcenter");
    if (iJmlCtr !== -1) target = Number(currentVals[iJmlCtr] || 0);
  }

  var hasProg   = changedFields.hasOwnProperty("progresscenter") || changedFields.hasOwnProperty("progress");
  var hasUpload = changedFields.hasOwnProperty("statusupload");
  var hasKerja  = changedFields.hasOwnProperty("statuskerja");
  var hasJamBr  = changedFields.hasOwnProperty("jamberangkat");
  var hasJamPl  = changedFields.hasOwnProperty("jampulang");

  var oldProg  = hasProg ? Number((changedFields["progresscenter"] || changedFields["progress"]).oldVal || 0) : prog;
  var congrats = (target > 0 && prog >= target && oldProg < target);

  if (hasProg || hasUpload || hasKerja || hasJamBr || hasJamPl) {
    var notes = [];
    var stKerja = iKerja !== -1 ? String(currentVals[iKerja] || "") : "";
    var stUpld  = iUpld  !== -1 ? String(currentVals[iUpld]  || "") : "";
    var jamBr   = iJamBr !== -1 ? String(currentVals[iJamBr] || "") : "";
    var jamPl   = iJamPl !== -1 ? String(currentVals[iJamPl] || "") : "";

    function addChange(label, item, suffix) {
      if (!item) return;
      var ov = String(item.oldVal === undefined || item.oldVal === null ? "" : item.oldVal).trim();
      var nv = String(item.newVal === undefined || item.newVal === null ? "" : item.newVal).trim();
      if (ov && ov !== nv) notes.push(label + ": " + ov + " → " + nv + (suffix || ""));
      else notes.push(label + ": " + nv + (suffix || ""));
    }

    if (hasProg) addChange("Progress", changedFields["progresscenter"] || changedFields["progress"], target > 0 ? "/" + target + " center" : " center");
    if (hasKerja) {
      stKerja = String(changedFields["statuskerja"].newVal || "");
      addChange("Status", changedFields["statuskerja"], "");
    }
    if (hasJamBr) {
      jamBr = String(changedFields["jamberangkat"].newVal || "");
      addChange("Berangkat", changedFields["jamberangkat"], "");
    }
    if (hasJamPl) {
      jamPl = String(changedFields["jampulang"].newVal || "");
      addChange("Pulang", changedFields["jampulang"], "");
    }
    if (hasUpload) {
      stUpld = String(changedFields["statusupload"].newVal || "");
      addChange("Upload", changedFields["statusupload"], "");
    }

    queueStaffProgress(nama, prog, target, oldProg, congrats, notes.join("; "), stKerja, stUpld, jamBr, jamPl);
  }
}

function _manualLogStaffUpdate(nik) {
  try {
    if (typeof logActivity === "function") {
      logActivity("Update Staff", String(nik || "").trim() + " updated", "Manual Spreadsheet");
    }
  } catch(e) { Logger.log("Manual staff log gagal: " + e); }
}

function _manualLogSystemUpdate(details) {
  try {
    if (typeof logActivity === "function") {
      logActivity("Update System", details, "Manual Spreadsheet");
    }
  } catch(e) { Logger.log("Manual system log gagal: " + e); }
}

function onSpreadsheetEdit(e) {
  if (!e || !e.range) return;
  var queuedSomething = false;

  try {
    var range  = e.range;
    var sheet  = range.getSheet();
    var sName  = sheet.getName();
    var startRow = range.getRow();
    var startCol = range.getColumn();
    var numRows  = range.getNumRows();
    var numCols  = range.getNumColumns();
    var singleCell = (numRows === 1 && numCols === 1);

    // -- SHEET: Staff ---------------------------------------------
    if (sName === "Staff") {
      var lc = sheet.getLastColumn();
      if (lc < 1) return;

      var hdr  = sheet.getRange(1, 1, 1, lc).getValues()[0];
      var lhdr = hdr.map(function(h){ return String(h || "").toLowerCase().replace(/\s+/g, ""); });
      var iNik   = lhdr.indexOf("nik");
      var iNama  = lhdr.indexOf("nama"); if (iNama === -1) return;
      var iJab   = lhdr.indexOf("jabatan");
      var iTglUpdate = lhdr.indexOf("tanggalupdate");
      var DAYS = ["senin","selasa","rabu","kamis","jumat","sabtu","minggu"];

      for (var rOff = 0; rOff < numRows; rOff++) {
        var row = startRow + rOff;
        if (row < 2) continue;

        var vals = sheet.getRange(row, 1, 1, lc).getValues()[0];
        var nama = String(vals[iNama] || "").trim() || ("Baris " + row);
        var jabatan = iJab !== -1 ? String(vals[iJab] || "") : "";
        var nik = iNik !== -1 ? String(vals[iNik] || "").trim() : ("ROW-" + row);
        var changed = {};
        var rowRelevant = false;
        var targetNotifs = [];

        for (var cOff = 0; cOff < numCols; cOff++) {
          var col = startCol + cOff;
          if (col < 1 || col > lc) continue;
          var colKey = String(hdr[col - 1] || "").toLowerCase().replace(/\s+/g, "");
          var colRaw = String(hdr[col - 1] || "");
          if (!colKey || colKey === "tanggalupdate") continue;

          var currentVal = sheet.getRange(row, col).getValue();
          var newVal = String(currentVal === null || currentVal === undefined ? "" : currentVal).trim();
          var oldVal = "";
          if (singleCell && e.oldValue !== undefined && e.oldValue !== null) {
            oldVal = String(e.oldValue).trim();
            if (newVal === oldVal) continue;
          }

          var triggerKeys = ["progresscenter", "progress", "statuskerja", "jamberangkat", "jampulang", "statusupload"];
          if (triggerKeys.indexOf(colKey) !== -1) {
            changed[colKey] = { oldVal: oldVal, newVal: newVal };
            rowRelevant = true;
          } else if (DAYS.indexOf(colKey) !== -1 || colKey === "jumlahcenter") {
            targetNotifs.push("*" + nama + "*\nTarget *" + colRaw + "*: " + (singleCell ? oldVal : "-") + " → *" + newVal + "* center");
            rowRelevant = true;
          }
        }

        if (Object.keys(changed).length > 0) {
          if (iTglUpdate !== -1) {
            sheet.getRange(row, iTglUpdate + 1).setValue(new Date());
            vals[iTglUpdate] = new Date();
          }
          processStaffNotification(nama, jabatan, changed, vals, lhdr);
          queuedSomething = true;
        }

        targetNotifs.forEach(function(text) {
          queueSimpleNotification(text, WA_CFG.ROUTES.TARGET_CHANGE);
          queuedSomething = true;
        });

        if (rowRelevant) _manualLogStaffUpdate(nik);
      }
    }

    // -- SHEET: SystemStatus ---------------------------------------
    else if (sName === "SystemStatus") {
      // Format sheet adalah Key di kolom A dan Value di kolom B.
      for (var rr = 0; rr < numRows; rr++) {
        var sysRow = startRow + rr;
        if (sysRow < 2) continue;

        for (var cc = 0; cc < numCols; cc++) {
          var sysCol = startCol + cc;
          if (sysCol !== 2) continue;

          var keyCell = String(sheet.getRange(sysRow, 1).getValue() || "").trim();
          if (!keyCell) continue;

          var rawNew = sheet.getRange(sysRow, 2).getValue();
          var newSVal = String(rawNew === null || rawNew === undefined ? "" : rawNew).trim();
          var oldSVal = "";
          if (singleCell && e.oldValue !== undefined && e.oldValue !== null) {
            oldSVal = String(e.oldValue).trim();
            if (newSVal === oldSVal) continue;
          }

          // Balancing dan pengumuman juga masuk antrean yang sama agar edit beruntun
          // tidak pecah menjadi beberapa pesan. Builder lama tetap menentukan format akhirnya.
          queueSystemStatusUpdate(keyCell, newSVal, oldSVal, "Manual Sheet Edit");
          queuedSomething = true;
          _manualLogSystemUpdate("System status updated. " + keyCell + ": " + newSVal);
        }
      }
    }

  } catch(err) {
    Logger.log("onSpreadsheetEdit ERROR: " + err + (err && err.stack ? "\n" + err.stack : ""));
  }

  // Untuk edit manual, tunggu dari perubahan terakhir sehingga beberapa edit cepat
  // tergabung. Time trigger tetap menjadi safety-net jika eksekusi ini terputus.
  if (queuedSomething) {
    try { _manualDebounceFlush(); } catch(flushErr) { Logger.log("Manual debounce flush ERROR: " + flushErr); }
  }
}

// Sengaja tidak meneruskan simple trigger ke handler utama agar edit tidak diproses
// dua kali. setupRequiredTriggers() memasang installable onEdit yang punya izin penuh.
function onEdit(e) {
  return;
}


// -------------------------------------------------------------------
//  M — SETUP TRIGGER OTOMATIS
// -------------------------------------------------------------------

function setupRequiredTriggers() {
  var ss = _waGetSS();
  if (!ss) {
    var msg1 = "• Spreadsheet tidak ditemukan. Buka script dari Spreadsheet atau atur DB_ID.";
    Logger.log(msg1);
    try { SpreadsheetApp.getUi().alert(msg1); } catch(e){}
    return;
  }

  var legacyReports = {
    "sendDailyOpening": true,
    "sendMiddayProgressReport": true,
    "sendMissedTargetAlert": true,
    "sendDailyClosing": true,
    "sendWhatsAppProgressReport": true,
    "sendTelegramProgressReport": true,
    "sendUnifiedProgressReport": true
  };

  var res = [];
  var existing = {};
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (legacyReports[fn]) {
      try {
        ScriptApp.deleteTrigger(t);
        res.push("• DIHAPUS: " + fn + " (laporan berkala dinonaktifkan)");
      } catch(e) {
        res.push("• GAGAL HAPUS: " + fn + " — " + e);
      }
      return;
    }
    if (!existing[fn]) existing[fn] = [];
    existing[fn].push(t);
  });

  // Pastikan hanya satu installable edit trigger untuk mencegah notifikasi ganda.
  if (existing["onSpreadsheetEdit"] && existing["onSpreadsheetEdit"].length > 1) {
    existing["onSpreadsheetEdit"].slice(1).forEach(function(t) {
      try { ScriptApp.deleteTrigger(t); } catch(e) {}
    });
    existing["onSpreadsheetEdit"] = existing["onSpreadsheetEdit"].slice(0, 1);
    res.push("• DUPLIKAT onSpreadsheetEdit dibersihkan");
  }

  if (!existing["onSpreadsheetEdit"] || !existing["onSpreadsheetEdit"].length) {
    try {
      ScriptApp.newTrigger("onSpreadsheetEdit").forSpreadsheet(ss).onEdit().create();
      res.push("• BERHASIL BUAT: onSpreadsheetEdit (Edit Spreadsheet → debounce update)");
    } catch(e) {
      res.push("• GAGAL: onSpreadsheetEdit — " + e);
    }
  } else {
    res.push("\u25AA\uFE0F SUDAH ADA: onSpreadsheetEdit");
  }

  // Reset harian tetap diperlukan untuk fungsi aplikasi, tetapi bukan laporan berkala.
  if (!existing["checkAndPerformDailyReset"] || !existing["checkAndPerformDailyReset"].length) {
    try {
      ScriptApp.newTrigger("checkAndPerformDailyReset").timeBased().everyDays(1).atHour(0).create();
      res.push("• BERHASIL BUAT: checkAndPerformDailyReset (Auto Reset Harian)");
    } catch(e) {
      res.push("• GAGAL: checkAndPerformDailyReset — " + e);
    }
  } else {
    res.push("\u25AA\uFE0F SUDAH ADA: checkAndPerformDailyReset");
  }

  var outStr = "=== HASIL SETUP TRIGGER ===\n" + res.join("\n") +
    "\n\nMODE: UPDATE-ONLY\nLaporan pagi/siang/sore/closing: NONAKTIF" +
    "\n===========================";
  Logger.log("\n" + outStr);

  try {
    SpreadsheetApp.getUi().alert("Setup Trigger Selesai", outStr, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch(e) {}
}


// -------------------------------------------------------------------
//  N — STATUS, DIAGNOSTICS & TESTS
// -------------------------------------------------------------------

function testSendWhatsApp() {
  var ok = sendWhatsAppMessage("✅ *Tes koneksi WhatsApp berhasil!* Mesin notifikasi KMD Check aktif", {force:true, route:"ALL"});
  try { SpreadsheetApp.getUi().alert("Tes WhatsApp: " + (ok ? "BERHASIL •" : "GAGAL •")); } catch(e){}
}

function testSendTelegram() {
  var ok = sendTelegramMessage("✅ <b>Tes koneksi Telegram berhasil!</b>\n━━━━━━━━━━━━━━━━━━\nBot notifikasi KMD Check aktif");
  try { SpreadsheetApp.getUi().alert("Tes Telegram: " + (ok ? "BERHASIL •" : "GAGAL •")); } catch(e){}
}

function waResetRateLimits() {
  var props = PropertiesService.getScriptProperties();
  ["WA_LAST_MS","WA_HOUR_KEY","WA_HOUR_CNT","WA_DEDUP_HASH","WA_DEDUP_TS","WA_ALLDONE_DATE",
   "WA_PENDING_STAFF","WA_PENDING_SYS","WA_PENDING_EXTRA","WA_PENDING_LAST_TS","TG_DELETE_QUEUE"]
    .forEach(function(k){ props.deleteProperty(k); });

  var all = props.getProperties();
  Object.keys(all).forEach(function(k) {
    if (k.indexOf("WA_SEND_RES_") === 0) props.deleteProperty(k);
  });

  _waResetProgressDashboardState();
  Logger.log("• Rate-limit, antrean, reservation, dan state progress WA direset; backlog delete gagal tetap disimpan.");
  try { SpreadsheetApp.getUi().alert("• Rate-limit & antrean berhasil direset!"); } catch(e){}
}

function waCheckStatus() {
  var wCfg = _waCfg();
  var tCfg = _tgCfg();
  var triggers = ScriptApp.getProjectTriggers().map(function(t){ return t.getHandlerFunction(); });

  var lines = [
    "=== STATUS NOTIFIKASI KMD CHECK ===",
    "Mode: " + (WA_CFG.UPDATES_ONLY ? "UPDATE-ONLY" : "NORMAL"),
    "\u25AA\uFE0F WA Token: " + (wCfg.token ? "OK" : "KOSONG"),
    "\u25AA\uFE0F WA Grup : " + (wCfg.groups.length ? wCfg.groups.join(", ") : "KOSONG"),
    "\u25AA\uFE0F WA Fonnte Fallback: " + (wCfg.fonnteToken ? "Aktif" : "Tidak Aktif"),
    "",
    "\u25AA\uFE0F TG Bot Token: " + (tCfg.botToken ? "OK" : "KOSONG"),
    "\u25AA\uFE0F TG Chat IDs  : " + (tCfg.chatIds.length ? tCfg.chatIds.join(", ") : "KOSONG"),
    "",
    "• Trigger Aktif (" + triggers.length + "):",
    triggers.length ? ("• " + triggers.join("\n• ")) : "Belum ada (jalankan setupRequiredTriggers)"
  ];

  var outStr = lines.join("\n");
  Logger.log(outStr);
  try { SpreadsheetApp.getUi().alert("Status Notifikasi", outStr, SpreadsheetApp.getUi().ButtonSet.OK); } catch(e){}
}


// -------------------------------------------------------------------
//  O — WHATSAPP BOT WEBHOOK (INTERACTIVE COMMANDS)
// -------------------------------------------------------------------

function handleWhatsAppWebhook(e, body) {
  try {
    if (!body) {
      if (!e || !e.postData || !e.postData.contents) return _wbOk();
      body = JSON.parse(e.postData.contents);
    }
    var msg = _wbParse(body);
    if (!msg || !msg.text)                      return _wbOk();
    if (msg.text.charAt(0) !== WA_BOT.PREFIX)   return _wbOk();
    if (!_wbIsAuthorized(msg))                  return _wbOk();

    var parts = msg.text.trim().split(/\s+/);
    var cmd   = parts[0].toLowerCase();
    var args  = parts.slice(1);
    if (!_wbCanExec(msg.from, cmd)) return _wbOk();

    var reply = _wbDispatch(cmd, args, msg);
    if (reply) {
      _wbRecordExec(msg.from, cmd);
      _waDirectSend(msg.replyTo, reply);
    }
  } catch(err) {
    Logger.log("handleWhatsAppWebhook ERROR: " + err);
  }
  return _wbOk();
}

function _wbOk() {
  return ContentService.createTextOutput(JSON.stringify({"status":"ok"}))
    .setMimeType(ContentService.MimeType.JSON);
}

function _wbParse(body) {
  if (!body) return null;
  var text    = String(body["Body"]      || body["body"]     || body["message"] || "").trim();
  var from    = String(body["SenderJID"] || body["From"]     || body["from"]    || body["sender"] || "");
  var chat    = String(body["Chat"]      || body["chat"]     || body["group"]   || from);
  var isGroup = !!(body["IsGroup"] || body["isGroup"] || chat.indexOf("@g.us") !== -1);
  var name    = String(body["PushName"]  || body["pushName"] || "");
  if (body["IsFromMe"] || body["isFromMe"]) return null;
  if (!text) return null;
  return { text: text, from: from, chat: chat, isGroup: isGroup, name: name, replyTo: isGroup ? chat : from };
}

function _wbIsAuthorized(msg) {
  if (!WA_BOT.ENABLED) return false;
  if (WA_BOT.GROUP_ONLY && msg.isGroup) {
    var cfg = _waCfg(); if (cfg.groups.indexOf(msg.chat) === -1) return false;
  }
  if (WA_BOT.ALLOWED_SENDERS && WA_BOT.ALLOWED_SENDERS.length > 0) {
    if (WA_BOT.ALLOWED_SENDERS.indexOf(msg.from) === -1) return false;
  }
  return true;
}

function _wbCanExec(from, cmd) {
  var k    = "WB_" + from.replace(/\W/g, "_").substring(0, 40) + "_" + cmd.replace(/\W/g, "").substring(0, 15);
  var last = parseInt(PropertiesService.getScriptProperties().getProperty(k) || "0", 10);
  if (Date.now() - last < WA_BOT.CMD_COOLDOWN_S * 1000) return false;
  return true;
}

function _wbRecordExec(from, cmd) {
  var k = "WB_" + from.replace(/\W/g, "_").substring(0, 40) + "_" + cmd.replace(/\W/g, "").substring(0, 15);
  PropertiesService.getScriptProperties().setProperty(k, String(Date.now()));
}

function _wbDispatch(cmd, args, msg) {
  var map = {
    "/menu": _wbMenu, "/help": _wbMenu,
    "/staf": _wbStaf, "/laporan": _wbStaf,
    "/jadwal"     : _wbJadwal,
    "/msa"        : _wbMsa,
    "/fsa"        : _wbFsa,
    "/manager"    : _wbManager,
    "/status"     : _wbStatus,
    "/pengumuman" : _wbPengumuman,
    "/profil"     : _wbProfil,
    "/ringkasan"  : _wbRingkasan,
    "/ping"       : _wbPing
  };
  var fn = map[cmd]; return fn ? fn(args, msg) : null;
}

function _wbPing(a, m) {
  return "\u25AA\uFE0F *KMD Bot aktif!*\n_" + Utilities.formatDate(new Date(), "GMT+7", "HH:mm") + " WIB_ •";
}

function _wbMenu(a, m) {
  return [
    "\u25AA\uFE0F *MENU PERINTAH — KMD BOT*", "━━━━━━━━━━━━━━━━━━━━━",
    "\u25AA\uFE0F */staf*          — Progres staf hari ini",
    "\u25AA\uFE0F */staf [nama]*   — Cari progres staf tertentu",
    "\u25AA\uFE0F */jadwal*        — Jadwal center hari ini",
    "\u25AA\uFE0F */msa*           — Status MSA",
    "\u25AA\uFE0F */fsa*           — Status FSA",
    "\u25AA\uFE0F */manager*       — Status Manager & ABM",
    "\u25AA\uFE0F */status*        — Status sistem & kantor",
    "\u25AA\uFE0F */pengumuman*    — Pengumuman terkini",
    "\u25AA\uFE0F */profil*        — Profil KMD Cibeunying",
    "\u25AA\uFE0F */ringkasan*     — Ringkasan akhir hari",
    "\u25AA\uFE0F */ping*          — Cek bot aktif",
    "━━━━━━━━━━━━━━━━━━━━━", "_" + WA_CFG.WEB_URL + "_"
  ].join("\n");
}

function _wbStaf(args, m) {
  if (args && args.length > 0) {
    var cari = args.join(" ").toLowerCase();
    var rows = _waGetProgressDataRaw().filter(function(r){ return r.nama.toLowerCase().indexOf(cari) !== -1; });
    if (!rows.length) return "• Staf *\"" + args.join(" ") + "\"* tidak ditemukan.";
    var jam = Utilities.formatDate(new Date(), "GMT+7", "HH:mm");
    var out = ["\u25AA\uFE0F *PROGRES STAF*", "_" + jam + " WIB_", "━━━━━━━━━━━━━━━━━━━━━"];
    rows.forEach(function(r){
      var ic = r.done ? "•" : (r.prog > 0 ? "\u25AA\uFE0F" : "•");
      out.push(ic + " *" + r.nama + "* — " + r.prog + "/" + r.target + " Ctr" + (r.done ? "" : (" (sisa " + r.sisa + ")")));
    });
    return out.join("\n");
  }
  return _waBuildProgressText();
}

function _wbJadwal(a, m) {
  var rows = _waGetProgressDataRaw(); if (!rows.length) return "\u25AA\uFE0F Tidak ada jadwal center hari ini.";
  var hari  = _waGetWIBDayName(new Date());
  var total = rows.reduce(function(s, r){ return s + r.target; }, 0);
  var out   = ["\u25AA\uFE0F *JADWAL CENTER — " + hari.toUpperCase() + "*", "━━━━━━━━━━━━━━━━━━━━━"];
  rows.forEach(function(r){ out.push("\u25AA\uFE0F *" + r.nama + "* • *" + r.target + "* center"); });
  out.push("━━━━━━━━━━━━━━━━━━━━━", "Total: *" + total + "* center | *" + rows.length + "* staf");
  return out.join("\n");
}

function _wbByJabatan(jabFilter, header) {
  var list = _waReadStaffAll().filter(function(r){ return r.jab.toUpperCase().indexOf(jabFilter) !== -1; });
  if (!list.length) return "\u25AA\uFE0F Tidak ada staf *" + jabFilter + "* terdaftar.";
  var jam = Utilities.formatDate(new Date(), "GMT+7", "HH:mm");
  var out = [header, "_" + jam + " WIB_", "━━━━━━━━━━━━━━━━━━━━━"];
  list.forEach(function(s){
    out.push("• *" + s.nama + "*");
    out.push("  _" + s.jab + "_");
    out.push("  Status: " + s.statusKerja);
  });
  return out.join("\n");
}

function _wbMsa(a, m)     { return _wbByJabatan("MIS SUPPORT",     "\u25AA\uFE0F *STATUS MSA — KMD CIBEUNYING*"); }
function _wbFsa(a, m)     { return _wbByJabatan("FINANCE SYSTEM",  "\u25AA\uFE0F *STATUS FSA — KMD CIBEUNYING*"); }
function _wbManager(a, m) { return _wbByJabatan("MANAGER",         "\u25AA\uFE0F *STATUS MANAGER — KMD CIBEUNYING*"); }

function _wbStatus(a, m) {
  var kv  = _waReadKV(WA_BOT.SHEET_STATUS);
  var jam = Utilities.formatDate(new Date(), "GMT+7", "HH:mm");
  var out = ["\u25AA\uFE0F *STATUS SISTEM & KANTOR*", "_" + jam + " WIB_", "━━━━━━━━━━━━━━━━━━━━━"];
  if (!Object.keys(kv).length) {
    out.push("\u25AA\uFE0F Sheet *\"" + WA_BOT.SHEET_STATUS + "\"* belum ada data.");
  } else {
    var labels = {"statusKantor":"\u25AA\uFE0F Kantor","statusSistem":"\u25AA\uFE0F Sistem","statusBalancing":"\u25AA\uFE0F Balancing","pengumuman":"\u25AA\uFE0F Pengumuman"};
    Object.keys(kv).forEach(function(k){
      out.push((labels[k] || ("• " + k)) + ": *" + kv[k] + "*");
    });
  }
  return out.join("\n");
}

function _wbPengumuman(a, m) {
  var pg = (_waReadKV(WA_BOT.SHEET_STATUS))["pengumuman"] || "";
  if (!pg || pg.toLowerCase().indexOf("tidak ada") !== -1 || pg === "-")
    return "\u25AA\uFE0F *PENGUMUMAN*\n━━━━━━━━━━━━━━━━━━━━━\n\u25AA\uFE0F Tidak ada pengumuman saat ini.";
  return "\u25AA\uFE0F *PENGUMUMAN*\n━━━━━━━━━━━━━━━━━━━━━\n" + pg + "\n━━━━━━━━━━━━━━━━━━━━━\n_KMD Cibeunying_";
}

function _wbProfil(a, m) {
  var kv   = _waReadKV(WA_BOT.SHEET_PROFILE);
  var nama = kv["nama"]     || kv["Nama"]     || "Koperasi Mitra Dhuafa (KMD)";
  var cab  = kv["cabang"]   || kv["Cabang"]   || "Cabang Cibeunying, Bandung";
  var almt = kv["alamat"]   || kv["Alamat"]   || "Bandung, Jawa Barat";
  var telp = kv["telp"]     || kv["Telp"]     || "-";
  var web  = kv["website"]  || kv["Website"]  || WA_CFG.WEB_URL;
  var desk = kv["deskripsi"]|| kv["Deskripsi"]|| "Koperasi simpan pinjam berbasis syariah.";
  return ["\u25AA\uFE0F *PROFIL KOPERASI*", "━━━━━━━━━━━━━━━━━━━━━",
    "\u25AA\uFE0F Nama   : *" + nama + "*", "\u25AA\uFE0F Cabang : " + cab,
    "\u25AA\uFE0F Alamat : " + almt, "\u25AA\uFE0F Telp   : " + telp, "\u25AA\uFE0F Web    : " + web,
    "━━━━━━━━━━━━━━━━━━━━━", "_" + desk + "_"
  ].join("\n");
}

function _wbRingkasan(a, m) {
  return _waBuildDailyClosing() || "\u25AA\uFE0F Belum ada data ringkasan untuk hari ini.";
}