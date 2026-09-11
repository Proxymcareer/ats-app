require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('./db/pool');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();

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
