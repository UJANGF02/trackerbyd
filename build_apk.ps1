$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\Kang Ujang\AppData\Local\Android\Sdk"
$env:Path = "$($env:JAVA_HOME)\bin;$($env:Path)"

# Pastikan berada di folder project root
if ($PSScriptRoot) { Set-Location $PSScriptRoot }

# Hapus APK lama jika ada agar benar-benar fresh
if (Test-Path "tracker-bodypaint-byd.apk") { Remove-Item "tracker-bodypaint-byd.apk" -Force }

Write-Host "--- STEP -1: Mematikan proses Java untuk buka lock file ---"
try {
    taskkill /F /IM java.exe /T /FI "STATUS eq RUNNING" 2>$null
    taskkill /F /IM gradle.exe /T /FI "STATUS eq RUNNING" 2>$null
    taskkill /F /IM studio64.exe /T /FI "STATUS eq RUNNING" 2>$null
    Get-Process -Name "java", "gradle", "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
} catch { }

Start-Sleep -Seconds 3

Write-Host "--- Membersihkan folder build secara rekursif ---"
function Robust-Remove($path) {
    if (Test-Path $path) {
        Write-Host "Menghapus $path..."
        Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $path) {
            Write-Host "Gagal hapus $path, mencoba lewat CMD..."
            cmd /c "rmdir /s /q `"$path`""
        }
    }
}

Get-ChildItem -Path "android" -Filter "build" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { Robust-Remove $_.FullName }
Get-ChildItem -Path "android" -Filter ".gradle" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { Robust-Remove $_.FullName }
Get-ChildItem -Path "node_modules\@capacitor" -Filter "build" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { Robust-Remove $_.FullName }

Write-Host "--- STEP 0: Sinkronisasi ROOT ke WWW ---"
if (Test-Path "www") {
    $item = Get-Item "www"
    if ($item.PSIsContainer -eq $false) {
        Write-Host "Menghapus file 'www' yang tidak valid..."
        Remove-Item "www" -Force
    }
}

if (-not (Test-Path "www")) {
    New-Item -ItemType Directory -Path "www" | Out-Null
}

# Salin file-file utama (TANPA favicon.ico agar APK ringan)
Get-ChildItem -Path *.html, manifest.json | Copy-Item -Destination "www" -Force
if (Test-Path "js") { 
    if (-not (Test-Path "www\js")) { New-Item -ItemType Directory -Path "www\js" | Out-Null }
    Copy-Item -Path "js\*" -Destination "www\js" -Recurse -Force 
}
if (Test-Path "data") { 
    if (-not (Test-Path "www\data")) { New-Item -ItemType Directory -Path "www\data" | Out-Null }
    Copy-Item -Path "data\*" -Destination "www\data" -Recurse -Force 
}

# Hapus favicon.ico dari www (tidak dipakai di mobile, hemat ~427KB)
if (Test-Path "www\favicon.ico") { Remove-Item "www\favicon.ico" -Force }

Write-Host "--- STEP 1: Sinkronisasi file web (www) ke project Android ---"
npx capacitor copy android
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: npx capacitor copy gagal, melakukan sinkronisasi manual..."
    $dest = "android\app\src\main\assets\public"
    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
    Copy-Item -Path "www\*" -Destination $dest -Recurse -Force
}

# Hapus favicon.ico dari assets android juga
$androidFavicon = "android\app\src\main\assets\public\favicon.ico"
if (Test-Path $androidFavicon) { 
    Remove-Item $androidFavicon -Force
    Write-Host "Menghapus favicon.ico dari Android assets (hemat ~427KB)" 
}

Set-Location android

Write-Host "--- STEP 2: Membersihkan build lama ---"
./gradlew.bat clean 

Write-Host "--- STEP 3: Memulai Build APK RELEASE (Super Ringan) ---"
./gradlew.bat assembleRelease

if ($LASTEXITCODE -eq 0) {
    Set-Location ..
    $sourceApk = "android/app/build/outputs/apk/release/app-release-unsigned.apk"
    if (-not (Test-Path $sourceApk)) {
        $sourceApk = "android/app/build/outputs/apk/release/app-release.apk"
    }
    if (Test-Path $sourceApk) {
        Write-Host "--- STEP 4: Memindahkan APK ke folder utama ---"
        Move-Item -Path $sourceApk -Destination "tracker-bodypaint-byd.apk" -Force
        $sizeMB = [math]::Round((Get-Item "tracker-bodypaint-byd.apk").Length / 1MB, 2)
        Write-Host "--------------------------------------------------------"
        Write-Host "BERHASIL! Tracker Bodypaint BYD APK sudah siap!"
        Write-Host "Ukuran: $sizeMB MB"
        Write-Host "Lokasi: C:\Users\Kang Ujang\OneDrive\My Project\trackingunit-byd\tracker-bodypaint-byd.apk"
        Write-Host "--------------------------------------------------------"
    }
    else {
        Write-Host "Release APK tidak ditemukan, fallback ke Debug build..."
        Set-Location android
        ./gradlew.bat assembleDebug
        Set-Location ..
        $sourceApk = "android/app/build/outputs/apk/debug/app-debug.apk"
        if (Test-Path $sourceApk) {
            Move-Item -Path $sourceApk -Destination "tracker-bodypaint-byd.apk" -Force
            $sizeMB = [math]::Round((Get-Item "tracker-bodypaint-byd.apk").Length / 1MB, 2)
            Write-Host "--------------------------------------------------------"
            Write-Host "BERHASIL (Debug)! Ukuran: $sizeMB MB"
            Write-Host "Lokasi: C:\Users\Kang Ujang\OneDrive\My Project\trackingunit-byd\tracker-bodypaint-byd.apk"
            Write-Host "--------------------------------------------------------"
        }
    }
}
else {
    Write-Host "Release build gagal, mencoba Debug build..."
    ./gradlew.bat assembleDebug
    Set-Location ..
    $sourceApk = "android/app/build/outputs/apk/debug/app-debug.apk"
    if (Test-Path $sourceApk) {
        Move-Item -Path $sourceApk -Destination "tracker-bodypaint-byd.apk" -Force
        $sizeMB = [math]::Round((Get-Item "tracker-bodypaint-byd.apk").Length / 1MB, 2)
        Write-Host "BERHASIL (Debug Fallback)! Ukuran: $sizeMB MB"
    } else {
        Write-Host "EROR: Semua build gagal!"
    }
}
