E:\firefox3\fireflow> npm run server:fresh

> fireflow-restaurant-system@1.0.1 server:fresh
> powershell -Command "$p=(Get-NetTCPConnection -LocalPort 3001 -EA 0).OwningProcess; if($p){Stop-Process -Id $p -Force -EA 0; Start-Sleep 2}" && npm run server


> fireflow-restaurant-system@1.0.1 server
> node --import tsx src/api/server.ts

[2026-04-19T08:38:51.015Z] INFO - environment_validation
  Metadata: {
  "node_env": "development",
  "cloud_enabled": true
}
ℹ️  Sentry not configured - using local error tracking
🚀 Server Engine Online: http://localhost:3001
[2026-04-19T08:38:51.495Z] INFO - server_started
  Metadata: {
  "port": 3001,
  "environment": "development",
  "cloud_enabled": true,
  "url": "http://localhost:3001"
}
✅ Database connection verified (1844ms)
[2026-04-19T08:38:53.340Z] INFO - database_verified
[SUBSCRIPTION CHECKER] ℹ️ Initializing subscription checker...
[SUBSCRIPTION CHECKER] 🔄 Running check at 2026-04-19T08:38:53.342Z
[2026-04-19T08:38:53.373Z] INFO - subscription_checker_started
[SUBSCRIPTION CHECKER] 📅 Found 0 trials expiring in 5 days
[SUBSCRIPTION CHECKER] ⚠️ Error updating trial status: new row for relation "restaurants_cloud" violates check constraint "check_subscription_dates"
[SUBSCRIPTION CHECKER] ⚠️ Error updating trial status: new row for relation "restaurants_cloud" violates check constraint "check_subscription_dates"
[SUBSCRIPTION CHECKER] ⛔ Expired 2 trials
[SUBSCRIPTION CHECKER] 📅 Found 0 subscriptions expiring in 3 days
[SUBSCRIPTION CHECKER] ⛔ Expired 0 subscriptions
[SOCKET] User connected: NlpfDCfYqe0PLuvCAAAB
[LOGIN DEBUG] Received PIN: "1111" (type: string, length: 4)
[LOGIN DEBUG] Full body: {"pin":"1111"}
[LOGIN DEBUG] Query result: Found Cashier Khan (ID: 281ce755-759a-4833-8498-a987628de503)
[2026-04-19T08:46:21.305Z] INFO - login_success
  Metadata: {
  "role": "CASHIER"
}
[SOCKET] Socket NlpfDCfYqe0PLuvCAAAB joined room: restaurant:b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
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
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_items - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_items - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_items - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_items - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
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
[AUTH] POST /api/floor/seat-party - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /api/orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1 - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /f2b16a5c-bc3d-449d-984f-d1339d5028e1/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[2026-04-19T08:46:37.430Z] CRITICAL - unhandled_rejection
  Metadata: {
  "reason": "ReferenceError: orderId is not defined",
  "stack": "ReferenceError: orderId is not defined\n    at <anonymous> (E:\\firefox3\\Fireflow\\src\\api\\routes\\orderWorkflowRoutes.ts:115:31)"
}
[2026-04-19T08:46:37.440Z] ERROR - exception_captured
  Error: orderId is not defined
ReferenceError: orderId is not defined
    at <anonymous> (E:\firefox3\Fireflow\src\api\routes\orderWorkflowRoutes.ts:115:31)
  Metadata: {
  "errorId": "z6u6ul",
  "type": "unhandledRejection"
}
[AUTH] POST /api/orders - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
✅ Generated takeaway token: T001 for 2026-04-19, pickup time: 12 minutes
[AUTH] POST /orders/ec3f3974-0273-4325-89fb-f0f828d52e4f/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/ec3f3974-0273-4325-89fb-f0f828d52e4f/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/ec3f3974-0273-4325-89fb-f0f828d52e4f/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/ec3f3974-0273-4325-89fb-f0f828d52e4f/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /ec3f3974-0273-4325-89fb-f0f828d52e4f/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[2026-04-19T08:47:10.901Z] CRITICAL - unhandled_rejection
  Metadata: {
  "reason": "ReferenceError: orderId is not defined",
  "stack": "ReferenceError: orderId is not defined\n    at <anonymous> (E:\\firefox3\\Fireflow\\src\\api\\routes\\orderWorkflowRoutes.ts:115:31)"
}
[2026-04-19T08:47:10.910Z] ERROR - exception_captured
  Error: orderId is not defined
