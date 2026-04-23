E:\firefox3\fireflow> npm run server:fresh

> fireflow-restaurant-system@1.0.1 server:fresh
> powershell -Command "$p=(Get-NetTCPConnection -LocalPort 3001 -EA 0).OwningProcess; if($p){Stop-Process -Id $p -Force -EA 0; Start-Sleep 2}" && npm run server

[1] cross-env NODE_ENV=development node scripts/launch-electron.js exited with code 3221225786

> fireflow-restaurant-system@1.0.1 server
> node --import tsx src/api/server.ts

[2026-04-21T20:23:47.396Z] INFO - environment_validation
  Metadata: {
  "node_env": "development",
  "cloud_enabled": true
}
ℹ️  Sentry not configured - using local error tracking
🚀 Server Engine Online: http://localhost:3001
[2026-04-21T20:23:47.523Z] INFO - server_started
  Metadata: {
  "port": 3001,
  "environment": "development",
  "cloud_enabled": true,
  "url": "http://localhost:3001"
}
✅ Database connection verified (281ms)
[2026-04-21T20:23:47.804Z] INFO - database_verified
[SUBSCRIPTION CHECKER] ℹ️ Initializing subscription checker...
[SUBSCRIPTION CHECKER] 🔄 Running check at 2026-04-21T20:23:47.805Z
[2026-04-21T20:23:47.806Z] INFO - subscription_checker_started
[SUBSCRIPTION CHECKER] 📅 Found 0 trials expiring in 5 days
[SUBSCRIPTION CHECKER] ⚠️ Error updating trial status: new row for relation "restaurants_cloud" violates check constraint "check_subscription_dates"
[SUBSCRIPTION CHECKER] ⚠️ Error updating trial status: new row for relation "restaurants_cloud" violates check constraint "check_subscription_dates"
[SUBSCRIPTION CHECKER] ⛔ Expired 2 trials
[SUBSCRIPTION CHECKER] 📅 Found 0 subscriptions expiring in 3 days
[SUBSCRIPTION CHECKER] ⛔ Expired 0 subscriptions
PS E:\firefox3\fireflow> npm run server:fresh

> fireflow-restaurant-system@1.0.1 server:fresh
> powershell -Command "$p=(Get-NetTCPConnection -LocalPort 3001 -EA 0).OwningProcess; if($p){Stop-Process -Id $p -Force -EA 0; Start-Sleep 2}" && npm run server


> fireflow-restaurant-system@1.0.1 server
> node --import tsx src/api/server.ts

[2026-04-21T20:37:45.507Z] INFO - environment_validation
  Metadata: {
  "node_env": "development",
  "cloud_enabled": true
}
ℹ️  Sentry not configured - using local error tracking
🚀 Server Engine Online: http://localhost:3001
[2026-04-21T20:37:45.890Z] INFO - server_started
  Metadata: {
  "port": 3001,
  "environment": "development",
  "cloud_enabled": true,
  "url": "http://localhost:3001"
}
✅ Database connection verified (177ms)
[2026-04-21T20:37:46.068Z] INFO - database_verified
[SUBSCRIPTION CHECKER] ℹ️ Initializing subscription checker...
[SUBSCRIPTION CHECKER] 🔄 Running check at 2026-04-21T20:37:46.070Z
[2026-04-21T20:37:46.073Z] INFO - subscription_checker_started
[SUBSCRIPTION CHECKER] 📅 Found 0 trials expiring in 5 days
[SUBSCRIPTION CHECKER] ⚠️ Error updating trial status: new row for relation "restaurants_cloud" violates check constraint "check_subscription_dates"
[SUBSCRIPTION CHECKER] ⚠️ Error updating trial status: new row for relation "restaurants_cloud" violates check constraint "check_subscription_dates"
[SUBSCRIPTION CHECKER] ⛔ Expired 2 trials
[SUBSCRIPTION CHECKER] 📅 Found 0 subscriptions expiring in 3 days
[SUBSCRIPTION CHECKER] ⛔ Expired 0 subscriptions
[SOCKET] User connected: jIatRaAtaCuzXkS-AAAB
[LOGIN DEBUG] Received PIN: "1111" (type: string, length: 4)
[LOGIN DEBUG] Full body: {"pin":"1111"}
[LOGIN DEBUG] Query result: Found Cashier Khan (ID: 281ce755-759a-4833-8498-a987628de503)
[2026-04-21T20:39:42.997Z] INFO - login_success
  Metadata: {
  "role": "CASHIER"
}
[SOCKET] Socket jIatRaAtaCuzXkS-AAAB joined room: restaurant:b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /orders - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /orders - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /orders - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /orders - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET / - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /tables - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /tables - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /tables - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /tables - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /sections - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /sections - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /sections - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /sections - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_items - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_items - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_items - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_items - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /staff - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /staff - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /staff - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /staff - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /transactions - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /transactions - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /transactions - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /transactions - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /customers - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /customers - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /customers - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /customers - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /vendors - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /vendors - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /vendors - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /vendors - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /stations - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /stations - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /stations - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /stations - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
GET /api/stations for restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /cashier/current - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /cashier/current - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /cashier/current - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /cashier/current - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /current - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /current - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/operations/config/b1972d7d-8374-4b55-9580-95a15f18f656 - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/operations/config/b1972d7d-8374-4b55-9580-95a15f18f656 - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /pairing/generate - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /pairing/generate - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /pairing/generate - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /pairing/generate - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /api/pairing/generate - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[DEBUG] staff lookup for targetStaffId: 281ce755-759a-4833-8498-a987628de503 and restaurantId: b1972d7d-8374-4b55-9580-95a15f18f656
[2026-04-21T20:55:48.735Z] INFO - best_ip_detected
  Metadata: {
  "ip": "10.101.36.244",
  "all_candidates": [
    {
      "ip": "10.101.36.244",
      "priority": 25
    },
    {
      "ip": "172.18.160.1",
      "priority": 0
    }
  ]
}
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/pairing/devices - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
