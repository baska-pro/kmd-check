const KMD_PRODUCTION_DATABASE_ID = '1QWUYC-xo8btMWbJtl0FUoUKR04xe1_1M2RZzucAO8ds';

/**
 * Jalankan SEKALI dari Apps Script editor setelah menambahkan file ini.
 * Fungsi ini mengikat Code.gs lama ke KMD Check Database produksi dan
 * memastikan kolom NIK tidak lagi diinterpretasikan sebagai tanggal.
 */
function KMD_BIND_PRODUCTION_DATABASE() {
  var ss = SpreadsheetApp.openById(KMD_PRODUCTION_DATABASE_ID);
  if (!ss || ss.getName() !== 'KMD Check Database') {
    throw new Error('Database produksi tidak ditemukan atau nama database tidak sesuai.');
  }

  var requiredSheets = ['Users', 'Staff', 'Options', 'SystemStatus', 'CompanyProfile', 'ActivityLog', 'Transactions'];
  requiredSheets.forEach(function(name) {
    if (!ss.getSheetByName(name)) throw new Error('Sheet wajib tidak ditemukan: ' + name);
  });

  PropertiesService.getScriptProperties().setProperty('DB_ID', KMD_PRODUCTION_DATABASE_ID);

  var staffSheet = ss.getSheetByName('Staff');
  if (staffSheet.getMaxRows() > 1) {
    staffSheet.getRange(2, 1, staffSheet.getMaxRows() - 1, 1).setNumberFormat('@');
  }

  var usersSheet = ss.getSheetByName('Users');
  var userCount = Math.max(0, usersSheet.getLastRow() - 1);

  return {
    success: true,
    databaseName: ss.getName(),
    databaseId: ss.getId(),
    users: userCount,
    message: 'GAS sekarang terikat ke KMD Check Database produksi. Kolom NIK telah dipaksa Plain Text.'
  };
}

/** Pemeriksaan aman tanpa menampilkan password. */
function KMD_VERIFY_PRODUCTION_DATABASE() {
  var propsId = PropertiesService.getScriptProperties().getProperty('DB_ID');
  var ss = SpreadsheetApp.openById(KMD_PRODUCTION_DATABASE_ID);
  var users = ss.getSheetByName('Users');
  var staff = ss.getSheetByName('Staff');
  return {
    success: propsId === KMD_PRODUCTION_DATABASE_ID,
    boundDatabaseId: propsId || '',
    expectedDatabaseId: KMD_PRODUCTION_DATABASE_ID,
    databaseName: ss.getName(),
    userCount: users ? Math.max(0, users.getLastRow() - 1) : 0,
    staffCount: staff ? Math.max(0, staff.getLastRow() - 1) : 0
  };
}
