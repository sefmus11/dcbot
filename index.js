require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  ActivityType,
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("./storage");
const { commands: economyCommands, startLotteryScheduler } = require("./economy");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});

const COLOR = 0x5865f2;
const GIVEAWAY_EMOJI = "🎉";

// ---------- yardımcı fonksiyonlar ----------

// "10s", "5m", "2h", "1d" -> milisaniye
function parseDuration(text) {
  if (!text) return null;
  const match = text.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
}

function getTargetMember(message, args) {
  const mentioned = message.mentions.members?.first();
  if (mentioned) return mentioned;
  const id = args[0]?.replace(/[<@!>]/g, "");
  if (id) return message.guild.members.cache.get(id) || null;
  return null;
}

function hasPerm(member, permission) {
  return member.permissions.has(permission);
}

const AI_SYSTEM_PROMPT =
  "Sen yardımsever, kısa ve net cevaplar veren bir Discord asistanısın. Türkçe cevap ver, 1-3 cümle ile sınırlı tut.";

async function askGemini(question, historyText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ayarlanmamış");

  const prompt = `${AI_SYSTEM_PROMPT}\nÖnceki konuşma: ${historyText || "yok"}\nYeni soru: ${question}`;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!answer) throw new Error("Boş yanıt döndü");
  return answer.trim();
}

// ---------- komutlar ----------
// Her komut: async (message, args, settings) => { ... }

