@echo off
setlocal
set "NTE_PYTHON=D:\CODEX\Programs\Python312\pythonw.exe"
if not exist "%NTE_PYTHON%" (
  echo Python not found: %NTE_PYTHON%
  pause
  exit /b 1
)
start "" "%NTE_PYTHON%" "%~dp0app.py"
