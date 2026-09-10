const SCRIPT_VERSION = "1.3";
var KMD_WRITE_LOCK_HELD = false; // Hindari deadlock saat broker notifikasi dipanggil dari write API.

function getDB() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DB_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch(e) {}
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    props.setProperty('DB_ID', ss.getId());
    return ss;
  }
  
  ss = SpreadsheetApp.create("KMD Monitoring Database");
  props.setProperty('DB_ID', ss.getId());
  return ss;
}

function setup() {
  var ss = getDB();
  
  var sheets = ["Users", "Staff", "ActivityLog", "Transactions", "SystemStatus"];
  sheets.forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
    }
  });
  
  // Setup Users
  var usersSheet = ss.getSheetByName("Users");
  if (usersSheet.getLastRow() === 0) {
    usersSheet.appendRow(["Username", "Password", "Role"]);
    usersSheet.appendRow(["admin", "admin123", "ADMIN"]);
    usersSheet.appendRow(["viewer", "viewer123", "USER"]);
  }
  
  // Setup Staff
  var staffSheet = ss.getSheetByName("Staff");
  if (staffSheet.getLastRow() === 0) {
    staffSheet.appendRow(["NIK", "Nama", "Jabatan", "StatusKerja", "JamBerangkat", "JamPulang", "ProgressCenter", "JumlahCenter", "StatusUpload", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "TanggalUpdate"]);
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    var initialStaff = [
      ["001196/2013", "Dadi Supriyadi", "BRANCH MANAGER", "Di Kantor", "", "", 0, 0, "Tidak ada Center", 0, 0, 0, 0, 0, today],
      ["001557/2014", "Arsad Awaludin", "ASSISTANT BRANCH MANAGER", "Di Kantor", "", "", 0, 0, "Tidak ada Center", 0, 0, 0, 0, 0, today],
      ["001839/2015", "Cep Dullatip", "MIS SUPPORT ADMINISTRATION STAFF", "Di Kantor", "", "", 0, 0, "Tidak ada Center", 0, 0, 0, 0, 0, today],
      ["006255/2018", "Rian Saepul Rahman", "FIELD OFFICER", "Di Kantor", "", "", 0, 6, "Sudah upload semua", 4, 6, 5, 7, 2, today],
      ["006983/2019", "Karmin Rahmadi", "FIELD OFFICER", "Di Kantor", "", "", 0, 4, "Sudah upload semua", 4, 4, 6, 7, 2, today],
      ["009364/2022", "Zacky Januar Moch Syarif", "FIELD OFFICER", "Di Kantor", "", "", 0, 3, "Sudah upload semua", 8, 3, 5, 4, 2, today],
      ["0357/05/26", "Moch. Argiansyah", "FIELD OFFICER", "Di Kantor", "", "", 0, 5, "Sudah upload semua", 6, 5, 6, 7, 2, today],
      ["010348/2023", "Jaka Supriatna", "FIELD OFFICER", "Di Kantor", "", "", 0, 5, "Sudah upload semua", 8, 5, 7, 9, 0, today],
      ["010755/2023", "Fajar Faturohman", "FINANCE SYSTEM ADMINISTRATION STAFF", "Di Kantor", "", "", 0, 0, "Tidak ada Center", 0, 0, 0, 0, 0, today],
      ["011199/2023", "Fajar Fauzan", "FIELD OFFICER", "Di Kantor", "", "", 0, 6, "Sudah upload semua", 5, 6, 6, 5, 1, today],
      ["011143/2023", "Sansan Nugraha", "FIELD OFFICER", "Di Kantor", "", "", 0, 8, "Sudah upload semua", 5, 8, 13, 5, 1, today],
      ["0703/06/26", "Muhamad Rizki Setiawan", "FIELD OFFICER", "Di Kantor", "", "", 0, 9, "Sudah upload semua", 6, 9, 10, 6, 6, today],
      ["012535/2024", "Muhammad Ilham", "FIELD OFFICER", "Di Kantor", "", "", 0, 9, "Sudah upload semua", 9, 9, 7, 11, 2, today],
      ["0363/05/26", "Yoga Rahmat Mauldi", "FIELD OFFICER", "Di Kantor", "", "", 0, 7, "Sudah upload semua", 3, 7, 7, 6, 3, today],
      ["0841/07/26", "Saeful Anwar", "FIELD OFFICER", "Di Kantor", "", "", 0, 3, "Sudah upload semua", 2, 3, 0, 0, 0, today]
    ];
    initialStaff.forEach(function(row) { staffSheet.appendRow(row); });
  } else {
    // Ensure and auto-heal existing headers
    _ensureAndFixStaffHeaders(staffSheet);
  }
  
  // Setup SystemStatus
  var sysSheet = ss.getSheetByName("SystemStatus");
  if (sysSheet.getLastRow() === 0) {
    sysSheet.appendRow(["Key", "Value"]);
    sysSheet.appendRow(["statusKantor", "Operasional normal"]);
    sysSheet.appendRow(["statusSistem", "Normal"]);
    sysSheet.appendRow(["statusMSA", "💻 Bekerja"]);
    sysSheet.appendRow(["statusFSA", "Menerima Transaksi"]);
    sysSheet.appendRow(["statusBalancing", "Proses"]);
  }
  
  // Panggil fungsi pembuat trigger otomatis jika tersedia
  try {
    if (typeof setupRequiredTriggers === 'function') {
      setupRequiredTriggers();
    }
  } catch (trigErr) {
    Logger.log("Gagal membuat trigger otomatis pada setup: " + trigErr.toString());
  }
  
  return "Setup complete. Database ready. Spreadsheet URL: " + ss.getUrl();
}

function doPost(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      var data = JSON.parse(e.postData.contents);
      // Route WhatsApp webhook requests (which have event/Event/data/Data/Body/SenderJID but no action)
      if ((data.event || data.Event || data.data || data.Data || data.Body || data.body || data.message || data.SenderJID || data.sender) && !data.action) {
        if (typeof handleWhatsAppWebhook === 'function') {
          return handleWhatsAppWebhook(e, data);
        }
      }
    }
  } catch (routeErr) {
    Logger.log("Failed routing in doPost: " + routeErr.toString());
  }

  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var result = {};
    
    // Acquire lock ONLY for write operations to prevent blocking read/login requests
    var isWrite = [
      "updateStaff", "bulkUpdateStaff", "updateSystem", "resetProgress", 
      "addLog", "deleteLog", "manageCompanyProfile", "manageUser", "manageStaff", "setup"
    ].indexOf(action) > -1;
    
    var lock = null;
    if (isWrite) {
      lock = LockService.getScriptLock();
      try {
        lock.waitLock(15000); // Wait up to 15 seconds for write lock
        KMD_WRITE_LOCK_HELD = true;
      } catch (lockError) {
        output.setContent(JSON.stringify({ success: false, error: "Database Lock Timeout. Silakan coba beberapa saat lagi." }));
        return output;
      }
    }
    
    try {
      if (action === "login") {
        result = login(data.username, data.password);
      } else if (action === "getData") {
        result = getData();
      } else if (action === "updateStaff") {
        result = updateStaff(data.nik, data.updates);
      } else if (action === "bulkUpdateStaff") {
        result = bulkUpdateStaff(data.updatesList);
      } else if (action === "updateSystem") {
        result = updateSystem(data.updates);
      } else if (action === "resetProgress") {
        result = resetProgress(data.isAuto, data.todayStr);
      } else if (action === "addLog") {
        result = addLogClient(data.actionName, data.details, data.user);
      } else if (action === "deleteLog") {
        result = deleteLog(data.id);
      } else if (action === "manageCompanyProfile") {
        result = manageCompanyProfile(data.payload);
      } else if (action === "manageUser") {
        result = manageUser(data.payload);
      } else if (action === "manageStaff") {
        result = manageStaff(data.payload);
      } else if (action === "setup") {
        result = { message: setup() };
      }
      
      output.setContent(JSON.stringify({ success: true, data: result }));
    } finally {
      if (lock) {
        KMD_WRITE_LOCK_HELD = false;
        try {
          lock.releaseLock();
        } catch(releaseError) {}
      }
    }
  } catch (err) {
    output.setContent(JSON.stringify({ success: false, error: err.message || err.toString() }));
  }
  
  return output;
}

