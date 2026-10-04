const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const env = require('./config/env');
const AppError = require('./utils/AppError');
const { apiLimiter } = require('./middleware/rateLimit');
const { csrfHeader } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1); // correct client IPs behind Render/Railway proxies

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // TEMPORARY: allows inline onclick="" handlers in the existing app.js.
        // We will remove this in Part 5 after reviewing app.js.
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
      },
    },
  })
);
app.use(cors({ origin: [env.CLIENT_ORIGIN], credentials: true }));
if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '200kb' })); // a long legal draft is well under this
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api', apiLimiter, csrfHeader);
app.use('/api/auth', require('./routes/authroutes'));
// Part 2 onward adds: users, assessments, submissions, reviews, skills, analytics.

app.use('/api', (req, res, next) => next(new AppError(404, 'NOT_FOUND', 'API route not found.')));

// Serve the existing frontend from the same origin.
const frontendDir = path.resolve(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

app.use(notFound);
app.use(errorHandler);

module.exports = app;