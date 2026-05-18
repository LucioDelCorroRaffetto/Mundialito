import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/auth-guard.js';
import { registerHandler, registerSchema } from './handlers/register.js';
import { loginHandler, loginSchema } from './handlers/login.js';
import { meHandler } from './handlers/me.js';
import { refreshHandler, refreshSchema } from './handlers/refresh.js';
import { googleAuthHandler } from './handlers/google.js';

export const authRouter = Router();

authRouter.post('/google', (req, res, next) => {
  googleAuthHandler(req, res).catch(next);
});

authRouter.post('/register', validate(registerSchema), (req, res, next) => {
  registerHandler(req, res).catch(next);
});

authRouter.post('/login', validate(loginSchema), (req, res, next) => {
  loginHandler(req, res).catch(next);
});

authRouter.get('/me', authGuard, (req, res, next) => {
  meHandler(req, res).catch(next);
});

authRouter.post('/refresh', validate(refreshSchema), (req, res, next) => {
  refreshHandler(req, res).catch(next);
});
