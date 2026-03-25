@echo off
echo Setting up Keller Instinct PWA backend...
cd /d "%~dp0backend"

echo Installing dependencies...
pip install -r requirements.txt --break-system-packages

echo Initializing database...
python init_db.py

echo Starting server at http://localhost:8000
echo API docs at http://localhost:8000/docs
python main.py
