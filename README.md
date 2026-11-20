# Yusic

Spotify esintili masaüstü müzik çalar, playlist yöneticisi, parça & liste bazlı hız/ton kontrol aracı, **Spotify Canlı Akış** istemcisi ve **Spotify / YouTube MP3 indirici**.

## Özellikler

- **Spotify Hesabı Bağlama & İndirmeden Dinleme:** Kendi Spotify hesabınızı OAuth 2.0 (PKCE, `http://127.0.0.1:43821/callback`) ile bağlayarak **Beğenilen Şarkılarınızı**, listelerinizi, son dinlediklerinizi veya arama sonuçlarını diske dosya indirmeden anında dinleyebilirsiniz. Ayrıca giriş yapmadan herkese açık Spotify bağlantıları da doğrudan akış olarak çalınabilir.
- **Şarkıya ve Listeye Özel Hız / Ses Tonu (Pitch):** `0.25x` – `2.50x` arası çalma hızı ve **Sesi Koru (Sabit Ton)** / **Sesi Değiştir (Nightcore / Slowed)** seçeneklerini hem genel hem tek şarkıya özel hem de listeye özel olarak kaydedebilirsiniz (`Şarkı > Liste > Genel` önceliği).
- **Spotify Benzeri Arayüz, Liste Görünümleri & Kapak Fotoğrafı:** **Liste**, **Kompakt** ve **Izgara** görünüm modları; playlistlere özel kapak fotoğrafı seçme, 2×2 kolaj ve açıklama düzenleme.
- **Otomatik Klasör Aktarımı:** Kurulumlu sürümde `%USERPROFILE%\Music\Yusic` (geliştirme modunda `muzik/`) klasörüne attığınız tüm `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, `.aac`, `.opus`, `.webm`, `.wma` dosyalarını otomatik algılar.
- **Karışık Çal, Liste Döngüsü, Tek Şarkı Döngüsü ve MP3 İndirici:** Spotify ve YouTube linklerinden tek şarkı veya tüm playlisti MP3 formatında indirebilirsiniz.
- **GitHub Otomatik Güncelleme:** Uygulama içinden yeni sürümleri GitHub Releases üzerinden kontrol etme, indirme ve tek tıkla kurup yeniden başlatma.

## Kurulum (Windows Setup)

1. [GitHub Releases](https://github.com/ParrotDeveloping/Yusic/releases/latest) sayfasından `Yusic-Setup-*.exe` kurulum dosyasını indirin ve çalıştırın.
2. Müzik dosyalarınız `Music\Yusic` klasöründe saklanır; güncellemeler sırasında silinmez.

## Spotify Hesabı Bağlama Kurulumu

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) üzerinden ücretsiz bir App oluşturun.
2. Redirect URI alanına `http://127.0.0.1:43821/callback` adresini ekleyin.
3. App **Client ID** değerini Yusic içindeki **Spotify** sekmesine yapıştırıp **Spotify ile Bağlan**'a basın.

## Geliştirici Komutları

```bash
npm install
npm test
npm run smoke
npm run dist
```
