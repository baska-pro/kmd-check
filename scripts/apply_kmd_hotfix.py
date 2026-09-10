from pathlib import Path
import re


def replace_function(text: str, name: str, replacement: str) -> str:
    pattern = re.compile(
        r'^function\s+' + re.escape(name) + r'\s*\([^\n]*\)\s*\{.*?(?=^function\s+[A-Za-z0-9_]+\s*\(|\Z)',
        re.M | re.S,
    )
    result, count = pattern.subn(replacement.rstrip() + '\n\n', text, count=1)
    if count != 1:
        raise RuntimeError(f'Function {name} replacement count={count}')
    return result


# ---------------------------------------------------------------------------
# GAS: direct production DB + deterministic CRUD
# ---------------------------------------------------------------------------
code_path = Path('public/gas/Code.gs')
code = code_path.read_text(encoding='utf-8')
code = re.sub(
    r'const SCRIPT_VERSION = "[^"]+";(?:\nconst KMD_DATABASE_ID = "[^"]+";)?',
    'const SCRIPT_VERSION = "2.2";\nconst KMD_DATABASE_ID = "1QWUYC-xo8btMWbJtl0FUoUKR04xe1_1M2RZzucAO8ds";',
    code,
    count=1,
)

code = replace_function(code, 'getDB', r'''function getDB() {
  // KMD Check Database adalah satu-satunya source of truth.
  // Jangan bergantung pada PropertiesService atau active spreadsheet.
  try {
    return SpreadsheetApp.openById(KMD_DATABASE_ID);
  } catch (e) {
    throw new Error('KMD Check Database tidak dapat dibuka: ' + (e.message || e));
  }
}''')

code = replace_function(code, 'setup', r'''function setup() {
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
}''')

code = replace_function(code, 'login', r'''function login(username, password) {
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
}''')

code = replace_function(code, 'getData', r'''function getData() {
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
}''')

code = replace_function(code, 'updateStaff', r'''function updateStaff(nik, updates) {
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
}''')

code = replace_function(code, 'bulkUpdateStaff', r'''function bulkUpdateStaff(updatesList) {
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
}''')

code = replace_function(code, 'getFilteredLogs', r'''function getFilteredLogs() {
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
}''')

code = replace_function(code, 'deleteLog', r'''function deleteLog(id) {
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
}''')

code = replace_function(code, 'manageCompanyProfile', r'''function manageCompanyProfile(payload) {
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
}''')

code = replace_function(code, 'manageUser', r'''function manageUser(payload) {
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
}''')

code = replace_function(code, 'manageStaff', r'''function manageStaff(payload) {
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
}''')

# Reset must not fail just because ScriptProperties storage is unavailable.
reset_match = re.search(
    r'^function\s+resetProgress\s*\([^\n]*\)\s*\{.*?(?=^function\s+[A-Za-z0-9_]+\s*\(|\Z)',
    code,
    re.M | re.S,
)
if reset_match:
    reset = reset_match.group(0)
    reset = reset.replace(
        '  var props = PropertiesService.getScriptProperties();\n  var lastResetProp = String(props.getProperty("LAST_AUTO_RESET_DATE") || "").trim();',
        '  var lastResetProp = ""; // SystemStatus.lastResetDate adalah marker utama.',
    )
    reset = reset.replace(
        '    props.setProperty("LAST_AUTO_RESET_DATE", dateToCheck);',
        '    // ScriptProperties tidak digunakan; SystemStatus sudah menyimpan marker reset.',
    )
    code = code[:reset_match.start()] + reset + '\n\n' + code[reset_match.end():]

# Unknown API action must fail explicitly.
setup_route = '''      } else if (action === "setup") {\n        result = { message: setup() };\n      }'''
if setup_route in code and "Action API tidak dikenal" not in code:
    code = code.replace(
        setup_route,
        setup_route + ''' else {\n        throw new Error('Action API tidak dikenal: ' + action);\n      }''',
        1,
    )

