const SCRIPT_VERSION = "2.2";
const KMD_DATABASE_ID = "1QWUYC-xo8btMWbJtl0FUoUKR04xe1_1M2RZzucAO8ds";
var KMD_WRITE_LOCK_HELD = false; // Hindari deadlock saat broker notifikasi dipanggil dari write API.

function getDB() {
  // KMD Check Database adalah satu-satunya source of truth.
  // Jangan bergantung pada PropertiesService atau active spreadsheet.
  try {
    return SpreadsheetApp.openById(KMD_DATABASE_ID);
  } catch (e) {
    throw new Error('KMD Check Database tidak dapat dibuka: ' + (e.message || e));
  }
}

function setup() {
  var ss = getDB();
  var requiredSheets = ['Users', 'Staff', 'Options', 'SystemStatus', 'CompanyProfile', 'ActivityLog', 'Transactions'];
  requiredSheets.forEach(function(name) {
    if (!ss.getSheetByName(name)) throw new Error('Sheet wajib tidak ditemukan: ' + name);
  });

  var staffSheet = ss.getSheetByName('Staff');
  _ensureAndFixStaffHeaders(staffSheet);
  var headers = staffSheet.getRange(1, 1, 1, staffSheet.getLastColumn()).getDisplayValues()[0];
  var lowerHeaders = headers.map(function(h) { return String(h || '').toLowerCase().replace(/\s+/g, ''); });
  var nikColumn = _resolveColumnIndexForField(lowerHeaders, 'nik');
  if (nikColumn !== -1 && staffSheet.getMaxRows() > 1) {
    staffSheet.getRange(2, nikColumn + 1, staffSheet.getMaxRows() - 1, 1).setNumberFormat('@');
  }
  return 'KMD Check Database siap: ' + ss.getName() + ' (' + ss.getId() + ')';
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
      } else {
        throw new Error('Action API tidak dikenal: ' + action);
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
  var sheet = getDB().getSheetByName('Users');
  if (!sheet) throw new Error('Sheet Users tidak ditemukan.');
  var data = sheet.getDataRange().getDisplayValues();
  var inputUser = String(username || '').trim().toLowerCase();
  var inputPass = String(password || '').trim();
  if (!inputUser || !inputPass) throw new Error('Username dan password wajib diisi.');

  for (var i = 1; i < data.length; i++) {
    var sheetUser = String(data[i][0] || '').trim();
    var sheetPass = String(data[i][1] || '').trim();
    if (sheetUser.toLowerCase() === inputUser && sheetPass === inputPass) {
      return {
        username: sheetUser,
        role: String(data[i][2] || 'USER').trim().toUpperCase()
      };
    }
  }
  throw new Error('Username atau password salah');
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
  var requiredSheets = ['Users', 'Staff', 'Options', 'SystemStatus', 'CompanyProfile', 'ActivityLog'];
  requiredSheets.forEach(function(name) {
    if (!ss.getSheetByName(name)) throw new Error('Sheet wajib tidak ditemukan: ' + name);
  });

  var staffSheet = ss.getSheetByName('Staff');
  var staffRange = staffSheet.getDataRange();
  var staffData = staffRange.getValues();
  var staffDisplay = staffRange.getDisplayValues();
  var staff = [];

  if (staffData.length > 1) {
    var headers = staffDisplay[0];
    var lowerHeaders = headers.map(function(h) { return String(h || '').toLowerCase().replace(/\s+/g, ''); });
    var indices = _resolveStaffFieldIndices(lowerHeaders);

    var jakartaText = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd-HH-mm-ss');
    var jp = jakartaText.split('-');
    var jakartaDate = new Date(Number(jp[0]), Number(jp[1]) - 1, Number(jp[2]), 12, 0, 0);
    var dayIndex = jakartaDate.getDay();
    var dayKeys = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    var dayKey = dayKeys[dayIndex];
    var dayColumn = _resolveColumnIndexForField(lowerHeaders, dayKey);

    for (var i = 1; i < staffData.length; i++) {
      var row = staffData[i];
      var displayRow = staffDisplay[i] || [];
      var nikIndex = indices.nik !== -1 ? indices.nik : 0;
      var nik = String(displayRow[nikIndex] || '').trim();
      if (!nik) continue;

      var progress = indices.progressCenter !== -1 ? Number(row[indices.progressCenter] || 0) : 0;
      if (!isFinite(progress)) progress = 0;

      var targetToday = null;
      if (dayIndex >= 1 && dayIndex <= 5 && dayColumn !== -1) {
        var rawTarget = row[dayColumn];
        if (rawTarget !== '' && rawTarget !== null && isFinite(Number(rawTarget))) targetToday = Number(rawTarget);
      }
      var fallbackTarget = 0;
      if (indices.jumlahCenter !== -1 && row[indices.jumlahCenter] !== '' && row[indices.jumlahCenter] !== null && isFinite(Number(row[indices.jumlahCenter]))) {
        fallbackTarget = Number(row[indices.jumlahCenter]);
      }
      var target = targetToday !== null ? targetToday : fallbackTarget;

      var upload = 'Belum upload';
      if (target <= 0) upload = 'Tidak ada Center';
      else if (progress >= target) upload = 'Sudah upload semua';
      else if (progress > 0) upload = 'Sebagian upload';

      function displayAt(index) {
        return index !== -1 ? String(displayRow[index] || '').trim() : '';
      }
      function numberAt(index) {
        if (index === -1) return 0;
        var n = Number(row[index]);
        return isFinite(n) ? n : 0;
      }

      staff.push({
        nik: nik,
        nama: displayAt(indices.nama),
        jabatan: displayAt(indices.jabatan) || 'FIELD OFFICER',
        statusKerja: displayAt(indices.statusKerja) || 'Di Kantor',
        jamBerangkat: displayAt(indices.jamBerangkat),
        jamPulang: displayAt(indices.jamPulang),
        progressCenter: progress,
        jumlahCenter: target,
        statusUpload: upload,
        keterangan: displayAt(indices.keterangan),
        senin: numberAt(indices.senin),
        selasa: numberAt(indices.selasa),
        rabu: numberAt(indices.rabu),
        kamis: numberAt(indices.kamis),
        jumat: numberAt(indices.jumat),
        tanggalUpdate: displayAt(indices.tanggalUpdate)
      });
    }
  }

  var systemStatus = {};
  var sysData = ss.getSheetByName('SystemStatus').getDataRange().getValues();
  for (var s = 1; s < sysData.length; s++) {
    var key = String(sysData[s][0] || '').trim();
    if (key) systemStatus[key] = sysData[s][1];
  }

  var options = {};
  var optionsData = ss.getSheetByName('Options').getDataRange().getDisplayValues();
  for (var o = 1; o < optionsData.length; o++) {
    var category = String(optionsData[o][0] || '').trim();
    var value = String(optionsData[o][1] || '').trim();
    if (!category || !value) continue;
    if (!options[category]) options[category] = [];
    if (options[category].indexOf(value) === -1) options[category].push(value);
  }

  var companyProfile = [];
  var companyData = ss.getSheetByName('CompanyProfile').getDataRange().getDisplayValues();
  for (var c = 1; c < companyData.length; c++) {
    if (!String(companyData[c][0] || '').trim() && !String(companyData[c][1] || '').trim()) continue;
    companyProfile.push({
      id: String(companyData[c][0] || '').trim(),
      kategori: String(companyData[c][1] || '').trim(),
      informasi: String(companyData[c][2] || '').trim(),
      icon: String(companyData[c][3] || '').trim()
    });
  }

  // Password tidak pernah dikirim ke browser. Login selalu membaca langsung sheet Users.
  var usersList = [];
  var usersData = ss.getSheetByName('Users').getDataRange().getDisplayValues();
  for (var u = 1; u < usersData.length; u++) {
    var uname = String(usersData[u][0] || '').trim();
    if (!uname) continue;
    usersList.push({ username: uname, role: String(usersData[u][2] || 'USER').trim().toUpperCase() });
  }

  return {
    staff: staff,
    systemStatus: systemStatus,
    options: options,
    companyProfile: companyProfile,
    usersList: usersList,
    activityLogs: getFilteredLogs(),
    serverMeta: {
      databaseId: KMD_DATABASE_ID,
      databaseName: ss.getName(),
      dateWIB: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd'),
      timestampWIB: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
    }
  };
}

