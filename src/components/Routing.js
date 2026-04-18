import { simulator } from '../simulation/simulator.js';
import { calculateDijkstraPath } from '../algorithms/dijkstra.js';
import { routeCache } from '../utils/cache.js';
import { CongestionPredictor } from '../ai/predictor.js';

export class Routing {
  constructor(svgLayerId) {
    this.layer = document.getElementById(svgLayerId);
    
    // Core Zones
    this.nodes = {
      'gate_a': { x: 100, y: 300, isZone: true },
      'gate_b': { x: 900, y: 300, isZone: true },
      'section_101': { x: 500, y: 60, isZone: true },
      'section_205': { x: 500, y: 540, isZone: true },
      'food_court': { x: 850, y: 540, isZone: true },
      'restroom_north': { x: 150, y: 60, isZone: true },
      // NavMesh Intermediary nodes (corners wrapping the field)
      'nw_corner': { x: 200, y: 150, isZone: false },
      'sw_corner': { x: 200, y: 450, isZone: false },
      'ne_corner': { x: 800, y: 150, isZone: false },
      'se_corner': { x: 800, y: 450, isZone: false }
    };

    // Connections (Undirected graph edges)
    this.edges = [
      ['gate_a', 'nw_corner'], ['gate_a', 'sw_corner'],
      ['restroom_north', 'nw_corner'], ['restroom_north', 'section_101'],
      ['section_101', 'nw_corner'], ['section_101', 'ne_corner'],
      ['gate_b', 'ne_corner'], ['gate_b', 'se_corner'],
      ['food_court', 'se_corner'], ['food_court', 'section_205'],
      ['section_205', 'sw_corner'], ['section_205', 'se_corner'],
      ['nw_corner', 'sw_corner'], ['nw_corner', 'ne_corner'],
      ['sw_corner', 'se_corner'], ['ne_corner', 'se_corner']
    ];
  }

