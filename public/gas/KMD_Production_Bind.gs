const KMD_PRODUCTION_DATABASE_ID = '1QWUYC-xo8btMWbJtl0FUoUKR04xe1_1M2RZzucAO8ds';

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
