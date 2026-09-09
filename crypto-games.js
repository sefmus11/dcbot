// ================== crypto-games.js ==================
// Kripto temalı 2 yüksek riskli kumar oyunu:
//
// 1) ZEPLİN — Çarpan sürekli yükselir, istediğin an "İn" diyerek çekebilirsin.
//    Kaldıraç seçersen kazanç da kayıp da katlanır — patlarsa ve kaldıraçla
//    oynuyorsan bakiyen EKSİYE düşüp BORÇLANABİLİRSİN.
//
// 2) KRİPTO MADEN TARLASI — 4x4 kutucuklu bir alanda "rug pull" (bomba)
//    kutucuklarından kaçarak ilerle, her güvenli kutucukta çarpan artar,
//    istediğin an çekebilirsin. Bombaya basarsan bahsin tamamen gider.
// ==================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getUser, updateBalance, formatMoney, MAX_BET } = require("./economy");

const MIN_BET = 100;

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
  const user = getUser(message.author.id);

  if (user.balance < 0) {
    return message.reply("⚠️ Borçlusun! Önce `daily`, `avla` veya `madenci` ile borcunu kapatmalısın.");
  }

  const amount = parseInt((args[0] || "").replace(/\./g, "").replace(/,/g, ""), 10);
  const leverage = parseInt(args[1], 10) || 1;

  if (!amount || amount <= 0) {
    return message.reply(
      `Kullanım: \`zeplin <miktar> <kaldıraç>\`\n` +
      `Kaldıraç seçenekleri: ${LEVERAGE_OPTIONS.join("x, ")}x\n` +
      `⚠️ Kaldıraç kullanırsan ve zeplin patlarsa **bahis x kaldıraç** kadar kaybedersin — bu bakiyeni eksiye düşürüp seni BORÇLANDIRABİLİR!`
    );
  }
  if (amount < MIN_BET) return message.reply(`Minimum bahis **${MIN_BET.toLocaleString("tr-TR")}**.`);
  if (amount > MAX_BET) return message.reply(`Maksimum bahis **${MAX_BET.toLocaleString("tr-TR")}**.`);
  if (amount > user.balance) return message.reply(`Yeterli bakiyen yok! Bakiyen: ${formatMoney(user.balance)}`);
  if (!LEVERAGE_OPTIONS.includes(leverage)) {
    return message.reply(`Geçersiz kaldıraç. Seçenekler: ${LEVERAGE_OPTIONS.join("x, ")}x`);
  }

  const maxLoss = amount * leverage;
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
        `Bahis: ${formatMoney(amount)} · Kaldıraç: **${leverage}x**\n` +
        `Riskli kayıp: ${formatMoney(maxLoss)}` +
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

    const profit = Math.floor(amount * leverage * (multiplier - 1));
    updateBalance(message.author.id, profit);

    const embed = buildEmbed(
      "cashed",
      `✅ **${multiplier.toFixed(2)}x**'te indin!\nKazanç: **+${formatMoney(profit)}**\nGüncel bakiye: **${getUser(message.author.id).balance.toLocaleString("tr-TR")}**`
    );

    if (interaction) await interaction.update({ embeds: [embed], components: [] });
    else await msg.edit({ embeds: [embed], components: [] });
  };

  const finishCrash = async () => {
    if (resolved) return;
    resolved = true;
    clearInterval(interval);
    collector.stop("crashed");

    updateBalance(message.author.id, -maxLoss);
    const finalBalance = getUser(message.author.id).balance;
    const debtLine = finalBalance < 0 ? `\n💀 **BORÇLANDIN!** Bakiyen artık: **${finalBalance.toLocaleString("tr-TR")}**` : "";

    const embed = buildEmbed(
      "crashed",
      `Zeplin **${crashPoint.toFixed(2)}x**'te patladı!\nKayıp: **-${formatMoney(maxLoss)}**${debtLine}`
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
  const user = getUser(message.author.id);

  if (user.balance < 0) {
    return message.reply("⚠️ Borçlusun! Önce `daily`, `avla` veya `madenci` ile borcunu kapatmalısın.");
  }

  const amount = parseInt((args[0] || "").replace(/\./g, "").replace(/,/g, ""), 10);
  const bombCount = parseInt(args[1], 10) || 3;

  if (!amount || amount <= 0) {
    return message.reply(
      `Kullanım: \`kripto <miktar> <bomba sayısı>\`\n` +
      `Bomba sayısı 1-15 arası olabilir (varsayılan: 3). Ne kadar çok bomba, o kadar yüksek çarpan!`
    );
  }
  if (amount < MIN_BET) return message.reply(`Minimum bahis **${MIN_BET.toLocaleString("tr-TR")}**.`);
  if (amount > MAX_BET) return message.reply(`Maksimum bahis **${MAX_BET.toLocaleString("tr-TR")}**.`);
  if (amount > user.balance) return message.reply(`Yeterli bakiyen yok! Bakiyen: ${formatMoney(user.balance)}`);
  if (bombCount < 1 || bombCount > 15) return message.reply("Bomba sayısı 1 ile 15 arasında olmalı.");

  updateBalance(message.author.id, -amount); // bahis baştan alınır, kazanınca iade + kâr verilir

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
        `Bahis: ${formatMoney(amount)} · Bomba: **${bombCount}**\n` +
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

      const payout = Math.floor(amount * currentMultiplier());
      updateBalance(message.author.id, payout);

      const embed = buildEmbed(
        "cashed",
        `✅ **${currentMultiplier().toFixed(2)}x**'te çektin!\nKazanç: **+${formatMoney(payout)}**\nGüncel bakiye: **${getUser(message.author.id).balance.toLocaleString("tr-TR")}**`
      );
      return i.update({ embeds: [embed], components: buildRows(true) });
    }

    const idx = parseInt(i.customId.replace("tile_", ""), 10);
    if (isNaN(idx) || revealed[idx]) return i.deferUpdate();

    revealed[idx] = true;

    if (bombPositions.has(idx)) {
      resolved = true;
      collector.stop("done");
      const embed = buildEmbed("boom", `💣 Rug pull'a bastın! Bahsin tamamen gitti: **-${formatMoney(amount)}**`);
      return i.update({ embeds: [embed], components: buildRows(true) });
    }

    revealedCount++;

    if (revealedCount === GRID_SIZE - bombCount) {
      // Tüm güvenli kutular açıldı, otomatik çek
      resolved = true;
      collector.stop("done");
      const payout = Math.floor(amount * currentMultiplier());
      updateBalance(message.author.id, payout);
      const embed = buildEmbed(
        "cashed",
        `🏆 Tüm güvenli kutuları buldun!\nKazanç: **+${formatMoney(payout)}**\nGüncel bakiye: **${getUser(message.author.id).balance.toLocaleString("tr-TR")}**`
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
