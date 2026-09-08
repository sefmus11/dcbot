// ================== hunt.js ==================
// !avla, !hayvanlarim, !sat, !market, !satinal, !envanter, !gemtak, !gemcikar, !kasaac
// OwO tarzı avcılık sistemi. economy.js'teki bakiye fonksiyonlarını kullanır.
// ==================================================

const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { getUser, updateBalance, formatMoney } = require("./economy");

const HUNT_COOLDOWN = 30 * 1000; // 30 saniye

// ---------- HAYVAN KATALOĞU ----------
const ANIMALS = [
  { id: "tavsan", name: "Tavşan", emoji: "🐇", rarity: "common", weight: 35, price: 50 },
  { id: "sincap", name: "Sincap", emoji: "🐿️", rarity: "common", weight: 30, price: 60 },
  { id: "guvercin", name: "Güvercin", emoji: "🕊️", rarity: "common", weight: 25, price: 55 },
  { id: "tilki", name: "Tilki", emoji: "🦊", rarity: "uncommon", weight: 15, price: 200 },
  { id: "geyik", name: "Geyik", emoji: "🦌", rarity: "uncommon", weight: 12, price: 250 },
  { id: "kurt", name: "Kurt", emoji: "🐺", rarity: "rare", weight: 6, price: 700 },
  { id: "ayi", name: "Ayı", emoji: "🐻", rarity: "rare", weight: 5, price: 800 },
  { id: "kartal", name: "Kartal", emoji: "🦅", rarity: "epic", weight: 2, price: 2500 },
  { id: "panter", name: "Panter", emoji: "🐆", rarity: "epic", weight: 1.5, price: 3000 },
  { id: "ejderha", name: "Ejderha", emoji: "🐉", rarity: "legendary", weight: 0.3, price: 15000 },
];

const RARITY_LABELS = {
  common: { label: "Yaygın", color: "#95a5a6" },
  uncommon: { label: "Az Bulunan", color: "#2ecc71" },
  rare: { label: "Nadir", color: "#3498db" },
  epic: { label: "Destansı", color: "#9b59b6" },
  legendary: { label: "Efsanevi", color: "#f1c40f" },
};

// ---------- MARKET ÜRÜNLERİ ----------
const ITEMS = {
  gem_kucuk: { name: "Ufak Şans Taşı", emoji: "🔹", price: 5000, type: "gem", luckBonus: 0.05 },
  gem_parlak: { name: "Parlak Şans Taşı", emoji: "💠", price: 20000, type: "gem", luckBonus: 0.12 },
  gem_efsane: { name: "Efsanevi Şans Taşı", emoji: "🔮", price: 60000, type: "gem", luckBonus: 0.25 },
  kasa: { name: "Av Kasası", emoji: "📦", price: 2000, type: "crate" },
};

// ---------- VERİTABANI ----------
const HUNT_PATH = path.join(__dirname, "hunt-data.json");

function loadHunt() {
  if (!fs.existsSync(HUNT_PATH)) {
    fs.writeFileSync(HUNT_PATH, JSON.stringify({}, null, 2));
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(HUNT_PATH, "utf8"));
  } catch (e) {
    return {};
  }
}

let huntData = loadHunt();

function saveHunt() {
  fs.writeFileSync(HUNT_PATH, JSON.stringify(huntData, null, 2));
}

function getHuntUser(userId) {
  if (!huntData[userId]) {
    huntData[userId] = { animals: {}, items: {}, equippedGem: null, lastHunt: 0 };
    saveHunt();
  }
  return huntData[userId];
}

// ---------- YARDIMCI FONKSİYONLAR ----------
function findAnimal(query) {
  const q = query.toLowerCase();
  return ANIMALS.find((a) => a.id === q || a.name.toLowerCase() === q);
}

function pickAnimal(luckBonus) {
  const pool = ANIMALS.map((a) => {
    let weight = a.weight;
    if (a.rarity !== "common" && luckBonus) {
      weight = weight * (1 + luckBonus);
    }
    return { ...a, weight };
  });
  const total = pool.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const a of pool) {
    if (r < a.weight) return a;
    r -= a.weight;
  }
  return pool[0];
}

// ================== KOMUTLAR ==================

