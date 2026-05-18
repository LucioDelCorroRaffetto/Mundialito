import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { tokenParse } from './middleware/token-parse.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

export const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));
app.use(tokenParse);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/v1', apiRouter);

app.use(errorHandler);