function updateStaff(nik, updates) {
  var sheet = getDB().getSheetByName('Staff');
  if (!sheet) throw new Error('Sheet Staff tidak ditemukan.');
  var range = sheet.getDataRange();
  var values = range.getValues();
  var displayValues = range.getDisplayValues();
  if (values.length < 2) throw new Error('Data Staff kosong.');
  var headers = displayValues[0];
  var lowerHeaders = headers.map(function(h) { return String(h || '').toLowerCase().replace(/\s+/g, ''); });
  var rowIndex = _findStaffRowIndex(displayValues, lowerHeaders, nik);
  if (rowIndex === -1) throw new Error('Staf NIK: ' + nik + ' tidak ditemukan di KMD Check Database.');

  var changedFields = {};
  var hasOperationalChange = false;
  for (var key in (updates || {})) {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
    var colIndex = _resolveColumnIndexForField(lowerHeaders, key);
    if (colIndex === -1) continue;
    var cell = sheet.getRange(rowIndex + 1, colIndex + 1);
    var oldVal = cell.getDisplayValue();
    var newVal = updates[key];
    if (newVal === undefined || newVal === null) newVal = '';
    var cleanKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanKey === 'nik') {
      cell.setNumberFormat('@');
      newVal = String(newVal).trim();
    }
    if (String(oldVal).trim() === String(newVal).trim()) continue;
    cell.setValue(newVal);
    if (['progresscenter', 'statuskerja', 'jamberangkat', 'jampulang', 'statusupload', 'progress', 'status', 'upload'].indexOf(cleanKey) !== -1) {
      changedFields[cleanKey] = { oldVal: oldVal, newVal: newVal };
      hasOperationalChange = true;
    }
  }

  if (hasOperationalChange) {
    var dateCol = _resolveColumnIndexForField(lowerHeaders, 'tanggalupdate');
    if (dateCol !== -1) sheet.getRange(rowIndex + 1, dateCol + 1).setValue(new Date());
  }
  SpreadsheetApp.flush();
  logActivity('Update Staff', String(nik) + ' updated');

  if (hasOperationalChange && typeof processStaffNotification === 'function') {
    try {
      var updatedVals = sheet.getRange(rowIndex + 1, 1, 1, headers.length).getValues()[0];
      var namaCol = _resolveColumnIndexForField(lowerHeaders, 'nama');
      var jabatanCol = _resolveColumnIndexForField(lowerHeaders, 'jabatan');
      processStaffNotification(
        namaCol !== -1 ? String(updatedVals[namaCol] || '').trim() : '',
        jabatanCol !== -1 ? String(updatedVals[jabatanCol] || '').trim() : '',
        changedFields,
        updatedVals,
        lowerHeaders
      );
    } catch (notifyErr) {
      Logger.log('Notifikasi staf gagal, penyimpanan tetap sukses: ' + notifyErr.toString());
    }
  }
  return getData();
}