function doGet(e) {
  var output = ContentService.createTextOutput(JSON.stringify({ status: "GAS Backend is running", version: SCRIPT_VERSION }));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function login(username, password) {
  var sheet = getDB().getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  var inputUser = String(username || "").trim().toLowerCase();
  var inputPass = String(password || "").trim();
  
  for (var i = 1; i < data.length; i++) {
    var checkUsername = String(data[i][0] || "").trim().toLowerCase();
    var checkPassword = String(data[i][1] || "").trim();
    
    if (checkUsername === inputUser && checkPassword === inputPass) {
      return { username: data[i][0], role: data[i][2] };
    }
  }
  throw new Error("Username atau password salah");
}

function _ensureAndFixStaffHeaders(staffSheet) {
  if (!staffSheet || staffSheet.getLastRow() === 0) return;
  var headers = staffSheet.getRange(1, 1, 1, staffSheet.getLastColumn()).getValues()[0];
  var lowerH = headers.map(function(h) { return String(h || '').toLowerCase().replace(/\s+/g, ''); });
  
  var iProg = lowerH.indexOf('progresscenter');
  if (iProg === -1) iProg = lowerH.indexOf('progress');
  var iJml = lowerH.indexOf('jumlahcenter');
  if (iJml === -1) iJml = lowerH.indexOf('targetcenter');
  if (iJml === -1) iJml = lowerH.indexOf('target');
  var iUpload = lowerH.indexOf('statusupload');
  if (iUpload === -1) iUpload = lowerH.indexOf('upload');
  
  // Check if header row is missing JumlahCenter between ProgressCenter and StatusUpload
  if (iJml === -1 && iProg !== -1 && iUpload === iProg + 1) {
    if (staffSheet.getLastRow() > 1) {
      var sampleVal = staffSheet.getRange(2, iUpload + 1).getValue();
      // If sampleVal is numeric, the data is shifted because JumlahCenter was not in header!
      if (typeof sampleVal === 'number' || (!isNaN(Number(sampleVal)) && String(sampleVal).trim() !== '' && !String(sampleVal).toLowerCase().includes('upload'))) {
        staffSheet.insertColumnAfter(iProg + 1);
        staffSheet.getRange(1, iProg + 2).setValue("JumlahCenter");
        Logger.log("Staff sheet auto-healed: Inserted missing 'JumlahCenter' column.");
      }
    }
  }

  // Ensure daily and metadata columns exist
  var currentHeaders = staffSheet.getRange(1, 1, 1, staffSheet.getLastColumn()).getValues()[0];
  var required = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'TanggalUpdate'];
  for (var k = 0; k < required.length; k++) {
    var found = false;
    for (var m = 0; m < currentHeaders.length; m++) {
      if (String(currentHeaders[m] || '').toLowerCase().replace(/\s+/g, '') === required[k].toLowerCase()) {
        found = true;
        break;
      }
    }
    if (!found) {
      staffSheet.getRange(1, staffSheet.getLastColumn() + 1).setValue(required[k]);
      currentHeaders.push(required[k]);
    }
  }
}

function _resolveStaffFieldIndices(lowerHeaders) {
  function find(aliases) {
    for (var i = 0; i < aliases.length; i++) {
      var idx = lowerHeaders.indexOf(aliases[i]);
      if (idx !== -1) return idx;
    }
    return -1;
  }
  return {
    nik: find(['nik', 'id', 'nomorinduk', 'nikstaf']),
    nama: find(['nama', 'name', 'namastaf', 'namalengkap', 'petugas']),
    jabatan: find(['jabatan', 'role', 'posisi', 'jabatanstaf']),
    statusKerja: find(['statuskerja', 'status', 'statusoperasional', 'kehadiran', 'kondisi']),
    jamBerangkat: find(['jamberangkat', 'jamkeluar', 'berangkat', 'keluar', 'waktuberangkat', 'waktukeluar']),
    jamPulang: find(['jampulang', 'jammasuk', 'pulang', 'masuk', 'waktupulang', 'waktumasuk']),
    progressCenter: find(['progresscenter', 'progress', 'realisasi', 'tercapai', 'sudah']),
    jumlahCenter: find(['jumlahcenter', 'targetcenter', 'target', 'center', 'targetharian']),
    statusUpload: find(['statusupload', 'upload', 'status_upload']),
    keterangan: find(['keterangan', 'catatan', 'ket', 'note', 'notes']),
    senin: find(['senin', 'mon', 'monday']),
    selasa: find(['selasa', 'tue', 'tuesday']),
    rabu: find(['rabu', 'wed', 'wednesday']),
    kamis: find(['kamis', 'thu', 'thursday']),
    jumat: find(['jumat', 'fri', 'friday']),
    tanggalUpdate: find(['tanggalupdate', 'tglupdate', 'updatedat', 'timestamp', 'terakhirdiupdate'])
  };
}

