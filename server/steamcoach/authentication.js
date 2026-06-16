import { COOKIE_MAX_AGE } from '../../constants.js';
import { getSteamcoachPasswordValue, getSteamcoachUserId, findSteamcoachUser } from '../../database/steamcoach/users.js';
import { saltAndHashPassword } from '../authentication.js';

import { createHash, timingSafeEqual } from 'crypto';
import jsonwebtoken from 'jsonwebtoken';

const { sign, verify } = jsonwebtoken;
const secret = process.env.STEAMCOACH_SECRET ?? process.env.SECRET ?? 'secret';

function sha256Base64 (value) {
  return createHash('sha256').update(value).digest('base64');
}

function sha256Hex (value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeCompare (a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function passwordMatches (password, storedPassword) {
  if (typeof password !== 'string' || typeof storedPassword !== 'string') {
    return false;
  }

  const candidates = [
    password,
    saltAndHashPassword(password),
    sha256Base64(password),
    sha256Hex(password)
  ];

  return candidates.some(candidate => safeCompare(candidate, storedPassword));
}

export function generateSteamcoachToken (steamcoachUserId, username) {
  return sign({ steamcoachUserId: String(steamcoachUserId), username }, secret, { expiresIn: Math.floor(COOKIE_MAX_AGE / 1000) });
}

export function checkSteamcoachToken (steamcoachUserId, token) {
  if (!steamcoachUserId || !token) {
    return false;
  }

  return verify(token, secret, (err, decoded) => {
    if (err) {
      return false;
    }
    return decoded.steamcoachUserId === String(steamcoachUserId);
  });
}

export async function checkSteamcoachPassword (username, password) {
  const user = await findSteamcoachUser(username);
  const storedPassword = getSteamcoachPasswordValue(user);
  if (!user || !passwordMatches(password, storedPassword)) {
    return null;
  }

  const steamcoachUserId = getSteamcoachUserId(user);
  if (!steamcoachUserId) {
    return null;
  }

  return {
    username: user.username ?? user.userName ?? username,
    steamcoachUserId
  };
}
