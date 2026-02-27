# 🗺️ Fireflow Intelligence: Implementation Roadmap

**How to build the superintelligent system without refactoring existing code**

---

## 🎯 Strategy: Additive Intelligence Layers

**Core Principle**: Build intelligence **around** existing system, not **inside** it.

```
Existing Code (Keep as-is)
    ↓
Add Intelligence Wrapper
    ↓
Gradually migrate to intelligent flows
```

**Benefits**:
- ✅ No breaking changes
- ✅ Can rollback any layer independently
- ✅ Test in production safely (shadow mode first)
- ✅ Zero refactoring of working code

---

## 📅 Phase 1: Self-Healing Foundation (Week 1-2)

### **Goal**: System that detects and fixes data corruption automatically

### **Implementation Steps**

#### **Step 1.1: Create Health Monitoring Service**

```typescript
// src/services/intelligence/SystemHealthMonitor.ts
export class SystemHealthMonitor {
  
  async checkHealth(): Promise<HealthReport> {
    const checks = await Promise.all([
      this.checkDatabaseConnection(),
      this.checkTableConsistency(),
      this.checkOrderIntegrity(),
      this.checkPrinterStatus()
    ]);
    
    return {
      status: checks.every(c => c.healthy) ? 'HEALTHY' : 'DEGRADED',
      checks,
      timestamp: new Date()
    };
  }
  
  async checkTableConsistency(): Promise<HealthCheck> {
    // Detect: Tables marked OCCUPIED but no active order
    const inconsistent = await prisma.tables.count({
      where: {
        status: 'OCCUPIED',
        active_order_id: null
      }
    });
    
    return {
      component: 'TABLES',
      healthy: inconsistent === 0,
      issues: inconsistent,
      autoHealable: true
    };
  }
}
```

**Testing**:
```bash
# Run health check manually
npm run health-check

# Expected output:
# ✅ Database: HEALTHY
# ⚠️  Tables: 2 inconsistencies detected (auto-healable)
# ✅ Orders: HEALTHY
# ✅ Printers: HEALTHY
```

---

#### **Step 1.2: Create Auto-Healing Service**

```typescript
// src/services/intelligence/AutoHealingService.ts
export class AutoHealingService {
  
  async healTableInconsistencies() {
    const stuckTables = await prisma.tables.findMany({
      where: {
        status: 'OCCUPIED',
        active_order_id: null
      }
    });
    
    for (const table of stuckTables) {
      // Check if there's an unpaid order for this table
      const orphanedOrder = await prisma.orders.findFirst({
        where: {
          table_id: table.id,
          payment_status: 'UNPAID',
          status: { notIn: ['CANCELLED', 'VOIDED'] }
        }
      });
      
      if (orphanedOrder) {
        // Reconnect
        await prisma.tables.update({
          where: { id: table.id },
          data: { active_order_id: orphanedOrder.id }
        });
        
        await this.logHealing({
          type: 'TABLE_RECONNECTION',
          table_id: table.id,
          order_id: orphanedOrder.id,
          action: 'Reconnected orphaned order'
        });
      } else {
        // No order - release table
        await prisma.tables.update({
          where: { id: table.id },
          data: { status: 'AVAILABLE' }
        });
        
        await this.logHealing({
          type: 'TABLE_RELEASE',
          table_id: table.id,
          action: 'Released stuck table'
        });
      }
    }
    
    return stuckTables.length;
  }
}
```

---

#### **Step 1.3: Background Healing Job**

