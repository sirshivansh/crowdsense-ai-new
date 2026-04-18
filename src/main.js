import { simulator } from './simulation/simulator.js';
import { Heatmap } from './components/Heatmap.js';
import { Routing } from './components/Routing.js';
import { Flow } from './components/Flow.js';
import { WaitTimes } from './components/WaitTimes.js';
import { Chatbot } from './components/Chatbot.js';
import { CongestionPredictor } from './ai/predictor.js';
import { firebaseService } from './services/firebaseService.js';
import { routeCache } from './utils/cache.js';

document.addEventListener('DOMContentLoaded', () => {
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

  // ── Simulator event bindings
  // EVENT-DRIVEN ARCHITECTURE: the simulator emits events on a fixed cadence
  // (3s heatmap, 5s wait times, 8s alerts). Each listener triggers a cascade:
  //   simulator → AI predictor → routing weight recalc → Firebase persistence
  // This decoupled pipeline ensures no component depends on another's internals.
  simulator.on('update:heatmap', async (zones) => {
    heatmap.update(zones);
    updateAIRecommendation(simulator.state);
    updateSmartSuggestions(simulator.state);

    // 🚀 Production Firebase Integration
    firebaseService.saveCrowdData(zones);
    console.log("📡 Crowd data sent to Firebase:", zones);
    firebaseService.triggerAlertIfHighDensity(zones);
  });

  simulator.on('update:predictions', async (history) => {
    // Uses Vertex AI when USE_VERTEX flag is enabled, otherwise local WRC engine
    const analysis = await CongestionPredictor.getAnalysis(history, simulator.state.zones);
    if (analysis.isIncreasing && analysis.confidence > 0.6) {
      firebaseService.logPrediction(analysis);
      console.log("🧠 Prediction logged:", analysis);
    }
  });

  simulator.on('update:waitTimes', (times) => {
    waitTimes.update(times);
    updateAIRecommendation(simulator.state);
    updateSmartSuggestions(simulator.state);
  });

  simulator.on('alert', (msg) => {
    showAlertBanner(msg);

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
      showAlertBanner('Please select both origin and destination.');
      return;
    }

    if (start === end) {
      showAlertBanner('Start and destination cannot be the same');
      return;
    }

    if (!routingMode) enableRouteMode();
    const meta = routing.showRoute(start, end);
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
      showAlertBanner('Start and destination cannot be the same');
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
  function showAlertBanner(msg) {
    const container = document.getElementById('alert-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'alert-toast';
    toast.innerHTML = `
      <span class="alert-icon">⚠️</span>
      <span class="alert-message">${msg}</span>
      <button class="close-btn">✕</button>
    `;
    container.appendChild(toast);

    let removed = false;
    const removeToast = () => {
      if (removed) return;
      removed = true;
      toast.classList.add('removing');
      setTimeout(() => { if (container.contains(toast)) container.removeChild(toast); }, 250);
    };

    toast.querySelector('.close-btn').addEventListener('click', removeToast);
    setTimeout(removeToast, 5000);
  }

  // ── AI Primary Recommendation (Proactive)
  function updateAIRecommendation(state) {
    const card = document.getElementById('ai-recommendation');
    const actionEl = document.getElementById('ai-action');
    const reasonEl = document.getElementById('ai-reason');
    if (!card || !actionEl || !reasonEl) return;

    const zones = state.zones;
    const analysis = CongestionPredictor.getTrendAnalysis(state.historicalDensity);

    const bestZone = [...zones].sort((a, b) => a.density - b.density)[0];
    const worstZone = [...zones].sort((a, b) => b.density - a.density)[0];

    let newAction = `Head to ${bestZone.name}`;
    let newReason = `Current optimal path identified. ${analysis.message}`;

    if (analysis.isIncreasing) {
      newAction = `Proactive Move: ${bestZone.name}`;
      newReason = `Congestion building fast. Avoid ${worstZone.name} now.`;
    }

    if (actionEl.textContent !== newAction || reasonEl.textContent !== newReason) {
      card.classList.add('ai-updating');
      requestAnimationFrame(() => {
        actionEl.textContent = newAction;
        reasonEl.textContent = newReason;
        setTimeout(() => card.classList.remove('ai-updating'), 350);
      });
    }
  }

  // ── Smart Suggestions (Proactive)
  const SUGGESTION_IDS = ['sug-0', 'sug-1', 'sug-2'];

  function initSuggestionNodes() {
    const container = document.getElementById('suggestion-list-container');
    if (!container) return;
    container.innerHTML = '';
    SUGGESTION_IDS.forEach(id => {
      const li = document.createElement('li');
      li.id = id;
      li.className = 'sug-item';
      li.innerHTML = '<span class="suggestion-icon"></span><span class="sug-text"></span>';
      container.appendChild(li);
    });
  }

  function updateSmartSuggestions(state) {
    const analysis = CongestionPredictor.getTrendAnalysis(state.historicalDensity);
    const bestWait = [...state.waitTimes].sort((a, b) => a.time - b.time)[0];
    const worstZone = [...state.zones].sort((a, b) => b.density - a.density)[0];

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

    SUGGESTION_IDS.forEach((id, i) => {
      const li = document.getElementById(id);
      if (!li) return;
      const item = items[i];
      const iconEl = li.querySelector('.suggestion-icon');
      const textEl = li.querySelector('.sug-text');
      if (!item) {
        li.style.opacity = '0';
        li.style.pointerEvents = 'none';
        return;
      }
      const newText = item.text;
      if (textEl.textContent !== newText) {
        li.classList.add('sug-updating');
        requestAnimationFrame(() => {
          iconEl.textContent = item.icon;
          textEl.textContent = newText;
          li.style.opacity = '1';
          li.style.pointerEvents = '';
          setTimeout(() => li.classList.remove('sug-updating'), 200);
        });
      }
    });
  }

  initSuggestionNodes();
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

    // 4. Update button state
    emergencyBtn.textContent = emergencyActive ? '✅ End Emergency' : '🚨 Emergency Mode';
    emergencyBtn.classList.toggle('emergency-active', emergencyActive);
    document.body.classList.toggle('emergency-mode', emergencyActive);
    
    // Toggle UI Banner
    const banner = document.getElementById('emergency-banner');
    if (banner) banner.classList.toggle('hidden', !emergencyActive);

    const logMsg = emergencyActive ? "🚨 Emergency Mode Activated" : "ℹ️ Normal Mode Restored";
    console.log(logMsg);
    console.log(`[Emergency] Mode switched to: ${scenario}`);
  });
});
