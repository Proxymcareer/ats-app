require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('./db/pool');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();

// Render (and most PaaS hosts) terminate TLS at a proxy and forward plain
// HTTP internally. Without this, Express can't tell the original request
// was HTTPS, so express-session's `cookie.secure: true` silently refuses
// to set the session cookie -- login "succeeds" but the browser never
// gets a session, and every subsequent request looks logged-out.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

if (!process.env.SESSION_SECRET) {
  console.warn(
    'SESSION_SECRET is not set -- using an insecure default. Set SESSION_SECRET ' +
      'in your environment before deploying.'
  );
}

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'insecure-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 12, // 12 hours
    },
  })
);

// Make a couple of things available to every view without passing them
// through each render() call.
app.use((req, res, next) => {
  res.locals.isAdmin = Boolean(req.session && req.session.adminId);
  res.locals.adminEmail = (req.session && req.session.adminEmail) || null;
  next();
});

// TEMPORARY debug instrumentation to diagnose a session-persistence issue.
// Safe to remove once login is confirmed working.
if (process.env.DEBUG_SESSION === 'true') {
  app.use((req, res, next) => {
    console.log(
      '[SESSDBG]', req.method, req.originalUrl,
      '| cookieHeader=', req.headers.cookie || '(none)',
      '| sessionID=', req.sessionID,
      '| adminId=', req.session && req.session.adminId
    );
    const origEnd = res.end;
    res.end = function (...args) {
      console.log(
        '[SESSDBG] -> response', res.statusCode,
        '| set-cookie=', res.getHeader('set-cookie') || '(none)',
        '| location=', res.getHeader('location') || '(none)'
      );
      return origEnd.apply(this, args);
    };
    next();
  });
}

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404', { url: req.originalUrl });
});

// Centralized error handler so a thrown/rejected error becomes a readable
// page instead of an unhandled crash or a raw stack trace to the visitor.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('error', {
    message: err.userMessage || 'Something went wrong. Please try again.',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ATS listening on port ${PORT}`);
});
