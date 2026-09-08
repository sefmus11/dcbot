// ================== economy.js ==================
// Para, günlük ödül, blackjack, coinflip, slot, zar ve piyango sistemi.
// index.js'teki commands objesiyle aynı imzayı kullanır:
// async (message, args, settings) => { ... }
// ==================================================

const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// ---------- AYARLAR ----------
const CONFIG = {
  MAX_BET: 250000,
  MIN_BET: 10,
  DAILY_MIN: 500,
  DAILY_MAX: 2000,
  DAILY_COOLDOWN: 24 * 60 * 60 * 1000,
  STARTING_BALANCE: 1000,
  LOTTERY_TICKET_PRICE: 1000,
  LOTTERY_DRAW_INTERVAL: 24 * 60 * 60 * 1000,
  CURRENCY_EMOJI: "💰",
};

// ---------- VERİTABANI (JSON dosya tabanlı, kendi dosyaları) ----------
const DB_PATH = path.join(__dirname, "economy-data.json");
const LOTTERY_PATH = path.join(__dirname, "lottery-data.json");

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

let users = loadData(DB_PATH, {});
let lottery = loadData(LOTTERY_PATH, {
  pool: 0,
  tickets: [],
  nextDraw: Date.now() + CONFIG.LOTTERY_DRAW_INTERVAL,
  history: [],
});

function saveUsers() {
  fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}
function saveLottery() {
  fs.writeFileSync(LOTTERY_PATH, JSON.stringify(lottery, null, 2));
}

function getUser(userId) {
  if (!users[userId]) {
    users[userId] = {
      balance: CONFIG.STARTING_BALANCE,
      lastDaily: 0,
      stats: { won: 0, lost: 0, gamesPlayed: 0 },
    };
    saveUsers();
  }
  if (!users[userId].stats) users[userId].stats = { won: 0, lost: 0, gamesPlayed: 0 };
  return users[userId];
}

function updateBalance(userId, amount) {
  const user = getUser(userId);
  user.balance += amount;
  if (user.balance < 0) user.balance = 0;
  saveUsers();
  return user.balance;
}

function recordGame(userId, won) {
  const user = getUser(userId);
  user.stats.gamesPlayed++;
  if (won) user.stats.won++;
  else user.stats.lost++;
  saveUsers();
}

// ---------- YARDIMCI FONKSİYONLAR ----------
function parseBet(input, userBalance) {
  if (!input) return null;
  const lower = input.toLowerCase();
  let amount;
  if (lower === "hepsi" || lower === "all" || lower === "max") {
    amount = userBalance;
  } else {
    amount = parseInt(input.replace(/\./g, "").replace(/,/g, ""), 10);
  }
  if (isNaN(amount) || amount <= 0) return null;
  return amount;
}

function validateBet(amount, userBalance) {
  if (amount < CONFIG.MIN_BET) return `Minimum bahis **${CONFIG.MIN_BET.toLocaleString("tr-TR")}**.`;
  if (amount > CONFIG.MAX_BET) return `Maksimum bahis **${CONFIG.MAX_BET.toLocaleString("tr-TR")}**.`;
  if (amount > userBalance) return `Yeterli bakiyen yok! Bakiyen: **${userBalance.toLocaleString("tr-TR")}**.`;
  return null;
}

function formatMoney(n) {
  return `${n.toLocaleString("tr-TR")} ${CONFIG.CURRENCY_EMOJI}`;
}

// ================== KOMUTLAR ==================

async function para(message, args) {
  const target = message.mentions.users.first() || message.author;
  const user = getUser(target.id);

  const embed = new EmbedBuilder()
    .setColor("#2ecc71")
    .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
    .setDescription(`${CONFIG.CURRENCY_EMOJI} Bakiye: **${user.balance.toLocaleString("tr-TR")}**`)
    .addFields(
      { name: "Oynanan Oyun", value: `${user.stats.gamesPlayed}`, inline: true },
      { name: "Kazanılan", value: `${user.stats.won}`, inline: true },
      { name: "Kaybedilen", value: `${user.stats.lost}`, inline: true }
    );

  await message.channel.send({ embeds: [embed] });
}

async function daily(message) {
  const user = getUser(message.author.id);
  const now = Date.now();
  const remaining = user.lastDaily + CONFIG.DAILY_COOLDOWN - now;

  if (remaining > 0) {
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    return message.reply(`⏳ Günlük ödülünü zaten aldın! Yeni ödül için **${hours} saat ${minutes} dakika** beklemelisin.`);
  }

  const amount = Math.floor(Math.random() * (CONFIG.DAILY_MAX - CONFIG.DAILY_MIN + 1)) + CONFIG.DAILY_MIN;
  user.lastDaily = now;
  updateBalance(message.author.id, amount);

  const embed = new EmbedBuilder()
    .setColor("#f1c40f")
    .setDescription(
      `🎁 Günlük ödülünü aldın: **${amount.toLocaleString("tr-TR")}** ${CONFIG.CURRENCY_EMOJI}\n` +
      `Güncel bakiye: **${getUser(message.author.id).balance.toLocaleString("tr-TR")}**`
    );

  await message.channel.send({ embeds: [embed] });
}

