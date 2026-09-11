const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const { extractResumeText } = require('../lib/resumeParser');

const router = express.Router();

const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'text/plain',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter(req, file, cb) {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error('Please upload your resume as a PDF, Word document (.doc/.docx), or plain text file.'));
  },
});

// Careers page: every open job.
router.get('/', async (req, res, next) => {
  try {
    const { rows: jobs } = await pool.query(
      `SELECT id, title, department, location, employment_type, created_at
       FROM jobs WHERE status = 'open' ORDER BY created_at DESC`
    );
    res.render('careers', { jobs });
  } catch (err) {
    next(err);
  }
});

// Single job detail + application form.
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    const job = rows[0];
    if (!job) return res.status(404).render('404', { url: req.originalUrl });
    res.render('job-detail', { job, errors: null, form: {} });
  } catch (err) {
    next(err);
  }
});

// Submit an application.
router.post('/jobs/:id/apply', (req, res, next) => {
  upload.single('resume')(req, res, (err) => {
    if (err) return handleApplyError(req, res, err.message);
    next();
  });
}, async (req, res, next) => {
  try {
    const jobId = req.params.id;
    const { rows: jobRows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    const job = jobRows[0];
    if (!job) return res.status(404).render('404', { url: req.originalUrl });
    if (job.status !== 'open') {
      return handleApplyError(req, res, 'This job is no longer accepting applications.', job);
    }

    const { name, email, phone, linkedin_url: linkedinUrl, cover_letter: coverLetter } = req.body;

    const errors = [];
    if (!name || !name.trim()) errors.push('Name is required.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('A valid email is required.');
    if (!req.file) errors.push('Please attach your resume.');

    if (errors.length) {
      return res.status(400).render('job-detail', {
        job,
        errors,
        form: { name, email, phone, linkedin_url: linkedinUrl, cover_letter: coverLetter },
      });
    }

    const resumeText = await extractResumeText(req.file.buffer, req.file.mimetype, req.file.originalname);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: candRows } = await client.query(
        `INSERT INTO candidates (name, email, phone, linkedin_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           phone = COALESCE(EXCLUDED.phone, candidates.phone),
           linkedin_url = COALESCE(EXCLUDED.linkedin_url, candidates.linkedin_url)
         RETURNING id`,
        [name.trim(), email.trim().toLowerCase(), phone || null, linkedinUrl || null]
      );
      const candidateId = candRows[0].id;

      const existing = await client.query(
        'SELECT id FROM applications WHERE job_id = $1 AND candidate_id = $2',
        [jobId, candidateId]
      );
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).render('job-detail', {
          job,
          errors: ['You have already applied to this job with this email address.'],
          form: { name, email, phone, linkedin_url: linkedinUrl, cover_letter: coverLetter },
        });
      }

      await client.query(
        `INSERT INTO applications
           (job_id, candidate_id, resume_filename, resume_mimetype, resume_data, resume_text, cover_letter)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          jobId,
          candidateId,
          req.file.originalname,
          req.file.mimetype,
          req.file.buffer,
          resumeText,
          coverLetter || '',
        ]
      );

      await client.query('COMMIT');
      res.render('applied', { job });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

async function handleApplyError(req, res, message, jobOverride) {
  try {
    let job = jobOverride;
    if (!job) {
      const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
      job = rows[0];
    }
    if (!job) return res.status(404).render('404', { url: req.originalUrl });
    res.status(400).render('job-detail', { job, errors: [message], form: req.body || {} });
  } catch (err) {
    res.status(500).render('error', { message: 'Something went wrong. Please try again.' });
  }
}

module.exports = router;