function bulkUpdateStaff(updatesList) {
  if (!Array.isArray(updatesList) || updatesList.length === 0) return getData();
  var sheet = getDB().getSheetByName('Staff');
  if (!sheet) throw new Error('Sheet Staff tidak ditemukan.');
  var range = sheet.getDataRange();
  var values = range.getValues();
  var displayValues = range.getDisplayValues();
  var headers = displayValues[0];
  var lowerHeaders = headers.map(function(h) { return String(h || '').toLowerCase().replace(/\s+/g, ''); });
  var errors = [];
  var updatedCount = 0;

  for (var u = 0; u < updatesList.length; u++) {
    var item = updatesList[u] || {};
    var nik = String(item.nik || '').trim();
    var rowIndex = _findStaffRowIndex(displayValues, lowerHeaders, nik);
    if (rowIndex === -1) {
      errors.push(nik || '?');
      continue;
    }
    var updates = item.updates || {};
    for (var key in updates) {
      if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
      var col = _resolveColumnIndexForField(lowerHeaders, key);
      if (col === -1) continue;
      var value = updates[key];
      if (value === undefined || value === null) value = '';
      sheet.getRange(rowIndex + 1, col + 1).setValue(value);
    }
    var dateCol = _resolveColumnIndexForField(lowerHeaders, 'tanggalupdate');
    if (dateCol !== -1) sheet.getRange(rowIndex + 1, dateCol + 1).setValue(new Date());
    updatedCount++;
  }

  SpreadsheetApp.flush();
  if (!updatedCount && errors.length) throw new Error('Staf tidak ditemukan: ' + errors.join(', '));
  logActivity('Update Staff Massal', updatedCount + ' staf diupdate' + (errors.length ? '; tidak ditemukan: ' + errors.join(', ') : ''));
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
  var sheet = getDB().getSheetByName('ActivityLog');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getDataRange().getValues();
  var logs = [];
  var limit = 300;
  for (var i = data.length - 1; i >= 1 && logs.length < limit; i--) {
    var id = String(data[i][0] || '').trim();
    var timestampValue = data[i][1];
    var parsed = new Date(timestampValue);
    logs.push({
      id: id || ('row:' + (i + 1)),
      timestamp: isNaN(parsed.getTime()) ? String(timestampValue || '') : parsed.toISOString(),
      action: String(data[i][2] || ''),
      details: String(data[i][3] || ''),
      user: String(data[i][4] || 'System')
    });
  }
  // Read-only: membaca log tidak boleh menghapus/mengubah baris Spreadsheet.
  return logs;
}

