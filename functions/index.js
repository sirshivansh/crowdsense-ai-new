const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");

// Set the region to match your Cloud Run deployment
setGlobalOptions({ region: "asia-south1" });

/**
 * Cloud Function: processSafetyInsight
 * Triggered whenever a new prediction is logged to Firestore.
 * Automatically calculates "Aggregated Venue Safety" and logs a system event
 * if the safety threshold is breached.
 */
exports.processSafetyInsight = onDocumentCreated("predictionLogs/{docId}", (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const data = snapshot.data();
  const { confidence, predictionType } = data;

  logger.info(`Processing AI Insight for ${event.params.docId}`, {
    prediction: predictionType,
    confidence
  });

  // Example Logic: If AI is very confident in a 'RISING' congestion, 
  // we could trigger a push notification or an emergency webhook here.
  if (predictionType === 'RISING' && confidence > 0.85) {
    logger.warn("⚠️ CRITICAL CONGESTION DETECTED BY CLOUD ENGINE", {
      timestamp: new Date().toISOString()
    });
  }
});
