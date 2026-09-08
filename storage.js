const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "settings.json");

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const DEFAULTS = {
  prefix: "!",
  welcomeChannelId: null,
  bakim: false,
  aiHistory: {},
  aiChannels: [],
};

function getGuildSettings(guildId) {
  const data = loadData();
  if (!data[guildId]) {
    data[guildId] = { ...DEFAULTS };
    saveData(data);
  }
  return { ...DEFAULTS, ...data[guildId] };
}

function updateGuildSettings(guildId, updates) {
  const data = loadData();
  const current = data[guildId] || { ...DEFAULTS };
  data[guildId] = { ...current, ...updates };
  saveData(data);
  return data[guildId];
}

module.exports = { getGuildSettings, updateGuildSettings };
