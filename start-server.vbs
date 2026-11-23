Set WshShell = CreateObject("WScript.Shell")

' 1. Jalankan Signaling Server Remote Desk di background (Port 4000)
WshShell.CurrentDirectory = "H:\Remote Desk\server"
WshShell.Run "cmd /c node server.js > ""H:\Remote Desk\server\server.log"" 2>&1", 0, False

' 2. Jalankan Cloudflare Tunnel di background dan catat URL ke tunnel.log
WshShell.CurrentDirectory = "H:\Remote Desk"
WshShell.Run "cmd /c cloudflared tunnel --url http://localhost:4000 > ""H:\Remote Desk\tunnel.log"" 2>&1", 0, False

Set WshShell = Nothing
