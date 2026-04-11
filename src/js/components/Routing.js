import { simulator } from '../data/simulation.js';

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

  getWeight(n1, n2) {
    let dist = this.getDistance(n1, n2);
    // Add density penalty. A crowded zone acts as "longer" distance
    const state = simulator.state;
    // Look up density for target node if it's a zone
    let penalty = 0;
    if (this.nodes[n2].isZone) {
      const zData = state.zones.find(z => z.id === n2);
      if (zData) {
        // Severe penalty for > 0.7 density
        if (zData.density > 0.8) penalty += 2000;
        else if (zData.density > 0.6) penalty += 500;
      }
    }
    return dist + penalty;
  }

  calculatePath(startId, endId) {
    const distances = {};
    const previous = {};
    const nodes = new Set(Object.keys(this.nodes));

    // Initialize
    for (let node of nodes) {
      distances[node] = Infinity;
      previous[node] = null;
    }
    distances[startId] = 0;

    while (nodes.size > 0) {
      // Get node with min distance
      let current = null;
      for (let node of nodes) {
        if (!current || distances[node] < distances[current]) {
          current = node;
        }
      }

      if (current === endId) break;
      if (distances[current] === Infinity) break;

      nodes.delete(current);

      // Neighbors
      const neighbors = this.edges
        .filter(e => e[0] === current || e[1] === current)
        .map(e => e[0] === current ? e[1] : e[0]);

      for (let neighbor of neighbors) {
        if (!nodes.has(neighbor)) continue;
        const alt = distances[current] + this.getWeight(current, neighbor);
        if (alt < distances[neighbor]) {
          distances[neighbor] = alt;
          previous[neighbor] = current;
        }
      }
    }

    // Trace back
    const path = [];
    let curr = endId;
    while (curr) {
      path.unshift(curr);
      curr = previous[curr];
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

