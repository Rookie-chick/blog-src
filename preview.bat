@echo off
rem =====================================================================
rem  myblog - local preview launcher
rem  Double-click this file to build the site and preview it in browser.
rem  NOTE: keep this file ASCII-only. Windows cmd.exe reads .bat files
rem  using the OEM codepage (936 on Chinese Windows), so UTF-8 Chinese
rem  text here would be garbled. Chinese output comes from build.py.
rem =====================================================================
cd /d "%~dp0"
title myblog local preview

echo.
echo   =========================================================
echo      myblog  --  local preview
echo   =========================================================
echo.
echo      Building the site and starting a local server.
echo      Your browser will open automatically.
echo      Close this window to stop the server.
echo.

py build.py --serve
if errorlevel 9009 goto trypython
goto done

:trypython
echo.
echo   [!] Python launcher "py" not found. Trying "python" ...
echo.
python build.py --serve
if errorlevel 9009 goto nopython
goto done

:nopython
echo.
echo   =========================================================
echo      Python not found.
echo.
echo      Install Python 3 first:  https://www.python.org/downloads/
echo      Remember to tick "Add Python to PATH" while installing.
echo   =========================================================
echo.

:done
echo.
echo   Server stopped. Press any key to close this window.
pause >nul
