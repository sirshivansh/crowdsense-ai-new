import { simulator } from './data/simulation.js';
import { Heatmap } from './components/Heatmap.js';
import { Routing } from './components/Routing.js';
import { Flow } from './components/Flow.js';
import { WaitTimes } from './components/WaitTimes.js';
import { Chatbot } from './components/Chatbot.js';

document.addEventListener('DOMContentLoaded', () => {
  // ── Bootstrap components
  const heatmap  = new Heatmap('heatmap-layer');
  const routing  = new Routing('route-layer');
  const flow     = new Flow('flow-layer', routing);
  const waitTimes = new WaitTimes('wait-list-container');
  const chatbot  = new Chatbot();

  // ── Initial paint
  heatmap.update(simulator.state.zones);
  waitTimes.update(simulator.state.waitTimes);
  updateAIRecommendation(simulator.state);

  // ── Simulator bindings
  simulator.on('update:heatmap', (zones) => {
    heatmap.update(zones);
    updateAIRecommendation(simulator.state);
    updateSmartSuggestions(simulator.state);
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
  const btnHeatmap    = document.getElementById('btn-heatmap');
  const btnRouting    = document.getElementById('btn-routing');
  const badge         = document.getElementById('route-mode-badge');
  const btnClearRoute = document.getElementById('btn-clear-route');
  const findRouteBtn  = document.getElementById('find-route-btn');
  const routeMeta     = document.getElementById('route-meta');
  const mapBackBtn    = document.getElementById('map-back-btn');

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
    const end   = document.getElementById('route-end').value;
    if (!routingMode) enableRouteMode();
    const meta = routing.showRoute(start, end);
    // Show route metadata panel
    if (routeMeta && meta) {
      document.getElementById('route-eta').textContent = `~${meta.minutes} min`;
      routeMeta.classList.remove('hidden');
    }
  });

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

  // ── AI Primary Recommendation — update text in place (no DOM rebuild)
  function updateAIRecommendation(state) {
    const card     = document.getElementById('ai-recommendation');
    const actionEl = document.getElementById('ai-action');
    const reasonEl = document.getElementById('ai-reason');
    if (!card || !actionEl || !reasonEl) return;

    const zones = state.zones;
    const waits = state.waitTimes;
    const bestZone  = [...zones].sort((a, b) => a.density - b.density)[0];
    const bestWait  = [...waits].sort((a, b) => a.time - b.time)[0];
    const worstZone = [...zones].sort((a, b) => b.density - a.density)[0];
    const savedMins = Math.round((worstZone.density - bestZone.density) * 8);

    const newAction = `Use ${bestZone.name} \u2192 ${bestWait.name}`;
    const newReason = savedMins > 0
      ? `Saves ~${savedMins} min \u2014 avoids congestion at ${worstZone.name}`
      : `Current optimal path \u2014 low crowd density detected`;

    // Only animate + write if content actually changed
    if (actionEl.textContent !== newAction || reasonEl.textContent !== newReason) {
      card.classList.add('ai-updating');
      // Small delay so CSS opacity transition is visible
      requestAnimationFrame(() => {
        actionEl.textContent = newAction;
        reasonEl.textContent = newReason;
        setTimeout(() => card.classList.remove('ai-updating'), 350);
      });
    }
  }

  // ── Smart Suggestions — in-place stable update
  // We maintain exactly 3 fixed <li> nodes and update their contents.
  // This prevents any layout shift or flicker from DOM rebuilds.
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
    const bestWait  = [...state.waitTimes].sort((a, b) => a.time - b.time)[0];
    const worstZone = [...state.zones].sort((a, b) => b.density - a.density)[0];
    const clearZone = [...state.zones].sort((a, b) => a.density - b.density)[0];

    const items = [
      bestWait
        ? { icon: '\u23F1', text: `${bestWait.name} \u2014 ${bestWait.time} min wait` }
        : null,
      (worstZone && worstZone.density > 0.68)
        ? { icon: '\u26A0', text: `Avoid ${worstZone.name} \u2014 ${Math.round(worstZone.density * 100)}% capacity` }
        : null,
      (clearZone && clearZone.density < 0.5)
        ? { icon: '\u2713', text: `${clearZone.name} is clear right now` }
        : { icon: '\u25CF', text: 'Analyzing crowd patterns\u2026' },
    ];

    SUGGESTION_IDS.forEach((id, i) => {
      const li = document.getElementById(id);
      if (!li) return;
      const item = items[i];
      const iconEl = li.querySelector('.suggestion-icon');
      const textEl = li.querySelector('.sug-text');
      if (!item) {
        // Hide unused slot without removing it
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

  // Bootstrap suggestion nodes once, then update data
  initSuggestionNodes();
  updateSmartSuggestions(simulator.state);
});

