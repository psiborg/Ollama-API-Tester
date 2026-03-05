#!/bin/sh
echo "Starting Ollama-API-Tester..."
open "http://localhost:8081" 2>/dev/null || xdg-open "http://localhost:8081" 2>/dev/null &
python3 -m http.server 8081
