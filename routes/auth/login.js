import { COOKIE_MAX_AGE } from '../../constants.js';
import { mergeScienceBowlStatsForUser } from '../../database/science-bowl/stats.js';
import { checkSteamcoachPassword, generateSteamcoachToken } from '../../server/steamcoach/authentication.js';

import { Router } from 'express';

const router = Router();

router.post('/', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const steamcoachUser = await checkSteamcoachPassword(username, password);
  if (!steamcoachUser) {
    res.sendStatus(401);
    return;
  }

  const expires = Date.now() + COOKIE_MAX_AGE;
  const { steamcoachUserId } = steamcoachUser;

  req.session.username = steamcoachUser.username;
  req.session.steamcoachUserId = steamcoachUserId;
  req.session.steamcoachToken = generateSteamcoachToken(steamcoachUserId, steamcoachUser.username);
  req.session.expires = expires;

  if (req.session.scienceBowlStats) {
    await mergeScienceBowlStatsForUser(steamcoachUserId, req.session.scienceBowlStats, { username: steamcoachUser.username });
    req.session.scienceBowlStats = {};
  }

  res.status(200).send(JSON.stringify({ expires, username: steamcoachUser.username }));
});

export default router;
