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
    // Muted SaaS palette — no neon
    if (density < 0.4)  return '#22c55e'; // muted green
    if (density < 0.75) return '#eab308'; // soft amber
    return '#ef4444';                     // subdued red
  }

  getScaleForDensity(density) {
    return 50 + (density * 100);
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

      if (zone.density >= 0.85) {
        el.classList.add('risky-zone');
      } else {
        el.classList.remove('risky-zone');
      }

      const color = this.getColorForDensity(zone.density);
      el.style.fill = color;

      // Opacity-based congestion: subtle at low density, stronger at high
      // Avoids harsh saturated blocks — looks professional
      const opacity = 0.18 + (zone.density * 0.65);
      el.style.fillOpacity = Math.min(opacity, 0.88);
      el.style.transition = 'fill 1.5s ease, fill-opacity 1.2s ease';

      if (this.activeZoneId === zone.id && !this.sidebar.classList.contains('hidden')) {
        this.updateSidebarData(zone);
      }
    });
  }

  showTooltip(e, zoneId) {
    // Determine the dynamic state from simulator
    // Since Heatmap doesn't store the full state, we can dynamically pull it from simulator or just the last updated zones.
    // However, it's better to get the exact up to date zone.
    import('../data/simulation.js').then(({ simulator }) => {
      const state = simulator.state;
      const zone = state.zones.find(z => z.id === zoneId);
      if (!zone) return;

      this.ttTitle.textContent = zone.name;
      this.ttDensity.textContent = `${Math.round(zone.density * 100)}%`;
      
      // Map wait times if applicable
      this.ttWaitContainer.classList.add('hidden');
      if (zone.id === 'food_court') {
        const wt = state.waitTimes.find(w => w.id === 'food');
        if (wt) {
          this.ttWaitMsg.textContent = `${wt.time} mins`;
          this.ttWaitContainer.classList.remove('hidden');
        }
      } else if (zone.id === 'restroom_north') {
         const wt = state.waitTimes.find(w => w.id === 'rest');
        if (wt) {
          this.ttWaitMsg.textContent = `${wt.time} mins`;
          this.ttWaitContainer.classList.remove('hidden');
        }
      }

      // Suggestion text colour
      if (zone.density > 0.8) {
        this.ttSuggestion.textContent = 'High congestion. Use an alternate route.';
        this.ttSuggestion.style.color = 'var(--red)';
      } else if (zone.density < 0.4) {
        this.ttSuggestion.textContent = 'Clear path. Good time to move.';
        this.ttSuggestion.style.color = 'var(--green)';
      } else {
        this.ttSuggestion.textContent = 'Moderate traffic. Proceed normally.';
        this.ttSuggestion.style.color = 'var(--yellow)';
      }

      // Update position
      this.tooltip.classList.remove('hidden');
      this.tooltip.style.left = `${e.pageX}px`;
      this.tooltip.style.top = `${e.pageY - 15}px`;
    });
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

    import('../data/simulation.js').then(({ simulator }) => {
      const state = simulator.state;
      const zone = state.zones.find(z => z.id === zoneId);
      if (zone) this.updateSidebarData(zone, state);
    });
  }

  closeSidebar() {
    this.sidebar.classList.add('hidden');
    this.mapContainer.classList.remove('dimmed-mode');
    this.activeZoneId = null;
    Object.values(this.elements).forEach(el => el.classList.remove('active'));
  }

  updateSidebarData(zone, stateObj) {
    const doUpdate = (state) => {
      this.zdTitle.textContent = zone.name;
      const pct = Math.round(zone.density * 100);
      this.zdDensity.textContent = `${pct}%`;
      this.zdDensity.className = zone.density > 0.75 ? 'text-danger' : (zone.density > 0.4 ? 'text-warning' : 'text-success');

      // Trend bar logic
      this.zdTrend.style.width = `${pct}%`;
      this.zdTrend.style.background = zone.density > 0.75
        ? 'var(--red)'
        : (zone.density > 0.4 ? 'var(--yellow)' : 'var(--green)');

      this.zdWaitContainer.style.display = 'none';
      if (zone.id === 'food_court' || zone.id === 'restroom_north') {
        const wtId = zone.id === 'food_court' ? 'food' : 'rest';
        const wt = state.waitTimes.find(w => w.id === wtId);
        if (wt) {
          this.zdWaitContainer.style.display = 'flex';
          this.zdWait.textContent = `${wt.time} mins`;
        }
      }

      if (zone.density > 0.8) this.zdSuggestion.textContent = "Critical density reached. Operations evaluating bypasses.";
      else if (zone.density > 0.5) this.zdSuggestion.textContent = "Traffic flowing moderately. Standard queue speeds apply.";
      else this.zdSuggestion.textContent = "Zone is below average capacity. Efficient entry/exit lines.";
    };

    if (stateObj) {
      doUpdate(stateObj);
    } else {
      import('../data/simulation.js').then(({ simulator }) => doUpdate(simulator.state));
    }
  }
}
