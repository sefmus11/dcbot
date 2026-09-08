# Discord Yönetim Botu

Özelleştirilebilir prefix, çekiliş, moderasyon komutları ve resimli hoşgeldin mesajı içeren bir Discord botu.

## Komutlar (varsayılan prefix: `!`)

| Komut | Açıklama |
|---|---|
| `!menu` | Komut listesini gösterir |
| `!prefix <yeni>` | Sunucunun prefix'ini değiştirir |
| `!çekiliş <süre> <ödül>` | Reaksiyonlu çekiliş başlatır. Örn: `!çekiliş 10m Nitro` |
| `!ban <@kullanıcı> [sebep]` | Kullanıcıyı yasaklar |
| `!unban <kullanıcı ID>` | Yasağı kaldırır |
| `!kick <@kullanıcı> [sebep]` | Kullanıcıyı atar |
| `!mute <@kullanıcı> <süre> [sebep]` | Kullanıcıyı susturur. Örn: `!mute @ali 10m` |
| `!unmute <@kullanıcı>` | Susturmayı kaldırır |
| `!clear <sayı>` | Belirtilen sayıda mesaj siler (1-100) |
| `!sohbet aç` / `!sohbet kapa` | Bulunulan kanalı herkese açar/kilitler |
| `!welcome #kanal` | Hoşgeldin mesajlarının gönderileceği kanalı ayarlar |
| `!avatar [@kullanıcı]` | Profil fotoğrafını gösterir |
| `!userinfo [@kullanıcı]` | Kullanıcı bilgilerini gösterir |
| `!serverinfo` | Sunucu bilgilerini gösterir |

**Prefix değiştirme örneği:** `!prefix a` yazarsan, artık `a menu`, `a çekiliş 10m ödül` gibi `a ` ile başlayan her komut çalışır.

**Hoşgeldin mesajı:** Yeni katılan kullanıcı için, profil fotoğrafı sağ üstte gösterilen bir mesaj otomatik gönderilir. Hedef kanal `!welcome #kanal` ile ayarlanmazsa sunucunun varsayılan sistem kanalına gönderilir.

## Discord Developer Portal ayarları
1. https://discord.com/developers/applications → botunu seç → **Bot** sekmesi
2. **Privileged Gateway Intents** altında şunları AÇ:
   - `MESSAGE CONTENT INTENT`
   - `SERVER MEMBERS INTENT`
3. Botu sunucuna eklerken (OAuth2 > URL Generator) en azından şu izinleri ver: Ban Members, Kick Members, Moderate Members, Manage Messages, Manage Channels, Manage Roles, Send Messages, Read Message History, Add Reactions, Embed Links, Attach Files. En kolayı: **Administrator** izni vermek.

## Yerelde çalıştırma
```
npm install
cp .env.example .env   # .env içine token'ı yapıştır
npm start
```

## Notlar
- Ayarlar (`prefix`, hoşgeldin kanalı) `settings.json` dosyasında saklanır; bu dosya bot çalışırken otomatik oluşur.
- Ban/kick/mute komutlarının çalışması için botun rolünün, işlem yapılacak kullanıcının rolünden **üstte** olması gerekir.
