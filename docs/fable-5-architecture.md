# FireFlow × Fable 5 — Architecture Handout

## What is Fable 5

Fable 5 is an AI orchestration platform for building agentic applications. It provides:
- **Router** — intent classification and request routing
- **Agents** — specialized AI workers with tool access
- **Tools** — typed function calls with validation
- **Memory** — conversation and context persistence
- **Guardrails** — input/output safety and policy enforcement

In FireFlow, Fable 5 serves as the **AI-native control plane** over deterministic business systems.

---

## FireFlow + Fable 5 Architecture

```text
User Request
    ↓
Fable 5 Router (intent classification)
    ↓
┌─────────────┬──────────────┬──────────────┐
│ Order Agent │ Kitchen Agent │ Finance Agent │
└──────┬──────┴──────┬──────┴──────┬──────┘
       ↓              ↓              ↓
  FireFlow API   Kitchen Display  Accounting
  (Express/TS)   (Socket.IO)      (Journal/GL)
       ↓              ↓              ↓
   PostgreSQL     PostgreSQL      PostgreSQL
   (local)        (local)         (local)
```

### Layer responsibilities

| Layer | System | Authority |
|---|---|---|
| **Orchestration** | Fable 5 | Route intent, coordinate agents, enforce guardrails |
| **Presentation** | React/Electron | Render UI, capture input, display state |
| **API** | Express/TS | Validate, authorize, mutate business state |
| **Data** | PostgreSQL | Source of truth for all operational records |
| **AI Assist** | Fable 5 Agents | Recommend, summarize, assist — never approve financial transactions |

---

## Core concepts

### Router

The router classifies incoming messages into intents and selects the appropriate agent.

```ts
const router = new Router({
  agents: [orderAgent, kitchenAgent, financeAgent],
  defaultAgent: orderAgent,
  confidenceThreshold: 0.7,
});
```

### Agents

Agents are specialized workers with access to specific tools and context.

```ts
const orderAgent = new Agent({
  name: 'order-agent',
  instructions: 'You manage dine-in, takeaway, and delivery orders.',
  tools: [createOrderTool, updateOrderTool, cancelOrderTool],
  guardrails: [tenantIsolationGuardrail, financialAuthorityGuardrail],
});
```

### Tools

Tools are typed, validated functions that agents can call. They map to FireFlow API endpoints or direct service calls.

```ts
const createOrderTool = new Tool({
  name: 'create_order',
  description: 'Create a new order for the authenticated restaurant.',
  parameters: z.object({
    type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']),
    items: z.array(orderItemSchema),
    table_id: z.string().optional(),
  }),
  execute: async (params, context) => {
    return await OrderServiceFactory.getService(params.type).createOrder({
      ...params,
      restaurant_id: context.restaurantId,
    });
  },
});
```

### Memory

Memory persists conversation context and user preferences.

```ts
const memory = new PostgresMemory({
  tableName: 'ai_conversations',
  tenantColumn: 'restaurant_id',
});
```

### Guardrails

Guardrails enforce policy at the agent boundary.

```ts
const financialAuthorityGuardrail = new Guardrail({
  check: (input, context) => {
    if (input.approvePayment || input.voidOrder || input.applyDiscount) {
      return { allowed: false, reason: 'AI may not approve financial transactions' };
    }
    return { allowed: true };
  },
});
```

---

## AI boundaries (non-negotiable)

FireFlow's AI layer may **recommend, summarize, and assist**. It may **never**:
- approve financial transactions
- override permissions or security controls
- bypass audit logging
- mutate accounting records without explicit user action
- access data outside the authenticated tenant scope

```text
AI may say: "This order has been pending for 25 minutes. Would you like to fire it to kitchen?"
AI may NOT say: "Order fired to kitchen." (without explicit user confirmation)
```

---

## Tenant isolation in AI context

Every agent tool execution must carry tenant context from the authenticated session. The router and agents must never:
- accept `restaurant_id` from user input
- mix context between concurrent sessions
- cache tenant data across session boundaries