```typescript
// src/services/intelligence/BackgroundIntelligence.ts
export class BackgroundIntelligence {
  
  private healingService: AutoHealingService;
  private healthMonitor: SystemHealthMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  
  start() {
    console.log('🧠 Starting Intelligence Background Service...');
    
    // Run every 30 seconds
    this.intervalId = setInterval(async () => {
      try {
        // 1. Health check
        const health = await this.healthMonitor.checkHealth();
        
        // 2. Auto-heal if issues found
        if (health.status !== 'HEALTHY') {
          const healableIssues = health.checks.filter(c => 
            !c.healthy && c.autoHealable
          );
          
          for (const issue of healableIssues) {
            await this.healingService.heal(issue.component);
          }
        }
        
        // 3. Update system health table
        await prisma.system_health.create({
          data: {
            component: 'OVERALL',
            status: health.status,
            last_check: new Date(),
            details: health
          }
        });
        
      } catch (error) {
        console.error('Background intelligence error:', error);
        // Don't crash - log and continue
      }
    }, 30000);
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

// Initialize in main server
// src/api/server.ts
import { BackgroundIntelligence } from './services/intelligence/BackgroundIntelligence';

const intelligence = new BackgroundIntelligence();
intelligence.start();

process.on('SIGTERM', () => {
  intelligence.stop();
});
```

---

### **Phase 1 Deliverable: Self-Healing System**

**What works**:
- ✅ System runs health checks every 30 seconds
- ✅ Auto-fixes stuck tables, orphaned items, status mismatches
- ✅ Logs all healing actions to audit trail
- ✅ Manager can view healing history in dashboard

**Testing**:
```typescript
// Test: Create stuck table manually
await prisma.tables.update({
  where: { id: 'some-table-id' },
  data: { status: 'OCCUPIED', active_order_id: null }
});

// Wait 30 seconds...
// Check: Table should auto-release to AVAILABLE

// Verify healing log
const healingLogs = await prisma.audit_logs.findMany({
  where: { action_type: 'AUTO_HEAL' },
  orderBy: { created_at: 'desc' },
  take: 10
});
```

---

## 📅 Phase 2: Decision Assistance (Week 3-4)

### **Goal**: Cashier gets intelligent guidance when settling orders

### **Implementation Steps**

#### **Step 2.1: Create Decision Engine**

