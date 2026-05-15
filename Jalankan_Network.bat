@echo off
title Tracking Unit - Network Server
cd /d "%~dp0"
echo Memulai Tracking Unit di port 5001...
echo Akses dari PC lain: http://192.168.137.105:5001
python -m http.server 5001 --bind 0.0.0.0
pause
