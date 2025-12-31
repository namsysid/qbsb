import adminRouter from './admin.js';
import apiRouter from './api/index.js';
import authRouter from './auth/index.js';
import geowordRouter from './geoword/index.js';
import multiplayerRouter from './multiplayer.js';
import userRouter from './user.js';

import cors from 'cors';
import express, { Router } from 'express';
const router = Router();

router.get('/*.scss', (req, res) => {
  res.sendFile(req.url, { root: './scss' });
});

/**
 * Redirects:
 */
router.get('/api-info', (_req, res) => res.redirect('/api-docs'));
router.get('/bonuses', (_req, res) => res.redirect('/singleplayer/bonuses'));
router.get('/db', (_req, res) => res.redirect('/database'));
router.get('/tossups', (_req, res) => res.redirect('/singleplayer/tossups'));
router.get('/user', (_req, res) => res.redirect('/user/login'));
router.get('/singleplayer/tossups', (_req, res) => res.redirect('/singleplayer/science-bowl/'));

/**
 * Routes:
 */
router.use('/admin', adminRouter);
router.use('/api', cors(), apiRouter);
router.use('/auth', authRouter);
router.use('/geoword', geowordRouter);
router.use('/multiplayer', multiplayerRouter);
router.use('/user', userRouter);

router.use('/quizbowl', express.static('quizbowl'));

// Serve static files with proper MIME types
router.use(express.static('client', {
  extensions: ['html'],
  setHeaders: (res, path) => {
    if (path.endsWith('.js') || path.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

router.use(express.static('node_modules', {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

/**
 * 404 Error handler
 */
router.use((_req, res) => {
  res.sendFile('404.html', { root: './client' });
});

export default router;
