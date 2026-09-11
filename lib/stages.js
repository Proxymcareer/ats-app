// Ordered pipeline stages. Order here is the order columns appear in the
// admin pipeline board, and the order used to sort a job's applications
// list before falling back to applied_at.
const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];

module.exports = { STAGES };
