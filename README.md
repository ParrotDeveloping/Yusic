# Yusic

Modern masaüstü müzik çalar, playlist yöneticisi, anlık hız/ton kontrol aracı ve **Spotify / YouTube MP3 indirici**.

## Özellikler

- **Otomatik Klasör Aktarımı:** Kurulumlu sürümde `%USERPROFILE%\Music\Yusic` (geliştirme modunda `muzik/`) klasörüne attığınız tüm `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, `.aac`, `.opus`, `.webm`, `.wma` dosyalarını otomatik algılar ve kütüphaneye aktarır. Pencereye sürükle-bırak da desteklenir.
- **Playlist Yönetimi:** Playlist oluşturma, yeniden adlandırma, şarkı ekleme/çıkarma ve sürükle-bırak ile sıralama.
- **Hız & Ses Tonu (Pitch) Kontrolü:** `0.25x` – `2.50x` arası çalma hızı ve **Sesi Koru (Sabit Ton)** / **Sesi Değiştir (Nightcore / Slowed)** seçimi.
- **Oynatma Modları:** Karışık Çal, Liste Döngüsü ve Tek Şarkı Döngüsü.
- **Spotify & YouTube İndirici:** Tek şarkı, video veya tüm playlist linkinden MP3 olarak indirme, albüm kapağı + ID3 etiketi işleme ve isteğe bağlı otomatik playlist oluşturma.
- **GitHub Otomatik Güncelleme:** Uygulama içinden yeni sürümleri GitHub Releases üzerinden kontrol etme, indirme ve tek tıkla kurup yeniden başlatma.

## Kurulum (Windows Setup)

1. [GitHub Releases](https://github.com/ParrotDeveloping/Yusic/releases/latest) sayfasından `Yusic-Setup-*.exe` kurulum dosyasını indirin ve çalıştırın.
2. Müzik dosyalarınız `Belgeler/Müzik` altındaki `Music\Yusic` klasöründe saklanır; güncellemeler sırasında silinmez.

## Geliştirici Komutları

```bash
npm install
npm test
npm run smoke
npm run dist
```

## Yeni Güncelleme Yayınlama

1. `package.json` içindeki `"version"` alanını yükseltin (ör. `1.0.1`).
2. Değişiklikleri commit edip `v1.0.1` etiketiyle pushlayın:
   ```bash
   git tag v1.0.1
   git push origin main --tags
   ```
   GitHub Actions (`.github/workflows/release.yml`) yeni `Yusic-Setup-1.0.1.exe`, `.blockmap` ve `latest.yml` dosyalarını otomatik oluşturup Release olarak yayınlar; kurulu Yusic uygulamaları bu güncellemeyi uygulama içinden otomatik algılar.