code_path.write_text(code, encoding='utf-8')


# Binder remains compatible but does not use PropertiesService anymore.
Path('public/gas/KMD_Production_Bind.gs').write_text(r'''const KMD_PRODUCTION_DATABASE_ID = '1QWUYC-xo8btMWbJtl0FUoUKR04xe1_1M2RZzucAO8ds';

/** Code.gs v2.2 sudah memakai Spreadsheet ID produksi secara langsung. */
function KMD_BIND_PRODUCTION_DATABASE() {
  var ss = SpreadsheetApp.openById(KMD_PRODUCTION_DATABASE_ID);
  if (!ss || ss.getName() !== 'KMD Check Database') throw new Error('KMD Check Database tidak dapat dibuka.');
  var required = ['Users', 'Staff', 'Options', 'SystemStatus', 'CompanyProfile', 'ActivityLog', 'Transactions'];
  required.forEach(function(name) {
    if (!ss.getSheetByName(name)) throw new Error('Sheet wajib tidak ditemukan: ' + name);
  });
  var staff = ss.getSheetByName('Staff');
  var headers = staff.getRange(1, 1, 1, staff.getLastColumn()).getDisplayValues()[0];
  var nikCol = headers.map(function(v) { return String(v || '').trim().toLowerCase(); }).indexOf('nik');
  if (nikCol !== -1 && staff.getMaxRows() > 1) staff.getRange(2, nikCol + 1, staff.getMaxRows() - 1, 1).setNumberFormat('@');
  return {
    success: true,
    databaseName: ss.getName(),
    databaseId: ss.getId(),
    mode: 'DIRECT_ID',
    message: 'Database produksi terverifikasi. PropertiesService tidak digunakan.'
  };
}

function KMD_VERIFY_PRODUCTION_DATABASE() {
  var ss = SpreadsheetApp.openById(KMD_PRODUCTION_DATABASE_ID);
  return {
    success: !!ss && ss.getName() === 'KMD Check Database',
    databaseId: ss.getId(),
    databaseName: ss.getName(),
    userCount: Math.max(0, ss.getSheetByName('Users').getLastRow() - 1),
    staffCount: Math.max(0, ss.getSheetByName('Staff').getLastRow() - 1),
    mode: 'DIRECT_ID'
  };
}
''', encoding='utf-8')


# ---------------------------------------------------------------------------
# Runtime: no write deadlock; every mutation owns isUpdating lifecycle.
# ---------------------------------------------------------------------------
runtime_path = Path('src/lib/runtimeHardening.ts')
runtime = runtime_path.read_text(encoding='utf-8')
old_run = '''  const runManagementAction = async (action: string, payload: any) => {\n    if (!navigator.onLine) throw new Error('Perubahan data membutuhkan koneksi ke Spreadsheet.');\n    store.setState({ isUpdating: true, error: null });\n    try {\n      const data = await postGas({ action, payload });\n      if (data && typeof data === 'object') applyServerData(store, data);\n      else await fetchData(false);\n    } catch (error: any) {\n      store.setState({ error: error?.message || 'Perubahan data gagal.' });\n      throw error;\n    } finally {\n      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });\n    }\n  };'''
new_run = '''  const runManagementAction = async (action: string, payload: any) => {\n    if (!navigator.onLine) throw new Error('Perubahan data membutuhkan koneksi ke Spreadsheet.');\n    if (store.getState().isUpdating) throw new Error('Masih ada perubahan yang sedang disimpan. Tunggu sampai selesai.');\n    store.setState({ isUpdating: true, error: null });\n    let shouldRefresh = false;\n    try {\n      const data = await postGas({ action, payload });\n      if (data && typeof data === 'object') applyServerData(store, data);\n      else shouldRefresh = true;\n    } catch (error: any) {\n      store.setState({ error: error?.message || 'Perubahan data gagal.' });\n      throw error;\n    } finally {\n      store.setState({ isUpdating: false, isLoading: false, lastWriteTime: Date.now() });\n    }\n    if (shouldRefresh) await fetchData(false);\n  };'''
if old_run not in runtime:
    raise RuntimeError('runManagementAction block not found')