function _resolveColumnIndexForField(lowerHeaders, fieldName) {
  var clean = String(fieldName || "").toLowerCase().replace(/[^a-z0-9]/g, '');
  
  var directIdx = lowerHeaders.indexOf(clean);
  if (directIdx !== -1) return directIdx;
  
  var aliasesMap = {
    nik: ['nik', 'id', 'nomorinduk', 'nikstaf'],
    nama: ['nama', 'name', 'namastaf', 'namalengkap', 'petugas'],
    jabatan: ['jabatan', 'role', 'posisi', 'jabatanstaf'],
    statuskerja: ['statuskerja', 'status', 'statusoperasional', 'kehadiran', 'kondisi'],
    status: ['statuskerja', 'status', 'statusoperasional', 'kehadiran', 'kondisi'],
    jamberangkat: ['jamberangkat', 'jamkeluar', 'berangkat', 'keluar', 'waktuberangkat', 'waktukeluar'],
    berangkat: ['jamberangkat', 'jamkeluar', 'berangkat', 'keluar', 'waktuberangkat', 'waktukeluar'],
    jampulang: ['jampulang', 'jammasuk', 'pulang', 'masuk', 'waktupulang', 'waktumasuk'],
    pulang: ['jampulang', 'jammasuk', 'pulang', 'masuk', 'waktupulang', 'waktumasuk'],
    progresscenter: ['progresscenter', 'progress', 'realisasi', 'tercapai', 'sudah'],
    progress: ['progresscenter', 'progress', 'realisasi', 'tercapai', 'sudah'],
    jumlahcenter: ['jumlahcenter', 'targetcenter', 'target', 'center', 'targetharian'],
    jumlah: ['jumlahcenter', 'targetcenter', 'target', 'center', 'targetharian'],
    target: ['jumlahcenter', 'targetcenter', 'target', 'center', 'targetharian'],
    statusupload: ['statusupload', 'upload', 'status_upload'],
    upload: ['statusupload', 'upload', 'status_upload'],
    keterangan: ['keterangan', 'catatan', 'ket', 'note', 'notes'],
    catatan: ['keterangan', 'catatan', 'ket', 'note', 'notes'],
    senin: ['senin', 'mon', 'monday'],
    selasa: ['selasa', 'tue', 'tuesday'],
    rabu: ['rabu', 'wed', 'wednesday'],
    kamis: ['kamis', 'thu', 'thursday'],
    jumat: ['jumat', 'fri', 'friday'],
    tanggalupdate: ['tanggalupdate', 'tglupdate', 'updatedat', 'timestamp', 'terakhirdiupdate']
  };

  var targetAliases = aliasesMap[clean];
  if (targetAliases) {
    for (var a = 0; a < targetAliases.length; a++) {
      var idx = lowerHeaders.indexOf(targetAliases[a]);
      if (idx !== -1) return idx;
    }
  }
  
  return -1;
}

function _findStaffRowIndex(sheetData, lowerHeaders, targetNik) {
  var normTarget = getNormalizedNikValue(targetNik);
  if (!normTarget) return -1;
  
  var indices = _resolveStaffFieldIndices(lowerHeaders);
  var nikIdx = indices.nik !== -1 ? indices.nik : 0;
  
  // 1. Primary check: column resolved by NIK header
  for (var i = 1; i < sheetData.length; i++) {
    var row = sheetData[i];
    if (!row || row.length === 0) continue;
    var rowNik = getNormalizedNikValue(row[nikIdx]);
    if (rowNik === normTarget) {
      return i;
    }
  }
  
  // 2. Secondary check: column 0 (Column A) if different from nikIdx
  if (nikIdx !== 0) {
    for (var i = 1; i < sheetData.length; i++) {
      var row = sheetData[i];
      if (!row || row.length === 0) continue;
      var rowNik = getNormalizedNikValue(row[0]);
      if (rowNik === normTarget) {
        return i;
      }
    }
  }

  // 3. Fallback scan across all cells in each row for matching NIK or exact matching name
  for (var i = 1; i < sheetData.length; i++) {
    var row = sheetData[i];
    if (!row || row.length === 0) continue;
    for (var c = 0; c < row.length; c++) {
      if (getNormalizedNikValue(row[c]) === normTarget) {
        return i;
      }
    }
    if (indices.nama !== -1 && getNormalizedNikValue(row[indices.nama]) === normTarget) {
      return i;
    }
  }

  return -1;
}

