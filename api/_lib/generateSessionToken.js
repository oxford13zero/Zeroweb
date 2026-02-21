// /api/_lib/generateSessionToken.js
import crypto from 'crypto';

/**
 * Generate a cryptographically secure random session token
 * 
 * @returns {string} 64-character hexadecimal token (256 bits of entropy)
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculate session expiration timestamp
 * 
 * @param {number} hours - Hours until expiration (default: 8)
 * @returns {Date} Expiration timestamp
 */
export function getSessionExpiration(hours = 8) {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + hours);
  return expiration;
}

/**
 * Validate that a token has the correct format
 * 
 * @param {string} token - Token to validate
 * @returns {boolean} True if token format is valid
 */
export function isValidTokenFormat(token) {
  // Must be exactly 64 hex characters
  return typeof token === 'string' && /^[0-9a-f]{64}$/i.test(token);
}