function deleteLog(id) {
  var sheet = getDB().getSheetByName('ActivityLog');
  if (!sheet) throw new Error('Sheet ActivityLog tidak ditemukan.');
  var target = String(id || '').trim();
  if (!target) throw new Error('ID log tidak valid.');
  var data = sheet.getDataRange().getDisplayValues();
  var rowToDelete = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === target) {
      rowToDelete = i + 1;
      break;
    }
  }
  if (rowToDelete === -1 && target.indexOf('row:') === 0) {
    var candidate = parseInt(target.substring(4), 10);
    if (!isNaN(candidate) && candidate > 1 && candidate <= sheet.getLastRow()) rowToDelete = candidate;
  }
  if (rowToDelete === -1) throw new Error('Log tidak ditemukan atau sudah dihapus.');
  sheet.deleteRow(rowToDelete);
  SpreadsheetApp.flush();
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
  var lastResetProp = ""; // SystemStatus.lastResetDate adalah marker utama.
  
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
    // ScriptProperties tidak digunakan; SystemStatus sudah menyimpan marker reset.
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
  payload = payload || {};
  var sheet = getDB().getSheetByName('CompanyProfile');
  if (!sheet) throw new Error('Sheet CompanyProfile tidak ditemukan.');
  var data = sheet.getDataRange().getDisplayValues();
  var actionType = String(payload.actionType || '').trim();

  function findRow(id) {
    var target = String(id || '').trim();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === target) return i + 1;
    }
    return -1;
  }

  if (actionType === 'add') {
    if (!String(payload.kategori || '').trim()) throw new Error('Kategori profil wajib diisi.');
    sheet.appendRow([Utilities.getUuid(), String(payload.kategori).trim(), String(payload.informasi || '').trim(), String(payload.icon || '🏢').trim()]);
  } else if (actionType === 'edit') {
    var row = findRow(payload.id);
    if (row === -1) throw new Error('Profil yang akan diedit tidak ditemukan.');
    sheet.getRange(row, 2, 1, 3).setValues([[
      String(payload.kategori || '').trim(),
      String(payload.informasi || '').trim(),
      String(payload.icon || '🏢').trim()
    ]]);
  } else if (actionType === 'delete') {
    var row = findRow(payload.id);
    if (row === -1) throw new Error('Profil yang akan dihapus tidak ditemukan.');
    sheet.deleteRow(row);
  } else {
    throw new Error('Action profil tidak dikenal: ' + actionType);
  }
  SpreadsheetApp.flush();
  logActivity('Company Profile', actionType + ': ' + String(payload.kategori || payload.id || ''));
  return getData();
}