  getDistance(n1, n2) {
    const dx = this.nodes[n1].x - this.nodes[n2].x;
    const dy = this.nodes[n1].y - this.nodes[n2].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Exit nodes — used during emergency to bias routing toward gates.
  // EMERGENCY WEIGHT STRATEGY: blocked zones receive +50000 (impassable),
  // exit nodes receive -500 (attraction), and all density penalties are
  // multiplied 3× to aggressively steer foot traffic toward gates.
  static EXIT_NODES = new Set(['gate_a', 'gate_b']);

  getWeight(n1, n2) {
    let dist = this.getDistance(n1, n2);
    const state = simulator.state;
    const isEmergency = simulator.mode === 'emergency';
    let penalty = 0;

    // ── Emergency: blocked zones are impassable
    if (isEmergency && simulator.blockedZones.has(n2)) {
      console.log(`[Routing Decision] Zone: ${n2} [BLOCKED]`);
      console.log({
        node: n2,
        isBlocked: true,
        isExit: Routing.EXIT_NODES.has(n2),
        finalWeight: Math.round(dist + 50000),
        mode: "emergency"
      });
      console.log('────────────────────────────────────');
      return dist + 50000;
    }

    // ── Emergency: reward moving toward exits
    if (isEmergency && Routing.EXIT_NODES.has(n2)) {
      penalty -= 500; // negative penalty = preference
    }

    if (this.nodes[n2].isZone) {
      const zData = state.zones.find(z => z.id === n2);
      if (zData) {
        const analysis = CongestionPredictor.getTrendAnalysis(state.historicalDensity);
        const multiplier = isEmergency ? 3 : 1; // 3× aggressive in emergency
        
        // 1. Reactive Penalty (Current Density)
        if (zData.density > 0.8) penalty += 2000 * multiplier;
        else if (zData.density > 0.6) penalty += 500 * multiplier;

        // 2. Proactive Penalty (Predicted Trend)
        if (analysis.isIncreasing) {
          const trendMultiplier = analysis.confidence * 1000;
          penalty += trendMultiplier;
        }

        // ── Structured Decision Logging
        console.log(`[Routing Decision] Zone: ${zData.name}${isEmergency ? ' [EMERGENCY]' : ''}`);
        
        // Detailed log object for developers/audit
        console.log({
          node: n2,
          isBlocked: isEmergency && simulator.blockedZones.has(n2),
          isExit: Routing.EXIT_NODES.has(n2),
          finalWeight: Math.round(dist + penalty),
          mode: isEmergency ? "emergency" : "normal"
        });

        console.log(` - Congestion Predicted: ${analysis.isIncreasing}`);
        console.log(` - Action: ${penalty > 0 ? `Applied +${Math.round(penalty)} weight penalty` : penalty < 0 ? `Exit bonus: ${Math.round(penalty)}` : 'No penalty applied'}`);
        console.log('────────────────────────────────────');
      }
    }
    return dist + penalty;
  }

  calculatePath(startId, endId) {
    // Basic input validation to prevent invalid state propagation
    if (!startId || !endId || typeof startId !== 'string' || typeof endId !== 'string') {
      console.warn('[Routing] Invalid input — startId and endId must be non-empty strings.');
      return [];
    }
    if (!this.nodes[startId] || !this.nodes[endId]) {
      console.warn(`[Routing] Unknown node: ${!this.nodes[startId] ? startId : endId}`);
      return [];
    }

    // Check cache first
    const cached = routeCache.get(startId, endId);
    if (cached) return cached;

    // Performance instrumentation — measure Dijkstra traversal time
    const t0 = performance.now();

    const path = calculateDijkstraPath(
      startId, 
      endId, 
      this.nodes, 
      this.edges, 
      (n1, n2) => this.getWeight(n1, n2)
    );

    const t1 = performance.now();
    console.log(`⚡ Route computation time: ${(t1 - t0).toFixed(2)} ms [${startId} → ${endId}]`);

    // Save to cache
    if (path.length > 0) {
      routeCache.set(startId, endId, path);
    }

    return path;
  }

  showRoute(startId, endId) {
    if (!this.layer) return;
    this.layer.innerHTML = '';
    if (startId === endId) return;

    const pathIds = this.calculatePath(startId, endId);
    if (pathIds.length < 2) return;

    let d = `M ${this.nodes[pathIds[0]].x} ${this.nodes[pathIds[0]].y}`;
    for (let i = 1; i < pathIds.length; i++) {
      d += ` L ${this.nodes[pathIds[i]].x} ${this.nodes[pathIds[i]].y}`;
    }

    // Subtle glow track behind the route line
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('d', d);
    track.setAttribute('stroke', 'rgba(59,130,246,0.12)');
    track.setAttribute('stroke-width', '12');
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke-linecap', 'round');
    this.layer.appendChild(track);

    // Animated route line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', d);
    line.setAttribute('class', 'path-line smart-route');
    this.layer.appendChild(line);

    // Draw-on animation via stroke-dashoffset
    requestAnimationFrame(() => {
      const len = line.getTotalLength ? line.getTotalLength() : 800;
      line.style.strokeDasharray  = len;
      line.style.strokeDashoffset = len;
      line.style.transition = 'stroke-dashoffset 0.85s cubic-bezier(0.4,0,0.2,1)';
      requestAnimationFrame(() => { line.style.strokeDashoffset = 0; });
    });

    // Start marker
    const sn = this.nodes[pathIds[0]];
    const startMark = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    startMark.setAttribute('x', sn.x); startMark.setAttribute('y', sn.y - 18);
    startMark.setAttribute('text-anchor', 'middle'); startMark.setAttribute('font-size', '20');
    startMark.textContent = '📍';
    this.layer.appendChild(startMark);

    // End marker
    const en = this.nodes[pathIds[pathIds.length - 1]];
    const endMark = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    endMark.setAttribute('x', en.x); endMark.setAttribute('y', en.y - 18);
    endMark.setAttribute('text-anchor', 'middle'); endMark.setAttribute('font-size', '20');
    endMark.textContent = '🎯';
    this.layer.appendChild(endMark);

    // Compute estimated time
    const zones = simulator.state.zones;
    const routeZones = pathIds.filter(id => this.nodes[id].isZone);
    const avgDensity = routeZones.reduce((sum, id) => {
      const z = zones.find(z => z.id === id);
      return sum + (z ? z.density : 0.5);
    }, 0) / (routeZones.length || 1);
    const mins = Math.round((pathIds.length - 1) * 1.5 + avgDensity * 4);
    this.lastRouteMeta = { minutes: mins };
    return this.lastRouteMeta;
  }

  clear() {
    if (this.layer) this.layer.innerHTML = '';
    this.lastRouteMeta = null;
  }
}
