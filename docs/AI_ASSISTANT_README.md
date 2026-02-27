# 🤖 FOR AI ASSISTANTS: Start Here

**You are working on Fireflow, an intelligent restaurant POS system.**

---

## 📚 **THE SINGLE SOURCE OF TRUTH**

**READ THIS FIRST**: `docs/ORDER_BOOKING_WORK_PROCESS.md`

This document contains:
- ✅ Complete system architecture
- ✅ Accurate database schema & status enums
- ✅ All order lifecycle phases with code examples
- ✅ Intelligence layer specifications
- ✅ Critical implementation rules
- ✅ Version history & design decisions

**All other docs are secondary references or archives.**

---

## ⚡ **Quick Decision Tree**

### **User asks you to add/modify feature**

```
1. Read ORDER_BOOKING_WORK_PROCESS.md
   ↓
2. Is this feature already documented?
   ├─ YES → Implement exactly as documented
   └─ NO  → Propose addition to spec FIRST, then implement
```

### **User reports a bug**

```
1. Read ORDER_BOOKING_WORK_PROCESS.md
   ↓
2. Compare actual code behavior vs documented behavior
   ├─ Code wrong → Fix code to match spec
   ├─ Spec wrong → Update spec, then fix code
   └─ Both wrong → Consult user, then update both
```

### **User asks "how does X work?"**

```
1. Read relevant section in ORDER_BOOKING_WORK_PROCESS.md
   ↓
2. Explain based on spec (not based on code)
   ↓
3. If code doesn't match spec → Report discrepancy
```

---

## 🚨 **CRITICAL RULES (Never Break These)**

1. **ALWAYS use transactions** for multi-table operations
2. **ALWAYS snapshot prices/metadata** in order_items
3. **NEVER block operations** - guide with recommendations instead
4. **ALWAYS broadcast Socket.IO** events after data changes
5. **CHECK status enums** in spec before using (don't guess!)

---

## 📂 **Document Hierarchy**

```
1. ORDER_BOOKING_WORK_PROCESS.md  ← THE TRUTH
   └─ If this conflicts with code, code is wrong
   
2. QUICK_START_DELIVERY.md        ← Immediate priorities
   └─ What to focus on for shipment
   
3. IMPLEMENTATION_ROADMAP.md      ← Post-delivery plan
   └─ How to add intelligence layers
   
4. INDEX.md                       ← Overview & navigation
   └─ Background context
   
5. All other .md files            ← Archives/references
   └─ Historical or supplementary
```

---

## ✅ **Before Making ANY Code Change**

**Checklist**:
- [ ] Read relevant section in ORDER_BOOKING_WORK_PROCESS.md?
- [ ] Using correct status enum names from spec?
- [ ] Wrapped multi-step logic in transaction?
- [ ] Following "assist, don't block" principle?
- [ ] Will update spec if adding new behavior?

---

## 🎯 **Current Phase**

**Phase**: Core Functionality Delivery (3-5 days deadline)  
**Priority**: Ship working DINE_IN, TAKEAWAY, DELIVERY flows  
**Intelligence Layer**: Deferred to post-delivery

**See**: `QUICK_START_DELIVERY.md` for daily action items

---

## 💬 **Communication Style**

When working with the user:
- ✅ Reference the spec when explaining decisions
- ✅ Be transparent about spec vs implementation gaps
- ✅ Propose spec updates when needed
- ✅ Cite version history when relevant

---

**Last Updated**: February 8, 2026  
**Next AI Agent**: Read ORDER_BOOKING_WORK_PROCESS.md before doing ANYTHING!
