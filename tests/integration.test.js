import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CongestionPredictor, USE_VERTEX } from '../src/ai/predictor.js';
import { routeCache } from '../src/utils/cache.js';
import { Routing } from '../src/components/Routing.js';
import { simulator } from '../src/simulation/simulator.js';

// Mock simulator with controllable state
vi.mock('../src/simulation/simulator.js', () => {
  return {
    simulator: {
      state: {
        zones: [
          { id: 'gate_a', name: 'Gate A', density: 0.2 },
          { id: 'gate_b', name: 'Gate B', density: 0.2 },
          { id: 'section_101', name: 'Section 101', density: 0.3 },
          { id: 'section_205', name: 'Section 205', density: 0.3 },
          { id: 'food_court', name: 'Food Court', density: 0.9 },
          { id: 'restroom_north', name: 'Restrooms', density: 0.7 }
        ],
        historicalDensity: [0.3, 0.3, 0.3, 0.3, 0.3]
      },
      mode: 'normal',
      blockedZones: new Set(),
      on: vi.fn()
    }
  };
});

// Mock Vertex AI service — should not be called when USE_VERTEX is false
vi.mock('../src/services/vertexService.js', () => ({
  getPredictionFromVertex: vi.fn().mockResolvedValue(null)
}));

describe('Integration Tests — Emergency, Vertex, and Routing Pipeline', () => {
  let routing;

  beforeEach(() => {
    routeCache.clear();
    simulator.mode = 'normal';
    simulator.blockedZones = new Set();
    simulator.state.zones.forEach(z => z.density = 0.2);
    simulator.state.historicalDensity = [0.3, 0.3, 0.3, 0.3, 0.3];

    vi.stubGlobal('document', {
      getElementById: vi.fn().mockReturnValue({ innerHTML: '' })
    });
    routing = new Routing('mock-layer');
  });

  // ── Emergency Mode: exit prioritization ─────────────────────

  it('routes toward exits (gates) in emergency mode', () => {
    simulator.mode = 'emergency';
    simulator.blockedZones = new Set(['food_court', 'restroom_north']);

    // From section_101 to gate_a — should succeed and reach gate_a
    const path = routing.calculatePath('section_101', 'gate_a');
    expect(path.length).toBeGreaterThan(1);
    expect(path[path.length - 1]).toBe('gate_a');
  });

  it('never routes through blocked zones in emergency', () => {
    simulator.mode = 'emergency';
    simulator.blockedZones = new Set(['food_court', 'restroom_north']);

    // Route from section_205 to gate_b — must not pass through blocked zones
    const path = routing.calculatePath('section_205', 'gate_b');
    expect(path).not.toContain('food_court');
    expect(path).not.toContain('restroom_north');
  });

  it('applies heavier penalties in emergency mode', () => {
    // Set a zone above 0.8 density
    simulator.state.zones.find(z => z.id === 'section_101').density = 0.85;

    const normalWeight = routing.getWeight('nw_corner', 'section_101');

    simulator.mode = 'emergency';
    routeCache.clear();
    const emergencyWeight = routing.getWeight('nw_corner', 'section_101');

    // Emergency mode applies 3× multiplier on density penalties
    expect(emergencyWeight).toBeGreaterThan(normalWeight);
  });

  // ── Vertex AI Fallback ──────────────────────────────────────

  it('uses local WRC engine when USE_VERTEX is false', async () => {
    expect(USE_VERTEX).toBe(false);
    const result = await CongestionPredictor.getAnalysis([0.3, 0.4, 0.5, 0.6]);
    // Should return a valid local result, not null
    expect(result).toBeDefined();
    expect(result).toHaveProperty('isIncreasing');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('message');
  });

  it('returns safe fallback for invalid input to getAnalysis', async () => {
    const result = await CongestionPredictor.getAnalysis(null);
    expect(result.isIncreasing).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.message).toBe('Invalid input data.');
  });

  // ── Prediction → Routing integration ────────────────────────

  it('prediction trend affects routing weight for zone nodes', () => {
    const stableWeight = routing.getWeight('nw_corner', 'section_101');

    // Force a rising trend in historical data
    simulator.state.historicalDensity = [0.1, 0.3, 0.6];
    routeCache.clear();
    const risingWeight = routing.getWeight('nw_corner', 'section_101');

    expect(risingWeight).toBeGreaterThan(stableWeight);
  });

  // ── Cache invalidation ──────────────────────────────────────

  it('cache is empty after clear() call', () => {
    routeCache.set('a', 'b', ['a', 'x', 'b']);
    expect(routeCache.get('a', 'b')).toEqual(['a', 'x', 'b']);

    routeCache.clear();
    expect(routeCache.get('a', 'b')).toBeNull();
  });

  // ── Input validation ───────────────────────────────────────

  it('routing rejects invalid node IDs gracefully', () => {
    const path = routing.calculatePath('nonexistent_zone', 'gate_a');
    expect(path).toEqual([]);
  });

  it('routing rejects null inputs gracefully', () => {
    const path = routing.calculatePath(null, undefined);
    expect(path).toEqual([]);
  });
});
