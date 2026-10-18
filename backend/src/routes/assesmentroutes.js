const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/assessmentController');

const criterionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  skillDimension: z.enum([
    'ISSUE_SPOTTING', 'APPLICATION_OF_LAW', 'DRAFTING_QUALITY',
    'ARGUMENT_STRUCTURE', 'CITATION_ACCURACY', 'PROFESSIONAL_LANGUAGE',
  ]),
  maxScore: z.number().int().min(1).max(100),
  // Faculty-written score-band descriptors (the PDR's "rubric descriptors").
  descriptors: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        minScore: z.number().int().min(0).max(100),
        maxScore: z.number().int().min(0).max(100),
        text: z.string().trim().min(1).max(500),
      })
    )
    .max(6)
    .nullable()
    .optional(),
});
const criteriaList = z.array(criterionSchema).min(1, 'At least one criterion is required').max(12);

const IntegrityMode = z.enum(['SUPERVISED', 'PROCESS_TRACKED', 'OPEN_DISCLOSED', 'FORMATIVE']);
const dueAt = z.string().datetime({ offset: true }).nullable().optional(); // ISO, e.g. 2026-11-01T10:00:00.000Z

const fields = z.object({
  title: z.string().trim().min(3).max(200),
  courseName: z.string().trim().min(2).max(200),
  instructions: z.string().trim().min(20, 'Instructions must be at least 20 characters').max(20000),
  integrityMode: IntegrityMode,
  dueAt,
  cohortId: z.string().min(1),
});

const createSchema = fields.extend({ integrityMode: IntegrityMode.default('SUPERVISED'), criteria: criteriaList }).strict();
const updateSchema = fields
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
const rubricSchema = z.object({ criteria: criteriaList }).strict();

router.use(authenticate, requireRole('FACULTY'));

router.post('/', validate(createSchema), ctrl.create);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.patch('/:id', validate(updateSchema), ctrl.update);
router.get('/:id/rubric', ctrl.getRubric);
router.put('/:id/rubric', validate(rubricSchema), ctrl.replaceRubric);
router.post('/:id/publish', ctrl.publish);
router.post('/:id/close', ctrl.close);
router.get('/:id/submissions', ctrl.listSubmissions);

module.exports = router; 