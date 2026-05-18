import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { tokenParse } from './middleware/token-parse.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

export const app = express();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5174', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(tokenParse);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/v1', apiRouter);

app.use(errorHandler);