async function coinflip(message, args) {
  const user = getUser(message.author.id);
  const amount = parseBet(args[0], user.balance);
  const choice = (args[1] || "").toLowerCase();

  if (!amount) return message.reply("Geçerli bir miktar gir. Örnek: `coinflip 1000 yazi`");
  const err = validateBet(amount, user.balance);
  if (err) return message.reply(err);
  if (!["yazi", "tura"].includes(choice)) {
    return message.reply("Yazı mı tura mı seçmelisin! Örnek: `coinflip 1000 yazi`");
  }

  const result = Math.random() < 0.5 ? "yazi" : "tura";
  const won = result === choice;

  updateBalance(message.author.id, won ? amount : -amount);
  recordGame(message.author.id, won);

  const embed = new EmbedBuilder()
    .setColor(won ? "#2ecc71" : "#e74c3c")
    .setDescription(
      `🪙 Sonuç: **${result === "yazi" ? "Yazı" : "Tura"}**\n` +
      (won ? `Kazandın! +${formatMoney(amount)}` : `Kaybettin! -${formatMoney(amount)}`) +
      `\nGüncel bakiye: **${getUser(message.author.id).balance.toLocaleString("tr-TR")}**`
    );

  await message.channel.send({ embeds: [embed] });
}

async function zar(message, args) {
  const user = getUser(message.author.id);
  const amount = parseBet(args[0], user.balance);
  const guess = (args[1] || "").toLowerCase();

  if (!amount) return message.reply("Geçerli bir miktar gir. Örnek: `zar 1000 tek` veya `zar 1000 4`");
  const err = validateBet(amount, user.balance);
  if (err) return message.reply(err);

  const roll = Math.floor(Math.random() * 6) + 1;
  let won, multiplier;

  if (guess === "tek" || guess === "cift") {
    const isEven = roll % 2 === 0;
    won = (guess === "cift" && isEven) || (guess === "tek" && !isEven);
    multiplier = 2;
  } else if (["1", "2", "3", "4", "5", "6"].includes(guess)) {
    won = parseInt(guess, 10) === roll;
    multiplier = 6;
  } else {
    return message.reply("Geçersiz tahmin! `tek`, `cift` veya `1` ile `6` arası bir sayı yaz.");
  }

  const change = won ? amount * (multiplier - 1) : -amount;
  updateBalance(message.author.id, change);
  recordGame(message.author.id, won);

  const diceEmojis = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  const embed = new EmbedBuilder()
    .setColor(won ? "#2ecc71" : "#e74c3c")
    .setDescription(
      `${diceEmojis[roll - 1]} Zar: **${roll}**\n` +
      (won ? `Kazandın! +${formatMoney(change)}` : `Kaybettin! -${formatMoney(amount)}`) +
      `\nGüncel bakiye: **${getUser(message.author.id).balance.toLocaleString("tr-TR")}**`
    );

  await message.channel.send({ embeds: [embed] });
}

const SLOT_SYMBOLS = [
  { emoji: "🍒", weight: 30, payout: 2 },
  { emoji: "🍋", weight: 25, payout: 3 },
  { emoji: "🍇", weight: 20, payout: 4 },
  { emoji: "🔔", weight: 15, payout: 6 },
  { emoji: "💎", weight: 8, payout: 10 },
  { emoji: "7️⃣", weight: 2, payout: 25 },
];

function spinReel() {
  const totalWeight = SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * totalWeight;
  for (const s of SLOT_SYMBOLS) {
    if (r < s.weight) return s;
    r -= s.weight;
  }
  return SLOT_SYMBOLS[0];
}

async function slot(message, args) {
  const user = getUser(message.author.id);
  const amount = parseBet(args[0], user.balance);

  if (!amount) return message.reply("Geçerli bir miktar gir. Örnek: `slot 1000`");
  const err = validateBet(amount, user.balance);
  if (err) return message.reply(err);

  const reels = [spinReel(), spinReel(), spinReel()];
  let won = false;
  let winnings = 0;

  if (reels[0].emoji === reels[1].emoji && reels[1].emoji === reels[2].emoji) {
    won = true;
    winnings = amount * reels[0].payout;
  } else if (
    reels[0].emoji === reels[1].emoji ||
    reels[1].emoji === reels[2].emoji ||
    reels[0].emoji === reels[2].emoji
  ) {
    won = true;
    winnings = Math.floor(amount * 1.5);
  }

  const change = won ? winnings - amount : -amount;
  updateBalance(message.author.id, change);
  recordGame(message.author.id, won);

  const embed = new EmbedBuilder()
    .setColor(won ? "#2ecc71" : "#e74c3c")
    .setTitle("🎰 Slot Makinesi")
    .setDescription(
      `【 ${reels.map((r) => r.emoji).join(" | ")} 】\n\n` +
      (won ? `Kazandın! +${formatMoney(change)}` : `Kaybettin! -${formatMoney(amount)}`) +
      `\nGüncel bakiye: **${getUser(message.author.id).balance.toLocaleString("tr-TR")}**`
    );

  await message.channel.send({ embeds: [embed] });
}

