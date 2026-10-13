@echo off
chcp 65001 >nul
title 创建桌面快捷方式
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $ws.CreateShortcut([IO.Path]::Combine($ws.SpecialFolders['Desktop'], '枝桠.lnk'));" ^
  "$lnk.TargetPath = '%~dp0启动枝桠.bat';" ^
  "$lnk.WorkingDirectory = '%~dp0';" ^
  "$lnk.Description = '枝桠思维导图（绿色便携）';" ^
  "$lnk.Save()"
if errorlevel 1 (
  echo 创建失败，请右键"启动枝桠.bat"手动发送到桌面快捷方式。
  pause
) else (
  echo 已在桌面创建"枝桠"快捷方式。
  timeout /t 3 >nul
)
