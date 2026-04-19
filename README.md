<p align="center">
  <h1 align="center">CrowdSense AI New</h1>
  <p align="center"><strong>Predictive Crowd Intelligence for Live Stadium Operations</strong></p>
</p>

<p align="center">
  <a href="https://crowdsense-ai-81506469908.asia-south1.run.app" target="_blank"><strong>🌐 Live Demo (Attendee Map)</strong></a> •
  <a href="https://crowdsense-ai-81506469908.asia-south1.run.app/admin" target="_blank"><strong>🛡️ Admin Dashboard</strong></a>
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
        └─────────▶│  Firebase Platform    │◀──────────┤  Vertex AI Endpoint   │
                   │  Auth · Firestore ·   │           │  (Scalable Inference) │
                   │  Analytics · Perf Mon │           └───────────────────────┘
                   └───────────────────────┘
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
Production-ready integration using Google Cloud Vertex AI (`USE_VERTEX = true`):
- **Active Inference**: `getAnalysis()` routes data to the Vertex AI endpoint on every prediction cycle.
- **Automatic Fallback**: If the Vertex endpoint is unreachable, the system seamlessly falls back to the local WRC engine with zero downtime.
- **Unified Contract**: Both local and remote predictors return identical decision objects to ensure system stability.

---

## ☁️ Google Cloud Services Integration

CrowdSense AI integrates **9 distinct Google Cloud / Firebase services** across the full stack:

| Service | Purpose | Integration Point |
|---|---|---|
| **Firebase Cloud Functions** | Background event-driven architecture | **processSafetyInsight** trigger (v2) for automated intelligence |
| **Google Cloud Functions** | Event-driven background intelligence | **processSafetyInsight** trigger (v2) for automated log analysis |
| **Firebase Authentication** | Anonymous auth for session-tagged audit trails | `signInAnonymously()` on app init, UID attached to all Firestore writes |
| **Cloud Firestore** | Real-time persistence for crowd logs, predictions, alerts, system events | 4 collections: `crowdLogs`, `predictionLogs`, `activeAlerts`, `systemEvents` |
| **Google Analytics** | Custom event tracking for route calculations, emergency activations | `logEvent()` calls on route_calculated, emergency_mode_toggled, crowd_data_saved |
| **Firebase Performance Monitoring** | Auto page load instrumentation + custom traces | `getPerformance()` + custom trace on route computation |
| **Vertex AI** | Scalable ML inference for congestion prediction | Async prediction pipeline with automatic local fallback |
| **Cloud Run** | Containerized deployment with structured logging | Dockerfile + health check endpoint (`/healthz`) + JSON Cloud Logging |
| **Firebase App Check** | Project protection vs bot/tampering | **reCAPTCHA Enterprise** provider initialization on start |
| **Firebase Remote Config** | Administrative bypass/override control | **Emergency_override flag** polled every 30s to trigger remote evacuation |
| **Google Cloud Storage** | Persistent data archiving for post-incident audits | **System snapshots** uploaded during active emergency events |

- Document structure validation per collection
- Immutable audit logs (no update/delete on prediction and event records)
- Default deny on unmatched paths

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

## Setup & Deployment

```bash
npm install
npm run dev        # Local Dev: http://localhost:5173
npm test           # 44 tests, ~500ms
```

- **Local Admin:** `http://localhost:5173/admin.html`
- **Production Attendee Map:** [crowdsense-ai-81506469908.asia-south1.run.app](https://crowdsense-ai-81506469908.asia-south1.run.app)
- **Production Admin Panel:** [crowdsense-ai-81506469908.asia-south1.run.app/admin](https://crowdsense-ai-81506469908.asia-south1.run.app/admin)

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