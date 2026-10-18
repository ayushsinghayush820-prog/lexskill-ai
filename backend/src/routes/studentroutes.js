const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/studentController');

const submitSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Submission cannot be empty')
      .min(30, 'Submission is too short')
      .max(50000, 'Submission is too long'),
  })
  .strict();

router.use(authenticate, requireRole('STUDENT'));
router.get('/assessments', ctrl.listAssessments);
router.get('/assessments/:id', ctrl.getAssessment);
router.post('/assessments/:id/submit', validate(submitSchema), ctrl.submit);

module.exports = router;