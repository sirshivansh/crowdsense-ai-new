/**
 * ScenarioManager - Modular control for stadium simulation scenarios.
 * Centralizes the transitions between Normal, Peak, and Emergency states.
 * Orchestrates 'Demo Mode' sequences and UI feedback during state shifts.
 * 
 * Part of the Code Quality enhancement suite to improve project maintainability.
 */
export class ScenarioManager {
  /**
   * @param {Object} simulator - The core simulation engine instance.
   * @param {Object} ui - The central UIController instance.
   * @param {Object} firebaseService - Google Cloud integration layer.
   */
  constructor(simulator, ui, firebaseService) {
    this.simulator = simulator;
    this.ui = ui;
    this.firebaseService = firebaseService;
    this.emergencyActive = false;
    this.demoRunning = false;
  }

  /**
   * Transitions the stadium to a specific crowd scenario.
   * @param {string} type - 'normal', 'peak', or 'emergency'.
   */
  async setScenario(type) {
    console.log(`[ScenarioManager] Transitioning to: ${type}`);
    
    // Clear route caches on major state shift
    if (window.routeCache) window.routeCache.clear();

    if (type === 'emergency') {
      this._handleEmergency(true);
    } else if (type === 'peak') {
      this._handleEmergency(false);
      // Simulate peak crowd manually by spiking densities across all sectors
      this.simulator.state.zones.forEach(z => z.density = Math.min(0.95, z.density + 0.45));
      this.simulator.emit('update:heatmap', this.simulator.state.zones);
    } else {
      this._handleEmergency(false);
      this.simulator.simulateScenario('normal');
    }

    // Google Analytics: track operational mode changes
    this.firebaseService.logAnalyticsEvent('scenario_changed', { type });
  }

  /**
   * Internal handler for Emergency state transitions.
   * Manages simulator state, Firebase snapshotting, and UI vignette overlays.
   * @param {boolean} active 
   */
  _handleEmergency(active) {
    if (this.emergencyActive === active) return;
    this.emergencyActive = active;

    const simulatorScenario = active ? 'emergency' : 'normal';
    this.simulator.simulateScenario(simulatorScenario);
    this.ui.setEmergencyUI(active);

    if (active) {
      // Archive system state for post-incident audit (Google Cloud Storage)
      this.firebaseService.uploadSystemSnapshot('emergency_mode', {
        ...this.simulator.state,
        blockedZones: [...this.simulator.blockedZones]
      });
      this.firebaseService.triggerAlertIfHighDensity(this.simulator.state.zones, 0.7);
    }
    
    this.firebaseService.logSystemEvent({
      type: 'emergency',
      metadata: { action: active ? 'activated' : 'deactivated' }
    });
  }

  /**
   * Runs the 'System Validation' demo sequence.
   * Progressively shifts from Normal -> Peak -> Emergency to verify AI and UI responsiveness.
   * @param {HTMLElement} btn - The demo trigger button for feedback.
   * @param {HTMLElement} selector - The scenario dropdown to sync.
   */
  async runDemo(btn, selector) {
    if (this.demoRunning || !btn) return;
    this.demoRunning = true;
    btn.disabled = true;

    try {
      // Step 1: Normal Flow
      selector.value = 'normal';
      await this.setScenario('normal');
      btn.textContent = '⏱ Normal Flow (3s)';
      await new Promise(r => setTimeout(r, 3000));

      // Step 2: Peak Crowd Pressure
      selector.value = 'peak';
      await this.setScenario('peak');
      btn.textContent = '⏱ Peak Crowd (4s)';
      await new Promise(r => setTimeout(r, 4000));

      // Step 3: Emergency Response
      selector.value = 'emergency';
      await this.setScenario('emergency');
      btn.textContent = '⏱ Emergency Mode (5s)';
      await new Promise(r => setTimeout(r, 5000));

      // Reset to Normal
      selector.value = 'normal';
      await this.setScenario('normal');
      btn.textContent = 'Demo Successful ✅';
    } catch (e) {
      console.error('[ScenarioManager] Demo failure', e);
      btn.textContent = 'Demo Failed ❌';
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = 'Run Demo';
        this.demoRunning = false;
      }, 2000);
    }
  }
}