function manageUser(payload) {
  payload = payload || {};
  var sheet = getDB().getSheetByName('Users');
  if (!sheet) throw new Error('Sheet Users tidak ditemukan.');
  var data = sheet.getDataRange().getDisplayValues();
  var actionType = String(payload.actionType || '').trim();
  var username = String(payload.username || '').trim();

  function findUserRow(name) {
    var target = String(name || '').trim().toLowerCase();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim().toLowerCase() === target) return i + 1;
    }
    return -1;
  }
  function countAdmins() {
    var count = 0;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][2] || '').trim().toUpperCase() === 'ADMIN') count++;
    }
    return count;
  }

  if (actionType === 'add') {
    if (!username) throw new Error('Username wajib diisi.');
    if (!String(payload.password || '').trim()) throw new Error('Password wajib diisi.');
    if (findUserRow(username) !== -1) throw new Error('Username sudah ada.');
    sheet.appendRow([username, String(payload.password), String(payload.role || 'USER').trim().toUpperCase()]);
  } else if (actionType === 'edit') {
    var row = findUserRow(username);
    if (row === -1) throw new Error('User tidak ditemukan: ' + username);
    var oldRole = String(data[row - 1][2] || 'USER').trim().toUpperCase();
    var newUsername = String(payload.newUsername || username).trim();
    var newRole = String(payload.role || oldRole).trim().toUpperCase();
    if (!newUsername) throw new Error('Username baru tidak boleh kosong.');
    var conflict = findUserRow(newUsername);
    if (conflict !== -1 && conflict !== row) throw new Error('Username baru sudah digunakan.');
    if (oldRole === 'ADMIN' && newRole !== 'ADMIN' && countAdmins() <= 1) throw new Error('Admin terakhir tidak dapat diturunkan rolenya.');
    sheet.getRange(row, 1).setValue(newUsername);
    if (String(payload.password || '').trim()) sheet.getRange(row, 2).setValue(String(payload.password));
    sheet.getRange(row, 3).setValue(newRole);
  } else if (actionType === 'changeRole') {
    var row = findUserRow(username);
    if (row === -1) throw new Error('User tidak ditemukan: ' + username);
    var oldRole = String(data[row - 1][2] || 'USER').trim().toUpperCase();
    var newRole = String(payload.newRole || 'USER').trim().toUpperCase();
    if (oldRole === 'ADMIN' && newRole !== 'ADMIN' && countAdmins() <= 1) throw new Error('Admin terakhir tidak dapat diturunkan rolenya.');
    sheet.getRange(row, 3).setValue(newRole);
  } else if (actionType === 'delete') {
    var row = findUserRow(username);
    if (row === -1) throw new Error('User tidak ditemukan: ' + username);
    if (String(data[row - 1][2] || '').trim().toUpperCase() === 'ADMIN' && countAdmins() <= 1) throw new Error('Admin terakhir tidak dapat dihapus.');
    sheet.deleteRow(row);
  } else {
    throw new Error('Action user tidak dikenal: ' + actionType);
  }
  SpreadsheetApp.flush();
  logActivity('User Management', actionType + ': ' + username);
  return getData();
}

