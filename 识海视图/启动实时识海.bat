@echo off
rem 大肥鱼识海 · 本地实时模式：启动本机服务并打开浏览器
cd /d "%~dp0"
start "大肥鱼识海服务" cmd /k "node server.mjs"
timeout /t 1 >nul
start "" "http://127.0.0.1:4177/"
