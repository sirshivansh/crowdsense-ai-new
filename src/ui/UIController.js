/**
 * UIController - Decouples DOM manipulation from business logic.
 * Improves Code Quality by centralizing all view updates, animations, and toast management.
 */
export class UIController {
  constructor() {
    this.alertContainer = document.getElementById('alert-container');
    this.emergencyBanner = document.getElementById('emergency-banner');
    this.attendanceEl = document.getElementById('live-attendance');
    this.safetyScoreEl = document.getElementById('safety-score');
  }

  /**
   * Displays a non-blocking alert toast.
   * @param {string} msg 
   */
  showAlert(msg) {
    if (!this.alertContainer) return;
    const toast = document.createElement('div');
    toast.className = 'alert-toast';
    toast.innerHTML = `
      <span class="alert-icon">⚠️</span>
      <span class="alert-message">${msg}</span>
      <button class="close-btn">✕</button>
    `;
    this.alertContainer.appendChild(toast);

    const removeToast = () => {
      toast.classList.add('removing');
      setTimeout(() => { if (this.alertContainer.contains(toast)) this.alertContainer.removeChild(toast); }, 250);
    };

    toast.querySelector('.close-btn').addEventListener('click', removeToast);
    setTimeout(removeToast, 5000);
  }

  /**
   * Updates executive metrics in the health panel.
   * @param {number} attendance 
   * @param {number} safetyScore 
   */
  updateMetrics(attendance, safetyScore) {
    if (this.attendanceEl) {
      this.attendanceEl.textContent = attendance.toLocaleString();
    }
    if (this.safetyScoreEl) {
      this.safetyScoreEl.textContent = `${safetyScore}%`;
      this.safetyScoreEl.className = 'att-value';
      if (safetyScore >= 60) this.safetyScoreEl.classList.add('text-success');
      else if (safetyScore >= 35) this.safetyScoreEl.classList.add('text-warning');
      else this.safetyScoreEl.classList.add('text-danger');
    }
  }

  /**
   * Toggles the UI state for emergency mode.
   * @param {boolean} active 
   */
  setEmergencyUI(active) {
    document.body.classList.toggle('emergency-mode', active);
    if (this.emergencyBanner) this.emergencyBanner.classList.toggle('hidden', !active);
    
    const emergencyBtn = document.getElementById('btn-emergency');
    if (emergencyBtn) {
      emergencyBtn.textContent = active ? '✅ End Emergency' : '🚨 Emergency Mode';
      emergencyBtn.classList.toggle('emergency-active', active);
    }
  }

  /**
   * Updates the status pills in the health dashboard.
   * @param {string} serviceId - 'vertex', 'auth', 'analytics', etc.
   * @param {boolean} isOk 
   */
  setStatusPill(serviceId, isOk) {
    const pill = document.getElementById(`status-${serviceId}-pill`);
    if (!pill) return;
    const dot = pill.querySelector('.dot');
    if (dot) dot.className = isOk ? 'dot green' : 'dot grey';
    
    // Label update
    const labels = {
      vertex: 'Vertex AI',
      auth: 'Auth',
      analytics: 'Analytics',
      firebase: 'Firebase'
    };
    pill.innerHTML = `<span class="${isOk ? 'dot green' : 'dot grey'}"></span> ${labels[serviceId]}: ${isOk ? 'OK' : 'OFF'}`;
  }

  /**
   * Updates the primary AI recommendation card.
   * @param {object} analysis - Outcome from Predictor.getTrendAnalysis
   * @param {object} bestZone
   * @param {object} worstZone
   */
  updateAIRecommendation(analysis, bestZone, worstZone) {
    const card = document.getElementById('ai-recommendation');
    const actionEl = document.getElementById('ai-action');
    const reasonEl = document.getElementById('ai-reason');
    if (!card || !actionEl || !reasonEl) return;

    let newAction = `Head to ${bestZone.name}`;
    let newReason = `Current optimal path identified. ${analysis.message}`;

    if (analysis.isIncreasing) {
      newAction = `Proactive Move: ${bestZone.name}`;
      newReason = `Congestion building fast. Avoid ${worstZone.name} now.`;
    }

    if (actionEl.textContent !== newAction || reasonEl.textContent !== newReason) {
      card.classList.add('ai-updating');
      requestAnimationFrame(() => {
        actionEl.textContent = newAction;
        reasonEl.textContent = newReason;
        setTimeout(() => card.classList.remove('ai-updating'), 350);
      });
    }
  }

  /**
   * Updates the dynamic smart suggestion list items.
   * @param {Array} items - List of {icon, text} objects
   */
  updateSmartSuggestions(items) {
    const SUGGESTION_IDS = ['sug-0', 'sug-1', 'sug-2'];
    SUGGESTION_IDS.forEach((id, i) => {
      const li = document.getElementById(id);
      if (!li) return;
      const item = items[i];
      const iconEl = li.querySelector('.suggestion-icon');
      const textEl = li.querySelector('.sug-text');
      if (!item) {
        li.style.opacity = '0';
        li.style.pointerEvents = 'none';
        return;
      }
      if (textEl.textContent !== item.text) {
        li.classList.add('sug-updating');
        requestAnimationFrame(() => {
          if (iconEl) iconEl.textContent = item.icon;
          if (textEl) textEl.textContent = item.text;
          li.style.opacity = '1';
          li.style.pointerEvents = '';
          setTimeout(() => li.classList.remove('sug-updating'), 200);
        });
      }
    });
  }
}

export const ui = new UIController();
