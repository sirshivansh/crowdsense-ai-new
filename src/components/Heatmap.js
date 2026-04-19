import { simulator } from '../simulation/simulator.js';
import { CongestionPredictor } from '../ai/predictor.js';

export class Heatmap {
  constructor(layerId) {
    this.layer = document.getElementById(layerId);
    this.elements = {};
    
    // Tooltip elements
    this.tooltip = document.getElementById('zone-tooltip');
    this.ttTitle = document.getElementById('tt-title');
    this.ttDensity = document.getElementById('tt-density');
    this.ttWaitMsg = document.getElementById('tt-wait');
    this.ttWaitContainer = document.getElementById('tt-wait-container');
    this.ttSuggestion = document.getElementById('tt-suggestion');

    // Details Panel elements
    this.sidebar = document.getElementById('zone-details-sidebar');
    this.zdTitle = document.getElementById('zd-title');
    this.zdDensity = document.getElementById('zd-density');
    this.zdWaitContainer = document.getElementById('zd-wait-container');
    this.zdWait = document.getElementById('zd-wait');
    this.zdTrend = document.getElementById('zd-trend');
    this.zdSuggestion = document.getElementById('zd-suggestion');
    this.zdClose = document.getElementById('zd-close-btn');
    this.mapContainer = document.querySelector('.stadium-container');
    
    this.activeZoneId = null;

    if (this.zdClose) {
      this.zdClose.addEventListener('click', () => this.closeSidebar());
    }
  }

  getColorForDensity(density) {
    if (density < 0.4)  return '#22c55e';
    if (density < 0.75) return '#eab308';
    return '#ef4444';
  }

  update(zones) {
    if (!this.layer) return;

    zones.forEach(zone => {
      let el = this.elements[zone.id];
      if (!el) {
        el = document.getElementById(`zone-${zone.id}`);
        this.elements[zone.id] = el;
        if (el && this.tooltip) {
          el.addEventListener('mousemove', (e) => this.showTooltip(e, zone.id));
          el.addEventListener('mouseleave', () => this.hideTooltip());
          el.addEventListener('click', () => this.openSidebar(zone.id));
        }
      }
      if (!el) return;

      const isProactivelyCongested = CongestionPredictor.predictProactiveCongestion(zone, simulator.state.historicalDensity);
      
      // Clear previous tactical states
      el.classList.remove('risky-zone', 'critical-density', 'warning-density');

      if (isProactivelyCongested) {
        el.classList.add('risky-zone');
      }

      // [New] Tactical HUD Alerts
      if (zone.density > 0.8) {
        el.classList.add('critical-density');
      } else if (zone.density > 0.6) {
        el.classList.add('warning-density');
      }

      const color = this.getColorForDensity(zone.density);
      el.style.fill = color;

      const opacity = 0.18 + (zone.density * 0.65);
      el.style.fillOpacity = Math.min(opacity, 0.88);
      el.style.transition = 'fill 1.5s ease, fill-opacity 1.2s ease';

      if (this.activeZoneId === zone.id && !this.sidebar.classList.contains('hidden')) {
        this.updateSidebarData(zone);
      }
    });
  }

  showTooltip(e, zoneId) {
    const state = simulator.state;
    const zone = state.zones.find(z => z.id === zoneId);
    if (!zone) return;

    this.ttTitle.textContent = zone.name;
    this.ttDensity.textContent = `${Math.round(zone.density * 100)}%`;
    
    this.ttWaitContainer.classList.add('hidden');
    if (zone.id === 'food_court' || zone.id === 'restroom_north') {
      const wtId = zone.id === 'food_court' ? 'food' : 'rest';
      const wt = state.waitTimes.find(w => w.id === wtId);
      if (wt) {
        this.ttWaitMsg.textContent = `${wt.time} mins`;
        this.ttWaitContainer.classList.remove('hidden');
      }
    }

    // NEW: Deep Prediction Integration
    const analysis = CongestionPredictor.getTrendAnalysis(state.historicalDensity);
    const confidenceLabel = CongestionPredictor.getConfidenceLabel(analysis.confidence);

    if (zone.density > 0.8 || (analysis.isIncreasing && zone.density > 0.5)) {
      this.ttSuggestion.innerHTML = `⚠️ High congestion expected in ${zone.name}<br/>
                                     <small>Confidence: ${confidenceLabel} (${Math.round(analysis.confidence * 100)}%)</small>`;
      this.ttSuggestion.style.color = 'var(--red)';
    } else {
      this.ttSuggestion.textContent = analysis.message;
      this.ttSuggestion.style.color = analysis.isIncreasing ? 'var(--yellow)' : 'var(--green)';
    }

    this.tooltip.classList.remove('hidden');
    this.tooltip.style.left = `${e.pageX}px`;
    this.tooltip.style.top = `${e.pageY - 15}px`;
  }

  hideTooltip() {
    if (this.tooltip) this.tooltip.classList.add('hidden');
  }

  openSidebar(zoneId) {
    this.activeZoneId = zoneId;
    this.sidebar.classList.remove('hidden');
    this.mapContainer.classList.add('dimmed-mode');
    
    Object.values(this.elements).forEach(el => el.classList.remove('active'));
    if (this.elements[zoneId]) this.elements[zoneId].classList.add('active');

    const state = simulator.state;
    const zone = state.zones.find(z => z.id === zoneId);
    if (zone) this.updateSidebarData(zone, state);
  }

  closeSidebar() {
    this.sidebar.classList.add('hidden');
    this.mapContainer.classList.remove('dimmed-mode');
    this.activeZoneId = null;
    Object.values(this.elements).forEach(el => el.classList.remove('active'));
  }

  updateSidebarData(zone, stateObj) {
    const state = stateObj || simulator.state;
    const analysis = CongestionPredictor.getTrendAnalysis(state.historicalDensity);
    const confidenceLabel = CongestionPredictor.getConfidenceLabel(analysis.confidence);
    
    this.zdTitle.textContent = zone.name;
    const pct = Math.round(zone.density * 100);
    this.zdDensity.textContent = `${pct}%`;
    this.zdDensity.className = zone.density > 0.75 ? 'text-danger' : (zone.density > 0.4 ? 'text-warning' : 'text-success');

    this.zdTrend.style.width = `${pct}%`;
    this.zdTrend.style.background = zone.density > 0.75 ? 'var(--red)' : (zone.density > 0.4 ? 'var(--yellow)' : 'var(--green)');

    this.zdWaitContainer.style.display = 'none';
    if (zone.id === 'food_court' || zone.id === 'restroom_north') {
      const wtId = zone.id === 'food_court' ? 'food' : 'rest';
      const wt = state.waitTimes.find(w => w.id === wtId);
      if (wt) {
        this.zdWaitContainer.style.display = 'flex';
        this.zdWait.textContent = `${wt.time} mins`;
      }
    }

    if (analysis.isIncreasing && zone.density > 0.5) {
      this.zdSuggestion.innerHTML = `<strong>Critical Alert:</strong> Congestion expected within 10 mins.<br/>Confidence: ${confidenceLabel}`;
    } else {
      this.zdSuggestion.textContent = analysis.message;
    }
  }
}