runtime = runtime.replace(old_run, new_run, 1)

old_delete = '''  const deleteLog = async (id: string) => {\n    if (!navigator.onLine) throw new Error('Hapus log membutuhkan koneksi ke Spreadsheet.');\n    const data = await postGas({ action: 'deleteLog', id });\n    if (data && typeof data === 'object') applyServerData(store, data);\n  };'''
new_delete = '''  const deleteLog = async (id: string) => {\n    if (!navigator.onLine) throw new Error('Hapus log membutuhkan koneksi ke Spreadsheet.');\n    if (store.getState().isUpdating) throw new Error('Masih ada perubahan yang sedang diproses.');\n    store.setState({ isUpdating: true, error: null });\n    try {\n      const data = await postGas({ action: 'deleteLog', id });\n      if (data && typeof data === 'object') applyServerData(store, data);\n    } catch (error: any) {\n      store.setState({ error: error?.message || 'Gagal menghapus log.' });\n      throw error;\n    } finally {\n      store.setState({ isUpdating: false, lastWriteTime: Date.now() });\n    }\n  };'''
if old_delete not in runtime:
    raise RuntimeError('deleteLog runtime block not found')
runtime = runtime.replace(old_delete, new_delete, 1)
runtime_path.write_text(runtime, encoding='utf-8')


# ---------------------------------------------------------------------------
# Dashboard: processing feedback + reliable modal lifecycle
# ---------------------------------------------------------------------------
dash_path = Path('src/components/Dashboard.tsx')
dash = dash_path.read_text(encoding='utf-8')
dash = dash.replace(
    "Copy, CheckSquare, Sparkles } from 'lucide-react';",
    "Copy, CheckSquare, Sparkles, Loader2 } from 'lucide-react';",
    1,
)
dash = dash.replace(
    'updateSystemStatus, isLoading, fetchData,',
    'updateSystemStatus, isLoading, isUpdating, fetchData,',
    1,
)

state_needle = "  const [editStatusKerja, setEditStatusKerja] = useState('');\n"
state_extra = r'''

  // Feedback per staf: klik cepat selalu memberi tanda proses dan hasil.
  const [processingStaffNik, setProcessingStaffNik] = useState<string | null>(null);
  const [recentlySavedStaffNik, setRecentlySavedStaffNik] = useState<string | null>(null);
  const staffFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (staffFeedbackTimerRef.current) clearTimeout(staffFeedbackTimerRef.current);
  }, []);

  const runStaffFeedbackAction = async (staffMember: Staff, action: () => Promise<void>, successMessage: string) => {
    if (processingStaffNik || isUpdating) return;
    if (staffFeedbackTimerRef.current) clearTimeout(staffFeedbackTimerRef.current);
    setRecentlySavedStaffNik(null);
    setProcessingStaffNik(staffMember.nik);
    const toastId = toast.loading(`Menyimpan ${staffMember.nama} ke Spreadsheet...`);
    try {
      await action();
      setRecentlySavedStaffNik(staffMember.nik);
      toast.success(successMessage, { id: toastId });
      staffFeedbackTimerRef.current = setTimeout(() => {
        setRecentlySavedStaffNik((current) => current === staffMember.nik ? null : current);
      }, 2200);
    } catch (error: any) {
      toast.error(error?.message ? `Gagal menyimpan ${staffMember.nama}: ${error.message}` : `Gagal menyimpan ${staffMember.nama}`, { id: toastId });
      throw error;
    } finally {
      setProcessingStaffNik((current) => current === staffMember.nik ? null : current);
    }
  };
'''
if state_needle not in dash:
    raise RuntimeError('Dashboard feedback state insertion point not found')
