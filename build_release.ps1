$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\Kang Ujang\AppData\Local\Android\Sdk"
$env:Path = "$($env:JAVA_HOME)\bin;$($env:Path)"

# Pastikan berada di folder project root
if ($PSScriptRoot) { Set-Location $PSScriptRoot }

# STEP 0: Bersihkan File lama
Write-Host "--- Mematikan proses Java untuk buka lock file ---"
jps | Select-String "Gradle|Daemon" | ForEach-Object { 
    $id = $_.ToString().Split(" ")[0]
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}
Stop-Process -Name "java" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "--- Membersihkan file lama ---"
if (Test-Path "trackingunit.apk") { Remove-Item "trackingunit.apk" -Force }

# Hapus folder build manual jika bisa
if (Test-Path "android\app\build") { 
    Remove-Item -Path "android\app\build" -Recurse -Force -ErrorAction SilentlyContinue 
}

Write-Host "--- STEP 1: Sinkronisasi file web (www) ---"
npx cap copy android

Set-Location android

Write-Host "--- STEP 2: Memulai Build APK (Optimized & Signed Auto) ---"
./gradlew.bat assembleDebug --no-daemon

if ($LASTEXITCODE -eq 0) {
    Set-Location ..
    $sourceApk = "android/app/build/outputs/apk/debug/app-debug.apk"

    if (Test-Path $sourceApk) {
        Write-Host "--- STEP 3: Memindahkan APK ke folder utama ---"
        Move-Item -Path $sourceApk -Destination "trackingunit.apk" -Force
        Write-Host "--------------------------------------------------------"
        Write-Host "BERHASIL! APK sudah diperbaiki & bisa di-instal sekarang."
        Write-Host "File APK baru ada di folder: Trackingunit\trackingunit.apk"
        Write-Host "--------------------------------------------------------"
    }
    else {
        Write-Host "EROR: File APK tidak ditemukan di $sourceApk"
    }
}
else {
    Write-Host "EROR: Proses Build gagal."
}
