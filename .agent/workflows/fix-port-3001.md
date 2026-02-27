---
description: fix EADDRINUSE port 3001 already in use error
---

## Fix: `EADDRINUSE` — Port 3001 Already In Use

This happens when a previous server process is still running in the background.

### ✅ Fastest fix — One command does everything:

```powershell
npm run server:fresh
```

This kills whatever is on port 3001, waits 1 second, then starts the server cleanly.

---

### Alternative — kill only (then start manually):

```powershell
npm run kill:3001
npm run server
```

---

### Manual PowerShell one-liner (if npm scripts unavailable):

```powershell
$p=(Get-NetTCPConnection -LocalPort 3001 -EA 0).OwningProcess; if($p){Stop-Process -Id $p -Force}
```

Then run:
```powershell
npm run server
```

---

### Why does this happen?

- You ran `npm run server` in one terminal and opened another terminal without stopping the first
- A previous crash left the Node process still holding the port
- VS Code's integrated terminal kept the process alive after closing

### Prevention tip

Always use **Ctrl+C** to stop the server in the terminal before starting a new one. The `server:fresh` script is your safety net when you forget.