dash = dash.replace(state_needle, state_needle + state_extra, 1)

# User save gets a second, modern confirmation modal.
user_state_needle = "  const [showEditUserPin, setShowEditUserPin] = useState(false);\n"
user_state_extra = "  const [pendingUserSavePayload, setPendingUserSavePayload] = useState<any | null>(null);\n"
if user_state_needle not in dash:
    raise RuntimeError('User state insertion point not found')
dash = dash.replace(user_state_needle, user_state_needle + user_state_extra, 1)

old_add_user = re.compile(r"  const handleAddUserSubmit = async \(e: React\.FormEvent<HTMLFormElement>\) => \{.*?\n  \};\n\n  const handleEditUserSubmit", re.S)
new_add_user = r'''  const handleAddUserSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserPassword.trim()) {
      toast.error('Username dan password wajib diisi.');
      return;
    }
    setPendingUserSavePayload({
      actionType: 'add',
      username: newUsername.trim(),
      role: newUserRole,
      password: newUserPassword,
      localPin: newUserPin.trim() || '1234'
    });
  };

  const handleEditUserSubmit'''
dash, count = old_add_user.subn(new_add_user, dash, count=1)
if count != 1:
    raise RuntimeError('Add user handler replacement failed')

old_edit_user = re.compile(r"  const handleEditUserSubmit = async \(e: React\.FormEvent<HTMLFormElement>\) => \{.*?\n  \};\n\n  const handleDeleteUserSubmit", re.S)
new_edit_user = r'''  const handleEditUserSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editUsername.trim()) {
      toast.error('Username tidak boleh kosong.');
      return;
    }
    setPendingUserSavePayload({
      actionType: 'edit',
      username: originalUsername,
      newUsername: editUsername.trim(),
      role: editUserRole,
      password: editUserPassword,
      localPin: editUserPin.trim() || '1234'
    });
  };

  const handleConfirmUserSave = async () => {
    if (!pendingUserSavePayload || isUpdating) return;
    const { localPin, ...serverPayload } = pendingUserSavePayload;
    try {
      await manageUser(serverPayload);
      const finalUsername = serverPayload.newUsername || serverPayload.username;
      setStoredPin(localPin || '1234', finalUsername);
      toast.success(serverPayload.actionType === 'add' ? 'User berhasil ditambahkan.' : 'Perubahan user berhasil disimpan.');
      setPendingUserSavePayload(null);
      setShowAddUserModal(false);
      setShowEditUserModal(false);
      if (serverPayload.actionType === 'add') {
        setNewUsername('');
        setNewUserRole('USER');
        setNewUserPassword('');
        setNewUserPin('1234');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Gagal menyimpan user.');
    }
  };

  const handleDeleteUserSubmit'''
dash, count = old_edit_user.subn(new_edit_user, dash, count=1)
if count != 1:
    raise RuntimeError('Edit user handler replacement failed')

