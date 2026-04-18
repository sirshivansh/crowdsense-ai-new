import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCLB3y2cn8tqo5G10y9K6kglyzfjBj54h4",
  authDomain: "crowdsense-ai-7d584.firebaseapp.com",
  projectId: "crowdsense-ai-7d584",
  storageBucket: "crowdsense-ai-7d584.firebasestorage.app",
  messagingSenderId: "328672963147",
  appId: "1:328672963147:web:3d93493202ee7163ae7bce"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/**
 * Firebase Service for CrowdSense AI.
 * Handles persistence for crowd metrics, AI predictions, and system alerts.
 */
export const firebaseService = {
  /**
   * Persists real-time crowd data (zone-specific densities).
   */
  async saveCrowdData(zones) {
    // Basic input validation to prevent invalid state propagation
    if (!zones || !Array.isArray(zones) || zones.length === 0) {
      console.warn('[Firebase] saveCrowdData: invalid zones input, skipping.');
      return null;
    }
    try {
      const docRef = await addDoc(collection(db, "crowdLogs"), {
        zones,
        timestamp: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      console.error("Firebase Error (saveCrowdData):", error);
      throw error;
    }
  },

  /**
   * Fetches latest crowd data logs.
   */
  async getCrowdData(count = 10) {
    // Basic input validation — count must be a positive integer
    if (typeof count !== 'number' || count < 1) count = 10;
    try {
      const q = query(collection(db, "crowdLogs"), orderBy("timestamp", "desc"), limit(count));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Firebase Error (getCrowdData):", error);
      return [];
    }
  },

  /**
   * Logs AI trend predictions for future audit and model refinement.
   */
  async logPrediction(prediction) {
    // Basic input validation to prevent empty or malformed log entries
    if (!prediction || typeof prediction !== 'object') {
      console.warn('[Firebase] logPrediction: invalid prediction input, skipping.');
      return;
    }
    try {
      await addDoc(collection(db, "predictionLogs"), {
        ...prediction,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Firebase Error (logPrediction):", error);
    }
  },

  /**
   * Triggers a system alert in Firestore if high density thresholds are breached.
   */
  async triggerAlertIfHighDensity(zones, threshold = 0.85) {
    if (!zones || !Array.isArray(zones)) return;
    const congestedZones = zones.filter(z => z && typeof z.density === 'number' && z.density >= threshold);
    if (congestedZones.length === 0) return;

    try {
      for (const zone of congestedZones) {
        await addDoc(collection(db, "activeAlerts"), {
          zoneId: zone.id,
          zoneName: zone.name,
          density: zone.density,
          priority: "HIGH",
          timestamp: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Firebase Error (triggerAlert):", error);
    }
  },

  /**
   * Logs a structured analytics event to the systemEvents collection.
   * Used for routing decisions, prediction audits, and emergency activations.
   *
   * @param {{ type: string, metadata: object }} event
   */
  async logSystemEvent(event) {
    // Basic input validation to prevent malformed analytics entries
    if (!event || !event.type || typeof event.type !== 'string') {
      console.warn('[Firebase] logSystemEvent: invalid event, skipping.');
      return;
    }
    const entry = {
      type: event.type,
      timestamp: Date.now(),
      metadata: event.metadata || {},
      serverTimestamp: serverTimestamp(),
    };
    console.log(`[Analytics] ${event.type}`, entry.metadata);
    try {
      await addDoc(collection(db, "systemEvents"), entry);
    } catch (error) {
      console.error("Firebase Error (logSystemEvent):", error);
    }
  }
};