function getData() {
  var ss = getDB();
  
  // Auto-setup if key sheets are missing
  if (!ss.getSheetByName("Staff") || !ss.getSheetByName("SystemStatus") || !ss.getSheetByName("Users")) {
    setup();
  }
  
  // Get Staff
  var staffSheet = ss.getSheetByName("Staff");
  _ensureAndFixStaffHeaders(staffSheet);
  
  var staffData = staffSheet.getDataRange().getValues();
  var staff = [];
  
  if (staffData.length > 1) {
    var headers = staffData[0];
    var today = new Date();
    // Get components in Asia/Jakarta timezone to align with client and local branch operations
    var jakartaStr = Utilities.formatDate(today, "Asia/Jakarta", "yyyy-MM-dd-HH-mm-ss");
    var jParts = jakartaStr.split('-');
    var targetDate = new Date(parseInt(jParts[0]), parseInt(jParts[1]) - 1, parseInt(jParts[2]), parseInt(jParts[3]), parseInt(jParts[4]), parseInt(jParts[5]));
    
    // Get day index (0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu)
    var dayIndex = targetDate.getDay();
    var dayKeys = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    var currentDayKey = dayKeys[dayIndex];
    
    // Normalize headers to be completely case and space insensitive
    var lowerHeaders = headers.map(function(h) {
      return String(h || "").toLowerCase().replace(/\s+/g, '');
    });
    
    var indices = _resolveStaffFieldIndices(lowerHeaders);
    var idxDay = _resolveColumnIndexForField(lowerHeaders, currentDayKey);
    if (idxDay === -1 && indices[currentDayKey] !== undefined) {
      idxDay = indices[currentDayKey];
    }
    
    for (var i = 1; i < staffData.length; i++) {
      var row = staffData[i];
      
      // Skip empty rows
      if (!row || row.length === 0 || String(row[0] || "").trim() === "") continue;
      
      var nik = indices.nik !== -1 ? String(row[indices.nik] || "").trim() : String(row[0] || "").trim();
      if (!nik) continue;
      
      var nama = indices.nama !== -1 ? String(row[indices.nama] || "").trim() : "";
      var jabatan = indices.jabatan !== -1 ? String(row[indices.jabatan] || "FIELD OFFICER").trim() : "FIELD OFFICER";
      var statusKerja = indices.statusKerja !== -1 ? String(row[indices.statusKerja] || "Di Kantor").trim() : "Di Kantor";
      
      var jamBerangkat = indices.jamBerangkat !== -1 ? row[indices.jamBerangkat] : "";
      if (jamBerangkat instanceof Date) jamBerangkat = Utilities.formatDate(jamBerangkat, Session.getScriptTimeZone(), "HH:mm");
      else jamBerangkat = String(jamBerangkat || "").trim();

      var jamPulang = indices.jamPulang !== -1 ? row[indices.jamPulang] : "";
      if (jamPulang instanceof Date) jamPulang = Utilities.formatDate(jamPulang, Session.getScriptTimeZone(), "HH:mm");
      else jamPulang = String(jamPulang || "").trim();

      var progressCenter = indices.progressCenter !== -1 ? Number(row[indices.progressCenter] || 0) : 0;
      if (isNaN(progressCenter)) progressCenter = 0;

      // Day target: Senin, Selasa, Rabu, Kamis, Jumat (Authoritative schedule for today)
      var dayTarget = null;
      if (dayIndex >= 1 && dayIndex <= 5 && idxDay !== -1) {
        var cellVal = row[idxDay];
        if (cellVal !== "" && cellVal !== null && !isNaN(Number(cellVal))) {
          dayTarget = Number(cellVal);
        }
      }
        
      var fallbackTarget = (indices.jumlahCenter !== -1 && row[indices.jumlahCenter] !== "" && row[indices.jumlahCenter] !== null && !isNaN(Number(row[indices.jumlahCenter])))
        ? Number(row[indices.jumlahCenter])
        : 0;

      var jumlahCenter = dayTarget !== null ? dayTarget : fallbackTarget;

      // Status Upload: derive or sanitize
      var rawUpload = indices.statusUpload !== -1 ? String(row[indices.statusUpload] || "").trim() : "";
      if (jumlahCenter === 0) {
        rawUpload = "Tidak ada Center";
      } else if (!rawUpload || (!isNaN(Number(rawUpload)) && rawUpload !== "")) {
        if (progressCenter >= jumlahCenter) rawUpload = "Sudah upload semua";
        else if (progressCenter > 0) rawUpload = "Sebagian upload";
        else rawUpload = "Belum upload";
      }

      var tanggalUpdate = indices.tanggalUpdate !== -1 ? row[indices.tanggalUpdate] : "";
      if (tanggalUpdate instanceof Date) tanggalUpdate = Utilities.formatDate(tanggalUpdate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
      else tanggalUpdate = String(tanggalUpdate || "").trim();

      var obj = {
        nik: nik,
        nama: nama,
        jabatan: jabatan,
        statusKerja: statusKerja,
        jamBerangkat: jamBerangkat,
        jamPulang: jamPulang,
        progressCenter: progressCenter,
        jumlahCenter: jumlahCenter,
        statusUpload: rawUpload,
        senin: indices.senin !== -1 ? Number(row[indices.senin] || 0) : 0,
        selasa: indices.selasa !== -1 ? Number(row[indices.selasa] || 0) : 0,
        rabu: indices.rabu !== -1 ? Number(row[indices.rabu] || 0) : 0,
        kamis: indices.kamis !== -1 ? Number(row[indices.kamis] || 0) : 0,
        jumat: indices.jumat !== -1 ? Number(row[indices.jumat] || 0) : 0,
        tanggalUpdate: tanggalUpdate
      };
      staff.push(obj);
    }
  }
  
  // Get System Status
  var sysSheet = ss.getSheetByName("SystemStatus");
  var sysData = sysSheet.getDataRange().getValues();
  var systemStatus = {};
  for (var i = 1; i < sysData.length; i++) {
    var rawKey = String(sysData[i][0] || "");
    var normKey = rawKey.trim();
    if (normKey) {
      systemStatus[normKey] = sysData[i][1];
    }
  }

  // Ensure default reset configurations and status keys exist in SystemStatus sheet
  var defaultsToEnsure = {
    "resetDefaultStatusKerja": "Di Kantor",
    "resetDefaultStatusUpload": "Belum upload",
    "resetDefaultStatusKantor": "Buka",
    "resetDefaultStatusSistem": "Normal",
    "resetDefaultStatusMSA": "💻 Bekerja",
    "resetDefaultStatusFSA": "Menerima Transaksi",
    "resetDefaultStatusBalancing": "Proses",
    "resetDefaultStatusManager": "💻 Bekerja",
    "resetDefaultStatusAsistenManager": "💻 Bekerja",
    "statusManager": "💻 Bekerja",
    "statusAsistenManager": "💻 Bekerja"
  };

  var addedAny = false;
  for (var key in defaultsToEnsure) {
    if (typeof systemStatus[key] === 'undefined' || systemStatus[key] === null || String(systemStatus[key]).trim() === "") {
      sysSheet.appendRow([key, defaultsToEnsure[key]]);
      systemStatus[key] = defaultsToEnsure[key];
      addedAny = true;
    }
  }
  if (addedAny) {
    // Refresh sysData
    sysData = sysSheet.getDataRange().getValues();
  }
  
  // Get Options
  var optionsSheet = ss.getSheetByName("Options");
  if (!optionsSheet) {
    optionsSheet = ss.insertSheet("Options");
    optionsSheet.appendRow(["Kategori", "Opsi"]);
    var defaultOptions = [
      ["statusKantor", "Operasional normal"],
      ["statusKantor", "Tutup"],
      ["statusSistem", "Normal"],
      ["statusSistem", "Gangguan"],
      ["statusMSA", "💻 Bekerja"],
      ["statusMSA", "🕌 Shalat"],
      ["statusMSA", "🍽️ Makan"],
      ["statusMSA", "🚶 Keluar kantor"],
      ["statusMSA", "💬 Diskusi"],
      ["statusMSA", "👥 Kumpul"],
      ["statusFSA", "Menerima Transaksi"],
      ["statusFSA", "Istirahat"],
      ["statusBalancing", "Proses"],
      ["statusBalancing", "Balance"],
      ["statusBalancing", "Selisih"],
      ["statusBalancing", "Error"],
      ["statusBalancing", "Selesai"]
    ];
    defaultOptions.forEach(function(opt) { optionsSheet.appendRow(opt); });
  }
  
  var optionsData = optionsSheet.getDataRange().getValues();
  var options = {};
  if (optionsData.length > 1) {
    for (var i = 1; i < optionsData.length; i++) {
      var cat = String(optionsData[i][0] || "").trim();
      var val = String(optionsData[i][1] || "").trim();
      if (cat && val) {
        if (!options[cat]) options[cat] = [];
        if (options[cat].indexOf(val) === -1) {
          options[cat].push(val);
        }
      }
    }
  }

  // Ensure statusManager and statusAsistenManager options exist in Options sheet
  var hasStatusManagerOpts = !!(options["statusManager"] && options["statusManager"].length > 0);
  var hasStatusAsistenManagerOpts = !!(options["statusAsistenManager"] && options["statusAsistenManager"].length > 0);
  
  if (!hasStatusManagerOpts || !hasStatusAsistenManagerOpts) {
    var defaultManagerOpts = [
      ["statusManager", "💻 Bekerja"],
      ["statusManager", "🕌 Shalat"],
      ["statusManager", "🍽️ Makan"],
      ["statusManager", "🚶 Keluar kantor"],
      ["statusManager", "💬 Diskusi"],
      ["statusManager", "👥 Kumpul"]
    ];
    var defaultAsistenManagerOpts = [
      ["statusAsistenManager", "💻 Bekerja"],
      ["statusAsistenManager", "🕌 Shalat"],
      ["statusAsistenManager", "🍽️ Makan"],
      ["statusAsistenManager", "🚶 Keluar kantor"],
      ["statusAsistenManager", "💬 Diskusi"],
      ["statusAsistenManager", "👥 Kumpul"]
    ];
    
    if (!hasStatusManagerOpts) {
      defaultManagerOpts.forEach(function(opt) { optionsSheet.appendRow(opt); });
    }
    if (!hasStatusAsistenManagerOpts) {
      defaultAsistenManagerOpts.forEach(function(opt) { optionsSheet.appendRow(opt); });
    }
    
    // Refresh options object
    optionsData = optionsSheet.getDataRange().getValues();
    options = {};
    for (var i = 1; i < optionsData.length; i++) {
      var cat = String(optionsData[i][0] || "").trim();
      var val = String(optionsData[i][1] || "").trim();
      if (cat && val) {
        if (!options[cat]) options[cat] = [];
        if (options[cat].indexOf(val) === -1) {
          options[cat].push(val);
        }
      }
    }
  }

  // Get Company Profile
  var cpSheet = ss.getSheetByName("CompanyProfile");
  if (!cpSheet) {
    cpSheet = ss.insertSheet("CompanyProfile");
    cpSheet.appendRow(["ID", "Kategori", "Informasi", "Icon"]);
    cpSheet.appendRow([Utilities.getUuid(), "Nama Perusahaan", "PT. KMD Mandiri", "🏢"]);
    cpSheet.appendRow([Utilities.getUuid(), "Alamat", "Jl. Sudirman No. 123, Jakarta", "📍"]);
    cpSheet.appendRow([Utilities.getUuid(), "Kontak", "0812-3456-7890", "📞"]);
    cpSheet.appendRow([Utilities.getUuid(), "Email", "info@kmdmandiri.com", "✉️"]);
  }
  var cpData = cpSheet.getDataRange().getValues();
  var companyProfile = [];
  if (cpData.length > 1) {
    for (var i = 1; i < cpData.length; i++) {
      companyProfile.push({ id: cpData[i][0], kategori: cpData[i][1], informasi: cpData[i][2], icon: cpData[i][3] });
    }
  }

  // Get Users List (for admin management)
  var usersSheet = ss.getSheetByName("Users");
  var usersData = usersSheet.getDataRange().getValues();
  var usersList = [];
  if (usersData.length > 1) {
    for (var i = 1; i < usersData.length; i++) {
      usersList.push({ username: usersData[i][0], role: usersData[i][2] });
    }
  }
  
  return { staff: staff, systemStatus: systemStatus, options: options, companyProfile: companyProfile, usersList: usersList, activityLogs: getFilteredLogs() };
}

function updateStaff(nik, updates) {
  var sheet = getDB().getSheetByName("Staff");
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  var lowerHeaders = headers.map(function(h) {
    return String(h || "").toLowerCase().replace(/\s+/g, '');
  });
  
  var rowIndex = _findStaffRowIndex(data, lowerHeaders, nik);
  if (rowIndex !== -1) {
    var changedFields = {};
    var isAnyTriggerKey = false;
    
    for (var key in updates) {
      var colIndex = _resolveColumnIndexForField(lowerHeaders, key);
      if (colIndex !== -1) {
        var cellRange = sheet.getRange(rowIndex + 1, colIndex + 1);
        var oldVal = cellRange.getValue();
        var newVal = updates[key];
        if (newVal === undefined || newVal === null) newVal = "";
        
        if (String(newVal).trim() !== String(oldVal).trim()) {
          cellRange.setValue(newVal);
          
          var cleanKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
          var isTriggerKey = ['progresscenter', 'statuskerja', 'jamberangkat', 'jampulang', 'statusupload', 'progress', 'status', 'upload'].indexOf(cleanKey) !== -1;
          if (isTriggerKey) {
            changedFields[cleanKey] = { oldVal: oldVal, newVal: newVal };
            isAnyTriggerKey = true;
          }
        }
      }
    }
    
    // Auto update TanggalUpdate column to current Date timestamp
    if (isAnyTriggerKey) {
      var idxTglUpdate = _resolveColumnIndexForField(lowerHeaders, "tanggalupdate");
      if (idxTglUpdate !== -1) {
        sheet.getRange(rowIndex + 1, idxTglUpdate + 1).setValue(new Date());
      }
    }

    logActivity("Update Staff", String(nik) + " updated");

    // Trigger the unified notification broker once with all collected changes (debounced)
    if (isAnyTriggerKey && typeof processStaffNotification === 'function') {
      try {
        var updatedVals = sheet.getRange(rowIndex + 1, 1, 1, headers.length).getValues()[0];
        var namaCol = _resolveColumnIndexForField(lowerHeaders, "nama");
        var jabatanCol = _resolveColumnIndexForField(lowerHeaders, "jabatan");
        var nama = namaCol !== -1 ? String(updatedVals[namaCol] || "").trim() : "";
        var jabatan = jabatanCol !== -1 ? String(updatedVals[jabatanCol] || "").trim() : "";
        
        processStaffNotification(nama, jabatan, changedFields, updatedVals, lowerHeaders);
      } catch (waErr) {
        Logger.log("Failed to process staff notification: " + waErr.toString());
      }
    }

    return getData();
  }
  throw new Error("Staf NIK: " + nik + " tidak ditemukan di sistem database.");
}

function bulkUpdateStaff(updatesList) {
  var sheet = getDB().getSheetByName("Staff");
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  var lowerHeaders = headers.map(function(h) {
    return String(h || "").toLowerCase().replace(/\s+/g, '');
  });
  
  var updatedCount = 0;
  var errors = [];
  
  for (var u = 0; u < updatesList.length; u++) {
    var nik = updatesList[u].nik;
    var updates = updatesList[u].updates;
    var rowIndex = _findStaffRowIndex(data, lowerHeaders, nik);
    
    if (rowIndex !== -1) {
      var changedFields = {};
      var isAnyTriggerKey = false;
      
      for (var key in updates) {
        var colIndex = _resolveColumnIndexForField(lowerHeaders, key);
        if (colIndex !== -1) {
          var cellRange = sheet.getRange(rowIndex + 1, colIndex + 1);
          var oldVal = cellRange.getValue();
          var newVal = updates[key];
          if (newVal === undefined || newVal === null) newVal = "";
          
          if (String(newVal).trim() !== String(oldVal).trim()) {
            cellRange.setValue(newVal);
            
            var cleanKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
            var isTriggerKey = ['progresscenter', 'statuskerja', 'jamberangkat', 'jampulang', 'statusupload', 'progress', 'status', 'upload'].indexOf(cleanKey) !== -1;
            if (isTriggerKey) {
              changedFields[cleanKey] = { oldVal: oldVal, newVal: newVal };
              isAnyTriggerKey = true;
            }
          }
        }
      }
      
      // Auto update TanggalUpdate column to current Date timestamp
      if (isAnyTriggerKey) {
        var idxTglUpdate = _resolveColumnIndexForField(lowerHeaders, "tanggalupdate");
        if (idxTglUpdate !== -1) {
          sheet.getRange(rowIndex + 1, idxTglUpdate + 1).setValue(new Date());
        }
      }

      // Trigger the unified notification broker once per staff
      if (isAnyTriggerKey && typeof processStaffNotification === 'function') {
        try {
          var updatedVals = sheet.getRange(rowIndex + 1, 1, 1, headers.length).getValues()[0];
          var namaCol = _resolveColumnIndexForField(lowerHeaders, "nama");
          var jabatanCol = _resolveColumnIndexForField(lowerHeaders, "jabatan");
          var nama = namaCol !== -1 ? String(updatedVals[namaCol] || "").trim() : "";
          var jabatan = jabatanCol !== -1 ? String(updatedVals[jabatanCol] || "").trim() : "";
          
          processStaffNotification(nama, jabatan, changedFields, updatedVals, lowerHeaders);
        } catch (waErr) {
          Logger.log("Failed to process bulk staff notification: " + waErr.toString());
        }
      }

      updatedCount++;
    } else {
      errors.push(nik);
    }
  }
  
  if (updatedCount > 0) {
    var logMsg = updatedCount + " staf diupdate. " + (errors.length > 0 ? ("Gagal perbarui NIK: " + errors.join(", ")) : "");
    logActivity("Update Staff Massal", logMsg);
  } else if (errors.length > 0) {
    throw new Error("Gagal memperbarui semua NIK: " + errors.join(", "));
  }
  
  return getData();
}

function updateSystem(updates) {
  var sheet = getDB().getSheetByName("SystemStatus");
  var data = sheet.getDataRange().getValues();
  
  // Normalize all incoming updates keys to trimmed format, sanitizing values (null/undefined/NaN -> safe defaults)
  var normalizedUpdates = {};
  for (var k in updates) {
    var val = updates[k];
    if (val === undefined || val === null) {
      val = "";
    } else if (typeof val === 'number' && isNaN(val)) {
      val = 0;
    }
    normalizedUpdates[String(k).trim()] = val;
  }
  
  // Keep track of which keys we've already updated in the sheet
  var updatedKeys = {};
  var keysInSheet = {}; // normalizedKey -> row index
  var rowsToDelete = [];
  
  for (var i = 1; i < data.length; i++) {
    var rawKey = String(data[i][0] || "");
    var normKey = rawKey.trim();
    if (!normKey) continue;
    
    // If this is a duplicate key, mark row for deletion (later)
    if (keysInSheet[normKey]) {
      rowsToDelete.push(i + 1);
      continue;
    }
    
    keysInSheet[normKey] = i + 1;
  }

  // We will collect changed keys/values to send a consolidated notification at the end of updateSystem
  var changedKeysForNotification = {};
  var importantKeys = ["statusKantor", "statusSistem", "statusMSA", "statusFSA", "statusBalancing", "statusManager", "statusAsistenManager", "pengumuman"];

  // Now perform updates
  for (var key in normalizedUpdates) {
    var newVal = normalizedUpdates[key];
    var rowIndex = keysInSheet[key];
    var oldVal = "";
    
    if (rowIndex) {
      var cellRange = sheet.getRange(rowIndex, 2);
      oldVal = cellRange.getValue();
      if (String(newVal).trim() !== String(oldVal).trim()) {
        cellRange.setValue(newVal);
        if (importantKeys.indexOf(key) !== -1) {
          changedKeysForNotification[key] = { newVal: newVal, oldVal: oldVal };
        }
      }
      updatedKeys[key] = true;
    } else {
      // Key doesn't exist, append it
      sheet.appendRow([key, newVal]);
      updatedKeys[key] = true;
      if (importantKeys.indexOf(key) !== -1) {
        changedKeysForNotification[key] = { newVal: newVal, oldVal: "" };
      }
    }
  }

  // Also trim other keys in the sheet if they are not in the updates
  for (var i = 1; i < data.length; i++) {
    var rawKey = String(data[i][0] || "");
    var normKey = rawKey.trim();
    if (normKey && !normalizedUpdates.hasOwnProperty(normKey) && rawKey !== normKey) {
      var rowIndex = keysInSheet[normKey];
      if (rowIndex) {
        sheet.getRange(rowIndex, 1).setValue(normKey);
      }
    }
  }
  
  // Delete duplicate rows backwards so row indices don't shift
  if (rowsToDelete.length > 0) {
    rowsToDelete.sort(function(a, b) { return b - a; });
    for (var d = 0; d < rowsToDelete.length; d++) {
      sheet.deleteRow(rowsToDelete[d]);
    }
  }
  
  var updateDetails = [];
  for (var key in normalizedUpdates) {
    updateDetails.push(key + ": " + normalizedUpdates[key]);
  }
  var logDetails = "System status updated. " + updateDetails.join(", ");
  logActivity("Update System", logDetails);

  // Semua perubahan SystemStatus masuk broker notifikasi yang sama dengan edit manual.
  // Ini mencegah pesan pecah saat aplikasi memperbarui beberapa status berurutan.
  if (Object.keys(changedKeysForNotification).length > 0) {
    try {
      if (typeof queueSystemStatusUpdate === 'function') {
        Object.keys(changedKeysForNotification).forEach(function(changedKey) {
          var item = changedKeysForNotification[changedKey];
          queueSystemStatusUpdate(changedKey, item.newVal, item.oldVal, "Web App");
        });
      } else if (typeof waSendConsolidatedSystemUpdates === 'function') {
        // Fallback kompatibilitas jika file notifikasi lama masih dipakai.
        waSendConsolidatedSystemUpdates(changedKeysForNotification);
      }
    } catch (waErr) {
      Logger.log("Failed to queue system notification from updateSystem: " + waErr.toString());
    }
  }

  return getData();
}

function logActivity(action, details, userName) {
  var ss = getDB();
  var sheet = ss.getSheetByName("ActivityLog");
  if (!sheet) {
    sheet = ss.insertSheet("ActivityLog");
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ID", "Timestamp", "Action", "Details", "User"]);
  }
  
  var id = Utilities.getUuid();
  var timestamp = new Date();
  var user = userName || "System";
  
  sheet.appendRow([id, timestamp, action, details, user]);
}

function getFilteredLogs() {
  var ss = getDB();
  var sheet = ss.getSheetByName("ActivityLog");
  if (!sheet) {
    sheet = ss.insertSheet("ActivityLog");
    sheet.appendRow(["ID", "Timestamp", "Action", "Details", "User"]);
    return [];
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var logs = [];
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  
  // We scan bottom-up (excluding headers) to process newest first and safely delete old rows
  for (var i = data.length - 1; i >= 1; i--) {
    var id = String(data[i][0] || "").trim();
    if (id === "") {
      id = Utilities.getUuid();
      sheet.getRange(i + 1, 1).setValue(id);
    }
    
    var timestampVal = data[i][1];
    var action = String(data[i][2] || "");
    var details = String(data[i][3] || "");
    var user = String(data[i][4] || "System");
    
    var logDate = new Date(timestampVal);
    if (isNaN(logDate.getTime())) {
      logDate = new Date();
    }
    
    // Clean up logs from previous months automatically
    if (logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear) {
      logs.push({
        id: id,
        timestamp: logDate.toISOString(),
        action: action,
        details: details,
        user: user
      });
    } else {
      sheet.deleteRow(i + 1);
    }
  }
  
  return logs;
}

function deleteLog(id) {
  var ss = getDB();
  var sheet = ss.getSheetByName("ActivityLog");
  if (!sheet) return getData();
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === String(id).trim()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return getData();
}

function addLogClient(actionName, details, user) {
  logActivity(actionName, details, user);
  return getData();
}

function resetProgress(isAuto, todayStr) {
  var ss = getDB();
  
  // Read dynamic reset configurations from SystemStatus sheet
  var sysSheet = ss.getSheetByName("SystemStatus");
  var sysData = sysSheet.getDataRange().getValues();
  var systemStatus = {};
  var lastResetRowIndex = -1;
  
  for (var i = 1; i < sysData.length; i++) {
    var rawKey = String(sysData[i][0] || "");
    var normKey = rawKey.trim();
    if (normKey) {
      systemStatus[normKey] = sysData[i][1];
      if (normKey === "lastResetDate") {
        lastResetRowIndex = i + 1;
      }
    }
  }
  
  var dateToCheck = todayStr || Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  var lastResetDate = String(systemStatus["lastResetDate"] || "").trim();
  var props = PropertiesService.getScriptProperties();
  var lastResetProp = String(props.getProperty("LAST_AUTO_RESET_DATE") || "").trim();
  
  // If it has already been reset on this date (check both Sheet & ScriptProperties), skip reset!
  if (lastResetDate === dateToCheck || lastResetProp === dateToCheck) {
    var cleanData = getData();
    cleanData.isSkipped = true;
    return cleanData;
  }
  
  var defStatusKerja = systemStatus["resetDefaultStatusKerja"] || "Di Kantor";
  var defStatusUpload = systemStatus["resetDefaultStatusUpload"] || "Belum upload";
  var defStatusKantor = systemStatus["resetDefaultStatusKantor"] || "Buka";
  var defStatusSistem = systemStatus["resetDefaultStatusSistem"] || "Normal";
  var defStatusMSA = systemStatus["resetDefaultStatusMSA"] || "?? Bekerja";
  var defStatusFSA = systemStatus["resetDefaultStatusFSA"] || "Menerima Transaksi";
  var defStatusBalancing = systemStatus["resetDefaultStatusBalancing"] || "Proses";
  var defStatusManager = systemStatus["resetDefaultStatusManager"] || "?? Bekerja";
  var defStatusAsistenManager = systemStatus["resetDefaultStatusAsistenManager"] || "?? Bekerja";

  // 1. Reset SystemStatus properties to defaults/empty
  var systemUpdates = {
    "statusKantor": defStatusKantor,
    "statusSistem": defStatusSistem,
    "statusMSA": defStatusMSA,
    "statusFSA": defStatusFSA,
    "statusBalancing": defStatusBalancing,
    "statusManager": defStatusManager,
    "statusAsistenManager": defStatusAsistenManager,
    "pengumuman": "",
    "lastResetDate": dateToCheck
  };

  for (var key in systemUpdates) {
    var found = false;
    for (var i = 1; i < sysData.length; i++) {
      if (String(sysData[i][0] || "").trim() === key) {
        sysSheet.getRange(i + 1, 2).setValue(systemUpdates[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      sysSheet.appendRow([key, systemUpdates[key]]);
    }
  }
  
  // 2. Reset Staff sheet values
  var staffSheet = ss.getSheetByName("Staff");
  var staffData = staffSheet.getDataRange().getValues();
  var headers = staffData[0];
  
  var lowerHeaders = headers.map(function(h) {
    return String(h || "").toLowerCase().replace(/\s+/g, '');
  });
  
  var indices = _resolveStaffFieldIndices(lowerHeaders);
  var idxProgress = indices.progressCenter;
  var idxUpload = indices.statusUpload;
  var idxKerja = indices.statusKerja;
  var idxBerangkat = indices.jamBerangkat;
  var idxPulang = indices.jamPulang;
  
  // Calculate day name to check scheduled target centers (Senin, Selasa, etc.)
  var targetDate = new Date();
  if (todayStr) {
    var parts = todayStr.split('-');
    if (parts.length === 3) {
      targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    }
  } else {
    var jakartaStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd-HH-mm-ss");
    var jParts = jakartaStr.split('-');
    targetDate = new Date(parseInt(jParts[0]), parseInt(jParts[1]) - 1, parseInt(jParts[2]), parseInt(jParts[3]), parseInt(jParts[4]), parseInt(jParts[5]));
  }
  var dayIndex = targetDate.getDay();
  var dayKeys = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
  var currentDayKey = dayKeys[dayIndex];
  
  var idxDay = _resolveColumnIndexForField(lowerHeaders, currentDayKey);
  if (idxDay === -1 && indices[currentDayKey] !== undefined) {
    idxDay = indices[currentDayKey];
  }
  
  for (var i = 1; i < staffData.length; i++) {
    // Skip empty row or header
    if (String(staffData[i][0] || "").trim() === "") continue;
    
    // Set progress to 0, statusUpload to default/No center, statusKerja to default
    if (idxProgress > -1) staffSheet.getRange(i + 1, idxProgress + 1).setValue(0);
    
    if (idxUpload > -1) {
      var numCenter = 0;
      if (dayIndex >= 1 && dayIndex <= 5 && idxDay > -1) {
        numCenter = Number(staffData[i][idxDay]) || 0;
      } else if (indices.jumlahCenter > -1) {
        numCenter = Number(staffData[i][indices.jumlahCenter]) || 0;
      }
      var uploadVal = numCenter === 0 ? "Tidak ada Center" : defStatusUpload;
      staffSheet.getRange(i + 1, idxUpload + 1).setValue(uploadVal);
    }
    
    if (idxKerja > -1) staffSheet.getRange(i + 1, idxKerja + 1).setValue(defStatusKerja);
    if (idxBerangkat > -1) staffSheet.getRange(i + 1, idxBerangkat + 1).setValue('');
    if (idxPulang > -1) staffSheet.getRange(i + 1, idxPulang + 1).setValue('');
  }
  
  var logType = isAuto ? "Auto Reset Progress" : "Manual Reset Progress";
  var logDesc = isAuto 
    ? "Sistem otomatis mereset! transaksi dimulai untuk tanggal " + dateToCheck
    : "Admin mereset seluruh progress harian dan status sistem.";
  logActivity(logType, logDesc);

  try {
    props.setProperty("LAST_AUTO_RESET_DATE", dateToCheck);
  } catch (propErr) {}

  // Kirim Notifikasi WhatsApp & Telegram real-time via WhatsApp_Notification script
  try {
    if (typeof waSendSystemResetNotif === 'function') {
      waSendSystemResetNotif(logDesc);
    }
  } catch (waErr) {
    Logger.log("Gagal mengirim notifikasi dari resetProgress: " + waErr.toString());
  }
  
  var cleanData = getData();
  cleanData.isSkipped = false;
  return cleanData;
}

function manageCompanyProfile(payload) {
  var sheet = getDB().getSheetByName("CompanyProfile");
  var data = sheet.getDataRange().getValues();
  
  if (payload.actionType === 'add') {
    sheet.appendRow([Utilities.getUuid(), payload.kategori, payload.informasi, payload.icon || '🏢']);
    logActivity("Company Profile", "Menambah profil: " + payload.kategori);
  } else if (payload.actionType === 'edit') {
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === payload.id) {
        sheet.getRange(i + 1, 2).setValue(payload.kategori);
        sheet.getRange(i + 1, 3).setValue(payload.informasi);
        sheet.getRange(i + 1, 4).setValue(payload.icon);
        logActivity("Company Profile", "Mengedit profil: " + payload.kategori);
        break;
      }
    }
  } else if (payload.actionType === 'delete') {
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === payload.id) {
        sheet.deleteRow(i + 1);
        logActivity("Company Profile", "Menghapus profil ID: " + payload.id);
        break;
      }
    }
  }
  return getData();
}

function manageUser(payload) {
  var sheet = getDB().getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  
  if (payload.actionType === 'add') {
    var exists = false;
    for(var i=1; i<data.length; i++) { if(data[i][0] === payload.username) exists = true; }
    if(exists) throw new Error("Username sudah ada");
    sheet.appendRow([payload.username, payload.password, payload.role]);
    logActivity("User Management", "Menambah user: " + payload.username);
  } else if (payload.actionType === 'edit') {
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === payload.username) {
        if (payload.password) sheet.getRange(i + 1, 2).setValue(payload.password);
        sheet.getRange(i + 1, 3).setValue(payload.role);
        logActivity("User Management", "Mengedit user: " + payload.username);
        break;
      }
    }
  } else if (payload.actionType === 'delete') {
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === payload.username) {
        sheet.deleteRow(i + 1);
        logActivity("User Management", "Menghapus user: " + payload.username);
        break;
      }
    }
  }
  return getData();
}

