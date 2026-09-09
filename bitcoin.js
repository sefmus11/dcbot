// ================== bitcoin.js ==================
// Hayali (oyun içi) Bitcoin madenciliği ve dalgalı piyasa sistemi.
// Gerçek kripto para birimiyle hiçbir bağlantısı yoktur, tamamen
// botun kendi "Para" birimiyle çalışan bir simülasyondur.
// economy.js'teki bakiye fonksiyonlarını kullanır.
// ==================================================

const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { getUser, updateBalance, formatMoney } = require("./economy");
const { DATA_DIR } = require("./dataDir");

// ---------- AYARLAR ----------
const BTC_CONFIG = {
  BASE_PRICE: 50000,       // Başlangıç kuru (Para / BTC)
  MIN_PRICE: 15000,        // Kur bu değerin altına düşemez
  MAX_PRICE: 500000,       // Kur bu değerin üstüne çıkamaz
  UPDATE_INTERVAL: 10 * 60 * 1000, // 10 dakikada bir piyasa güncellenir
  VOLATILITY: 0.07,        // Tek seferde en fazla %7 değişim (gerçekçi seviye)
  HISTORY_LENGTH: 12,      // Son kaç fiyat saklansın
  BIG_SWING_ANNOUNCE: 6,   // %6+ değişimlerde duyuru yapılsın
};

// ---------- MADENCİ KATALOĞU ----------
// rate: saat başına ürettiği BTC miktarı
const MINERS = [
  { id: "temel", name: "Temel Madenci", emoji: "🖥️", price: 10000, rate: 0.001 },
  { id: "gelismis", name: "Gelişmiş Madenci", emoji: "💻", price: 50000, rate: 0.006 },
  { id: "endustriyel", name: "Endüstriyel Madenci", emoji: "🏭", price: 150000, rate: 0.02 },
  { id: "kuantum", name: "Kuantum Madenci", emoji: "⚛️", price: 500000, rate: 0.08 },
];

// ---------- VERİTABANI ----------
const BTC_DATA_PATH = path.join(DATA_DIR, "bitcoin-data.json");
const BTC_MARKET_PATH = path.join(DATA_DIR, "bitcoin-market.json");

function loadData(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return defaultData;
  }
}

let btcData = loadData(BTC_DATA_PATH, {});
let market = loadData(BTC_MARKET_PATH, {
  price: BTC_CONFIG.BASE_PRICE,
  history: [BTC_CONFIG.BASE_PRICE],
  lastUpdate: Date.now(),
});

function saveBtc() {
  fs.writeFileSync(BTC_DATA_PATH, JSON.stringify(btcData, null, 2));
}
function saveMarket() {
  fs.writeFileSync(BTC_MARKET_PATH, JSON.stringify(market, null, 2));
}

function getBtcUser(userId) {
  if (!btcData[userId]) {
    btcData[userId] = { miners: {}, depo: 0, lastCollect: Date.now() };
    saveBtc();
  }
  return btcData[userId];
}

// Kullanıcının son toplamadan bu yana ürettiği BTC'yi depoya aktarır.
function collectMining(userId) {
  const btcUser = getBtcUser(userId);
  const now = Date.now();
  const elapsedHours = (now - btcUser.lastCollect) / 3600000;
  const totalRate = MINERS.reduce((s, m) => s + m.rate * (btcUser.miners[m.id] || 0), 0);
  const earned = totalRate * elapsedHours;

  btcUser.depo += earned;
  btcUser.lastCollect = now;
  saveBtc();
  return earned;
}

