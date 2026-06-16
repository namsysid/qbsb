import { pwds } from './collections.js';

const USERNAME_FIELDS = ['username', 'userName', 'email'];
const USER_ID_FIELDS = ['userid', 'userId', 'uid', '_id'];
const PASSWORD_FIELDS = ['password', 'pwd', 'hash', 'passwordHash'];

export function getSteamcoachUserId (user) {
  for (const field of USER_ID_FIELDS) {
    if (user?.[field] !== undefined && user[field] !== null) {
      return String(user[field]);
    }
  }
  return null;
}

export function getSteamcoachPasswordValue (user) {
  for (const field of PASSWORD_FIELDS) {
    if (typeof user?.[field] === 'string') {
      return user[field];
    }
  }
  return null;
}

export async function findSteamcoachUser (username) {
  if (!username || typeof username !== 'string') {
    return null;
  }

  const normalizedUsername = username.trim();
  if (!normalizedUsername) {
    return null;
  }

  return await pwds.findOne({
    $or: USERNAME_FIELDS.flatMap(field => ([
      { [field]: normalizedUsername },
      { [field]: normalizedUsername.toLowerCase() }
    ]))
  });
}
