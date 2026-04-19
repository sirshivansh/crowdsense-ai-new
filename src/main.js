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
  const updateMetrics = (zones) => {
    const avgDensity = zones.reduce((sum, z) => sum + z.density, 0) / zones.length;
    const safetyPct = Math.round((1 - avgDensity) * 100);
    ui.updateMetrics(simulator.state.attendance, safetyPct);
  };

  // Initial UI state
  ui.setStatusPill('vertex', USE_VERTEX);
  ui.setStatusPill('firebase', !!firebaseService.db);
  updateMetrics(simulator.state.zones);
  updateAIRecommendation(simulator.state);

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

    // 🚀 Production Firebase Integration
    firebaseService.saveCrowdData(zones);
    Logger.info("Crowd data sent to Firebase", zones);
    firebaseService.triggerAlertIfHighDensity(zones);
  });

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
  let emergencyActive = false;

  emergencyBtn?.addEventListener('click', () => {
    emergencyActive = !emergencyActive;
    const scenario = emergencyActive ? 'emergency' : 'normal';

    // 1. Switch simulator scenario (spikes densities, blocks zones, fires alerts)
    simulator.simulateScenario(scenario);

    // 2. Invalidate route cache — weights have changed
    routeCache.clear();

    // 3. Log to Firebase — structured analytics + prediction audit
    if (emergencyActive) {
      firebaseService.logPrediction({
        type: 'emergency',
        message: 'Evacuation mode triggered by operator',
        confidence: 1.0,
      });
      firebaseService.triggerAlertIfHighDensity(simulator.state.zones, 0.7);
      firebaseService.logSystemEvent({
        type: 'emergency',
        metadata: { action: 'activated', blockedZones: [...simulator.blockedZones] }
      });
    } else {
      firebaseService.logSystemEvent({
        type: 'emergency',
        metadata: { action: 'deactivated' }
      });
    }

    // 4. Update UI
    ui.setEmergencyUI(emergencyActive);

    // Google Analytics: track emergency mode toggle
    firebaseService.logAnalyticsEvent('emergency_mode_toggled', {
      active: emergencyActive,
      scenario,
    });

    console.log(`[Emergency] Mode switched to: ${scenario}`);

    // [New] Google Cloud Storage Integration: Archive system state on emergency
    if (emergencyActive) {
      firebaseService.uploadSystemSnapshot('emergency_mode', {
        ...simulator.state,
        blockedZones: [...simulator.blockedZones]
      });
    }
  });

  // ── Advanced Google Services Integration (Remote Config polling)
  /**
   * Periodically checks Firebase Remote Config for administrative overrides.
   * If 'emergency_override' is set to true in the console, the app will
   * automatically transition to Emergency Mode globally.
   */
  async function checkCloudOverrides() {
    const overrideStatus = await firebaseService.fetchEmergencyOverride();
    
    // Only trigger if cloud state out of sync with current local state
    if (overrideStatus && !emergencyActive) {
      console.log('🚨 Cloud Override detected! Transitioning to Emergency Mode.');
      emergencyBtn?.click(); 
    } else if (!overrideStatus && emergencyActive) {
      // Opt-out: cloud can also clear local emergency mode
      console.log('🛡️ Cloud Override cleared. Returning to Normal Mode.');
      emergencyBtn?.click();
    }
  }

  // Poll cloud configuration every 30 seconds
  setInterval(checkCloudOverrides, 30000);
  checkCloudOverrides(); // Initial check

  // ── NEW: Demo & Status Glue Logic (Tasks 1, 2, 3, 4, 5)

  // System Status initialization (Task 3)
  const updateSystemStatus = () => {
    const vertexPill = document.getElementById('status-vertex-pill');
    if (vertexPill) {
      const dot = vertexPill.querySelector('.dot');
      dot.className = USE_VERTEX ? 'dot green' : 'dot grey';
      vertexPill.innerHTML = `<span class="${dot.className}"></span> Vertex AI: ${USE_VERTEX ? 'ON' : 'OFF'}`;
    }
    const predDot = document.getElementById('status-predictor');
    if (predDot) predDot.className = 'dot green'; // Keep it green as it runs locally/vertex
  };
  updateSystemStatus();

  // Scenario Selector (Task 2)
  document.getElementById('scenario-selector')?.addEventListener('change', (e) => {
    const scenario = e.target.value;
    if (scenario === 'emergency') {
      if (!emergencyActive) emergencyBtn?.click();
    } else if (scenario === 'peak') {
      // Simulate peak crowd manually by spiking densities
      simulator.state.zones.forEach(z => z.density = Math.min(0.95, z.density + 0.45));
      simulator.emit('update:heatmap', simulator.state.zones);
      if (emergencyActive) emergencyBtn?.click();
    } else {
      if (emergencyActive) emergencyBtn?.click();
      simulator.simulateScenario('normal');
    }
  });

  // Staff Mode Toggle (Task: Perfect Alignment)
  document.getElementById('staff-mode-toggle')?.addEventListener('change', (e) => {
    const isStaff = e.target.checked;
    ui.setTacticalView(isStaff);
    
    // Immediate refresh of recommendations with extra fidelity
    updateAIRecommendation(simulator.state);
  });

  // Demo Mode (Task 1)
  const runDemo = async () => {
    const demoBtn = document.getElementById('btn-run-demo');
    const selector = document.getElementById('scenario-selector');
    if (!demoBtn || demoBtn.disabled) return;

    demoBtn.disabled = true;
    const originalText = demoBtn.textContent;
    
    // Step 1: Normal
    selector.value = 'normal';
    selector.dispatchEvent(new Event('change'));
    demoBtn.textContent = '⏱ Normal Flow (3s)';
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Peak
    selector.value = 'peak';
    selector.dispatchEvent(new Event('change'));
    demoBtn.textContent = '⏱ Peak Crowd (4s)';
    await new Promise(r => setTimeout(r, 4000));

    // Step 3: Emergency
    selector.value = 'emergency';
    selector.dispatchEvent(new Event('change'));
    demoBtn.textContent = '⏱ Emergency (5s)';
    await new Promise(r => setTimeout(r, 5000));

    // End Demo
    selector.value = 'normal';
    selector.dispatchEvent(new Event('change'));
    demoBtn.disabled = false;
    demoBtn.textContent = originalText;
  };

  document.getElementById('btn-run-demo')?.addEventListener('click', runDemo);

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
});
