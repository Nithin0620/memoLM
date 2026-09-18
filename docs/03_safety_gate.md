# 03. The Safety Gate Engine

## 🛡️ Why the Safety Gate is Essential

Traditional semantic caches use naive cosine similarity:
$$\text{similarity}(\vec{q}_{\text{new}}, \vec{q}_{\text{cached}}) \ge \tau \implies \text{RETURN CACHED RESPONSE}$$

This breaks down in production:
1. **Stale Knowledge:** Company changes refund policy from 30 days to 14 days. The semantic similarity is `0.98`, but the answer is **wrong and stale**.
2. **Expired Contexts:** Time-sensitive pricing or stock data cached 2 hours ago is returned when it had a 30-second validity window.
3. **High-Risk Domains:** Sensitive medical, legal, or financial queries must never be answered via speculative semantic cache.
4. **Tenant Leakage:** Responses generated for Tenant A must never be served to Tenant B.

---

## 🔍 Safety Verification Workflow

When a semantic candidate is found with cosine similarity $\ge$ baseline threshold (e.g., `0.90`), it enters the **Safety Gate**:

```mermaid
flowchart TD
    Candidate["Semantic Match Found (e.g. 0.94)"] --> CheckTenant{"1. Tenant Match?"}
    
    CheckTenant -->|No| RejectTenant["❌ REJECT: tenant_mismatch"]
    CheckTenant -->|Yes| CheckModel{"2. Model & Provider Match?"}
    
    CheckModel -->|No| RejectModel["❌ REJECT: model_mismatch"]
    CheckModel -->|Yes| CheckKnowledge{"3. Knowledge Version Match?<br/>(cached.kv == req.kv)"}
    
    CheckKnowledge -->|No| RejectKnowledge["❌ REJECT: knowledge_changed"]
    CheckKnowledge -->|Yes| CheckTTL{"4. TTL Valid?<br/>(now < created + ttl)"}
    
    CheckTTL -->|No| RejectTTL["❌ REJECT: ttl_expired"]
    CheckTTL -->|Yes| CheckRisk{"5. Risk Policy Check"}
    
    CheckRisk -->|Risk = high| RejectRisk["❌ REJECT: high_risk_disabled"]
    CheckRisk -->|Similarity < Policy Threshold| RejectThreshold["❌ REJECT: below_policy_threshold"]
    CheckRisk -->|Passed| SafeHit["✅ SAFE TO REUSE (Cache Hit)"]
    
    RejectTenant --> ForwardLLM["Forward to Upstream LLM"]
    RejectModel --> ForwardLLM
    RejectKnowledge --> ForwardLLM
    RejectTTL --> ForwardLLM
    RejectRisk --> ForwardLLM
    RejectThreshold --> ForwardLLM
```

---

## 📊 Safety Gate Verdict Output Schema

```json
{
  "verdict": "SAFE" | "REJECTED",
  "similarity": 0.942,
  "threshold_applied": 0.90,
  "matched_query": "What is the return policy?",
  "checks": {
    "tenant_valid": true,
    "model_valid": true,
    "prompt_version_valid": true,
    "knowledge_version_valid": true,
    "ttl_valid": true,
    "risk_policy_allowed": true
  },
  "rejection_reasons": []
}
```
If rejected:
```json
{
  "verdict": "REJECTED",
  "similarity": 0.942,
  "threshold_applied": 0.90,
  "matched_query": "What is the return policy?",
  "checks": {
    "tenant_valid": true,
    "model_valid": true,
    "prompt_version_valid": true,
    "knowledge_version_valid": false,
    "ttl_valid": true,
    "risk_policy_allowed": true
  },
  "rejection_reasons": [
    "knowledge_version_mismatch: cached=v12, requested=v13"
  ]
}
```