```typescript
// src/services/intelligence/DecisionEngine.ts
export class SettlementDecisionEngine {
  
  async analyzeSettlement(orderId: string): Promise<SettlementGuidance> {
    
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        order_items: { include: { menu_items: true } },
        customers: true,
        tables: true
      }
    });
    
    if (!order) throw new Error('Order not found');
    
    // 1. Check item completion
    const itemsNotReady = order.order_items.filter(
      item => !['DONE', 'SERVED', 'READY'].includes(item.item_status)
    );
    
    if (itemsNotReady.length === 0) {
      // Simple case - all items ready
      return {
        allowSettle: true,
        complexity: 'SIMPLE',
        recommendations: []
      };
    }
    
    // 2. Analyze customer context
    const customerContext = await this.analyzeCustomer(order.customer_id);
    
    // 3. Analyze order context
    const orderContext = {
      totalValue: order.total,
      itemsNotReady: itemsNotReady.map(i => ({
        name: i.item_name,
        price: i.total_price,
        category: i.category,
        estimatedReadyIn: await this.predictItemCompletionTime(i)
      }))
    };
    
    // 4. Generate recommendations
    const recommendations = this.generateRecommendations({
      customer: customerContext,
      order: orderContext
    });
    
    return {
      allowSettle: true,  // Never block
      complexity: 'REQUIRES_DECISION',
      itemsNotReady: orderContext.itemsNotReady,
      customerContext,
      recommendations: recommendations.sort((a, b) => 
        b.confidence - a.confidence
      )
    };
  }
  
  private generateRecommendations(context: AnalysisContext): Recommendation[] {
    const recs: Recommendation[] = [];
    
    // Recommendation 1: Only desserts/drinks pending
    const onlyNonEssentials = context.order.itemsNotReady.every(
      item => ['DESSERT', 'BEVERAGE'].includes(item.category)
    );
    
    if (onlyNonEssentials) {
      recs.push({
        action: 'SETTLE_NOW_DELIVER_LATER',
        confidence: 0.88,
        reasoning: 'Only desserts/drinks pending. Settle now, deliver when ready.',
        impact: 'POSITIVE',
        script: 'Your desserts will be ready in ~3 minutes. Would you like to settle now?',
        discountSuggestion: null
      });
    }
    
    // Recommendation 2: High-value customer + delay
    if (context.customer.isRegular && context.customer.lifetimeValue > 50000) {
      const hasSignificantDelay = context.order.itemsNotReady.some(
        item => item.estimatedReadyIn > 10
      );
      
      if (hasSignificantDelay) {
        recs.push({
          action: 'GOODWILL_DISCOUNT',
          confidence: 0.92,
          reasoning: 'Valuable regular customer experiencing delay. Protect relationship.',
          impact: 'REVENUE_PROTECTION',
          script: 'Apologies for the delay. Let me apply a courtesy discount.',
          discountSuggestion: Math.min(context.order.totalValue * 0.10, 500)
        });
      }
    }
    
    // Recommendation 3: Items almost ready
    const maxWaitTime = Math.max(
      ...context.order.itemsNotReady.map(i => i.estimatedReadyIn)
    );
    
    if (maxWaitTime < 3) {
      recs.push({
        action: 'ASK_TO_WAIT',
        confidence: 0.75,
        reasoning: 'Items ready in <3 minutes. Customer likely willing to wait.',
        impact: 'NEUTRAL',
        script: 'Your order is plating now. Ready in about 2 minutes.',
        discountSuggestion: null
      });
    }
    
    // Default: Force settle
    recs.push({
      action: 'FORCE_SETTLE',
      confidence: 0.60,
      reasoning: 'Customer wants to leave. Mark pending items as skipped.',
      impact: 'KITCHEN_WASTE',
      script: 'I can settle you now. The kitchen will stop preparing the pending items.',
      discountSuggestion: null,
      warnings: ['Kitchen will waste ingredients for pending items']
    });
    
    return recs;
  }
  
  private async analyzeCustomer(customerId?: string): Promise<CustomerContext> {
    if (!customerId) {
      return {
        isRegular: false,
        lifetimeValue: 0,
        averageOrderValue: 0,
        visitCount: 0,
        lastVisit: null,
        estimatedPatience: 0.5  // Default: medium patience
      };
    }
    
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      include: {
        orders: {
          where: { payment_status: 'PAID' },
          select: { total: true, created_at: true }
        }
      }
    });
    
    if (!customer) return this.analyzeCustomer(undefined);
    
    const lifetimeValue = customer.orders.reduce(
      (sum, o) => sum + Number(o.total), 0
    );
    
    return {
      isRegular: customer.orders.length >= 5,
      lifetimeValue,
      averageOrderValue: lifetimeValue / (customer.orders.length || 1),
      visitCount: customer.orders.length,
      lastVisit: customer.orders[0]?.created_at || null,
      estimatedPatience: this.calculatePatience(customer.orders.length)
    };
  }
  
  private calculatePatience(visitCount: number): number {
    // First-time customers: less patient (0.4)
    // Regular customers: more patient (0.8)
    return Math.min(0.4 + (visitCount * 0.08), 0.8);
  }
  
  private async predictItemCompletionTime(item: any): Promise<number> {
    // Simple heuristic for now (can be ML model later)
    // Get average prep time for this menu item
    const avgPrepTime = await prisma.order_items.aggregate({
      where: {
        menu_item_id: item.menu_item_id,
        completed_at: { not: null }
      },
      _avg: {
        // Time from fired to completed (in minutes)
      }
    });
    
    // For now, return simple estimate based on category
    const categoryEstimates = {
      'APPETIZER': 5,
      'ENTREE': 12,
      'DESSERT': 8,
      'BEVERAGE': 2
    };
    
    return categoryEstimates[item.category] || 10;
  }
}
```

---

#### **Step 2.2: UI Component for Settlement Guidance**

