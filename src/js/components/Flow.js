import { simulator } from '../data/simulation.js';

export class Flow {
  constructor(layerId, routingInstance) {
    this.layer = document.getElementById(layerId);
    this.routing = routingInstance;
    
    this.particles = [];
    this.initFlows();
  }

  initFlows() {
    if (!this.layer) return;
    
    // We will generate particles on some key edges
    const activeEdges = [
      ['gate_a', 'nw_corner'],
      ['nw_corner', 'section_101'],
      ['gate_b', 'ne_corner'],
      ['ne_corner', 'section_101'],
      ['food_court', 'se_corner'],
      ['se_corner', 'section_205'],
      ['nw_corner', 'sw_corner'],
      ['sw_corner', 'section_205']
    ];

    // Create defs for paths
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    this.layer.appendChild(defs);

    activeEdges.forEach((edge, idx) => {
      const p1 = this.routing.nodes[edge[0]];
      const p2 = this.routing.nodes[edge[1]];
      
      const pathId = `flow-path-${idx}`;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute('id', pathId);
      path.setAttribute('d', `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`);
      defs.appendChild(path);

      // Create several particles for this edge
      for (let i = 0; i < 3; i++) {
        this.createParticle(pathId, edge, i * 2); // staggered start times
      }
    });

    simulator.on('update:heatmap', () => this.updateFlowSpeeds());
  }

  createParticle(pathId, edge, delay) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', 'rgba(0, 210, 255, 0.8)');
    circle.setAttribute('filter', 'drop-shadow(0 0 4px rgba(0,210,255,0.8))');

    const anim = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
    anim.setAttribute('dur', '5s');
    anim.setAttribute('repeatCount', 'indefinite');
    anim.setAttribute('begin', `${delay}s`);
    
    const mpath = document.createElementNS("http://www.w3.org/2000/svg", "mpath");
    mpath.setAttribute('href', `#${pathId}`);
    
    anim.appendChild(mpath);
    circle.appendChild(anim);
    this.layer.appendChild(circle);

    this.particles.push({ circle, anim, edge });
  }

  updateFlowSpeeds() {
    const state = simulator.state;
    this.particles.forEach(p => {
      // average density of the two nodes
      let d1 = 0.5, d2 = 0.5;
      
      if (this.routing.nodes[p.edge[0]].isZone) {
        const z1 = state.zones.find(z => z.id === p.edge[0]);
        if (z1) d1 = z1.density;
      }
      if (this.routing.nodes[p.edge[1]].isZone) {
        const z2 = state.zones.find(z => z.id === p.edge[1]);
        if (z2) d2 = z2.density;
      }

      const avgD = (d1 + d2) / 2;
      
      // If density is high, duration increases (slower flow)
      // Base duration 3s. If density is 1.0 -> 10s (crawling).
      const newDur = 3 + (avgD * 7);
      
      p.anim.setAttribute('dur', `${newDur}s`);
      
      // If congestion is fatal, turn particle reddish
      if (avgD > 0.8) {
        p.circle.setAttribute('fill', 'rgba(255, 100, 100, 0.8)');
      } else {
        p.circle.setAttribute('fill', 'rgba(0, 210, 255, 0.8)');
      }
    });
  }
}