```ts
const context = {
  restaurantId: req.restaurantId, // from JWT, never from client
  staffId: req.staffId,
  role: req.role,
  sessionId: req.sessionId,
};
```

---

## Tool design patterns

### Read-only tools (safe)

```ts
const getOrderStatusTool = new Tool({
  name: 'get_order_status',
  description: 'Check the status of an order.',
  execute: async ({ orderId }, context) => {
    const order = await prisma.orders.findFirst({
      where: { id: orderId, restaurant_id: context.restaurantId },
    });
    return order ? { status: order.status } : { error: 'Not found' };
  },
});
```

### Write tools (require confirmation)

```ts
const fireOrderTool = new Tool({
  name: 'fire_order',
  description: 'Fire draft items to kitchen. Requires explicit confirmation.',
  execute: async ({ orderId }, context) => {
    // AI may propose; human confirms via UI
    return await OrderWorkflowService.fireOrderToKitchen(orderId, context);
  },
});
```

### Financial tools (AI proposes only)

```ts
const suggestDiscountTool = new Tool({
  name: 'suggest_discount',
  description: 'Suggest a discount based on order history. Does not apply discount.',
  execute: async ({ orderId }, context) => {
    const suggestion = await analyzeOrderHistory(orderId);
    return { suggestion, requiresApproval: true };
  },
});
```

---

## Memory and context

### Conversation memory

```ts
const conversationMemory = new BufferMemory({
  maxTokens: 4000,
  summaryThreshold: 3000,
});
```

### Tenant-scoped memory

```ts
const restaurantMemory = new PostgresMemory({
  tableName: 'ai_restaurant_memory',
  tenantColumn: 'restaurant_id',
  ttl: '7d',
});
```

### Memory rules

- Never store raw customer PII in AI memory
- Never store credentials, tokens, or session secrets
- Always scope memory queries by `restaurant_id`
- Purge memory on restaurant deletion

---

## Error handling and fallback

```ts
const resilientAgent = new Agent({
  name: 'order-agent',
  tools: [createOrderTool],
  fallback: async (error, context) => {
    if (error.code === 'RATE_LIMIT') {
      return { message: 'I am experiencing high demand. Please try again in a moment.' };
    }
    if (error.code === 'TENANT_ISOLATION') {
      return { message: 'I can only access data for your current restaurant.' };
    }
    return { message: 'Something went wrong. A staff member has been notified.' };
  },
});
```

---

## Observability

Every agent action must be logged with:
- `restaurant_id`
- `staff_id` or `session_id`
- `agent_name`
- `tool_name`
- `input_hash` (not raw input)
- `output_hash` (not raw output)
- `latency_ms`
- `success` / `failure`
- `error_code`

```ts
logger.log({
  level: LogLevel.INFO,
  service: 'fable-ai',
  action: 'agent_tool_execution',
  restaurant_id: context.restaurantId,
  staff_id: context.staffId,
  metadata: {
    agent: agent.name,
    tool: tool.name,
    latency_ms: Date.now() - start,
    success: true,
  },
});
```

---

## Deployment topology

```text
┌─────────────────────────────────────┐
│         Electron / Browser          │
│   ┌─────────────────────────────┐   │
│   │   FireFlow Frontend (React) │   │
│   └──────────────┬──────────────┘   │
└──────────────────┼──────────────────┘
                   │ HTTPS/WSS
┌──────────────────┼──────────────────┐
│                  ↓                  │
│   ┌─────────────────────────────┐   │
│   │  FireFlow API (Express)     │   │
│   │  - Auth, Tenant, Business   │   │
│   └──────────────┬──────────────┘   │
│                  │                   │
│   ┌──────────────┴──────────────┐   │
│   │  Fable 5 Runtime            │   │
│   │  - Router, Agents, Tools    │   │
│   │  - Memory, Guardrails       │   │
│   └──────────────┬──────────────┘   │
│                  │                   │
│   ┌──────────────┴──────────────┐   │
│   │  PostgreSQL (Local)         │   │
│   │  - Orders, Items, Sessions  │   │
│   │  - AI Memory, Audit Logs    │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Runtime options

| Option | Use case |
|---|---|
| **Embedded** | Fable 5 runs in the same Node.js process as FireFlow API |
| **Sidecar** | Fable 5 runs as a local service, communicates via HTTP |
| **Cloud** | Fable 5 runtime in cloud, requires secure tunnel for local data |

**Current recommendation:** Start with **embedded** for single-terminal deployments. Move to **sidecar** for multi-terminal or when AI load requires isolation.

---

## Getting started

### 1. Install Fable 5

```bash
npm install @fable-io/router @fable-io/agents @fable-io/tools @fable-io/memory
```

### 2. Define agents

```ts
// src/ai/agents/orderAgent.ts
import { Agent, Tool } from '@fable-io/agents';
import { z } from 'zod';