async function avla(message) {
  const huntUser = getHuntUser(message.author.id);
  const now = Date.now();
  const remaining = huntUser.lastHunt + HUNT_COOLDOWN - now;

  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000);
    return message.reply(`⏳ Yeni bir ava çıkmak için **${seconds} saniye** beklemelisin.`);
  }

  const gem = huntUser.equippedGem ? ITEMS[huntUser.equippedGem] : null;
  const luckBonus = gem ? gem.luckBonus : 0;
  const animal = pickAnimal(luckBonus);

  huntUser.animals[animal.id] = (huntUser.animals[animal.id] || 0) + 1;
  huntUser.lastHunt = now;
  saveHunt();

  const rarityInfo = RARITY_LABELS[animal.rarity];

  const embed = new EmbedBuilder()
    .setColor(rarityInfo.color)
    .setDescription(
      `🏹 Ava çıktın ve bir **${animal.emoji} ${animal.name}** yakaladın!\n` +
      `Nadirlik: **${rarityInfo.label}**\n` +
      `Satış değeri: **${animal.price.toLocaleString("tr-TR")}** 💰` +
      (gem ? `\n${gem.emoji} ${gem.name} sayesinde şansın arttı!` : "")
    );

  await message.channel.send({ embeds: [embed] });
}

async function hayvanlarim(message) {
  const huntUser = getHuntUser(message.author.id);
  const lines = ANIMALS.map((a) => {
    const count = huntUser.animals[a.id] || 0;
    return `${a.emoji} **${a.name}** (${RARITY_LABELS[a.rarity].label}) — ${count} adet · ${a.price.toLocaleString("tr-TR")}/adet`;
  });
  const totalValue = ANIMALS.reduce((s, a) => s + (huntUser.animals[a.id] || 0) * a.price, 0);

  const embed = new EmbedBuilder()
    .setColor("#27ae60")
    .setTitle(`🦁 ${message.author.username}'nin Hayvanat Bahçesi`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Toplam değer: ${totalValue.toLocaleString("tr-TR")} 💰 — satmak için: sat <hayvan> <adet>` });

  await message.channel.send({ embeds: [embed] });
}

async function sat(message, args) {
  const huntUser = getHuntUser(message.author.id);
  const arg0 = (args[0] || "").toLowerCase();

  if (arg0 === "hepsi" || arg0 === "all") {
    let total = 0;
    for (const animal of ANIMALS) {
      const count = huntUser.animals[animal.id] || 0;
      if (count > 0) {
        total += count * animal.price;
        huntUser.animals[animal.id] = 0;
      }
    }
    if (total === 0) return message.reply("Satacak hayvanın yok.");
    updateBalance(message.author.id, total);
    saveHunt();
    return message.reply(`✅ Tüm hayvanlarını sattın: +${formatMoney(total)}`);
  }

  const animal = findAnimal(arg0);
  if (!animal) {
    return message.reply("Kullanım: `sat <hayvan adı> <adet|hepsi>` veya `sat hepsi`\nHayvan adları için `hayvanlarim` yaz.");
  }

  const owned = huntUser.animals[animal.id] || 0;
  if (owned === 0) return message.reply(`Hiç ${animal.emoji} ${animal.name} avlamamışsın.`);

  const countArg = (args[1] || "").toLowerCase();
  const count = countArg === "hepsi" || countArg === "all" ? owned : parseInt(args[1], 10);

  if (!count || count <= 0 || count > owned) {
    return message.reply(`Geçersiz miktar. Elinde **${owned}** ${animal.emoji} ${animal.name} var.`);
  }

  const earned = count * animal.price;
  huntUser.animals[animal.id] -= count;
  updateBalance(message.author.id, earned);
  saveHunt();

  await message.reply(`✅ **${count}x** ${animal.emoji} ${animal.name} sattın: +${formatMoney(earned)}`);
}

async function market(message) {
  const lines = Object.entries(ITEMS).map(([id, item]) => {
    const detail =
      item.type === "gem"
        ? `+%${Math.round(item.luckBonus * 100)} nadir hayvan şansı`
        : "açınca rastgele ödül (para / gem / nadir hayvan)";
    return `${item.emoji} **${item.name}** — ${item.price.toLocaleString("tr-TR")} 💰\n${detail}\nSatın almak için: \`satinal ${id}\``;
  });

  const embed = new EmbedBuilder()
    .setColor("#e67e22")
    .setTitle("🏪 Market")
    .setDescription(lines.join("\n\n"));

  await message.channel.send({ embeds: [embed] });
}

async function satinal(message, args) {
  const itemId = (args[0] || "").toLowerCase();
  const count = parseInt(args[1], 10) || 1;
  const item = ITEMS[itemId];

  if (!item) return message.reply("Geçersiz ürün. `market` yazarak ürünleri görebilirsin.");
  if (count <= 0 || count > 50) return message.reply("1 ile 50 arası miktar girebilirsin.");

  const user = getUser(message.author.id);
  const cost = item.price * count;

  if (user.balance < cost) {
    return message.reply(`Yeterli bakiyen yok! ${formatMoney(cost)} gerekiyor, bakiyen: ${formatMoney(user.balance)}`);
  }

  updateBalance(message.author.id, -cost);
  const huntUser = getHuntUser(message.author.id);
  huntUser.items[itemId] = (huntUser.items[itemId] || 0) + count;
  saveHunt();

  await message.reply(`✅ **${count}x** ${item.emoji} ${item.name} satın aldın! (-${formatMoney(cost)})`);
}

