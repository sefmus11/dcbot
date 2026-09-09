// ================== crypto-games.js ==================
// Kripto temalı 2 yüksek riskli kumar oyunu — Para DEĞİL, doğrudan
// BTC deponla oynanır. Kazanırsan deponda BTC birikir, kaybedersen
// deponu kaybedersin. Zeplin'de kaldıraç kullanırsan ve patlarsa,
// deponun sahip olduğundan FAZLA BTC kaybedip BTC BORCUNA girebilirsin
// (negatif BTC bakiyesi).
//
// 1) ZEPLİN — Çarpan sürekli yükselir, istediğin an "İn" diyerek çekebilirsin.
// 2) KRİPTO MADEN TARLASI — 4x4 kutucuklu alanda rug pull'lardan kaçarak
//    ilerle, her güvenli kutucukta çarpan artar, istediğin an çekebilirsin.
// ==================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getBtcUser, saveBtc, market } = require("./bitcoin");
const { getUser, updateBalance, formatMoney } = require("./economy");

const MIN_BET_BTC = 0.000001;

function formatBtc(n) {
  return `${n.toFixed(6)} BTC`;
}

function parseBtcAmount(input, depo) {
  if (!input) return null;
  const lower = input.toLowerCase();
  if (lower === "hepsi" || lower === "all") return depo;
  const amount = parseFloat(input);
  if (isNaN(amount) || amount <= 0) return null;
  return amount;
}

// BTC kaybı depoyu aşarsa, aşan kısmı güncel kurdan Para'ya çevirip
// Para bakiyesinden düşer. BTC deposu asla eksiye inmez (taban: 0),
// borç varsa tamamen Para cinsinden oluşur.
function handleBtcLoss(userId, lossBtc) {
  const btcUser = getBtcUser(userId);
  const fromDepo = Math.min(btcUser.depo, lossBtc);
  const deficitBtc = lossBtc - fromDepo;

  btcUser.depo -= fromDepo;
  saveBtc();

  let paraCost = 0;
  if (deficitBtc > 0) {
    paraCost = Math.round(deficitBtc * market.price);
    updateBalance(userId, -paraCost);
  }

  return {
    deficitBtc,
    paraCost,
    newDepo: btcUser.depo,
    newBalance: getUser(userId).balance,
  };
}

// ================== ZEPLİN ==================

const LEVERAGE_OPTIONS = [1, 2, 5, 10, 25, 50];
const TICK_MS = 900;

// Basit, hafif "house edge"li exponential dağılım.
// Çoğunlukla düşük/orta çarpanlarda patlar, nadiren çok yükseğe çıkar.
function generateCrashPoint() {
  const houseEdge = 0.96;
  const r = Math.random();
  if (r <= 0.0001) return 1.0;
  let crash = houseEdge / (1 - r);
  return Math.max(1.0, Math.min(crash, 1000));
}

