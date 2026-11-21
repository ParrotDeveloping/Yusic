# Yusic

Mavi temalı modern masaüstü müzik çalar, playlist yöneticisi, parça & liste bazlı hız/ton kontrol aracı, **10 bantlı canlı ekolayzer**, ayrı **Yerel Müzik** & **Spotify Canlı Akış** sekmeleri ve **Spotify / YouTube MP3 indirici**.

## Özellikler (v1.0.2)

- **Tek Tıkla Spotify Bağlantısı & Canlı Akış:** Dahili Spotify Client ID hazır gelir (`Ayarlar > Spotify & İndirme` bölümünden değiştirilebilir). Hesabını OAuth 2.0 (PKCE, `http://127.0.0.1:43821/callback`) ile bağlayarak **Beğenilen Şarkılarını**, playlistlerini (Feb 2026 `/items` API + herkese açık yedek çözümleme ile), son dinlediklerini ve arama sonuçlarını indirmeden dinleyebilirsin.
- **Ayrıştırılmış Yerel & Spotify Kitaplıkları:** **Yerel Müzik** ve **Spotify** ayrı üst düzey sekmelerdedir; kenar çubuğu kitaplığı bulunduğun sekmeye göre yalnızca yerel playlistleri ya da yalnızca Spotify kitaplığını gösterir.
- **Sekmeli Ayarlar, Ölçeklendirme & 10 Bantlı Ekolayzer:**
  - **Görünüm & Ölçek:** `%75` – `%150` arası tam arayüz ölçeklendirme ve kenarlardan/köşeden sürüklenebilen yeniden boyutlandırılabilir paneller (`Kenar Çubuğu`, `Üst Menü`, `Alt Oynatıcı`).
  - **Ses & Ekolayzer:** Web Audio API tabanlı 10 bantlı (`32Hz` – `16kHz`) canlı ekolayzer ve 8 hazır ses profili (`Düz`, `Bas Güçlendirme`, `Pop`, `Rock`, `Elektronik`, `Vokal`, `Akustik`, `Gece`).
- **Şarkıya ve Listeye Özel Hız / Ses Tonu (Pitch):** `0.25x` – `2.50x` arası çalma hızı ve **Sesi Koru (Sabit Ton)** / **Sesi Değiştir (Nightcore / Slowed)** seçenekleri (`Şarkı > Liste > Genel` önceliği).
- **Liste Görünümleri & Kapak Fotoğrafı:** **Liste**, **Kompakt** ve **Izgara** görünüm modları; playlistlere özel kapak fotoğrafı seçme, 2×2 kolaj ve açıklama düzenleme.
- **Otomatik Klasör Aktarımı:** Kurulumlu sürümde `%USERPROFILE%\Music\Yusic` (geliştirme modunda `muzik/`) klasörüne attığın tüm `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, `.aac`, `.opus`, `.webm`, `.wma` dosyalarını otomatik algılar.
- **GitHub Otomatik Güncelleme:** Uygulama içinden GitHub Releases üzerinden yeni sürüm kontrolü, indirme ve tek tıkla kurup yeniden başlatma.

## Kurulum (Windows Setup)

1. [GitHub Releases](https://github.com/ParrotDeveloping/Yusic/releases/latest) sayfasından `Yusic-Setup-*.exe` kurulum dosyasını indirin ve çalıştırın.
2. Müzik dosyalarınız `Music\Yusic` klasöründe saklanır; güncellemeler sırasında silinmez.

## Geliştirici Komutları

```bash
npm install
npm test
npm run smoke
npm run dist
```