async function envanter(message) {
  const huntUser = getHuntUser(message.author.id);
  const entries = Object.entries(huntUser.items).filter(([, c]) => c > 0);
  const lines = entries.length
    ? entries.map(([id, c]) => `${ITEMS[id]?.emoji || "❔"} **${ITEMS[id]?.name || id}** — ${c} adet`)
    : ["Envanterin boş. `market` üzerinden ürün alabilirsin."];

  const gem = huntUser.equippedGem ? ITEMS[huntUser.equippedGem] : null;

  const embed = new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(`🎒 ${message.author.username}'nin Envanteri`)
    .setDescription(lines.join("\n"))
    .addFields({ name: "Takılı Gem", value: gem ? `${gem.emoji} ${gem.name} (+%${Math.round(gem.luckBonus * 100)})` : "Yok" });

  await message.channel.send({ embeds: [embed] });
}

async function gemtak(message, args) {
  const itemId = (args[0] || "").toLowerCase();
  const item = ITEMS[itemId];

  if (!item || item.type !== "gem") {
    return message.reply("Geçersiz gem. `envanter` ile sahip olduğun gemleri görebilirsin.");
  }

  const huntUser = getHuntUser(message.author.id);
  if (!huntUser.items[itemId] || huntUser.items[itemId] <= 0) {
    return message.reply("Bu geme sahip değilsin. `market` üzerinden satın alabilirsin.");
  }

  huntUser.equippedGem = itemId;
  saveHunt();

  await message.reply(`✅ ${item.emoji} **${item.name}** takıldı! Artık avlarında +%${Math.round(item.luckBonus * 100)} nadir hayvan şansın var.`);
}

async function gemcikar(message) {
  const huntUser = getHuntUser(message.author.id);
  if (!huntUser.equippedGem) return message.reply("Zaten takılı bir gem yok.");
  huntUser.equippedGem = null;
  saveHunt();
  await message.reply("✅ Gem çıkarıldı.");
}

async function kasaac(message, args) {
  const count = parseInt(args[0], 10) || 1;
  const huntUser = getHuntUser(message.author.id);
  const owned = huntUser.items["kasa"] || 0;

  if (owned === 0) return message.reply("Hiç Av Kasan yok. `market` üzerinden satın alabilirsin.");
  if (count <= 0 || count > owned) return message.reply(`Elinde sadece **${owned}** kasa var.`);

  huntUser.items["kasa"] -= count;

  let totalMoney = 0;
  const gemsWon = {};
  const animalsWon = {};

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    if (roll < 0.55) {
      totalMoney += Math.floor(Math.random() * 1500) + 300;
    } else if (roll < 0.85) {
      gemsWon["gem_kucuk"] = (gemsWon["gem_kucuk"] || 0) + 1;
    } else if (roll < 0.97) {
      gemsWon["gem_parlak"] = (gemsWon["gem_parlak"] || 0) + 1;
    } else {
      const rareAnimals = ANIMALS.filter((a) => ["rare", "epic", "legendary"].includes(a.rarity));
      const animal = rareAnimals[Math.floor(Math.random() * rareAnimals.length)];
      animalsWon[animal.id] = (animalsWon[animal.id] || 0) + 1;
    }
  }

  if (totalMoney > 0) updateBalance(message.author.id, totalMoney);
  for (const [id, c] of Object.entries(gemsWon)) huntUser.items[id] = (huntUser.items[id] || 0) + c;
  for (const [id, c] of Object.entries(animalsWon)) huntUser.animals[id] = (huntUser.animals[id] || 0) + c;
  saveHunt();

  const lines = [];
  if (totalMoney > 0) lines.push(`💰 ${formatMoney(totalMoney)}`);
  for (const [id, c] of Object.entries(gemsWon)) lines.push(`${ITEMS[id].emoji} ${c}x ${ITEMS[id].name}`);
  for (const [id, c] of Object.entries(animalsWon)) {
    const a = ANIMALS.find((x) => x.id === id);
    lines.push(`${a.emoji} ${c}x ${a.name}`);
  }

  const embed = new EmbedBuilder()
    .setColor("#f39c12")
    .setTitle(`📦 ${count} Kasa Açıldı!`)
    .setDescription(lines.length ? lines.join("\n") : "Hiçbir şey çıkmadı, şanssız gündesin.");

  await message.channel.send({ embeds: [embed] });
}

module.exports = {
  commands: {
    avla,
    av: avla,
    hayvanlarim: hayvanlarim,
    zoo: hayvanlarim,
    sat,
    market,
    dukkan: market,
    satinal,
    buy: satinal,
    envanter,
    inv: envanter,
    gemtak,
    gemcikar,
    kasaac,
  },
};
