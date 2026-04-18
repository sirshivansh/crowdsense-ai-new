/**
 * Enhanced Congestion Predictor.
 * Uses weighted rate of change to provide proactive traffic intelligence.
 *
 * VERTEX AI INTEGRATION:
 *   Set USE_VERTEX = true to route async predictions through the Vertex AI
 *   service layer. The synchronous getTrendAnalysis() method is always
 *   available as a fast fallback for routing weight calculations.
 */
import { getPredictionFromVertex } from '../services/vertexService.js';

/**
 * Feature flag — flip to true to enable the Vertex AI inference path.
 * When false, the system runs entirely on the local WRC engine.
 */
export const USE_VERTEX = false;

export class CongestionPredictor {
  /**
   * Analyzes historical density to identify trends.
   * Synchronous — used directly by the routing engine for weight calculation.
   *
   * @param {number[]} historicalData - Array of recent density values.
   * @returns {{ isIncreasing: boolean, confidence: number, message: string, trendScore: number }}
   */
  static getTrendAnalysis(historicalData) {
    if (!historicalData || historicalData.length < 3) {
      return {
        isIncreasing: false,
        confidence: 0,
        message: "Data stabilizing..."
      };
    }

    // Calculate changes between intervals
    const deltas = [];
    for (let i = 1; i < historicalData.length; i++) {
      deltas.push(historicalData[i] - historicalData[i - 1]);
    }

    // Calculate weighted average of changes (most recent weights more)
    let weightedSum = 0;
    let weightTotal = 0;
    deltas.forEach((d, i) => {
      const weight = (i + 1);
      weightedSum += d * weight;
      weightTotal += weight;
    });

    const weightedRate = weightedSum / weightTotal;
    const isIncreasing = weightedRate > 0.005; // 0.5% growth threshold

    // Confidence based on consistency and data volume
    const consistency = 1 - Math.min(1, Math.abs(deltas[deltas.length - 1] - weightedRate) * 5);
    let confidence = Math.max(0.2, consistency * (historicalData.length / 10));
    confidence = Math.min(0.99, confidence);

    // Human-readable message
    let message = "Stable flow.";
    if (weightedRate > 0.04) message = "Severe spike expected.";
    else if (weightedRate > 0.01) message = "Increasing congestion.";
    else if (weightedRate < -0.01) message = "Traffic dissipating.";

    return {
      isIncreasing,
      confidence: parseFloat(confidence.toFixed(2)),
      message,
      trendScore: weightedRate // useful for penalties
    };
  }

  /**
   * Async analysis — uses Vertex AI when USE_VERTEX is enabled,
   * falls back to the local WRC engine on error or when flag is off.
   *
   * VERTEX FALLBACK MECHANISM: the system always has a synchronous local
   * predictor available. The Vertex path is additive — if the remote call
   * fails or returns null, the local WRC result is used transparently.
   * This guarantees the routing engine is never starved of predictions.
   *
   * @param {number[]} historicalData
   * @param {object[]} [zones] - Optional zone snapshots for richer inference
   * @returns {Promise<object>} Same shape as getTrendAnalysis()
   */
  static async getAnalysis(historicalData, zones = []) {
    // Basic input validation to prevent invalid state propagation
    if (!historicalData || !Array.isArray(historicalData)) {
      return { isIncreasing: false, confidence: 0, message: 'Invalid input data.', trendScore: 0 };
    }

    // Performance instrumentation — measure prediction pipeline latency
    const t0 = performance.now();

    let result;
    if (USE_VERTEX) {
      const vertexResult = await getPredictionFromVertex({ historicalData, zones });
      if (vertexResult) {
        result = vertexResult;
      } else {
        // Vertex call failed — fall back silently
        console.warn('[Predictor] Vertex AI unavailable — using local WRC engine.');
        result = this.getTrendAnalysis(historicalData);
      }
    } else {
      result = this.getTrendAnalysis(historicalData);
    }

    const t1 = performance.now();
    console.log(`⚡ Prediction time: ${(t1 - t0).toFixed(2)} ms [source: ${USE_VERTEX ? 'Vertex AI' : 'local WRC'}]`);

    return result;
  }

  /**
   * Deterministic confidence label
   */
  static getConfidenceLabel(confidence) {
    if (confidence > 0.8) return 'High';
    if (confidence > 0.5) return 'Medium';
    return 'Low';
  }

  /**
   * Proactive congestion check
   */
  static predictProactiveCongestion(zone, historicalData) {
    const analysis = this.getTrendAnalysis(historicalData);
    // If it's already high OR increasing rapidly, it's a risk
    return zone.density > 0.7 || (analysis.isIncreasing && zone.density > 0.5);
  }
}
