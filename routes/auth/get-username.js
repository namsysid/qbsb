import { checkSteamcoachToken } from '../../server/steamcoach/authentication.js';

import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  const { username, steamcoachUserId, steamcoachToken, expires } = req.session ?? {};
  if (!checkSteamcoachToken(steamcoachUserId, steamcoachToken)) {
    delete req.session;
    res.sendStatus(401);
    return;
  }

  res.json({ username, steamcoachUserId, expires });
});

export default router;
