import twilio from 'twilio';
import { config } from '../config.js';

/**
 * Express middleware to validate that an inbound request really came from Twilio.
 * Enabled via TWILIO_VALIDATE_SIGNATURE=true. Requires PUBLIC_BASE_URL to match
 * the URL you configured in the Twilio console exactly.
 */
export function validateTwilio(req, res, next) {
  if (!config.twilio.validateSignature) return next();
  const signature = req.headers['x-twilio-signature'];
  const url = config.publicBaseUrl + req.originalUrl;
  const valid = twilio.validateRequest(config.twilio.authToken, signature, url, req.body || {});
  if (!valid) {
    console.warn('[twilio] signature validation failed for', url);
    return res.status(403).send('Invalid signature');
  }
  next();
}
