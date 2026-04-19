import { simulator } from './simulation/simulator.js';
import { Heatmap } from './components/Heatmap.js';
import { Routing } from './components/Routing.js';
import { Flow } from './components/Flow.js';
import { WaitTimes } from './components/WaitTimes.js';
import { Chatbot } from './components/Chatbot.js';
import { CongestionPredictor, USE_VERTEX } from './ai/predictor.js';
import { firebaseService, initAuth, onAuthChanged } from './services/firebaseService.js';
import { routeCache } from './utils/cache.js';
import { ui } from './ui/UIController.js';
import { config, validateConfig, Logger } from './config.js';
import { Security } from './utils/security.js';
import { ScenarioManager } from './simulation/ScenarioManager.js';

document.addEventListener('DOMContentLoaded', async () => {
try {
    validateConfig();
  } catch (e) {
    Logger.error('Startup validation failed', e.message);
    ui.showAlert(`Configuration Error: ${e.message}`);
  }

  // ── Firebase Auth — establish anonymous session before any Firestore writes
  await initAuth();
  onAuthChanged((uid) => {
    ui.setStatusPill('auth', !!uid);
  });

  // ── Bootstrap components
  const heatmap = new Heatmap('heatmap-layer');
  const routing = new Routing('route-layer');
  const flow = new Flow('flow-layer', routing);
  const waitTimes = new WaitTimes('wait-list-container');
  const chatbot = new Chatbot();
  const scenarioManager = new ScenarioManager(simulator, ui, firebaseService);

  // ── Initial paint
  heatmap.update(simulator.state.zones);
  waitTimes.update(simulator.state.waitTimes);
  updateAIRecommendation(simulator.state);
  updateMetrics(simulator.state.zones);

  /**
   * Computes and displays a stadium-wide Safety Score.
   * Score is the inverse of average density across all zones (higher = safer).
   * Updates the header bar's Safety chip with color-coded feedback.
   *
   * @param {Array<{density: number}>} zones - Current zone density snapshot.
   */
  function updateMetrics(zones) {
    const avgDensity = zones.reduce((sum, z) => sum + z.density, 0) / zones.length;
    const safetyPct = Math.round((1 - avgDensity) * 100);
    ui.updateMetrics(simulator.state.attendance, safetyPct);
  }

  // Initial UI state
  ui.setStatusPill('vertex', USE_VERTEX);
  ui.setStatusPill('firebase', !!firebaseService.db);
  ui.setStatusPill('analytics', true);
  updateMetrics(simulator.state.zones);
  updateAIRecommendation(simulator.state);
  updateSmartSuggestions(simulator.state);

  // ── Simulator event bindings
  // EVENT-DRIVEN ARCHITECTURE: the simulator emits events on a fixed cadence
  // (3s heatmap, 5s wait times, 8s alerts). Each listener triggers a cascade:
  //   simulator → AI predictor → routing weight recalc → Firebase persistence
  // This decoupled pipeline ensures no component depends on another's internals.
  simulator.on('update:heatmap', async (zones) => {
    heatmap.update(zones);
    updateAIRecommendation(simulator.state);
    updateSmartSuggestions(simulator.state);
    updateMetrics(zones);
    updateTelemetryHUD(zones);

    // 🚀 Production Firebase Integration
    firebaseService.saveCrowdData(zones);
    Logger.info("Crowd data sent to Firebase", zones);
    firebaseService.triggerAlertIfHighDensity(zones);
  });

  /**
   * Updates tactical telemetry HUD labels for Staff Mode.
   * @param {Array} zones - Current zone states.
   */
  function updateTelemetryHUD(zones) {
    zones.forEach(z => {
      const el = document.getElementById(`telemetry-${z.id}`);
      if (!el) return;
      const density = Math.round(z.density * 100);
      const flow = (0.5 + Math.random() * 1.5).toFixed(1); // Simulated throughput
      el.textContent = `${density}% | ${flow}m/s`;
      el.setAttribute('fill', z.density > 0.75 ? 'var(--red)' : (z.density > 0.4 ? 'var(--yellow)' : 'var(--green)'));
    });
  }

  simulator.on('update:predictions', async (history) => {
    // Uses Vertex AI when USE_VERTEX flag is enabled, otherwise local WRC engine
    const analysis = await CongestionPredictor.getAnalysis(history, simulator.state.zones);
    if (analysis.isIncreasing && analysis.confidence > 0.6) {
      firebaseService.logPrediction(analysis);
      Logger.info("Prediction logged", analysis);
    }
  });

  simulator.on('update:waitTimes', (times) => {
    waitTimes.update(times);
    updateAIRecommendation(simulator.state);
    updateSmartSuggestions(simulator.state);
  });

  simulator.on('alert', (msg) => {
    ui.showAlert(msg);

    const warningLayer = document.getElementById('warning-layer');
    if (!warningLayer) return;
    let targetId = null;
    simulator.state.zones.forEach(z => { if (msg.includes(z.name)) targetId = z.id; });

    if (targetId && routing.nodes[targetId]) {
      const p = routing.nodes[targetId];
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('x', p.x);
      icon.setAttribute('y', p.y - 10);
      icon.setAttribute('class', 'warning-icon');
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('dominant-baseline', 'middle');
      icon.setAttribute('font-size', '24px');
      icon.textContent = '⚠️';
      warningLayer.appendChild(icon);
      setTimeout(() => { if (warningLayer.contains(icon)) warningLayer.removeChild(icon); }, 6000);
    }
  });

  // ── Routing mode controls
  let routingMode = false;
  const btnHeatmap = document.getElementById('btn-heatmap');
  const btnRouting = document.getElementById('btn-routing');
  const badge = document.getElementById('route-mode-badge');
  const btnClearRoute = document.getElementById('btn-clear-route');
  const findRouteBtn = document.getElementById('find-route-btn');
  const routeMeta = document.getElementById('route-meta');
  const mapBackBtn = document.getElementById('map-back-btn');

  const disableRouteMode = () => {
    routingMode = false;
    btnHeatmap?.classList.add('active');
    btnRouting?.classList.remove('active');
    document.getElementById('heatmap-layer').classList.remove('heatmap-dimmed');
    document.getElementById('route-layer').classList.add('hidden');
    badge?.classList.add('hidden');
    btnClearRoute?.classList.add('hidden');
    findRouteBtn?.classList.remove('hidden');
    mapBackBtn?.classList.add('hidden');
    if (routeMeta) routeMeta.classList.add('hidden');
    document.getElementById('route-explanation')?.classList.add('hidden');
    document.getElementById('route-metrics')?.classList.add('hidden');
    routing.clear();
  };

  const enableRouteMode = () => {
    routingMode = true;
    btnRouting?.classList.add('active');
    btnHeatmap?.classList.remove('active');
    document.getElementById('heatmap-layer').classList.add('heatmap-dimmed');
    document.getElementById('route-layer').classList.remove('hidden');
    badge?.classList.remove('hidden');
    btnClearRoute?.classList.remove('hidden');
    findRouteBtn?.classList.add('hidden');
    mapBackBtn?.classList.remove('hidden');
  };

  btnHeatmap?.addEventListener('click', disableRouteMode);
  btnRouting?.addEventListener('click', enableRouteMode);
  btnClearRoute?.addEventListener('click', disableRouteMode);
  mapBackBtn?.addEventListener('click', disableRouteMode);

  findRouteBtn?.addEventListener('click', () => {
    const start = document.getElementById('route-start').value;
    const end = document.getElementById('route-end').value;

    if (!start || !end) {
      ui.showAlert('Please select both origin and destination.');
      return;
    }

    if (start === end) {
      ui.showAlert('Start and destination cannot be the same');
      return;
    }

    if (!routingMode) enableRouteMode();
    
    // Performance metrics (Task 5) + Firebase Performance trace
    const perfTrace = firebaseService.startPerformanceTrace('route_calculation');
    const t0 = performance.now();
    const meta = routing.showRoute(start, end);
    const t1 = performance.now();
    if (perfTrace) perfTrace.stop();

    // Google Analytics: track route calculation
    firebaseService.logAnalyticsEvent('route_calculated', {
      start,
      end,
      calc_time_ms: Math.round(t1 - t0),
      is_emergency: simulator.mode === 'emergency',
    });

    // Task 4: Explainable Routing
    const pathIds = routing.calculatePath(start, end);
    updateRouteExplanation(pathIds);

    // Task 5: Metrics update
    updateRouteMetrics(t1 - t0, pathIds);

    // Show route metadata panel
    if (routeMeta && meta) {
      document.getElementById('route-eta').textContent = `~${meta.minutes} min`;
      routeMeta.classList.remove('hidden');
    }
  });

  // ── Dynamic Dropdown Population & Validation
  function populateRouteDropdowns() {
    const startSelect = document.getElementById('route-start');
    const endSelect = document.getElementById('route-end');
    if (!startSelect || !endSelect) return;

    const zones = simulator.state.zones;

    // Clear existing (but keep placeholder)
    const placeholderStart = startSelect.firstElementChild;
    const placeholderEnd = endSelect.firstElementChild;
    startSelect.innerHTML = '';
    endSelect.innerHTML = '';
    if (placeholderStart) startSelect.appendChild(placeholderStart);
    if (placeholderEnd) endSelect.appendChild(placeholderEnd);

    zones.forEach(zone => {
      const optStart = document.createElement('option');
      optStart.value = zone.id;
      optStart.textContent = zone.name;
      startSelect.appendChild(optStart);

      const optEnd = document.createElement('option');
      optEnd.value = zone.id;
      optEnd.textContent = zone.name;
      endSelect.appendChild(optEnd);
    });
  }

  function validateRouteSelection() {
    const start = document.getElementById('route-start').value;
    const end = document.getElementById('route-end').value;
    const btn = document.getElementById('find-route-btn');

    if (start && end && start === end) {
      ui.showAlert('Start and destination cannot be the same');
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
    } else {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    }
  }

  document.getElementById('route-start')?.addEventListener('change', validateRouteSelection);
  document.getElementById('route-end')?.addEventListener('change', validateRouteSelection);

  // Initial population
  populateRouteDropdowns();

  // ── Alert Toasts
  // ── Alert Toasts (Moved to UIController)


  // ── AI Primary Recommendation (Proactive)
  function updateAIRecommendation(state) {
    const zones = state.zones;
    const analysis = CongestionPredictor.getTrendAnalysis(state.historicalDensity);
    const sorted = [...zones].sort((a, b) => a.density - b.density);
    const bestZone = sorted[0];
    const worstZone = sorted[sorted.length - 1];

    ui.updateAIRecommendation(analysis, bestZone, worstZone);
  }

  // ── Smart Suggestions (Proactive)
  function updateSmartSuggestions(state) {
    const analysis = CongestionPredictor.getTrendAnalysis(state.historicalDensity);
    const bestWait = waitTimes.getShortestWait();
    const sorted = [...state.zones].sort((a, b) => b.density - a.density);
    const worstZone = sorted[0];

    const items = [
      bestWait
        ? { icon: '⏳', text: `${bestWait.name}: ${bestWait.time}m wait` }
        : null,
      (analysis.isIncreasing)
        ? { icon: '⚠️', text: `Proactive: ${analysis.message}` }
        : { icon: '✅', text: `Status: ${analysis.message}` },
      (worstZone && worstZone.density > 0.7)
        ? { icon: '🚫', text: `Avoid ${worstZone.name} (Predicted High)` }
        : { icon: '✨', text: 'Flow is currently optimal' },
    ];
    ui.updateSmartSuggestions(items);
  }

  updateSmartSuggestions(simulator.state);

  // ── Emergency Evacuation Mode
  const emergencyBtn = document.getElementById('btn-emergency');
  emergencyBtn?.addEventListener('click', () => {
    scenarioManager.setScenario(scenarioManager.emergencyActive ? 'normal' : 'emergency');
  });

  // ── Advanced Google Services Integration (Remote Config polling)
  async function checkCloudOverrides() {
    const overrideStatus = await firebaseService.fetchEmergencyOverride();
    if (overrideStatus && !scenarioManager.emergencyActive) {
      console.log('🚨 Cloud Override detected! Transitioning to Emergency Mode.');
      scenarioManager.setScenario('emergency');
    } else if (!overrideStatus && scenarioManager.emergencyActive) {
      console.log('🛡️ Cloud Override cleared. Returning to Normal Mode.');
      scenarioManager.setScenario('normal');
    }
  }

  // Poll cloud configuration every 30 seconds
  setInterval(checkCloudOverrides, 30000);
  checkCloudOverrides();

  // System Status initialization
  const updateSystemStatus = () => {
    const vertexPill = document.getElementById('status-vertex-pill');
    if (vertexPill) {
      const dot = vertexPill.querySelector('.dot');
      dot.className = USE_VERTEX ? 'dot green' : 'dot grey';
      vertexPill.innerHTML = `<span class="${dot.className}"></span> Vertex AI: ${USE_VERTEX ? 'ON' : 'OFF'}`;
    }
    const predDot = document.getElementById('status-predictor');
    if (predDot) predDot.className = 'dot green';
  };
  updateSystemStatus();

  // Scenario Selector
  document.getElementById('scenario-selector')?.addEventListener('change', (e) => {
    scenarioManager.setScenario(e.target.value);
  });

  // Staff Mode Toggle
  document.getElementById('staff-mode-toggle')?.addEventListener('change', (e) => {
    ui.setTacticalView(e.target.checked);
    updateAIRecommendation(simulator.state);
  });

  // Demo Mode
  document.getElementById('btn-run-demo')?.addEventListener('click', (e) => {
    scenarioManager.runDemo(e.target, document.getElementById('scenario-selector'));
  });

  // Helper: Route Explanation (Task 4)
  function updateRouteExplanation(pathIds) {
    const el = document.getElementById('route-explanation');
    const txt = document.getElementById('route-explanation-text');
    if (!el || !txt) return;

    const analysis = CongestionPredictor.getTrendAnalysis(simulator.state.historicalDensity);
    const zones = simulator.state.zones;
    const pathZones = pathIds.filter(id => routing.nodes[id].isZone);
    const isEmergency = simulator.mode === 'emergency';

    let msg = "Optimal route identified through low-density zones for a smoother experience.";
    
    if (isEmergency) {
      msg = "Safety-first routing prioritized; bypassing interior congestion and steering toward confirmed exits.";
    } else if (pathZones.some(id => (zones.find(z => z.id === id)?.density || 0) > 0.7)) {
      msg = "Direct route selected. Balances transit distance with current crowd levels for efficiency.";
    } else if (analysis.isIncreasing) {
      msg = "Route selected to proactively avoid zones with rapidly increasing crowd density.";
    }

    txt.textContent = msg;
    el.classList.remove('hidden');
  }

  // Helper: Route Metrics (Task 5)
  function updateRouteMetrics(calcTime, pathIds) {
    const panel = document.getElementById('route-metrics');
    if (!panel) return;

    document.getElementById('metric-route-time').textContent = `${calcTime.toFixed(1)}ms`;
    
    const analysis = CongestionPredictor.getTrendAnalysis(simulator.state.historicalDensity);
    document.getElementById('metric-confidence').textContent = `${(analysis.confidence * 100).toFixed(0)}%`;

    const highDensityZones = simulator.state.zones.filter(z => z.density > 0.6);
    const avoidedCount = highDensityZones.filter(z => !pathIds.includes(z.id)).length;
    document.getElementById('metric-zones-skip').textContent = avoidedCount;

    panel.classList.remove('hidden');
  }

  // ── Final Startup Sync
  populateRouteDropdowns();
});
