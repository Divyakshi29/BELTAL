import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/env.js';
import routes from './routes/index.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';
import requestLogger from './middleware/requestLogger.js';

const app = express();

app.set('trust proxy', 1);

app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 100/15min was sized for a single script hitting one endpoint, not a
  // person clicking through a role dashboard: a manager landing on
  // ManagerDashboard alone fires 3 requests (team members + team assets +
  // transfers), and normal page-to-page browsing (Team Members, Team Assets,
  // Approvals, asset detail pages, ...) over a working session burns through
  // the old budget in minutes with no bug involved. Raised to a figure sized
  // for that kind of interactive session while still bounding sustained
  // scripted abuse from a single IP.
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Machine badge ingest has its own, higher limit (machineRateLimit.js); the
  // human limit would otherwise cap a PACS gateway at ~7 events a minute.
  // The polled read-only PACS console endpoints (zones/events) likewise use
  // their own per-minute limiter in pacs.route.js.
  skip: (req) =>
    (req.method === 'POST' && req.path === '/pacs/badge-event') ||
    (req.method === 'GET' && (req.path === '/pacs/zones' || req.path === '/pacs/events')) ||
    // The waiting page polls this every ~10s; it has its own per-IP limiter in
    // registrationRateLimit.js so it can't exhaust the general budget.
    (req.method === 'GET' && req.path === '/auth/registration-status'),
  message: { error: { message: 'Too many requests, please try again later.', status: 429 } },
});

app.use('/api', apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