# CRUD handlers close only after success.
replacements = {
'''  const handleCpDeleteSubmit = async () => {
    if (!cpToDelete) return;
    await manageCompanyProfile({ actionType: 'delete', id: cpToDelete });
    setShowDeleteCpModal(false);
    setCpToDelete(null);
  };''': '''  const handleCpDeleteSubmit = async () => {
    if (!cpToDelete || isUpdating) return;
    try {
      await manageCompanyProfile({ actionType: 'delete', id: cpToDelete });
      toast.success('Profil berhasil dihapus dari Spreadsheet.');
      setShowDeleteCpModal(false);
      setCpToDelete(null);
    } catch (error: any) {
      toast.error(error?.message || 'Gagal menghapus profil.');
    }
  };''',
'''  const handleResetProgress = async () => {
    await resetProgress();
    setShowResetModal(false);
  };''': '''  const handleResetProgress = async () => {
    if (isUpdating) return;
    try {
      await resetProgress();
      toast.success('Reset berhasil disimpan ke Spreadsheet.');
      setShowResetModal(false);
    } catch (error: any) {
      toast.error(error?.message || 'Reset gagal.');
    }
  };''',
'''  const handleDeleteUserSubmit = async () => {
    if (!userToDelete) return;
    await manageUser({ actionType: 'delete', username: userToDelete });
    setShowDeleteUserModal(false);
    setUserToDelete('');
  };''': '''  const handleDeleteUserSubmit = async () => {
    if (!userToDelete || isUpdating) return;
    try {
      await manageUser({ actionType: 'delete', username: userToDelete });
      toast.success(`User ${userToDelete} berhasil dihapus.`);
      setShowDeleteUserModal(false);
      setUserToDelete('');
    } catch (error: any) {
      toast.error(error?.message || 'Gagal menghapus user.');
    }
  };''',
'''  const handleChangeRoleSubmit = async () => {
    if (!userToChangeRole) return;
    await manageUser({ actionType: 'changeRole', username: userToChangeRole, newRole: newRoleSelection });
    setShowChangeRoleModal(false);
    setUserToChangeRole('');
  };''': '''  const handleChangeRoleSubmit = async () => {
    if (!userToChangeRole || isUpdating) return;
    try {
      await manageUser({ actionType: 'changeRole', username: userToChangeRole, newRole: newRoleSelection });
      toast.success(`Role ${userToChangeRole} berhasil diubah menjadi ${newRoleSelection}.`);
      setShowChangeRoleModal(false);
      setUserToChangeRole('');
    } catch (error: any) {
      toast.error(error?.message || 'Gagal mengubah role user.');
    }
  };''',
}
for old, new in replacements.items():
    if old not in dash:
        raise RuntimeError('Expected CRUD handler block not found')
    dash = dash.replace(old, new, 1)

# Staff confirm handlers show explicit result.
dash = dash.replace(
    "      setNewStaffJumat(0);\n    } catch(err) {\n      // Handled by store\n    }\n  };",
    "      setNewStaffJumat(0);\n      toast.success('Staf baru berhasil disimpan ke Spreadsheet.');\n    } catch(err: any) {\n      toast.error(err?.message || 'Gagal menambah staf.');\n    }\n  };",
    1,
)
dash = dash.replace(
    "      setPendingStaffSavePayload(null);\n    } catch(err) {\n      // Handled by store\n    }\n  };",
    "      setPendingStaffSavePayload(null);\n      toast.success('Perubahan data staf berhasil disimpan.');\n    } catch(err: any) {\n      toast.error(err?.message || 'Gagal menyimpan perubahan staf.');\n    }\n  };",
    1,
)
dash = dash.replace(
    "      setShowDeleteStaffConfirmModal(null);\n    } catch(err) {\n      // Handled by store\n    }\n  };",
    "      setShowDeleteStaffConfirmModal(null);\n      toast.success('Data staf berhasil dihapus dari Spreadsheet.');\n    } catch(err: any) {\n      toast.error(err?.message || 'Gagal menghapus staf.');\n    }\n  };",
    1,
)

quick_status_old = '''  const handleQuickStatusKerjaUpdate = async (staff: Staff, newStatus: string) => {
    const updates: Partial<Staff> = { statusKerja: newStatus as any };
    if (newStatus === 'Di Lapangan') {
      updates.jamBerangkat = format(new Date(), 'HH:mm');
    } else if (newStatus === 'Pulang') {
      updates.jamPulang = format(new Date(), 'HH:mm');
    } else if (newStatus === 'Di Kantor') {
      updates.jamBerangkat = '';
      updates.jamPulang = '';
    }
    await updateStaff(staff.nik, updates);
  };'''