function manageStaff(payload) {
  var sheet = getDB().getSheetByName("Staff");
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  var lowerHeaders = headers.map(function(h) {
    return String(h || "").toLowerCase().replace(/\s+/g, '');
  });
  
  if (payload.actionType === 'add') {
    // Check if NIK already exists
    var existsIndex = _findStaffRowIndex(data, lowerHeaders, payload.nik);
    if (existsIndex !== -1) throw new Error("NIK sudah terdaftar!");
    
    // Create new row matching headers
    var newRow = [];
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT", "yyyy-MM-dd");
    for (var j = 0; j < headers.length; j++) {
      var headerName = lowerHeaders[j];
      var val = "";
      if (headerName === 'nik') val = String(payload.nik).trim();
      else if (headerName === 'nama') val = payload.nama;
      else if (headerName === 'jabatan') val = payload.jabatan;
      else if (headerName === 'statuskerja') val = payload.statusKerja || 'Di Kantor';
      else if (headerName === 'progresscenter') val = parseInt(payload.progressCenter) || 0;
      else if (headerName === 'jumlahcenter') val = parseInt(payload.jumlahCenter) || 0;
      else if (headerName === 'statusupload') val = payload.statusUpload || (parseInt(payload.jumlahCenter) > 0 ? 'Belum upload' : 'Tidak ada Center');
      else if (headerName === 'jamberangkat') val = payload.jamBerangkat || '';
      else if (headerName === 'jampulang') val = payload.jamPulang || '';
      else if (headerName === 'keterangan' || headerName === 'catatan') val = payload.keterangan || '';
      else if (headerName === 'senin') val = parseInt(payload.senin) || 0;
      else if (headerName === 'selasa') val = parseInt(payload.selasa) || 0;
      else if (headerName === 'rabu') val = parseInt(payload.rabu) || 0;
      else if (headerName === 'kamis') val = parseInt(payload.kamis) || 0;
      else if (headerName === 'jumat') val = parseInt(payload.jumat) || 0;
      else if (headerName === 'tanggalupdate') val = today;
      newRow.push(val);
    }
    sheet.appendRow(newRow);
    logActivity("Staff Management", "Menambah staf: " + payload.nama + " (NIK: " + payload.nik + ")");
  } else if (payload.actionType === 'edit') {
    var originalNik = payload.originalNik || payload.nik;
    var foundIndex = _findStaffRowIndex(data, lowerHeaders, originalNik);
    if (foundIndex === -1 && payload.nik) {
      foundIndex = _findStaffRowIndex(data, lowerHeaders, payload.nik);
    }
    if (foundIndex === -1) throw new Error("Staf NIK: " + originalNik + " tidak ditemukan!");
    
    // Update cells based on resolved header fields
    for (var j = 0; j < headers.length; j++) {
      var headerName = lowerHeaders[j];
      var cellRange = sheet.getRange(foundIndex + 1, j + 1);
      
      if (headerName === 'nik' && payload.nik !== undefined) cellRange.setValue(String(payload.nik).trim());
      else if (headerName === 'nama' && payload.nama !== undefined) cellRange.setValue(payload.nama);
      else if (headerName === 'jabatan' && payload.jabatan !== undefined) cellRange.setValue(payload.jabatan);
      else if (headerName === 'statuskerja' && payload.statusKerja !== undefined) cellRange.setValue(payload.statusKerja);
      else if (headerName === 'jamberangkat' && payload.jamBerangkat !== undefined) cellRange.setValue(payload.jamBerangkat);
      else if (headerName === 'jampulang' && payload.jamPulang !== undefined) cellRange.setValue(payload.jamPulang);
      else if (headerName === 'progresscenter' && payload.progressCenter !== undefined) cellRange.setValue(parseInt(payload.progressCenter) || 0);
      else if (headerName === 'jumlahcenter' && payload.jumlahCenter !== undefined) cellRange.setValue(parseInt(payload.jumlahCenter) || 0);
      else if (headerName === 'statusupload' && payload.statusUpload !== undefined) cellRange.setValue(payload.statusUpload);
      else if ((headerName === 'keterangan' || headerName === 'catatan') && payload.keterangan !== undefined) cellRange.setValue(payload.keterangan);
      else if (headerName === 'senin' && payload.senin !== undefined) cellRange.setValue(parseInt(payload.senin) || 0);
      else if (headerName === 'selasa' && payload.selasa !== undefined) cellRange.setValue(parseInt(payload.selasa) || 0);
      else if (headerName === 'rabu' && payload.rabu !== undefined) cellRange.setValue(parseInt(payload.rabu) || 0);
      else if (headerName === 'kamis' && payload.kamis !== undefined) cellRange.setValue(parseInt(payload.kamis) || 0);
      else if (headerName === 'jumat' && payload.jumat !== undefined) cellRange.setValue(parseInt(payload.jumat) || 0);
      else if (headerName === 'tanggalupdate') cellRange.setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT", "yyyy-MM-dd"));
    }
    logActivity("Staff Management", "Mengedit data staf NIK: " + originalNik + " -> Nama: " + payload.nama);
  } else if (payload.actionType === 'delete') {
    var foundIndex = _findStaffRowIndex(data, lowerHeaders, payload.nik);
    if (foundIndex === -1) throw new Error("Staf NIK: " + payload.nik + " tidak ditemukan!");
    sheet.deleteRow(foundIndex + 1);
    logActivity("Staff Management", "Menghapus staf NIK: " + payload.nik);
  }
  return getData();
}

function getNormalizedNikValue(val) {
  if (val === null || val === undefined) {
    return "";
  }
  if (val instanceof Date) {
    try {
      return Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT", "yyyy-MM-dd");
    } catch (e) {
      return String(val).trim().toLowerCase();
    }
  }
  var str = String(val).trim();
  // Strip leading single quote if typed as text in Sheet
  if (str.charAt(0) === "'") {
    str = str.substring(1).trim();
  }
  // Strip trailing float zeroes like "12044810.0" -> "12044810"
  str = str.replace(/\.0+$/, '');
  // Strip non-printable / zero-width characters
  str = str.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
  return str.toLowerCase();
}