async function zeplin(message, args) {
  const btcUser = getBtcUser(message.author.id);
  const betBtc = parseBtcAmount(args[0], btcUser.depo);
  const leverage = parseInt(args[1], 10) || 1;

  if (!betBtc) {
    return message.reply(
      `Kullanım: \`zeplin <BTC miktarı|hepsi> <kaldıraç>\` — Örn: \`zeplin 0.001 10\`\n` +
      `Kaldıraç seçenekleri: ${LEVERAGE_OPTIONS.join("x, ")}x\n` +
      `Deponda: **${formatBtc(btcUser.depo)}**\n` +
      `⚠️ Kaldıraç kullanırsan ve zeplin patlarsa **bahis x kaldıraç** kadar BTC kaybedersin. BTC'n yetmezse fark güncel kurdan Para'ya çevrilip bakiyenden düşülür — bu seni PARA BORCUNA sokabilir!`
    );
  }
  if (betBtc < MIN_BET_BTC) return message.reply(`Minimum bahis **${formatBtc(MIN_BET_BTC)}**.`);
  if (!LEVERAGE_OPTIONS.includes(leverage)) {
    return message.reply(`Geçersiz kaldıraç. Seçenekler: ${LEVERAGE_OPTIONS.join("x, ")}x`);
  }
  if (btcUser.depo <= 0) {
    return message.reply(`Deponda BTC yok (${formatBtc(btcUser.depo)}). \`madenci\` ile üretip \`madenci topla\` ile depona aktarabilirsin.`);
  }
  if (betBtc > btcUser.depo) {
    return message.reply(`Yeterli BTC'n yok! Deponda: ${formatBtc(btcUser.depo)}`);
  }

  const maxLoss = betBtc * leverage;
  const crashPoint = generateCrashPoint();
  let multiplier = 1.0;
  let resolved = false;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("cashout").setLabel("🪂 İn (Çek)").setStyle(ButtonStyle.Success)
  );

  const buildEmbed = (state, extra = "") => {
    const colors = { flying: "#3498db", cashed: "#2ecc71", crashed: "#e74c3c" };
    const titles = {
      flying: "🎈 Zeplin Havada...",
      cashed: "🪂 Zeplinden İndin!",
      crashed: "💥 Zeplin PATLADI!",
    };
    return new EmbedBuilder()
      .setColor(colors[state])
      .setTitle(titles[state])
      .setDescription(
        `Çarpan: **${multiplier.toFixed(2)}x**\n` +
        `Bahis: ${formatBtc(betBtc)} · Kaldıraç: **${leverage}x**\n` +
        `Riskli kayıp: ${formatBtc(maxLoss)}` +
        (extra ? `\n\n${extra}` : "")
      );
  };

  const msg = await message.reply({ embeds: [buildEmbed("flying")], components: [row] });

  const collector = msg.createMessageComponentCollector({
    filter: (i) => i.user.id === message.author.id,
    time: 60000,
  });

  const finishCashout = async (interaction) => {
    if (resolved) return;
    resolved = true;
    clearInterval(interval);

    const profit = betBtc * leverage * (multiplier - 1);
    const u = getBtcUser(message.author.id);
    u.depo += profit;
    saveBtc();

    const embed = buildEmbed(
      "cashed",
      `✅ **${multiplier.toFixed(2)}x**'te indin!\nKazanç: **+${formatBtc(profit)}**\nGüncel depo: **${formatBtc(u.depo)}**`
    );

    if (interaction) await interaction.update({ embeds: [embed], components: [] });
    else await msg.edit({ embeds: [embed], components: [] });
  };

  const finishCrash = async () => {
    if (resolved) return;
    resolved = true;
    clearInterval(interval);
    collector.stop("crashed");

    const result = handleBtcLoss(message.author.id, maxLoss);

    let extraLine = "";
    if (result.deficitBtc > 0) {
      extraLine += `\n⚠️ Deponda yeterli BTC yoktu — **${result.deficitBtc.toFixed(6)} BTC** değerindeki fark (~${formatMoney(result.paraCost)}) Para bakiyenden düşüldü.`;
    }
    if (result.newBalance < 0) {
      extraLine += `\n💀 **PARA BORCUNA GİRDİN!** Bakiyen: **${formatMoney(result.newBalance)}**`;
    }

    const embed = buildEmbed(
      "crashed",
      `Zeplin **${crashPoint.toFixed(2)}x**'te patladı!\nKayıp: **-${formatBtc(maxLoss)}**${extraLine}\nGüncel depo: **${formatBtc(result.newDepo)}**`
    );

    await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
  };

  const interval = setInterval(async () => {
    if (resolved) return clearInterval(interval);

    const growth = 1 + (0.05 + Math.random() * 0.07); // %5-12 arası büyüme
    multiplier *= growth;

    if (multiplier >= crashPoint) {
      await finishCrash();
      return;
    }

    await msg.edit({ embeds: [buildEmbed("flying")], components: [row] }).catch(() => {});
  }, TICK_MS);

  collector.on("collect", async (i) => {
    if (i.customId === "cashout") await finishCashout(i);
  });

  collector.on("end", (collected, reason) => {
    if (reason !== "crashed" && !resolved) {
      resolved = true;
      clearInterval(interval);
      msg.edit({ components: [] }).catch(() => {});
    }
  });
}

// ================== KRİPTO MADEN TARLASI (MINES) ==================

const GRID_SIZE = 16; // 4x4
const TILE_EMOJI = "❓";
const SAFE_EMOJI = "💎";
const BOMB_EMOJI = "💣";
const HOUSE_EDGE = 0.97;

function calcMultiplier(revealed, bombs) {
  let mult = 1;
  const total = GRID_SIZE;
  for (let i = 0; i < revealed; i++) {
    const safeLeft = total - bombs - i;
    const totalLeft = total - i;
    mult *= (totalLeft / safeLeft) * HOUSE_EDGE;
  }
  return mult;
}