```typescript
// src/operations/orders/components/SettlementAssistModal.tsx
import React, { useState, useEffect } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';

interface SettlementAssistModalProps {
  orderId: string;
  onConfirm: (action: string, discount?: number) => void;
  onCancel: () => void;
}

export const SettlementAssistModal: React.FC<SettlementAssistModalProps> = ({
  orderId,
  onConfirm,
  onCancel
}) => {
  const [guidance, setGuidance] = useState<SettlementGuidance | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch guidance from API
    fetch(`/api/intelligence/settlement-guidance/${orderId}`)
      .then(r => r.json())
      .then(data => {
        setGuidance(data);
        setLoading(false);
      });
  }, [orderId]);
  
  if (loading) {
    return <Modal><div>Analyzing order...</div></Modal>;
  }
  
  if (!guidance || guidance.complexity === 'SIMPLE') {
    // No guidance needed - proceed directly
    onConfirm('SIMPLE_SETTLE');
    return null;
  }
  
  const topRecommendation = guidance.recommendations[0];
  
  return (
    <Modal onClose={onCancel}>
      <div className="settlement-assist">
        <h2>⚠️ Settlement Decision Assist</h2>
        
        <div className="order-context">
          <p><strong>{guidance.itemsNotReady.length} items</strong> not ready:</p>
          <ul>
            {guidance.itemsNotReady.map(item => (
              <li key={item.name}>
                {item.name} - <em>~{item.estimatedReadyIn} min remaining</em>
              </li>
            ))}
          </ul>
        </div>
        
        {guidance.customerContext.isRegular && (
          <div className="customer-context">
            <h3>👤 Customer Context</h3>
            <ul>
              <li>Regular customer ({guidance.customerContext.visitCount} visits)</li>
              <li>Lifetime value: ₨{guidance.customerContext.lifetimeValue.toLocaleString()}</li>
            </ul>
          </div>
        )}
        
        <div className="recommendation-primary">
          <h3>💡 Recommended Action ({Math.round(topRecommendation.confidence * 100)}% confident)</h3>
          
          <div className="recommendation-card">
            <h4>{topRecommendation.action.replace(/_/g, ' ')}</h4>
            <p className="reasoning">{topRecommendation.reasoning}</p>
            
            {topRecommendation.script && (
              <div className="script">
                <strong>Suggested script:</strong>
                <blockquote>"{topRecommendation.script}"</blockquote>
              </div>
            )}
            
            {topRecommendation.discountSuggestion && (
              <div className="discount">
                <strong>Suggested discount:</strong> ₨{topRecommendation.discountSuggestion}
              </div>
            )}
            
            <Button 
              variant="primary" 
              onClick={() => onConfirm(
                topRecommendation.action, 
                topRecommendation.discountSuggestion
              )}
            >
              {topRecommendation.discountSuggestion 
                ? `Settle with ₨${topRecommendation.discountSuggestion} Discount`
                : 'Proceed with This Action'
              }
            </Button>
          </div>
        </div>
        
        {guidance.recommendations.length > 1 && (
          <details className="alternative-options">
            <summary>View {guidance.recommendations.length - 1} Other Options</summary>
            {guidance.recommendations.slice(1).map((rec, idx) => (
              <div key={idx} className="recommendation-alternative">
                <h4>{rec.action.replace(/_/g, ' ')} ({Math.round(rec.confidence * 100)}%)</h4>
                <p>{rec.reasoning}</p>
                <Button 
                  variant="secondary" 
                  size="small"
                  onClick={() => onConfirm(rec.action, rec.discountSuggestion)}
                >
                  Choose This
                </Button>
              </div>
            ))}
          </details>
        )}
        
        <Button variant="ghost" onClick={onCancel}>
          Cancel - Wait for Kitchen
        </Button>
      </div>
    </Modal>
  );
};
```

---

### **Phase 2 Deliverable: Intelligent Settlement**

**What works**:
- ✅ Cashier clicks "Settle" on order with pending items
- ✅ Modal shows:
  - Items not ready with time estimates
  - Customer history & value
  - 2-4 ranked recommendations
  - Suggested scripts for each option
- ✅ Cashier chooses best option (or custom)
- ✅ System logs which recommendation was followed
- ✅ ML learns from outcomes over time

---

## 📅 Phase 3: Bottleneck Detection (Week 5-6)

### **Implementation**

