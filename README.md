# Yusic

Mavi temalı modern masaüstü müzik çalar, playlist yöneticisi, parça & liste bazlı hız/ton kontrol aracı, **10 bantlı canlı ekolayzer**, ayrı **Yerel Müzik** & tam kapsamlı **Spotify Canlı Akış** sekmeleri ve **Spotify / YouTube MP3 indirici**.

## Özellikler (v1.0.3)

- **Tam Spotify Deneyimi & Tek Tıkla Bağlantı:** Dahili Spotify Client ID hazır gelir. Spotify sekmesi üzerinden doğrudan **Spotify playlisti oluşturabilir**, başlık/açıklama/gizlilik düzenleyebilir, listeden çıkarabilir/silebilir, şarkı ekleyip çıkarabilir/sıralayabilir, `♥` ile beğenebilir, **Albümlerim** / **Keşfet** / **Sanatçı & Albüm Detayları** / **Çoklu Katalog Araması** kullanabilir ve **Spotify listelerinin içine kendi bilgisayarındaki yerel ses dosyalarını** da ekleyip birlikte çalabilirsin.
- **Kararlı Canlı Akış Motoru:** YouTube CDN 403/süre aşımı hatalarına karşı yerel tamponlu HTTPS 206 Range akışı ile Spotify şarkılarını ve hibrit yerel parçaları kesintisiz oynatır.
- **Ayrıştırılmış Yerel & Spotify Kitaplıkları:** **Yerel Müzik** ve **Spotify** ayrı üst düzey sekmelerdedir; kenar çubuğu kitaplığı bulunduğun sekmeye göre yalnızca yerel playlistleri ya da yalnızca Spotify kitaplığını gösterir.
- **Sekmeli Ayarlar, Ölçeklendirme & 10 Bantlı Ekolayzer:** `%75` – `%150` arası arayüz ölçeklendirme, kenarlardan/köşeden yeniden boyutlandırılabilir paneller ve Web Audio API tabanlı 10 bantlı (`32Hz` – `16kHz`) canlı ekolayzer.
- **Şarkıya ve Listeye Özel Hız / Ses Tonu (Pitch):** `0.25x` – `2.50x` arası çalma hızı ve **Sesi Koru (Sabit Ton)** / **Sesi Değiştir (Nightcore / Slowed)** seçenekleri.
- **Otomatik Klasör Aktarımı & GitHub Güncelleyici:** Kurulumlu sürümde `%USERPROFILE%\Music\Yusic` (geliştirme modunda `muzik/`) klasörüne atılan ses dosyalarını otomatik algılar ve yeni sürümleri GitHub Releases üzerinden günceller.

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