quick_status_new = '''  const handleQuickStatusKerjaUpdate = async (staff: Staff, newStatus: string) => {
    if (processingStaffNik || isUpdating) return;
    const updates: Partial<Staff> = { statusKerja: newStatus as any };
    if (newStatus === 'Di Lapangan') {
      updates.jamBerangkat = format(new Date(), 'HH:mm');
    } else if (newStatus === 'Pulang') {
      updates.jamPulang = format(new Date(), 'HH:mm');
    } else if (newStatus === 'Di Kantor') {
      updates.jamBerangkat = '';
      updates.jamPulang = '';
    }
    try {
      await runStaffFeedbackAction(staff, () => updateStaff(staff.nik, updates), `Status ${staff.nama} tersimpan: ${newStatus}`);
    } catch {}
  };'''
if quick_status_old not in dash:
    raise RuntimeError('Quick status handler not found')
dash = dash.replace(quick_status_old, quick_status_new, 1)

upload_pattern = re.compile(r"  const handleQuickUploadToggle = async \(staff: Staff\) => \{.*?\n  \};\n\n  const handleQuickProgressUpdate", re.S)
upload_new = '''  const handleQuickUploadToggle = async (staff: Staff) => {
    if (!canEditStaff || isLoading || isUpdating || processingStaffNik) return;
    if (staff.jumlahCenter === 0) return;
    const isCompleted = staff.statusUpload === 'Sudah upload semua';
    const newStatus = isCompleted ? 'Belum upload' : 'Sudah upload semua';
    const newProgress = isCompleted ? 0 : staff.jumlahCenter;
    try {
      await runStaffFeedbackAction(
        staff,
        () => updateStaff(staff.nik, { progressCenter: newProgress, statusUpload: newStatus as any }),
        `${staff.nama}: ${newStatus === 'Sudah upload semua' ? 'Selesai' : 'Belum Mulai'} tersimpan`
      );
    } catch {}
  };

  const handleQuickProgressUpdate'''
dash, count = upload_pattern.subn(upload_new, dash, count=1)
if count != 1:
    raise RuntimeError('Quick upload handler replacement failed')

progress_pattern = re.compile(r"  const handleQuickProgressUpdate = async \(staff: Staff, change: number\) => \{.*?\n  \};\n\n  const handleQuickSystemUpdate", re.S)
progress_new = '''  const handleQuickProgressUpdate = async (staff: Staff, change: number) => {
    if (!canEditStaff || isLoading || isUpdating || processingStaffNik) return;
    if (staff.jumlahCenter === 0) return;
    const newProgress = Math.min(Math.max(0, staff.progressCenter + change), staff.jumlahCenter);
    if (newProgress === staff.progressCenter) return;
    const newStatus = newProgress === 0 ? 'Belum upload' : newProgress >= staff.jumlahCenter ? 'Sudah upload semua' : 'Sebagian upload';
    try {
      await runStaffFeedbackAction(
        staff,
        () => updateStaff(staff.nik, { progressCenter: newProgress, statusUpload: newStatus as any }),
        `Progress ${staff.nama} tersimpan: ${newProgress}/${staff.jumlahCenter}`
      );
    } catch {}
  };

  const handleQuickSystemUpdate'''
dash, count = progress_pattern.subn(progress_new, dash, count=1)
if count != 1:
    raise RuntimeError('Quick progress handler replacement failed')