ReferenceError: orderId is not defined
    at <anonymous> (E:\firefox3\Fireflow\src\api\routes\orderWorkflowRoutes.ts:115:31)
  Metadata: {
  "errorId": "vc7sfo",
  "type": "unhandledRejection"
}
[AUTH] POST /api/orders - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/9433b289-c53d-4067-a031-03ba17f7c439/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/9433b289-c53d-4067-a031-03ba17f7c439/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/9433b289-c53d-4067-a031-03ba17f7c439/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/9433b289-c53d-4067-a031-03ba17f7c439/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /9433b289-c53d-4067-a031-03ba17f7c439/fire - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[2026-04-19T08:47:36.279Z] CRITICAL - unhandled_rejection
  Metadata: {
  "reason": "ReferenceError: orderId is not defined",
  "stack": "ReferenceError: orderId is not defined\n    at <anonymous> (E:\\firefox3\\Fireflow\\src\\api\\routes\\orderWorkflowRoutes.ts:115:31)"
}
[2026-04-19T08:47:36.281Z] ERROR - exception_captured
  Error: orderId is not defined
ReferenceError: orderId is not defined
    at <anonymous> (E:\firefox3\Fireflow\src\api\routes\orderWorkflowRoutes.ts:115:31)
  Metadata: {
  "errorId": "0l5x94",
  "type": "unhandledRejection"
}
[LOGIN DEBUG] Received PIN: "1111" (type: string, length: 4)
[LOGIN DEBUG] Full body: {"pin":"1111"}
[LOGIN DEBUG] Query result: Found Cashier Khan (ID: 281ce755-759a-4833-8498-a987628de503)
[2026-04-19T08:47:57.905Z] INFO - login_success
  Metadata: {
  "role": "CASHIER"
}
[SOCKET] Socket NlpfDCfYqe0PLuvCAAAB joined room: restaurant:b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
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
[AUTH] PATCH /orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1/items/f20a03c7-478b-4f1b-ada6-c59836382e12/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1/items/f20a03c7-478b-4f1b-ada6-c59836382e12/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1/items/f20a03c7-478b-4f1b-ada6-c59836382e12/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1/items/f20a03c7-478b-4f1b-ada6-c59836382e12/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /f2b16a5c-bc3d-449d-984f-d1339d5028e1/items/f20a03c7-478b-4f1b-ada6-c59836382e12/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[ITEM_STATUS_DEBUG] {
  staffId: '281ce755-759a-4833-8498-a987628de503',
  restaurantId: 'b1972d7d-8374-4b55-9580-95a15f18f656',
  orderId: 'f2b16a5c-bc3d-449d-984f-d1339d5028e1',
  itemId: 'f20a03c7-478b-4f1b-ada6-c59836382e12',
  newStatus: 'DONE'
}
[AUTH] PATCH /orders/ec3f3974-0273-4325-89fb-f0f828d52e4f/items/60d1f5c3-7131-4dd9-94b1-c3618a24b300/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /orders/ec3f3974-0273-4325-89fb-f0f828d52e4f/items/60d1f5c3-7131-4dd9-94b1-c3618a24b300/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /orders/ec3f3974-0273-4325-89fb-f0f828d52e4f/items/60d1f5c3-7131-4dd9-94b1-c3618a24b300/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /orders/ec3f3974-0273-4325-89fb-f0f828d52e4f/items/60d1f5c3-7131-4dd9-94b1-c3618a24b300/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /ec3f3974-0273-4325-89fb-f0f828d52e4f/items/60d1f5c3-7131-4dd9-94b1-c3618a24b300/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[ITEM_STATUS_DEBUG] {
  staffId: '281ce755-759a-4833-8498-a987628de503',
  restaurantId: 'b1972d7d-8374-4b55-9580-95a15f18f656',
  orderId: 'ec3f3974-0273-4325-89fb-f0f828d52e4f',
  itemId: '60d1f5c3-7131-4dd9-94b1-c3618a24b300',
  newStatus: 'DONE'
}
[AUTH] PATCH /orders/9433b289-c53d-4067-a031-03ba17f7c439/items/74803219-5e77-4952-a05c-15644e585789/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /orders/9433b289-c53d-4067-a031-03ba17f7c439/items/74803219-5e77-4952-a05c-15644e585789/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /orders/9433b289-c53d-4067-a031-03ba17f7c439/items/74803219-5e77-4952-a05c-15644e585789/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /orders/9433b289-c53d-4067-a031-03ba17f7c439/items/74803219-5e77-4952-a05c-15644e585789/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] PATCH /9433b289-c53d-4067-a031-03ba17f7c439/items/74803219-5e77-4952-a05c-15644e585789/status - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[ITEM_STATUS_DEBUG] {
  staffId: '281ce755-759a-4833-8498-a987628de503',
  restaurantId: 'b1972d7d-8374-4b55-9580-95a15f18f656',
  orderId: '9433b289-c53d-4067-a031-03ba17f7c439',
  itemId: '74803219-5e77-4952-a05c-15644e585789',
  newStatus: 'DONE'
}
[LOGIN DEBUG] Received PIN: "1111" (type: string, length: 4)
[LOGIN DEBUG] Full body: {"pin":"1111"}
[LOGIN DEBUG] Query result: Found Cashier Khan (ID: 281ce755-759a-4833-8498-a987628de503)
[2026-04-19T08:48:43.418Z] INFO - login_success
  Metadata: {
  "role": "CASHIER"
}
[SOCKET] Socket NlpfDCfYqe0PLuvCAAAB joined room: restaurant:b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
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
[AUTH] GET /staff - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /staff - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /staff - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /staff - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /menu_categories - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
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
[AUTH] POST /orders/9433b289-c53d-4067-a031-03ba17f7c439/assign-driver - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/9433b289-c53d-4067-a031-03ba17f7c439/assign-driver - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /orders/9433b289-c53d-4067-a031-03ba17f7c439 - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /orders/9433b289-c53d-4067-a031-03ba17f7c439 - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /orders/9433b289-c53d-4067-a031-03ba17f7c439 - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /orders/9433b289-c53d-4067-a031-03ba17f7c439 - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /9433b289-c53d-4067-a031-03ba17f7c439 - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[LOGIN DEBUG] Received PIN: "1111" (type: string, length: 4)
[LOGIN DEBUG] Full body: {"pin":"1111"}
[LOGIN DEBUG] Query result: Found Cashier Khan (ID: 281ce755-759a-4833-8498-a987628de503)
[2026-04-19T08:49:12.958Z] INFO - login_success
  Metadata: {
  "role": "CASHIER"
}
[SOCKET] Socket NlpfDCfYqe0PLuvCAAAB joined room: restaurant:b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
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
[AUTH] POST /orders/9433b289-c53d-4067-a031-03ba17f7c439/mark-delivered - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /orders/9433b289-c53d-4067-a031-03ba17f7c439/mark-delivered - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[JournalTrace] Order #ORD-134736-KDM | Total: 1350, Tax: 165.52 (INCLUSIVE), SC: 0, Disc: 0, Deliv: 150
[ROUNDING_DEBUG] Order: ORD-134736-KDM, DR: 1350, CR: 1350, Diff: 0, RoundAcc_Found: true
[LOGIN DEBUG] Received PIN: "1111" (type: string, length: 4)
[LOGIN DEBUG] Full body: {"pin":"1111"}
[LOGIN DEBUG] Query result: Found Cashier Khan (ID: 281ce755-759a-4833-8498-a987628de503)
[2026-04-19T08:50:00.305Z] INFO - login_success
  Metadata: {
  "role": "CASHIER"
}
[SOCKET] Socket NlpfDCfYqe0PLuvCAAAB joined room: restaurant:b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] GET /api/analytics/summary - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
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
[AUTH] POST /api/orders/9433b289-c53d-4067-a031-03ba17f7c439/settle - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[AUTH] POST /api/orders/ec3f3974-0273-4325-89fb-f0f828d52e4f/settle - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[JournalTrace] Order #ORD-134710-K8P | Total: 3150, Tax: 434.48 (INCLUSIVE), SC: 0, Disc: 0, Deliv: 0
[ROUNDING_DEBUG] Order: ORD-134710-K8P, DR: 3150, CR: 3150, Diff: 0, RoundAcc_Found: true
[AUTH] POST /api/orders/f2b16a5c-bc3d-449d-984f-d1339d5028e1/settle - Staff: 281ce755-759a-4833-8498-a987628de503 (CASHIER) @ Restaurant: b1972d7d-8374-4b55-9580-95a15f18f656
[JournalTrace] Order #ORD-134628-YQJ | Total: 5780, Tax: 758.62 (INCLUSIVE), SC: 275, Disc: 0, Deliv: 0
[ROUNDING_DEBUG] Order: ORD-134628-YQJ, DR: 5780, CR: 5780, Diff: 0, RoundAcc_Found: true
