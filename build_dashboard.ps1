# Build Dashboard EXE using Electron Builder (SINGLE PORTABLE EXE)
Write-Host "--- Memulai proses Build SINGLE EXE untuk Dashboard Admin ---"

# Hapus folder dist lama jika ada
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}

# Pastikan node_modules lengkap
if (-not (Test-Path "node_modules")) {
    Write-Host "--- Menginstall dependensi (node_modules) ---"
    npm install
}

Write-Host "--- Menggunakan electron-builder untuk membuat file Portable EXE ---"

# Jalankan build
$env:CSC_SKIP_SIGNING="true"
npx -y electron-builder --win

Write-Host "--------------------------------------------------------"
Write-Host "BERHASIL! Cek folder 'dist' untuk file EXE Tunggal."
Write-Host "Anda bisa membagikan file .exe tersebut ke orang lain."
Write-Host "--------------------------------------------------------"