```typescript
// src/services/intelligence/BottleneckDetector.ts
export class BottleneckDetector {
  
  async detect(): Promise<BottleneckAlert | null> {
    const checks = await Promise.all([
      this.checkKitchenBottleneck(),
      this.checkCashierBottleneck(),
      this.checkWaiterBottleneck()
    ]);
    
    const bottlenecks = checks.filter(c => c !== null);
    
    if (bottlenecks.length === 0) return null;
    
    // Return most severe
    return bottlenecks.sort((a, b) => 
      this.getSeverityScore(b) - this.getSeverityScore(a)
    )[0];
  }
  
  private async checkKitchenBottleneck(): Promise<BottleneckAlert | null> {
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60000);
    
    // Count pending/preparing items
    const pendingCount = await prisma.order_items.count({
      where: {
        item_status: { in: ['PENDING', 'PREPARING'] },
        created_at: { gte: thirtyMinAgo }
      }
    });
    
    // Get baseline capacity (from ML or config)
    const baselineCapacity = await this.getBaselineCapacity('KITCHEN');
    
    const utilizationPercent = (pendingCount / baselineCapacity) * 100;
    
    if (utilizationPercent < 85) return null;
    
    // Generate recommendations
    const recommendations = [];
    
    if (utilizationPercent > 95) {
      recommendations.push({
        action: 'STOP_ACCEPTING_WALKINS',
        impact: 'Prevents overload',
        autoExecutable: true
      });
    }
    
    recommendations.push({
      action: 'WARN_CUSTOMERS_15MIN_DELAY',
      impact: 'Sets expectations',
      autoExecutable: true,
      message: 'Kitchen running behind. Please inform new customers of ~15min delay.'
    });
    
    return {
      location: 'KITCHEN',
      severity: utilizationPercent > 95 ? 'CRITICAL' : 'WARNING',
      currentLoad: pendingCount,
      normalLoad: baselineCapacity * 0.7,
      predictedDelay: Math.round((utilizationPercent - 70) / 2),
      recommendations
    };
  }
}
```

**Manager Dashboard Component**:
```typescript
// Auto-updates every 30 seconds
const BottleneckAlert = () => {
  const { bottleneck } = useBottleneckMonitor();
  
  if (!bottleneck) return null;
  
  return (
    <div className={`alert alert-${bottleneck.severity.toLowerCase()}`}>
      <h3>🔴 {bottleneck.location} BOTTLENECK</h3>
      <p>Current: {bottleneck.currentLoad} items</p>
      <p>Normal: {bottleneck.normalLoad} items</p>
      <p>Predicted delay: ~{bottleneck.predictedDelay} minutes</p>
      
      <div className="recommendations">
        {bottleneck.recommendations.map(rec => (
          <Button
            key={rec.action}
            onClick={() => executeRecommendation(rec)}
            disabled={!rec.autoExecutable}
          >
            {rec.action.replace(/_/g, ' ')}
          </Button>
        ))}
      </div>
    </div>
  );
};
```

---

## 📅 Phase 4: Predictive Analytics (Week 7-8)

**Capacity forecasting, ML prediction models, auto-staffing suggestions**

(Details in separate implementation guide)

---

## 🎯 Success Metrics

After Phase 1-3 implementation, you should see:

Metric | Before | After
---|---|---
Data corruption incidents | 5-10/week | 0 (auto-healed)
Manager interruptions for PIN | 20-30/shift | 2-3/shift
Customer complaints (delays) | 8-12/week | 3-5/week
Time to settle complex order | 3-5 min | 1-2 min
Staff confidence in decisions | Low | High (has guidance)

---

## 🛠️ Development Workflow

### **For Each Feature**:

1. **Build in Shadow Mode** (observes, doesn't act)
2. **Collect data for 1 week**
3. **Validate accuracy** (are predictions correct?)
4. **Enable auto-actions** (system takes action)
5. **Monitor outcomes**
6. **Tune parameters** based on feedback

### **Never**:
- ❌ Modify existing working code if possible
- ❌ Release without shadow mode testing
- ❌ Auto-execute high-risk actions without manager approval

---

## 🚀 Next Step

Which phase would you like me to implement first?

1. **Phase 1: Self-Healing** (safest, immediate value)
2. **Phase 2: Settlement Assist** (highest user impact)
3. **Phase 3: Bottleneck Detection** (prevents problems)
4. **Custom**: Mix of the above

I can start coding the actual implementation right now! 🔥
