import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { validate } from '../../middleware/validate.js';
import { subscribeHandler, subscribeSchema } from './handlers/subscribe.js';
import { unsubscribeHandler, unsubscribeSchema } from './handlers/unsubscribe.js';
import { vapidKeyHandler } from './handlers/vapid-key.js';
import { sendTestPushHandler } from './handlers/send-test.js';

export const pushRouter = Router();

// No auth required — needed before user is signed in to show the prompt
pushRouter.get('/vapid-public-key', vapidKeyHandler);

// Fires a notification to the user's own subscriptions. Useful for sanity
// checks before the tournament starts and the cron has anything to send.
pushRouter.post('/test', authGuard, (req, res, next) =>
  sendTestPushHandler(req, res).catch(next),
);

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
