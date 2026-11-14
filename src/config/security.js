const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('./env');

const ALGORITHM = 'aes-256-gcm';
// Ensure key is exactly 32 bytes
const getKeyBuffer = () => {
  return crypto.createHash('sha256').update(String(env.ENCRYPTION_KEY)).digest();
};

/**
 * Encrypt sensitive string (e.g. API keys)
 */
function encryptText(plainText) {
  if (!plainText) return { encrypted: '', iv: '', authTag: '' };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag
  };
}

/**
 * Decrypt sensitive string
 */
function decryptText(encryptedHex, ivHex, authTagHex) {
  if (!encryptedHex || !ivHex || !authTagHex) return '';
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getKeyBuffer(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return '';
  }
}

/**
 * Mask API key for frontend presentation
 * Never expose full API key
 */
function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  const prefix = key.slice(0, 4);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Redact secrets from strings and objects for logging
 */
function redactSecrets(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    // Redact pass_key, apiKey, token patterns
    return obj
      .replace(/("?(pass_?key|password|api_?key|secret|token)"?\s*[:=]\s*)"([^"]+)"/gi, '$1"***REDACTED***"')
      .replace(/("?(pass_?key|password|api_?key|secret|token)"?\s*[:=]\s*)([^\s,]+)/gi, '$1***REDACTED***');
  }
  if (typeof obj === 'object') {
    const copy = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
      if (/pass_?key|password|api_?key|secret|token|encrypted/i.test(key)) {
        copy[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        copy[key] = redactSecrets(value);
      } else {
        copy[key] = value;
      }
    }
    return copy;
  }
  return obj;
}

/**
 * Hash pass key
 */
async function hashPassKey(passKey) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(passKey, salt);
}

/**
 * Compare pass key
 */
async function verifyPassKey(passKey, hash) {
  return await bcrypt.compare(passKey, hash);
}

/**
 * Generate secure session JWT
 */
function generateToken(payload, expiresIn = `${env.SESSION_EXPIRY_HOURS}h`) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

/**
 * Verify session JWT
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  encryptText,
  decryptText,
  maskApiKey,
  redactSecrets,
  hashPassKey,
  verifyPassKey,
  generateToken,
  verifyToken,
};