// ---------- PİYASA DALGALANMASI ----------
// Sadece rastgele yüzdesel değişim kullanmak matematiksel olarak aşağı yönlü
// bir kaymaya sebep olur (%7 düşüp %7 artmak seni başa döndürmez, hep eksi
// kalırsın). Bunu engellemek için fiyatı hafifçe "ortalama" bir değere doğru
// çeken bir güç ekliyoruz — fiyat düşünce yukarı, yükselince aşağı yönlü
// hafif bir baskı oluşur. Yine de güçlü art arda şoklarla dip ya da zirve
// bulunabilir, sadece sürekli tek yöne kaymaz.
function updatePrice() {
  const anchor = BTC_CONFIG.BASE_PRICE;
  const reversionStrength = 0.03; // ortalamaya çekilme gücü
  const reversion = ((anchor - market.price) / anchor) * reversionStrength;
  const randomShock = (Math.random() * 2 - 1) * BTC_CONFIG.VOLATILITY;

  const changePercent = randomShock + reversion;
  let newPrice = market.price * (1 + changePercent);

  // Taban/tavana sert yapışmayı önlemek için "yumuşak yansıtma":
  // sınırı aşan kısmın bir kısmını geri içeri yansıtıyoruz, böylece fiyat
  // hep aynı sabit sayıya (örn. tam 15.000) kilitlenip donmuş görünmez.
  if (newPrice < BTC_CONFIG.MIN_PRICE) {
    const overshoot = BTC_CONFIG.MIN_PRICE - newPrice;
    newPrice = BTC_CONFIG.MIN_PRICE + overshoot * 0.4 + Math.random() * (BTC_CONFIG.MIN_PRICE * 0.02);
  } else if (newPrice > BTC_CONFIG.MAX_PRICE) {
    const overshoot = newPrice - BTC_CONFIG.MAX_PRICE;
    newPrice = BTC_CONFIG.MAX_PRICE - overshoot * 0.4 - Math.random() * (BTC_CONFIG.MAX_PRICE * 0.02);
  }
  newPrice = Math.max(BTC_CONFIG.MIN_PRICE, Math.min(BTC_CONFIG.MAX_PRICE, newPrice));

  market.price = Math.round(newPrice);
  market.history.push(market.price);
  if (market.history.length > BTC_CONFIG.HISTORY_LENGTH) market.history.shift();
  market.lastUpdate = Date.now();
  saveMarket();
}

