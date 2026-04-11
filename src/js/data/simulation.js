// Basic event emitter pattern for our simulator
class DataSimulator {
  constructor() {
    this.listeners = {};
    
    // Initial State
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
        { id: 'food', name: 'Burger Stand 1', time: 15 }, // minutes
        { id: 'rest', name: 'Restroom North', time: 5 },
        { id: 'merch', name: 'Merch Tent A', time: 25 },
      ],
      historicalDensity: Array(10).fill(0.4).map(() => Math.random() * 0.4 + 0.3)
    };

    this.startSimulation();
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  startSimulation() {
    // Update zones every 3 seconds
    setInterval(() => {
      this.state.zones.forEach(zone => {
        // Random walk for densities between 0.1 and 1.0
        let change = (Math.random() - 0.5) * 0.2;
        zone.density = Math.max(0.1, Math.min(1.0, zone.density + change));
      });
      this.emit('update:heatmap', this.state.zones);

      // Recalculate average historic density for chart prediction
      const avgDensity = this.state.zones.reduce((sum, z) => sum + z.density, 0) / this.state.zones.length;
      this.state.historicalDensity.shift();
      this.state.historicalDensity.push(avgDensity);
      this.emit('update:predictions', this.state.historicalDensity);

    }, 3000);

    // Update wait times every 5 seconds
    setInterval(() => {
      this.state.waitTimes.forEach(item => {
        let change = Math.floor((Math.random() - 0.5) * 3);
        item.time = Math.max(0, Math.min(45, item.time + change));
      });
      this.emit('update:waitTimes', this.state.waitTimes);
    }, 5000);
    
    // Simulate alerts occasionally
    setInterval(() => {
      if (Math.random() > 0.7) {
        const congestedZone = this.state.zones.find(z => z.density > 0.85);
        if (congestedZone) {
          this.emit('alert', `High congestion detected at ${congestedZone.name}`);
        }
      }
    }, 8000);
  }
}

export const simulator = new DataSimulator();
