/**
 * System Configuration & Environment Validator.
 * Ensures the application does not start in a broken state due to missing keys.
 * High-quality pattern for enterprise JS applications.
 */

const REQUIRED_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId'
];

export const config = {
  firebase: {
    apiKey: "AIzaSyABrgM2dtkw5S1sxxKjClxzkg9MSxd_vi0",
    authDomain: "crowdsense-ai-new.firebaseapp.com",
    projectId: "crowdsense-ai-new",
    storageBucket: "crowdsense-ai-new.appspot.com",
    messagingSenderId: "81506469908",
    appId: "1:81506469908:web:d901cf000fbb69ee873f01",
    measurementId: "G-WT0S69R5Q2"
  },
  ai: {
    useVertex: true,
    threshold: 0.85
  },
  env: import.meta.env.MODE || 'development'
};

/**
 * Validates the current configuration against required schema.
 * Throws a descriptive error if the system is misconfigured.
 */
export function validateConfig() {
  const missing = REQUIRED_KEYS.filter(key => !config.firebase[key]);
  if (missing.length > 0) {
    throw new Error(`[Configuration Error] Missing critical Firebase keys: ${missing.join(', ')}`);
  }
  console.log(`[Config] Validation passed. Mode: ${config.env}`);
}

/**
 * Structured Logger for production observability.
 */
export const Logger = {
  info: (msg, data = '') => config.env !== 'production' && console.log(`%c[INFO] ${msg}`, 'color: #3b82f6', data),
  warn: (msg, data = '') => console.warn(`%c[WARN] ${msg}`, 'color: #fbbf24', data),
  error: (msg, err = '') => console.error(`%c[ERROR] ${msg}`, 'color: #ef4444', err),
  analytics: (msg) => console.log(`%c[GA4] ${msg}`, 'color: #10b981')
};
