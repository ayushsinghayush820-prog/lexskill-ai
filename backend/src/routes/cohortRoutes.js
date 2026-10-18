const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/cohortController');

const createSchema = z.object({ name: z.string().trim().min(2).max(120) }).strict();

router.use(authenticate);
router.get('/', requireRole('ADMIN', 'FACULTY', 'DEAN'), ctrl.list);
router.post('/', requireRole('ADMIN'), validate(createSchema), ctrl.create);

module.exports = router;