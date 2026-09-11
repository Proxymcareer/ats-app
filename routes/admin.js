const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const requireAdmin = require('../middleware/requireAdmin');
const { STAGES } = require('../lib/stages');

const router = express.Router();

// ---------- auth ----------

router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [
      (email || '').trim().toLowerCase(),
    ]);
    const admin = rows[0];
    const ok = admin && (await bcrypt.compare(password || '', admin.password_hash));
    if (!ok) {
      return res.status(401).render('admin/login', { error: 'Incorrect email or password.' });
    }
    req.session.adminId = admin.id;
    req.session.adminEmail = admin.email;
    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    res.redirect(returnTo || '/admin');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Everything below requires an authenticated admin.
router.use(requireAdmin);

// ---------- dashboard ----------

router.get('/', async (req, res, next) => {
  try {
    const { rows: jobs } = await pool.query(
      `SELECT j.*,
              COUNT(a.id) AS application_count,
              COUNT(a.id) FILTER (WHERE a.stage = 'Applied') AS new_count
       FROM jobs j
       LEFT JOIN applications a ON a.job_id = j.id
       GROUP BY j.id
       ORDER BY j.created_at DESC`
    );
    res.render('admin/dashboard', { jobs });
  } catch (err) {
    next(err);
  }
});

// ---------- job management ----------

router.get('/jobs/new', (req, res) => {
  res.render('admin/job-form', { job: null, errors: null });
});

router.post('/jobs', async (req, res, next) => {
  try {
    const { title, department, location, employment_type: employmentType, description } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).render('admin/job-form', {
        job: req.body,
        errors: ['Title is required.'],
      });
    }
    const { rows } = await pool.query(
      `INSERT INTO jobs (title, department, location, employment_type, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title.trim(), department || null, location || null, employmentType || 'Full-time', description || '']
    );
    res.redirect(`/admin/jobs/${rows[0].id}/pipeline`);
  } catch (err) {
    next(err);
  }
});

router.get('/jobs/:id/edit', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).render('404', { url: req.originalUrl });
    res.render('admin/job-form', { job: rows[0], errors: null });
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/:id', async (req, res, next) => {
  try {
    const { title, department, location, employment_type: employmentType, description, status } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).render('admin/job-form', {
        job: { ...req.body, id: req.params.id },
        errors: ['Title is required.'],
      });
    }
    await pool.query(
      `UPDATE jobs SET title = $1, department = $2, location = $3, employment_type = $4,
              description = $5, status = $6, updated_at = now()
       WHERE id = $7`,
      [
        title.trim(),
        department || null,
        location || null,
        employmentType || 'Full-time',
        description || '',
        status === 'closed' ? 'closed' : 'open',
        req.params.id,
      ]
    );
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/:id/toggle-status', async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE jobs SET status = CASE WHEN status = 'open' THEN 'closed' ELSE 'open' END,
              updated_at = now()
       WHERE id = $1`,
      [req.params.id]
    );
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

// ---------- pipeline ----------

router.get('/jobs/:id/pipeline', async (req, res, next) => {
  try {
    const { rows: jobRows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    const job = jobRows[0];
    if (!job) return res.status(404).render('404', { url: req.originalUrl });

    const { rows: applications } = await pool.query(
      `SELECT a.id, a.stage, a.applied_at, a.resume_filename,
              c.name, c.email, c.phone
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       WHERE a.job_id = $1
       ORDER BY a.applied_at ASC`,
      [req.params.id]
    );

    const board = {};
    for (const stage of STAGES) board[stage] = [];
    for (const app of applications) {
      (board[app.stage] || (board[app.stage] = [])).push(app);
    }

    res.render('admin/pipeline', { job, board, stages: STAGES });
  } catch (err) {
    next(err);
  }
});

router.post('/applications/:id/stage', async (req, res, next) => {
  try {
    const { stage } = req.body;
    if (!STAGES.includes(stage)) {
      const err = new Error('Invalid stage');
      err.userMessage = 'That is not a valid pipeline stage.';
      throw err;
    }
    const { rows } = await pool.query(
      'UPDATE applications SET stage = $1, updated_at = now() WHERE id = $2 RETURNING job_id',
      [stage, req.params.id]
    );
    if (!rows[0]) return res.status(404).render('404', { url: req.originalUrl });

    if (req.get('X-Requested-With') === 'fetch') {
      return res.json({ ok: true });
    }
    res.redirect(`/admin/jobs/${rows[0].job_id}/pipeline`);
  } catch (err) {
    next(err);
  }
});

// ---------- candidate detail ----------

router.get('/applications/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, c.name, c.email, c.phone, c.linkedin_url, j.title AS job_title, j.id AS job_id
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN jobs j ON j.id = a.job_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    const application = rows[0];
    if (!application) return res.status(404).render('404', { url: req.originalUrl });
    res.render('admin/application-detail', { application, stages: STAGES });
  } catch (err) {
    next(err);
  }
});

router.post('/applications/:id/notes', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE applications SET notes = $1, updated_at = now() WHERE id = $2 RETURNING id',
      [req.body.notes || '', req.params.id]
    );
    if (!rows[0]) return res.status(404).render('404', { url: req.originalUrl });
    res.redirect(`/admin/applications/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/applications/:id/resume', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT resume_filename, resume_mimetype, resume_data FROM applications WHERE id = $1',
      [req.params.id]
    );
    const app = rows[0];
    if (!app || !app.resume_data) return res.status(404).render('404', { url: req.originalUrl });
    res.setHeader('Content-Type', app.resume_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${app.resume_filename || 'resume'}"`);
    res.send(app.resume_data);
  } catch (err) {
    next(err);
  }
});

// ---------- search ----------

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    let results = [];
    if (q) {
      const { rows } = await pool.query(
        `SELECT a.id, a.stage, ts_rank(a.search_vector, query) AS rank,
                c.name, c.email, j.title AS job_title, j.id AS job_id
         FROM applications a
         JOIN candidates c ON c.id = a.candidate_id
         JOIN jobs j ON j.id = a.job_id,
              plainto_tsquery('english', $1) query
         WHERE a.search_vector @@ query
         ORDER BY rank DESC
         LIMIT 100`,
        [q]
      );
      results = rows;
    }
    res.render('admin/search', { q, results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
