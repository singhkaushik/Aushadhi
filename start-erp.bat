@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
if not exist renderer\.next\BUILD_ID (
  echo Building app...
  call npm run build
)
start "" http://localhost:3000
call npm start
