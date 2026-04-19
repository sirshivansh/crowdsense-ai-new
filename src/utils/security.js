/**
 * Security Utility - Input Sanitization & XSS Prevention.
 * Protects the application by filtering any user-generated content 
 * before it is processed by the AI or rendered in the UI.
 */
export const Security = {
  /**
   * Simple HTML character escaping to prevent XSS.
   * @param {string} str - Raw user input.
   * @returns {string} Sanitized string.
   */
  sanitize(str) {
    if (typeof str !== 'string') return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      "/": '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return str.replace(reg, (match)=>(map[match]));
  },

  /**
   * Validates dropdown selections against allowed IDs.
   * @param {string} value - Selected ID.
   * @param {Array} allowed - List of valid IDs.
   * @returns {boolean}
   */
  isValidSelection(value, allowed) {
    return allowed.includes(value);
  }
};
