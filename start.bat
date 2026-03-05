@echo off
echo Starting Ollama-API-Tester...
start "" http://localhost:8081
python -m http.server 8081
