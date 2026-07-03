@echo off
echo ===================================================
echo   Starting Budget Management Platform
echo ===================================================
echo.
echo Launching Django backend server (port 8000)...
start "Django Backend Server" cmd /k "cd Project_Budgeting-BE- && python manage.py runserver"

echo.
echo Launching React + Vite frontend server (port 5173)...
start "Vite React Frontend" cmd /k "cd Project_Budgeting-FE- && npm run dev"

echo.
echo Done! Both servers are starting up in separate terminal windows.
echo You can close this window now.
echo ===================================================
pause
