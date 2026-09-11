const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Best-effort text extraction from an uploaded resume so it can be
 * full-text searched later. Never throws -- a resume we can't parse is
 * still stored and downloadable, it's just not searchable by content.
 */
async function extractResumeText(buffer, mimetype, filename = '') {
  try {
    const lower = (filename || '').toLowerCase();
    if (mimetype === 'application/pdf' || lower.endsWith('.pdf')) {
      const result = await pdfParse(buffer);
      return (result.text || '').trim();
    }
    if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lower.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return (result.value || '').trim();
    }
    if (mimetype === 'text/plain' || lower.endsWith('.txt')) {
      return buffer.toString('utf8').trim();
    }
    // .doc (legacy binary Word) and anything else: no reliable parser
    // available without native dependencies. Stored as-is, unsearchable.
    return '';
  } catch (err) {
    console.warn('Resume text extraction failed:', err.message);
    return '';
  }
}

module.exports = { extractResumeText };
