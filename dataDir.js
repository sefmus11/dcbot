// ================== dataDir.js ==================
// Tüm JSON tabanlı verilerin (economy, hunt, bitcoin, storage) yazıldığı
// klasörü belirler. Railway'de bir Volume (kalıcı disk) bağlayıp
// DATA_DIR ortam değişkenini o diskin bağlama yoluna ayarlarsan
// (örn. /data), bot yeniden başlasa/deploy edilse bile veriler SİLİNMEZ.
//
// DATA_DIR ayarlanmazsa proje klasörü kullanılır — bu Railway'de
// KALICI DEĞİLDİR, sadece yerel test için uygundur.
// ==================================================

const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || __dirname;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

module.exports = { DATA_DIR };
