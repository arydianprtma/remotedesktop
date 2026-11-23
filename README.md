# Remote Desk

Aplikasi remote desktop berbasis WebRTC untuk kontrol jarak jauh antar-jaringan dengan dukungan Unattended Access (akses tanpa operator di PC tujuan).

## Arsitektur Sistem

1. **Signaling Server (`/server`)**: Layanan perantara berbasis Node.js dan Socket.io untuk pertukaran info kandidat ICE/SDP serta verifikasi PIN keamanan.
2. **Native Input Injector (`/desktop/src/native`)**: Helper Windows native C# yang dikompilasi ke executable (`InputInjector.exe`) untuk simulasi mouse dan keyboard secara langsung via Win32 API.
3. **Desktop Client (`/desktop`)**: Aplikasi Electron yang mendukung mode ganda (Host PC Rumah dan Controller/Viewer).

---

## Persyaratan Sistem

- Windows 10 / 11
- Node.js v18 atau yang lebih baru
- .NET Framework 4.5+ (sudah terpasang bawaan di Windows)

---

## Panduan Menjalankan

### 1. Menjalankan Signaling Server

Jika menguji di lokal atau mendeploy ke VPS:

```bash
cd server
npm start
```

Server akan aktif di `http://localhost:4000`. Endpoint pengecekan status: `http://localhost:4000/health`.

### 2. Menjalankan Aplikasi Desktop

Buka terminal terpisah di direktori desktop:

```bash
cd desktop
npm start
```

---

## Skenario Penggunaan Luar Kota (Remote PC Rumah)

### Di PC Rumah (Host)
1. Buka aplikasi Remote Desk.
2. Pastikan Server URL mengarah ke IP publik / domain VPS kamu (misal: `http://vps-kamu:4000`).
3. Catat **Device ID** yang tampil (atau gunakan ID kustom) dan atur **Security PIN**.
4. Klik tombol **Aktifkan Host Standby**. Status akan berubah menjadi *Standby*.
5. Di pengaturan Windows, ubah Sleep Timer ke **Never** agar PC tidak masuk ke mode tidur saat ditinggal.

### Di Laptop Saat di Luar Kota (Viewer)
1. Buka aplikasi Remote Desk di laptop.
2. Hubungkan ke Server URL VPS yang sama.
3. Buka tab **Viewer Mode (Luar Kota)**.
4. Masukkan **Target Device ID** dan **Security PIN** PC rumahmu.
5. Klik **Mulai Remote**. Layar PC rumah akan langsung tampil dan kursor mouse serta keyboard siap digunakan.

---

## Setup Tambahan untuk Produksi di VPS

Agar koneksi selalu stabil di berbagai jaringan seluler atau WiFi hotel:

1. **PM2 untuk Signaling Server**:
   Jalankan server signaling dengan perintah `pm2 start server.js --name "signaling"`.
2. **TURN Server (Coturn)**:
   Pasang Coturn di VPS Linux (`apt install coturn`) untuk menangani NAT simetris ketika koneksi P2P langsung terhalang firewall ISP.
