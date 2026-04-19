/**
 * DataSimulator - High-fidelity crowd density and event simulator.
 * Emits telemetry events for heatmap, wait-times, and AI predictions.
 */
class DataSimulator {
  constructor() {
    /** @type {Object.<string, Function[]>} */
    this.listeners = {};
    /** @type {'normal'|'emergency'} */
    this.mode = 'normal';
    /** @type {Set<string>} */
    this.blockedZones = new Set();
    
    /** @type {Object} */
    this.state = {
      attendance: 54200,
      zones: [
        { id: 'gate_a', name: 'Gate A', density: 0.3, x: 10, y: 50 },
        { id: 'gate_b', name: 'Gate B', density: 0.2, x: 90, y: 50 },
        { id: 'section_101', name: 'Section 101', density: 0.8, x: 30, y: 30 },
        { id: 'section_205', name: 'Section 205', density: 0.5, x: 70, y: 30 },
        { id: 'food_court', name: 'Main Food Court', density: 0.9, x: 50, y: 80 },
        { id: 'restroom_north', name: 'North Restrooms', density: 0.6, x: 50, y: 20 },
      ],
      waitTimes: [
        { id: 'food', name: 'Burger Stand 1', time: 15 },
        { id: 'rest', name: 'Restroom North', time: 5 },
        { id: 'merch', name: 'Merch Tent A', time: 25 },
      ],
      historicalDensity: Array(10).fill(0.4).map(() => Math.random() * 0.4 + 0.3)
    };

    /** @type {NodeJS.Timeout[]} */
    this._intervals = [];
    this.startSimulation();
  }

  /**
   * Switches the simulator into a named scenario.
   * @param {'normal'|'emergency'} scenario 
   */
  simulateScenario(scenario) {
    if (!['normal', 'emergency'].includes(scenario)) return;
    this.mode = scenario;

    if (scenario === 'emergency') {
      this.state.zones.forEach(zone => {
        zone.density = Math.min(1.0, zone.density + 0.3 + Math.random() * 0.2);
      });

      this.blockedZones.clear();
      this.blockedZones.add('food_court');
      this.blockedZones.add('restroom_north');

      this.emit('update:heatmap', this.state.zones);
      this.emit('alert', '🚨 EMERGENCY EVACUATION — proceed to nearest exit now');
      
      this.state.zones.forEach(z => {
        if (z.density > 0.85) this.emit('alert', `Critical density at ${z.name}`);
      });
    } else {
      this.blockedZones.clear();
      this.emit('update:heatmap', this.state.zones);
    }
  }

  /**
   * @param {string} event 
   * @param {Function} callback 
   */
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  /**
   * @param {string} event 
   * @param {any} data 
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error(`[Event: ${event}] Handler failure`, e); }
      });
    }
  }

  startSimulation() {
    this._intervals.push(setInterval(() => {
      this.state.zones.forEach(zone => {
        let change = (Math.random() - 0.5) * 0.2;
        zone.density = Math.max(0.1, Math.min(1.0, zone.density + change));
      });
      this.emit('update:heatmap', this.state.zones);

      const avg = this.state.zones.reduce((sum, z) => sum + z.density, 0) / this.state.zones.length;
      this.state.historicalDensity.shift();
      this.state.historicalDensity.push(avg);
      this.emit('update:predictions', this.state.historicalDensity);
    }, 3000));

    this._intervals.push(setInterval(() => {
      this.state.waitTimes.forEach(item => {
        let change = Math.floor((Math.random() - 0.5) * 3);
        item.time = Math.max(0, Math.min(45, item.time + change));
      });
      this.emit('update:waitTimes', this.state.waitTimes);
    }, 5000));
  }
}

export const simulator = new DataSimulator();
export default simulator;