function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck = [];
  for (const s of suits) for (const v of values) deck.push({ suit: s, value: v });
  return deck.sort(() => Math.random() - 0.5);
}

function cardValue(card) {
  if (["J", "Q", "K"].includes(card.value)) return 10;
  if (card.value === "A") return 11;
  return parseInt(card.value, 10);
}

function handValue(hand) {
  let total = hand.reduce((s, c) => s + cardValue(c), 0);
  let aces = hand.filter((c) => c.value === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function formatHand(hand) {
  return hand.map((c) => `${c.value}${c.suit}`).join(" ");
}

async function blackjack(message, args) {
  const user = getUser(message.author.id);
  const amount = parseBet(args[0], user.balance);

  if (!amount) return message.reply("Geçerli bir miktar gir. Örnek: `blackjack 1000`");
  const err = validateBet(amount, user.balance);
  if (err) return message.reply(err);

  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];

  const playerBJ = handValue(playerHand) === 21;
  const dealerBJ = handValue(dealerHand) === 21;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("hit").setLabel("Kart Çek").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("stand").setLabel("Dur").setStyle(ButtonStyle.Secondary)
  );

  const buildEmbed = (revealDealer = false, resultText = null) => {
    const embed = new EmbedBuilder()
      .setColor("#2c3e50")
      .setTitle("🃏 Blackjack")
      .addFields(
        { name: `Senin Elin (${handValue(playerHand)})`, value: formatHand(playerHand) },
        {
          name: revealDealer ? `Kurpiyer (${handValue(dealerHand)})` : "Kurpiyer",
          value: revealDealer ? formatHand(dealerHand) : `${formatHand([dealerHand[0]])} 🂠`,
        }
      )
      .setFooter({ text: `Bahis: ${amount.toLocaleString("tr-TR")}` });
    if (resultText) embed.setDescription(resultText);
    return embed;
  };

  const msg = await message.channel.send({
    embeds: [buildEmbed()],
    components: playerBJ || dealerBJ ? [] : [row],
  });

  async function finish(interaction) {
    while (handValue(dealerHand) < 17) dealerHand.push(deck.pop());

    const playerTotal = handValue(playerHand);
    const dealerTotal = handValue(dealerHand);
    let result, change;

    if (playerTotal > 21) {
      result = "💥 Battın! Kaybettin.";
      change = -amount;
    } else if (playerBJ && !dealerBJ) {
      result = "🎉 Blackjack! Kazandın!";
      change = Math.floor(amount * 1.5);
    } else if (dealerTotal > 21) {
      result = "🎉 Kurpiyer battı! Kazandın!";
      change = amount;
    } else if (playerTotal > dealerTotal) {
      result = "🎉 Kazandın!";
      change = amount;
    } else if (playerTotal < dealerTotal) {
      result = "😔 Kaybettin.";
      change = -amount;
    } else {
      result = "🤝 Berabere! Bahsin iade edildi.";
      change = 0;
    }

    updateBalance(message.author.id, change);
    if (change !== 0) recordGame(message.author.id, change > 0);

    const finalEmbed = buildEmbed(
      true,
      `${result}${change !== 0 ? `\n${change > 0 ? "+" : ""}${formatMoney(change)}` : ""}\n` +
      `Güncel bakiye: **${getUser(message.author.id).balance.toLocaleString("tr-TR")}**`
    );

    if (interaction) {
      await interaction.update({ embeds: [finalEmbed], components: [] });
    } else {
      await msg.edit({ embeds: [finalEmbed], components: [] });
    }
  }

  if (playerBJ || dealerBJ) {
    return finish(null);
  }

  const collector = msg.createMessageComponentCollector({
    filter: (i) => i.user.id === message.author.id,
    time: 30000,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "hit") {
      playerHand.push(deck.pop());
      if (handValue(playerHand) >= 21) {
        collector.stop("done");
        return finish(i);
      }
      await i.update({ embeds: [buildEmbed()], components: [row] });
    } else {
      collector.stop("done");
      finish(i);
    }
  });

  collector.on("end", (collected, reason) => {
    if (reason !== "done") {
      msg.edit({ components: [] }).catch(() => {});
    }
  });
}

