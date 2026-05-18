import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { validate } from '../../middleware/validate.js';
import { subscribeHandler, subscribeSchema } from './handlers/subscribe.js';
import { unsubscribeHandler, unsubscribeSchema } from './handlers/unsubscribe.js';
import { vapidKeyHandler } from './handlers/vapid-key.js';

export const pushRouter = Router();

// No auth required — needed before user is signed in to show the prompt
pushRouter.get('/vapid-public-key', vapidKeyHandler);

pushRouter.post(
  '/subscribe',
  authGuard,
  validate(subscribeSchema),
  (req, res, next) => { subscribeHandler(req, res).catch(next); },
);

pushRouter.delete(
  '/unsubscribe',
  authGuard,
  validate(unsubscribeSchema),
  (req, res, next) => { unsubscribeHandler(req, res).catch(next); },
);