function manageStaff(payload) {
  payload = payload || {};
  var sheet = getDB().getSheetByName('Staff');
  if (!sheet) throw new Error('Sheet Staff tidak ditemukan.');
  var range = sheet.getDataRange();
  var displayValues = range.getDisplayValues();
  var headers = displayValues[0];
  var lowerHeaders = headers.map(function(h) { return String(h || '').toLowerCase().replace(/\s+/g, ''); });
  var actionType = String(payload.actionType || '').trim();

  function setCell(row, field, value, asText) {
    var col = _resolveColumnIndexForField(lowerHeaders, field);
    if (col === -1) return;
    var cell = sheet.getRange(row, col + 1);
    if (asText) cell.setNumberFormat('@');
    cell.setValue(value === undefined || value === null ? '' : value);
  }

  if (actionType === 'add') {
    var nik = String(payload.nik || '').trim();
    var nama = String(payload.nama || '').trim();
    if (!nik || !nama) throw new Error('NIK dan Nama staf wajib diisi.');
    if (_findStaffRowIndex(displayValues, lowerHeaders, nik) !== -1) throw new Error('NIK sudah terdaftar: ' + nik);
    var rowNum = sheet.getLastRow() + 1;
    setCell(rowNum, 'nik', nik, true);
    setCell(rowNum, 'nama', nama, false);
    setCell(rowNum, 'jabatan', String(payload.jabatan || 'FIELD OFFICER'), false);
    setCell(rowNum, 'statusKerja', String(payload.statusKerja || 'Di Kantor'), false);
    setCell(rowNum, 'jamBerangkat', String(payload.jamBerangkat || ''), false);
    setCell(rowNum, 'jamPulang', String(payload.jamPulang || ''), false);
    setCell(rowNum, 'progressCenter', Number(payload.progressCenter) || 0, false);
    setCell(rowNum, 'jumlahCenter', Number(payload.jumlahCenter) || 0, false);
    setCell(rowNum, 'statusUpload', String(payload.statusUpload || ((Number(payload.jumlahCenter) || 0) > 0 ? 'Belum upload' : 'Tidak ada Center')), false);
    setCell(rowNum, 'keterangan', String(payload.keterangan || ''), false);
    ['senin', 'selasa', 'rabu', 'kamis', 'jumat'].forEach(function(day) { setCell(rowNum, day, Number(payload[day]) || 0, false); });
    setCell(rowNum, 'tanggalUpdate', Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'), false);
    logActivity('Staff Management', 'Menambah staf: ' + nama + ' (NIK: ' + nik + ')');
  } else if (actionType === 'edit') {
    var originalNik = String(payload.originalNik || payload.nik || '').trim();
    var rowIndex = _findStaffRowIndex(displayValues, lowerHeaders, originalNik);
    if (rowIndex === -1) throw new Error('Staf NIK: ' + originalNik + ' tidak ditemukan.');
    var rowNum = rowIndex + 1;
    var newNik = String(payload.nik || originalNik).trim();
    if (!newNik) throw new Error('NIK staf tidak boleh kosong.');
    if (getNormalizedNikValue(newNik) !== getNormalizedNikValue(originalNik)) {
      var conflict = _findStaffRowIndex(displayValues, lowerHeaders, newNik);
      if (conflict !== -1 && conflict !== rowIndex) throw new Error('NIK baru sudah digunakan staf lain: ' + newNik);
    }
    setCell(rowNum, 'nik', newNik, true);
    if (payload.nama !== undefined) setCell(rowNum, 'nama', String(payload.nama).trim(), false);
    if (payload.jabatan !== undefined) setCell(rowNum, 'jabatan', payload.jabatan, false);
    if (payload.statusKerja !== undefined) setCell(rowNum, 'statusKerja', payload.statusKerja, false);
    if (payload.jamBerangkat !== undefined) setCell(rowNum, 'jamBerangkat', payload.jamBerangkat, false);
    if (payload.jamPulang !== undefined) setCell(rowNum, 'jamPulang', payload.jamPulang, false);
    if (payload.progressCenter !== undefined) setCell(rowNum, 'progressCenter', Number(payload.progressCenter) || 0, false);
    if (payload.jumlahCenter !== undefined) setCell(rowNum, 'jumlahCenter', Number(payload.jumlahCenter) || 0, false);
    if (payload.statusUpload !== undefined) setCell(rowNum, 'statusUpload', payload.statusUpload, false);
    if (payload.keterangan !== undefined) setCell(rowNum, 'keterangan', payload.keterangan, false);
    ['senin', 'selasa', 'rabu', 'kamis', 'jumat'].forEach(function(day) {
      if (payload[day] !== undefined) setCell(rowNum, day, Number(payload[day]) || 0, false);
    });
    setCell(rowNum, 'tanggalUpdate', Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'), false);
    logActivity('Staff Management', 'Mengedit staf: ' + originalNik + (newNik !== originalNik ? ' -> ' + newNik : ''));
  } else if (actionType === 'delete') {
    var nik = String(payload.nik || '').trim();
    var rowIndex = _findStaffRowIndex(displayValues, lowerHeaders, nik);
    if (rowIndex === -1) throw new Error('Staf NIK: ' + nik + ' tidak ditemukan atau sudah dihapus.');
    sheet.deleteRow(rowIndex + 1);
    logActivity('Staff Management', 'Menghapus staf NIK: ' + nik);
  } else {
    throw new Error('Action staf tidak dikenal: ' + actionType);
  }
  SpreadsheetApp.flush();
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

