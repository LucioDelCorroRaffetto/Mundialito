import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/auth-guard.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { registerHandler, registerSchema } from './handlers/register.js';
import { loginHandler, loginSchema } from './handlers/login.js';
import { meHandler } from './handlers/me.js';
import { refreshHandler, refreshSchema } from './handlers/refresh.js';
import { googleAuthHandler } from './handlers/google.js';
import { deleteAccountHandler, deleteAccountSchema } from './handlers/delete-account.js';

export const authRouter = Router();

// Throttle credentialed endpoints to slow down brute-force attempts.
// 10 attempts per 5 minutes per IP is well above what any legitimate user
// will do, but tight enough that a password-spray gets nowhere.
const credLimit = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, routeKey: 'auth-cred' });
// Google IDP token verification is cheaper to abuse — looser cap.
const googleLimit = rateLimit({ windowMs: 5 * 60 * 1000, max: 30, routeKey: 'auth-google' });

authRouter.post('/google', googleLimit, (req, res, next) => {
  googleAuthHandler(req, res).catch(next);
});

authRouter.post('/register', credLimit, validate(registerSchema), (req, res, next) => {
  registerHandler(req, res).catch(next);
});

authRouter.post('/login', credLimit, validate(loginSchema), (req, res, next) => {
  loginHandler(req, res).catch(next);
});

authRouter.get('/me', authGuard, (req, res, next) => {
  meHandler(req, res).catch(next);
});

authRouter.post('/refresh', credLimit, validate(refreshSchema), (req, res, next) => {
  refreshHandler(req, res).catch(next);
});

authRouter.delete('/me', authGuard, validate(deleteAccountSchema), (req, res, next) => {
  deleteAccountHandler(req, res).catch(next);
});