async function piyango(message, args) {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "al" || sub === "buy") {
    const count = parseInt(args[1], 10) || 1;
    if (count <= 0 || count > 100) {
      return message.reply("1 ile 100 arası bilet alabilirsin. Örnek: `piyango al 5`");
    }

    const user = getUser(message.author.id);
    const cost = CONFIG.LOTTERY_TICKET_PRICE * count;

    if (user.balance < cost) {
      return message.reply(`Yeterli bakiyen yok! ${formatMoney(cost)} gerekiyor, bakiyen: ${formatMoney(user.balance)}`);
    }

    updateBalance(message.author.id, -cost);
    lottery.pool += cost;
    for (let i = 0; i < count; i++) {
      lottery.tickets.push({ userId: message.author.id });
    }
    saveLottery();

    const myTickets = lottery.tickets.filter((t) => t.userId === message.author.id).length;

    return message.reply(
      `🎟️ **${count}** bilet aldın! (${formatMoney(cost)})\n` +
      `Toplam bilet sayın: **${myTickets}**\n` +
      `Güncel ödül havuzu: **${lottery.pool.toLocaleString("tr-TR")}**`
    );
  }

  if (sub === "gecmis" || sub === "history") {
    if (lottery.history.length === 0) {
      return message.reply("Henüz hiç çekiliş yapılmadı.");
    }
    const lines = lottery.history.map(
      (h) => `<@${h.userId}> — **${h.prize.toLocaleString("tr-TR")}** (${new Date(h.date).toLocaleDateString("tr-TR")})`
    );
    const embed = new EmbedBuilder()
      .setColor("#9b59b6")
      .setTitle("🏆 Son Piyango Kazananları")
      .setDescription(lines.join("\n"));
    return message.channel.send({ embeds: [embed] });
  }

  const remaining = lottery.nextDraw - Date.now();
  const hours = Math.max(0, Math.floor(remaining / 3600000));
  const minutes = Math.max(0, Math.floor((remaining % 3600000) / 60000));
  const myTickets = lottery.tickets.filter((t) => t.userId === message.author.id).length;

  const embed = new EmbedBuilder()
    .setColor("#9b59b6")
    .setTitle("🎰 Piyango")
    .setDescription(
      `Bilet fiyatı: **${CONFIG.LOTTERY_TICKET_PRICE.toLocaleString("tr-TR")}**\n` +
      `Ödül Havuzu: **${lottery.pool.toLocaleString("tr-TR")}**\n` +
      `Toplam bilet: **${lottery.tickets.length}**\n` +
      `Senin bilet sayın: **${myTickets}**\n` +
      `Sonraki çekiliş: **${hours}s ${minutes}dk**\n\n` +
      `Bilet almak için: \`piyango al <adet>\`\n` +
      `Geçmiş kazananlar: \`piyango gecmis\``
    );

  await message.channel.send({ embeds: [embed] });
}

// ---------- PİYANGO ÇEKİLİŞ ZAMANLAYICISI ----------
function startLotteryScheduler(client, announceChannelId = null) {
  setInterval(async () => {
    if (Date.now() < lottery.nextDraw) return;

    if (lottery.tickets.length === 0) {
      lottery.nextDraw = Date.now() + CONFIG.LOTTERY_DRAW_INTERVAL;
      saveLottery();
      return;
    }

    const winnerTicket = lottery.tickets[Math.floor(Math.random() * lottery.tickets.length)];
    const prize = lottery.pool;

    updateBalance(winnerTicket.userId, prize);

    lottery.history.unshift({ userId: winnerTicket.userId, prize, date: Date.now() });
    lottery.history = lottery.history.slice(0, 10);
    lottery.pool = 0;
    lottery.tickets = [];
    lottery.nextDraw = Date.now() + CONFIG.LOTTERY_DRAW_INTERVAL;
    saveLottery();

    if (announceChannelId) {
      const channel = await client.channels.fetch(announceChannelId).catch(() => null);
      if (channel) {
        const embed = new EmbedBuilder()
          .setColor("#f1c40f")
          .setTitle("🎉 Piyango Çekilişi Sonucu")
          .setDescription(`Kazanan: <@${winnerTicket.userId}>\nÖdül: **${prize.toLocaleString("tr-TR")}** 💰`);
        channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }, 60 * 1000);
}

module.exports = {
  commands: {
    para,
    bakiye: para,
    daily,
    gunluk: daily,
    coinflip,
    zar,
    slot,
    blackjack,
    piyango,
    loto: piyango,
  },
  startLotteryScheduler,
  // Diğer sistemlerin (örn. hunt.js) bakiyeye erişebilmesi için dışa açıyoruz
  getUser,
  updateBalance,
  formatMoney,
};
