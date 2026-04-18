<p align="center">
  <h1 align="center">CrowdSense AI</h1>
  <p align="center"><strong>Predictive Crowd Intelligence for Live Stadium Operations</strong></p>
</p>

<p align="center">
  <a href="./tests"><img src="https://img.shields.io/badge/tests-44%20passing-brightgreen" alt="Tests"></a>
  <a href="https://cloud.google.com/vertex-ai"><img src="https://img.shields.io/badge/AI-Vertex%20AI%20Ready-4285F4?logo=googlecloud" alt="Vertex AI"></a>
  <a href="https://firebase.google.com"><img src="https://img.shields.io/badge/pipeline-Firebase%20Firestore-FFCA28?logo=firebase" alt="Firebase"></a>
  <a href="https://vitest.dev"><img src="https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest" alt="Vitest"></a>
  <a href="https://vitejs.dev"><img src="https://img.shields.io/badge/built_with-Vite_5-646CFF?logo=vite" alt="Vite"></a>
</p>

---

## What This Is

CrowdSense AI is a real-time crowd management system that **predicts congestion before it happens** and **reroutes foot traffic automatically**.

It ingests live zone-level density data, runs it through a multi-layer trend analysis engine (local WRC + Vertex AI integration), feeds those scores into a penalty-weighted Dijkstra router, and persists every decision to a structured telemetry pipeline in Firebase Firestore.

The system identifies trajectories and acts — whether in normal operations or during a **critical emergency evacuation**.

---

## Why It Matters

Stadiums hosting 50,000+ people manage crowd flow reactively. By the time an operator sees a problem on camera, it's already a safety incident.

CrowdSense AI closes that gap:

| Traditional Approach | CrowdSense AI |
|---|---|
| Operator sees congestion on camera | System detects density trend 30s earlier |
| Manual radio call to redirect staff | Automatic reroute computed and displayed |
| Post-event incident report | Real-time prediction & system event audit logs |
| Static signage | Dynamic routing overlay + Emergency Evacuation Mode |

---

## Architecture

```
 ┌──────────────┐     events      ┌──────────────────┐    penalties    ┌────────────────┐
 │  Simulator   │────────────────▶│  AI Predictor    │───────────────▶│  Dijkstra      │
 │  (3s ticks)  │                 │  (WRC + VERTEX)  │                │  Router        │
 └──────┬───────┘                 └────────┬─────────┘                └────────────────┘
        │                                  │
        │          ┌───────────────────────┐│          ┌───────────────────────┐
        └─────────▶│  Firebase Firestore   │◀──────────┤  Vertex AI Endpoint   │
                   │  Telemetry Pipeline   │           │  (Scalable Inference) │
                   └───────────────────────┘           └───────────────────────┘
```

### Project Structure

```
src/
├── ai/               CongestionPredictor — WRC scoring, multi-step forecasting, Vertex fallback
├── algorithms/       Dijkstra shortest path with dynamic edge weight injection
├── components/       Heatmap, Routing, Flow particles, WaitTimes, Chatbot
├── services/         Firebase (Firestore), Vertex AI (Inference stub), Analytics logs
├── simulation/       Event-driven crowd simulator with Emergency Scenario support
└── utils/            TTL-based route cache & telemetry helpers
```

---

## AI Intelligence Layer

The engine utilizes **Weighted Rate of Change (WRC)** over a rolling density window, combined with **Multi-step Forecasting** to project future states:

```javascript
// Local engine logic
trendScore = Σ(Δᵢ × wᵢ) / Σ(wᵢ)     where wᵢ = i + 1
confidence = clamp(consistency × dataVolume / 10, 0.20, 0.99)

// Multi-step Forecast
forecast = [lastValue + (trendScore * 1), lastValue + (trendScore * 2), ...]
```

### Multi-Step Prediction
Every AI cycle now generates a 3-step future projection (approx. 9-second horizon), allowing the system to verify if a trend is accelerating or stabilizing before triggering high-cost routing changes.

---

## Key Features

### 🚨 Emergency Evacuation Mode
Integrated as a lightweight global override. When activated:
- **Density Spikes**: Simulator triggers immediate stadium-wide density increases.
- **Zone Blocking**: High-risk interior zones (e.g., Food Court) are marked as impassable.
- **Exit Priority**: Gates (`gate_a`, `gate_b`) receive heavy negative weights (attraction) to force routing toward exits.
- **Aggressive Weights**: Congestion penalties are multiplied (3×) to steer traffic away from emerging bottlenecks instantly.

### 🤖 Vertex AI Integration Layer
Production-ready integration path using Google Cloud Vertex AI:
- **Async Prediction**: `getAnalysis()` routes data to a Vertex AI endpoint for scalable inference.
- **Automatic Fallback**: If the Vertex endpoint is unreachable or disabled (`USE_VERTEX = false`), the system seamlessly falls back to the local WRC engine with zero downtime.
- **Unified Contract**: Both local and remote predictors return identical decision objects to ensure system stability.

---

## Decision Intelligence & Observability

Every routing evaluation produces a structured audit log and a developer-grade decision object:

```javascript
// [Routing Decision] Zone: Gate B [EMERGENCY]
{
  node: "gate_b",
  isBlocked: false,
  isExit: true,
  finalWeight: -420,
  mode: "emergency"
}
```

### Telemetry Pipeline (Firebase)

| Firestore Collection | Trigger | Payload |
|---|---|---|
| `crowdLogs` | Every heartbeat (3s) | Raw zone densities |
| `predictionLogs` | Confidence > 60% | AI trend score, forecast, confidence |
| `activeAlerts` | Density ≥ 85% | Immediate operator alert |
| `systemEvents` | System state change | Analytics for routing decisions & emergency mode |

---

## Testing

**44 test cases** across 6 files. Full suite runs in ~500ms.

```
 ✓ tests/ai.test.js           13 tests — trend detection, forecasting, edge cases
 ✓ tests/algorithms.test.js    9 tests — shortest path, custom weights
 ✓ tests/routing.test.js       4 tests — reactive vs proactive penalties
 ✓ tests/robustness.test.js    8 tests — cache TTL, null/undefined guards
 ✓ tests/integration.test.js   9 tests — EMERGENCY mode, Vertex fallback, Cache invalidation
 ✓ test/basic.test.js          1 test  — sanity check
```

---

## Performance & Optimization

| Technique | What It Does |
|---|---|
| **Performance instrumentation** | Real-time tracking of route computation and AI latency |
| **Route Cache (30s TTL)** | Second request for same origin/destination is near-instant |
| **DOM Diffing** | Text content compared before write — no unnecessary reflows |
| **Bounded History** | Rolling 10-point window keeps AI analysis O(n) with fixed memory |
| **Async Persistence** | Firebase writes and Vertex calls are fire-and-forget |

---

## Setup

```bash
npm install
npm run dev        # → http://localhost:5173
npm test           # 44 tests, ~500ms
```

Admin dashboard: `http://localhost:5173/admin.html` (Enable 🚨 Emergency Mode here)

---

## 🔮 Future Scope

| Direction | Evolution |
|----------|----------|
| **Computer Vision** | Replace simulated inputs with real-time crowd detection using edge-based inference |
| **Advanced Sequence Forecasting** | Deep learning (LSTM) for multi-minute horizons |
| **Operational Integration APIs** | Real-time alert delivery to on-ground staff via mobile |
| **Multi-Venue Architecture** | Support multi-stadium deployments with tenant isolation |

---

<p align="center">
  <em>Built to think ahead. Designed for venues where every second counts.</em>
</p>