const commands = {
  async menu(message, args, settings) {
    const p = settings.prefix;
    const embed = new EmbedBuilder()
      .setTitle("📋 Komut Menüsü")
      .setDescription(`Aktif prefix: \`${p}\``)
      .setColor(COLOR)
      .addFields(
        { name: `${p}menu`, value: "Bu menüyü gösterir" },
        { name: `${p}prefix <yeni>`, value: "Sunucu prefix'ini değiştirir (Sunucuyu Yönet yetkisi gerekir)" },
        { name: `${p}çekiliş <süre> <ödül>`, value: "Reaksiyonlu çekiliş başlatır. Örn: `10m Nitro`" },
        { name: `${p}ban <@kullanıcı> [sebep]`, value: "Kullanıcıyı sunucudan yasaklar" },
        { name: `${p}unban <kullanıcı ID>`, value: "Yasağı kaldırır" },
        { name: `${p}kick <@kullanıcı> [sebep]`, value: "Kullanıcıyı sunucudan atar" },
        { name: `${p}mute <@kullanıcı> <süre> [sebep]`, value: "Kullanıcıyı susturur. Örn: `10m`" },
        { name: `${p}unmute <@kullanıcı>`, value: "Susturmayı kaldırır" },
        { name: `${p}clear <sayı>`, value: "Belirtilen sayıda mesajı siler (maks 100)" },
        { name: `${p}sohbet <aç|kapa>`, value: "Bulunduğun kanalda herkesin yazmasını açar/kapatır" },
        { name: `${p}welcome <#kanal>`, value: "Hoşgeldin mesajlarının gönderileceği kanalı ayarlar" },
        { name: `${p}avatar [@kullanıcı]`, value: "Profil fotoğrafını gösterir" },
        { name: `${p}userinfo [@kullanıcı]`, value: "Kullanıcı bilgilerini gösterir" },
        { name: `${p}serverinfo`, value: "Sunucu bilgilerini gösterir" },
        { name: `${p}sor <soru>`, value: "NoveraMC yapay zeka asistanına soru sorar" },
        { name: `${p}bakım <aç|kapa>`, value: "AI asistanını bakım moduna alır/çıkarır" },
        { name: `${p}durum <metin>`, value: "Botun aktivite durumunu değiştirir" },
        { name: `${p}para [@kullanıcı]`, value: "Bakiyeni gösterir" },
        { name: `${p}daily`, value: "Günlük ödülünü alır" },
        { name: `${p}coinflip <miktar> <yazi/tura>`, value: "Yazı tura oyunu" },
        { name: `${p}zar <miktar> <tek/cift/1-6>`, value: "Zar oyunu" },
        { name: `${p}slot <miktar>`, value: "Slot makinesi" },
        { name: `${p}blackjack <miktar>`, value: "21 oyunu" },
        { name: `${p}piyango`, value: "Piyango sistemi (`piyango al <adet>` ile bilet al)" }
      );
    await message.channel.send({ embeds: [embed] });
  },

  async prefix(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("Bu komutu kullanmak için **Sunucuyu Yönet** yetkin olmalı.");
    }
    const newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 5) {
      return message.reply("Kullanım: `!prefix <yeni_prefix>` (en fazla 5 karakter)");
    }
    updateGuildSettings(message.guild.id, { prefix: newPrefix });
    await message.reply(`Prefix güncellendi: \`${newPrefix}\`. Örnek: \`${newPrefix}menu\``);
  },

  async çekiliş(message, args) {
    const durationText = args.shift();
    const prize = args.join(" ");

    if (!durationText || !prize) {
      return message.reply("Kullanım: `çekiliş <süre> <ödül>` — Örn: `çekiliş 1m Discord Nitro`");
    }

    const durationMs = parseDuration(durationText);
    if (!durationMs) {
      return message.reply("Geçersiz süre. Şu formatları kullan: `10s`, `5m`, `2h`, `1d`");
    }

    const endTime = Math.floor((Date.now() + durationMs) / 1000);
    const embed = new EmbedBuilder()
      .setTitle("🎉 ÇEKİLİŞ 🎉")
      .setDescription(
        `**Ödül:** ${prize}\n\nKatılmak için ${GIVEAWAY_EMOJI} ile tepki ver!\nBitiş: <t:${endTime}:R>`
      )
      .setColor(0x9b59b6)
      .setFooter({ text: `Başlatan: ${message.author.tag}` });

    const giveawayMessage = await message.channel.send({ embeds: [embed] });
    await giveawayMessage.react(GIVEAWAY_EMOJI);

    setTimeout(async () => {
      try {
        const fetched = await giveawayMessage.fetch();
        const reaction = fetched.reactions.cache.get(GIVEAWAY_EMOJI);
        const users = reaction ? await reaction.users.fetch() : null;
        const participants = users ? users.filter((u) => !u.bot) : null;

        if (!participants || participants.size === 0) {
          return message.channel.send(`Çekilişe kimse katılmadı. (Ödül: ${prize})`);
        }

        const winner = participants.random();
        const resultEmbed = new EmbedBuilder()
          .setTitle("🎉 ÇEKİLİŞ SONUÇLANDI 🎉")
          .setDescription(`**Ödül:** ${prize}\n**Kazanan:** ${winner}`)
          .setColor(0x2ecc71);
        await message.channel.send({ embeds: [resultEmbed] });
      } catch (err) {
        console.error("Çekiliş hatası:", err);
      }
    }, durationMs);
  },

  async ban(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.BanMembers)) {
      return message.reply("Bu komutu kullanmak için **Üyeleri Yasakla** yetkin olmalı.");
    }
    const target = getTargetMember(message, args);
    if (!target) return message.reply("Kullanım: `ban <@kullanıcı> [sebep]`");
    if (!target.bannable) return message.reply("Bu kullanıcıyı yasaklayamıyorum (rol hiyerarşisi).");

    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    await target.ban({ reason });
    await message.reply(`✅ ${target.user.tag} yasaklandı. Sebep: ${reason}`);
  },

  async unban(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.BanMembers)) {
      return message.reply("Bu komutu kullanmak için **Üyeleri Yasakla** yetkin olmalı.");
    }
    const userId = args[0]?.replace(/[<@!>]/g, "");
    if (!userId) return message.reply("Kullanım: `unban <kullanıcı ID>`");
    try {
      await message.guild.members.unban(userId);
      await message.reply(`✅ Kullanıcının (ID: ${userId}) yasağı kaldırıldı.`);
    } catch {
      await message.reply("Bu ID'ye ait bir yasak bulunamadı.");
    }
  },

  async kick(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.KickMembers)) {
      return message.reply("Bu komutu kullanmak için **Üyeleri At** yetkin olmalı.");
    }
    const target = getTargetMember(message, args);
    if (!target) return message.reply("Kullanım: `kick <@kullanıcı> [sebep]`");
    if (!target.kickable) return message.reply("Bu kullanıcıyı atamıyorum (rol hiyerarşisi).");

    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    await target.kick(reason);
    await message.reply(`✅ ${target.user.tag} sunucudan atıldı. Sebep: ${reason}`);
  },

  async mute(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("Bu komutu kullanmak için **Üyeleri Yönet** yetkin olmalı.");
    }
    const target = getTargetMember(message, args);
    const durationText = args[1];
    const durationMs = parseDuration(durationText);
    if (!target || !durationMs) {
      return message.reply("Kullanım: `mute <@kullanıcı> <süre> [sebep]` — Örn: `mute @kullanıcı 10m`");
    }
    const reason = args.slice(2).join(" ") || "Sebep belirtilmedi";
    await target.timeout(durationMs, reason);
    await message.reply(`🔇 ${target.user.tag} ${durationText} boyunca susturuldu. Sebep: ${reason}`);
  },

  async unmute(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("Bu komutu kullanmak için **Üyeleri Yönet** yetkin olmalı.");
    }
    const target = getTargetMember(message, args);
    if (!target) return message.reply("Kullanım: `unmute <@kullanıcı>`");
    await target.timeout(null);
    await message.reply(`🔊 ${target.user.tag} kullanıcısının susturması kaldırıldı.`);
  },

  async clear(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("Bu komutu kullanmak için **Mesajları Yönet** yetkin olmalı.");
    }
    const count = parseInt(args[0], 10);
    if (!count || count < 1 || count > 100) {
      return message.reply("Kullanım: `clear <1-100 arası sayı>`");
    }
    const deleted = await message.channel.bulkDelete(count, true);
    const confirmation = await message.channel.send(`🧹 ${deleted.size} mesaj silindi.`);
    setTimeout(() => confirmation.delete().catch(() => {}), 4000);
  },

  async sohbet(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("Bu komutu kullanmak için **Kanalları Yönet** yetkin olmalı.");
    }
    const mode = args[0]?.toLowerCase();
    if (mode !== "aç" && mode !== "kapa") {
      return message.reply("Kullanım: `sohbet aç` veya `sohbet kapa`");
    }
    const everyone = message.guild.roles.everyone;
    if (mode === "kapa") {
      await message.channel.permissionOverwrites.edit(everyone, { SendMessages: false });
      await message.channel.send("🔒 Bu kanal kilitlendi, sadece yetkililer yazabilir.");
    } else {
      await message.channel.permissionOverwrites.edit(everyone, { SendMessages: null });
      await message.channel.send("🔓 Bu kanalın kilidi açıldı, herkes yazabilir.");
    }
  },

  async welcome(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("Bu komutu kullanmak için **Sunucuyu Yönet** yetkin olmalı.");
    }
    const channel = message.mentions.channels?.first();
    if (!channel) return message.reply("Kullanım: `welcome #kanal-adı`");
    updateGuildSettings(message.guild.id, { welcomeChannelId: channel.id });
    await message.reply(`✅ Hoşgeldin mesajları artık ${channel} kanalına gönderilecek.`);
  },

  async avatar(message, args) {
    const target = getTargetMember(message, args) || message.member;
    const embed = new EmbedBuilder()
      .setTitle(`${target.user.tag} — Profil Fotoğrafı`)
      .setImage(target.user.displayAvatarURL({ size: 512, extension: "png" }))
      .setColor(COLOR);
    await message.channel.send({ embeds: [embed] });
  },

  async userinfo(message, args) {
    const target = getTargetMember(message, args) || message.member;
    const roles = target.roles.cache
      .filter((r) => r.id !== message.guild.id)
      .map((r) => r.toString())
      .slice(0, 15)
      .join(", ") || "Yok";

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${target.user.tag}`)
      .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
      .setColor(COLOR)
      .addFields(
        { name: "Kullanıcı ID", value: target.id, inline: true },
        { name: "Sunucuya Katılım", value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: "Hesap Oluşturulma", value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Roller", value: roles }
      );
    await message.channel.send({ embeds: [embed] });
  },

  async serverinfo(message) {
    const guild = message.guild;
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }) || null)
      .setColor(COLOR)
      .addFields(
        { name: "Üye Sayısı", value: `${guild.memberCount}`, inline: true },
        { name: "Oluşturulma", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Sahibi", value: `<@${guild.ownerId}>`, inline: true },
        { name: "Kanal Sayısı", value: `${guild.channels.cache.size}`, inline: true },
        { name: "Rol Sayısı", value: `${guild.roles.cache.size}`, inline: true }
      );
    await message.channel.send({ embeds: [embed] });
  },

  async sor(message, args, settings) {
    if (settings.bakim) {
      return message.reply("🔧 Şu anda bakımdayım, birazdan döneceğim!");
    }
    const question = args.join(" ");
    if (!question) {
      return message.reply("❌ Lütfen bir soru yazın! Örnek: `sor nasılsın`");
    }

    await message.channel.sendTyping();
    const history = settings.aiHistory?.[message.author.id] || "";

    try {
      const answer = await askGemini(question, history);
      const newHistory = `Soru: ${question} - Cevap: ${answer}`;
      updateGuildSettings(message.guild.id, {
        aiHistory: { ...(settings.aiHistory || {}), [message.author.id]: newHistory },
      });
      await message.reply(`🤖 **Novera AI:** ${answer}`);
    } catch (err) {
      console.error("Gemini hatası:", err);
      await message.reply(`❌ Hata oluştu: ${err.message}`);
    }
  },

  async bakım(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("Bu komutu kullanmak için **Sunucuyu Yönet** yetkin olmalı.");
    }
    const mode = args[0]?.toLowerCase();
    if (mode !== "aç" && mode !== "kapa") {
      return message.reply("Kullanım: `bakım aç` veya `bakım kapa`");
    }
    updateGuildSettings(message.guild.id, { bakim: mode === "aç" });
    await message.reply(mode === "aç" ? "🔧 Bakım modu açıldı." : "✅ Bakım modu kapatıldı.");
  },

  async durum(message, args) {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("Bu komutu kullanmak için **Sunucuyu Yönet** yetkin olmalı.");
    }
    const text = args.join(" ");
    if (!text) return message.reply("Kullanım: `durum <yeni durum metni>`");
    client.user.setActivity(text, { type: ActivityType.Watching });
    await message.reply(`✅ Bot durumu güncellendi: "${text}" (tüm sunucularda geçerli, botun tekli bir durumu vardır)`);
  },
};

// Para, daily, blackjack, coinflip, slot, zar ve piyango komutlarını ekliyor.
Object.assign(commands, economyCommands);

// ---------- olaylar ----------

client.once("ready", () => {
  console.log(`Bot giriş yaptı: ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: "noveramc.aternos.me", type: ActivityType.Watching }],
    status: "online",
  });
  startLotteryScheduler(client);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const settings = getGuildSettings(message.guild.id);
  const prefix = settings.prefix;

  if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName || !commands[commandName]) return;

  try {
    await commands[commandName](message, args, settings);
  } catch (err) {
    console.error(`"${commandName}" komutunda hata:`, err);
    message.reply("⚠️ Komut çalıştırılırken bir hata oluştu.").catch(() => {});
  }
});

// Hoşgeldin mesajı
client.on("guildMemberAdd", async (member) => {
  const settings = getGuildSettings(member.guild.id);
  const channel =
    (settings.welcomeChannelId && member.guild.channels.cache.get(settings.welcomeChannelId)) ||
    member.guild.systemChannel;
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`👋 Hoş geldin, ${member.user.username}!`)
    .setDescription(`**${member.guild.name}** sunucusuna hoş geldin!\nArtık **${member.guild.memberCount}.** üyemizsin.`)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setColor(COLOR)
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => {});
});

client.login(process.env.DISCORD_TOKEN);
