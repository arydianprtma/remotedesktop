Get-Process -Name "*Terminal*" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "*wt*" -ErrorAction SilentlyContinue | Stop-Process -Force