# Simple list: spinner -> saved feedback right on clicked staff.
dash = dash.replace(
    "                      const isBelum = s.statusUpload === 'Belum upload';\n                      const symbol",
    "                      const isBelum = s.statusUpload === 'Belum upload';\n                      const isProcessing = processingStaffNik === s.nik;\n                      const isJustSaved = recentlySavedStaffNik === s.nik;\n                      const symbol",
    1,
)
dash = dash.replace(
    'if (canEditStaff && s.jumlahCenter > 0) {\n                              handleQuickUploadToggle(s);',
    'if (canEditStaff && s.jumlahCenter > 0 && !processingStaffNik && !isUpdating) {\n                              handleQuickUploadToggle(s);',
    1,
)
dash = dash.replace('"text-sm font-bold truncate transition-colors",', '"text-sm font-bold break-words leading-snug transition-colors",', 1)
dash = dash.replace(
    '                              {symbol}\n                            </span>',
    '                              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin text-violet-600" /> : isJustSaved ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : symbol}\n                            </span>',
    1,
)
dash = dash.replace(
    "                              {isSelesai ? 'Selesai' : isBelum ? 'Belum' : s.statusUpload}\n",
    "                              {isProcessing ? 'Menyimpan…' : isJustSaved ? 'Tersimpan' : isSelesai ? 'Selesai' : isBelum ? 'Belum' : s.statusUpload}\n",
    1,
)

# Mutation buttons must respond to write state.
dash = dash.replace('disabled={isLoading}', 'disabled={isLoading || isUpdating}')

# Delete log modal stays open if server reports failure.
old_log = '''                onClick={async () => {
                  try {
                    await deleteLog(showDeleteLogConfirmModal.id);
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setShowDeleteLogConfirmModal(null);
                  }
                }}'''
new_log = '''                onClick={async () => {
                  if (isUpdating) return;
                  try {
                    await deleteLog(showDeleteLogConfirmModal.id);
                    toast.success('Log berhasil dihapus dari Spreadsheet.');
                    setShowDeleteLogConfirmModal(null);
                  } catch (e: any) {
                    toast.error(e?.message || 'Gagal menghapus log.');
                  }
                }}'''
if old_log not in dash:
    raise RuntimeError('Delete log inline handler not found')
dash = dash.replace(old_log, new_log, 1)

# Insert secondary user confirmation modal before Delete User modal.
user_modal_marker = '      {/* Delete User Confirmation Modal */}'
user_confirm_modal = r'''      {/* Confirm Add/Edit User */}
      {pendingUserSavePayload && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-md flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-violet-300/30 dark:border-violet-700/30 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                <Shield className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {pendingUserSavePayload.actionType === 'add' ? 'Tambah User Baru?' : 'Simpan Perubahan User?'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Data akan ditulis langsung ke sheet Users pada KMD Check Database.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 text-left text-xs space-y-2">
                <div className="flex justify-between gap-3"><span className="text-slate-500">Username</span><strong className="text-slate-900 dark:text-white">{pendingUserSavePayload.newUsername || pendingUserSavePayload.username}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Role</span><strong className="text-violet-700 dark:text-violet-300">{pendingUserSavePayload.role}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Password</span><strong className="text-slate-900 dark:text-white">{pendingUserSavePayload.password ? 'Akan diperbarui' : 'Tetap'}</strong></div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button type="button" disabled={isUpdating} onClick={() => setPendingUserSavePayload(null)} className="rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50">Cek Lagi</button>
                <button type="button" disabled={isUpdating} onClick={handleConfirmUserSave} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-md disabled:opacity-50">
                  {isUpdating ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses…</> : <><Check className="w-4 h-4" /> Ya, Simpan</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

'''
if user_modal_marker not in dash:
    raise RuntimeError('User confirmation modal insertion marker not found')
dash = dash.replace(user_modal_marker, user_confirm_modal + user_modal_marker, 1)

# Common confirmation labels get live processing feedback.
dash = dash.replace('<span>Ya, Simpan ke Sheet</span>', '<span>{isUpdating ? \'Memproses…\' : \'Ya, Simpan ke Sheet\'}</span>', 1)
dash = dash.replace('<span>Ya, Hapus</span>', '<span>{isUpdating ? \'Menghapus…\' : \'Ya, Hapus\'}</span>', 1)

dash_path.write_text(dash, encoding='utf-8')

print('KMD hotfix patch applied successfully')
