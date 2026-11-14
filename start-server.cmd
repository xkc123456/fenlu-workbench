@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   未找到 Python。两种选择：
  echo   1. 直接双击 index.html —— 除图片 OCR 外全部功能可用；
  echo   2. 安装 Python 后再运行本脚本，OCR 需要 http 环境加载本地识别组件。
  echo.
  pause
  exit /b 1
)
echo.
echo   分录工坊本地服务：http://127.0.0.1:8787
echo   OCR 需要保持此窗口开启；关闭窗口即停止服务。
echo.
start "" cmd /c "timeout /t 1 >nul & start http://127.0.0.1:8787/index.html"
python -m http.server 8787 --bind 127.0.0.1