export const orderAgent = new Agent({
  name: 'order-agent',
  instructions: `You are the FireFlow order assistant. You can help create orders, check status, and suggest actions. Never approve financial transactions without explicit human confirmation.`,
  tools: [
    new Tool({
      name: 'list_active_orders',
      description: 'List active orders for the current restaurant.',
      parameters: z.object({}),
      execute: async (_, context) => {
        const orders = await prisma.orders.findMany({
          where: { restaurant_id: context.restaurantId, status: { in: ['ACTIVE', 'DRAFT'] } },
        });
        return { orders };
      },
    }),
  ],
});
```

### 3. Create router

```ts
// src/ai/router.ts
import { Router } from '@fable-io/router';
import { orderAgent } from './agents/orderAgent';

export const aiRouter = new Router({
  agents: [orderAgent],
  defaultAgent: orderAgent,
  confidenceThreshold: 0.7,
});
```

### 4. Add guardrails

```ts
// src/ai/guardrails/tenantIsolation.ts
export const tenantIsolationGuardrail = {
  name: 'tenant-isolation',
  check: (input: any, context: any) => {
    if (input.restaurant_id && input.restaurant_id !== context.restaurantId) {
      return { allowed: false, reason: 'Cross-tenant access denied' };
    }
    return { allowed: true };
  },
};
```

### 5. Wire to API

```ts
// src/api/routes/aiRoutes.ts
router.post('/ai/chat', authMiddleware, async (req, res) => {
  const response = await aiRouter.handle(req.body.message, {
    restaurantId: req.restaurantId,
    staffId: req.staffId,
    role: req.role,
  });
  res.json(response);
});
```

---

## Testing agents

```ts
// tests/ai/orderAgent.test.ts
describe('Order Agent', () => {
  it('lists active orders for the restaurant', async () => {
    const response = await orderAgent.execute('list_active_orders', {}, {
      restaurantId: testRestaurant.id,
    });
    expect(response.orders).toHaveLength(3);
  });

  it('rejects cross-tenant access', async () => {
    const response = await orderAgent.execute('list_active_orders', {}, {
      restaurantId: otherRestaurant.id,
    });
    expect(response.error).toBe('Not found');
  });
});
```

---

## Checklist

- [ ] Fable 5 agents defined for each FireFlow domain (orders, kitchen, finance, inventory)
- [ ] All tools enforce tenant isolation at first database query
- [ ] Financial guardrails prevent AI from approving voids, refunds, discounts, or payment releases
- [ ] Memory is tenant-scoped and does not store raw PII
- [ ] All agent actions are audited with `restaurant_id`, `staff_id`, `agent_name`, `tool_name`
- [ ] Error handling provides user-friendly fallbacks
- [ ] Router confidence threshold tuned to prevent misrouting
- [ ] Tests cover: tenant isolation, guardrail enforcement, tool validation, memory scoping

---

## References

- Fable 5 documentation: https://fable.io/docs
- FireFlow AI architecture: `PROJECT_CONSTITUTION.md` — AI-native Business Operating System
- FireFlow security model: `AGENTS.md` — AI Boundaries section