async function kripto(message, args) {
  const btcUser = getBtcUser(message.author.id);
  const betBtc = parseBtcAmount(args[0], btcUser.depo);
  const bombCount = parseInt(args[1], 10) || 3;

  if (!betBtc) {
    return message.reply(
      `Kullanım: \`kripto <BTC miktarı|hepsi> <bomba sayısı>\` — Örn: \`kripto 0.0005 5\`\n` +
      `Bomba sayısı 1-15 arası olabilir (varsayılan: 3). Ne kadar çok bomba, o kadar yüksek çarpan!\n` +
      `Deponda: **${formatBtc(btcUser.depo)}**`
    );
  }
  if (betBtc < MIN_BET_BTC) return message.reply(`Minimum bahis **${formatBtc(MIN_BET_BTC)}**.`);
  if (bombCount < 1 || bombCount > 15) return message.reply("Bomba sayısı 1 ile 15 arasında olmalı.");
  if (btcUser.depo <= 0) {
    return message.reply(`Deponda BTC yok (${formatBtc(btcUser.depo)}). \`madenci\` ile üretip \`madenci topla\` ile depona aktarabilirsin.`);
  }
  if (betBtc > btcUser.depo) {
    return message.reply(`Yeterli BTC'n yok! Deponda: ${formatBtc(btcUser.depo)}`);
  }

  btcUser.depo -= betBtc; // bahis baştan alınır, kazanınca iade + kâr verilir
  saveBtc();

  const bombPositions = new Set();
  while (bombPositions.size < bombCount) {
    bombPositions.add(Math.floor(Math.random() * GRID_SIZE));
  }

  const revealed = new Array(GRID_SIZE).fill(false);
  let revealedCount = 0;
  let resolved = false;

  const buildRows = (showAll = false) => {
    const rows = [];
    for (let r = 0; r < 4; r++) {
      const row = new ActionRowBuilder();
      for (let c = 0; c < 4; c++) {
        const idx = r * 4 + c;
        const isBomb = bombPositions.has(idx);
        const btn = new ButtonBuilder().setCustomId(`tile_${idx}`);

        if (revealed[idx]) {
          btn.setLabel(isBomb ? BOMB_EMOJI : SAFE_EMOJI).setStyle(isBomb ? ButtonStyle.Danger : ButtonStyle.Success).setDisabled(true);
        } else if (showAll) {
          btn.setLabel(isBomb ? BOMB_EMOJI : SAFE_EMOJI).setStyle(isBomb ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(true);
        } else {
          btn.setLabel(TILE_EMOJI).setStyle(ButtonStyle.Secondary);
        }
        row.addComponents(btn);
      }
      rows.push(row);
    }

    const cashoutRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cashout")
        .setLabel("💰 Çek (Cash Out)")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(revealedCount === 0 || showAll)
    );
    rows.push(cashoutRow);
    return rows;
  };

  const currentMultiplier = () => calcMultiplier(revealedCount, bombCount);

  const buildEmbed = (state, extra = "") => {
    const colors = { playing: "#f39c12", cashed: "#2ecc71", boom: "#e74c3c" };
    const titles = {
      playing: "⛏️ Kripto Maden Tarlası",
      cashed: "💰 Çektin!",
      boom: "💥 RUG PULL!",
    };
    return new EmbedBuilder()
      .setColor(colors[state])
      .setTitle(titles[state])
      .setDescription(
        `Bahis: ${formatBtc(betBtc)} · Bomba: **${bombCount}**\n` +
        `Açılan güvenli kutu: **${revealedCount}**\n` +
        `Güncel çarpan: **${currentMultiplier().toFixed(2)}x**` +
        (extra ? `\n\n${extra}` : "")
      );
  };

  const msg = await message.reply({ embeds: [buildEmbed("playing")], components: buildRows() });

  const collector = msg.createMessageComponentCollector({
    filter: (i) => i.user.id === message.author.id,
    time: 60000,
  });

  collector.on("collect", async (i) => {
    if (resolved) return;

    if (i.customId === "cashout") {
      if (revealedCount === 0) return i.deferUpdate();
      resolved = true;
      collector.stop("done");

      const payout = betBtc * currentMultiplier();
      const u = getBtcUser(message.author.id);
      u.depo += payout;
      saveBtc();

      const embed = buildEmbed(
        "cashed",
        `✅ **${currentMultiplier().toFixed(2)}x**'te çektin!\nKazanç: **+${formatBtc(payout)}**\nGüncel depo: **${formatBtc(u.depo)}**`
      );
      return i.update({ embeds: [embed], components: buildRows(true) });
    }

    const idx = parseInt(i.customId.replace("tile_", ""), 10);
    if (isNaN(idx) || revealed[idx]) return i.deferUpdate();

    revealed[idx] = true;

    if (bombPositions.has(idx)) {
      resolved = true;
      collector.stop("done");
      const embed = buildEmbed("boom", `💣 Rug pull'a bastın! Bahsin tamamen gitti: **-${formatBtc(betBtc)}**`);
      return i.update({ embeds: [embed], components: buildRows(true) });
    }

    revealedCount++;

    if (revealedCount === GRID_SIZE - bombCount) {
      // Tüm güvenli kutular açıldı, otomatik çek
      resolved = true;
      collector.stop("done");
      const payout = betBtc * currentMultiplier();
      const u = getBtcUser(message.author.id);
      u.depo += payout;
      saveBtc();
      const embed = buildEmbed(
        "cashed",
        `🏆 Tüm güvenli kutuları buldun!\nKazanç: **+${formatBtc(payout)}**\nGüncel depo: **${formatBtc(u.depo)}**`
      );
      return i.update({ embeds: [embed], components: buildRows(true) });
    }

    await i.update({ embeds: [buildEmbed("playing")], components: buildRows() });
  });

  collector.on("end", (collected, reason) => {
    if (!resolved) {
      resolved = true;
      msg.edit({ components: buildRows(true) }).catch(() => {});
    }
  });
}

module.exports = {
  commands: {
    zeplin,
    kripto,
    mines: kripto,
  },
};