function startPriceUpdater(client, announceChannelId = null) {
  setInterval(async () => {
    const oldPrice = market.price;
    updatePrice();
    const changePct = ((market.price - oldPrice) / oldPrice) * 100;

    if (announceChannelId && Math.abs(changePct) >= BTC_CONFIG.BIG_SWING_ANNOUNCE) {
      const channel = await client.channels.fetch(announceChannelId).catch(() => null);
      if (channel) {
        const up = changePct > 0;
        const embed = new EmbedBuilder()
          .setColor(up ? "#2ecc71" : "#e74c3c")
          .setTitle(`${up ? "🚀" : "📉"} Bitcoin Piyasası Hareketlendi!`)
          .setDescription(
            `Fiyat **%${Math.abs(changePct).toFixed(1)}** ${up ? "arttı" : "düştü"}!\n` +
            `Yeni kur: **${market.price.toLocaleString("tr-TR")}** 💰 / BTC`
          );
        channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }, BTC_CONFIG.UPDATE_INTERVAL);
}

// ================== KOMUTLAR ==================

async function madenci(message, args) {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "al" || sub === "buy") {
    const tierId = (args[1] || "").toLowerCase();
    const count = parseInt(args[2], 10) || 1;
    const miner = MINERS.find((m) => m.id === tierId);

    if (!miner) {
      return message.reply(
        "Geçersiz madenci tipi. Kullanım: `madenci al <tip> <adet>`\n" +
        `Tipler: ${MINERS.map((m) => `\`${m.id}\``).join(", ")}`
      );
    }
    if (count <= 0 || count > 100) return message.reply("1 ile 100 arası adet girebilirsin.");

    const user = getUser(message.author.id);
    const cost = miner.price * count;

    if (user.balance < cost) {
      return message.reply(`Yeterli bakiyen yok! ${formatMoney(cost)} gerekiyor, bakiyen: ${formatMoney(user.balance)}`);
    }

    collectMining(message.author.id); // yeni madenci eklemeden önce mevcut üretimi adil şekilde topla
    updateBalance(message.author.id, -cost);

    const btcUser = getBtcUser(message.author.id);
    btcUser.miners[tierId] = (btcUser.miners[tierId] || 0) + count;
    saveBtc();

    return message.reply(`✅ **${count}x** ${miner.emoji} ${miner.name} satın aldın! (-${formatMoney(cost)})`);
  }

  if (sub === "topla" || sub === "collect") {
    const earned = collectMining(message.author.id);
    if (earned <= 0) {
      return message.reply("Toplayacak BTC yok. Hiç madencin yok ya da henüz yeterli süre geçmedi.");
    }
    return message.reply(`⛏️ **${earned.toFixed(6)} BTC** depona eklendi!`);
  }

  // Bilgi ekranı
  const btcUser = getBtcUser(message.author.id);
  const totalRate = MINERS.reduce((s, m) => s + m.rate * (btcUser.miners[m.id] || 0), 0);
  const pendingHours = (Date.now() - btcUser.lastCollect) / 3600000;
  const pending = totalRate * pendingHours;

  const lines = MINERS.map((m) => {
    const owned = btcUser.miners[m.id] || 0;
    return `${m.emoji} **${m.name}** (\`${m.id}\`) — ${owned} adet · ${m.rate} BTC/saat/adet · ${m.price.toLocaleString("tr-TR")} 💰/adet`;
  });

  const embed = new EmbedBuilder()
    .setColor("#f39c12")
    .setTitle("⛏️ Madencilerim")
    .setDescription(lines.join("\n"))
    .addFields(
      { name: "Toplam Üretim", value: `${totalRate.toFixed(4)} BTC/saat`, inline: true },
      { name: "Depo", value: `${btcUser.depo.toFixed(6)} BTC`, inline: true },
      { name: "Toplanmayı Bekleyen", value: `${pending.toFixed(6)} BTC`, inline: true }
    )
    .setFooter({ text: "Satın almak: madenci al <tip> <adet> — Toplamak: madenci topla" });

  await message.channel.send({ embeds: [embed] });
}

async function btcfiyat(message) {
  const current = market.price;
  const prev = market.history.length > 1 ? market.history[market.history.length - 2] : current;
  const changePct = prev ? ((current - prev) / prev) * 100 : 0;
  const trend = changePct > 0 ? "📈" : changePct < 0 ? "📉" : "➖";

  const historyLine = market.history.map((p) => p.toLocaleString("tr-TR")).join("  →  ");

  const embed = new EmbedBuilder()
    .setColor(changePct >= 0 ? "#2ecc71" : "#e74c3c")
    .setTitle("₿ Bitcoin Piyasası")
    .setDescription(
      `Güncel kur: **${current.toLocaleString("tr-TR")}** 💰 / BTC\n` +
      `Son değişim: ${trend} **%${changePct.toFixed(2)}**\n\n` +
      `**Son fiyatlar:**\n${historyLine}`
    )
    .setFooter({ text: "Piyasa her ~5 dakikada bir güncellenir. Alım-satım risklidir!" });

  await message.channel.send({ embeds: [embed] });
}

async function btcal(message, args) {
  const user = getUser(message.author.id);
  const arg = (args[0] || "").toLowerCase();
  let cost;

  if (arg === "hepsi" || arg === "all") {
    cost = user.balance;
  } else {
    cost = parseInt((args[0] || "").replace(/\./g, "").replace(/,/g, ""), 10);
  }

  if (!cost || cost <= 0 || cost > user.balance) {
    return message.reply(`Geçersiz miktar. Bakiyen: ${formatMoney(user.balance)}\nKullanım: \`btcal <miktar|hepsi>\``);
  }

  const btcAmount = cost / market.price;
  updateBalance(message.author.id, -cost);

  const btcUser = getBtcUser(message.author.id);
  btcUser.depo += btcAmount;
  saveBtc();

  await message.reply(
    `✅ **${formatMoney(cost)}** karşılığında **${btcAmount.toFixed(6)} BTC** aldın!\n` +
    `Kur: ${market.price.toLocaleString("tr-TR")} 💰/BTC`
  );
}

async function btcsat(message, args) {
  collectMining(message.author.id); // satmadan önce bekleyen üretimi depoya aktar
  const btcUser = getBtcUser(message.author.id);
  const arg = (args[0] || "").toLowerCase();
  let amount;

  if (arg === "hepsi" || arg === "all") {
    amount = btcUser.depo;
  } else {
    amount = parseFloat(args[0]);
  }

  if (!amount || amount <= 0 || amount > btcUser.depo) {
    return message.reply(
      `Geçersiz miktar. Depondaki BTC: **${btcUser.depo.toFixed(6)}**\n` +
      "Kullanım: `btcsat <miktar|hepsi>`"
    );
  }

  const earned = Math.floor(amount * market.price);
  btcUser.depo -= amount;
  updateBalance(message.author.id, earned);
  saveBtc();

  await message.reply(
    `✅ **${amount.toFixed(6)} BTC** sattın: +${formatMoney(earned)}\n` +
    `Kur: ${market.price.toLocaleString("tr-TR")} 💰/BTC`
  );
}

module.exports = {
  commands: {
    madenci,
    miner: madenci,
    btcfiyat,
    btc: btcfiyat,
    btcal,
    btcsat,
  },
  startPriceUpdater,
  // crypto-games.js'in BTC deposuna ve güncel kura doğrudan erişebilmesi için dışa açıyoruz
  getBtcUser,
  saveBtc,
  market,
};
