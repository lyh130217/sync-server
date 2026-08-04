@echo off
chcp 65001 >nul
title 龙飞个人工作台 - 同步服务器
echo ============================================
echo   龙飞个人工作台 同步服务器
echo   本窗口不要关闭，关闭即停止服务
echo ============================================
echo.
REM 判断是否已安装 node
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先到 https://nodejs.org 下载安装（选 LTS 版）
  echo          安装时一路下一步即可，务必勾选 "Add to PATH"
  pause
  exit /b
)
echo [OK] 检测到 Node.js，正在启动服务...
echo.
echo 电脑本机访问：  http://localhost:8787
echo.
echo 手机访问（同一 WiFi）：
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
  set "ip=%%a"
)
set "ip=%ip: =%"
echo   http://%ip%:8787
echo.
echo （手机浏览器填上面的地址即可；若连不上，请确认手机和电脑在同一 WiFi）
echo.
node "%~dp0server.js"
pause
