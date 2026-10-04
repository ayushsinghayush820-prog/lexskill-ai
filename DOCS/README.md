# LexSkill AI — Working Frontend Prototype

Frontend-only institutional legal skills assessment prototype based on the supplied Google Stitch screens.

## Run locally

Option A: open `index.html` directly in a modern browser.

Option B (recommended):

```bash
cd lexskill-ai
python -m http.server 8000
```
Then open `http://localhost:8000`.

## Demo credentials

- Faculty: `faculty@lexskill.demo`
- Student: `student@lexskill.demo`
- Admin: `admin@lexskill.demo`

There is no real authentication. Pick a role on the demo login screen.

## Main demo path

Faculty → Faculty Dashboard → Student Submissions → Ayush Sharma → AI Review & Citations → edit a faculty score/comment → Finalize Assessment → Student Skill Profile → switch role to Admin → Institutional Skills Intelligence → Generate Institutional Report.

## Functional interactions

- Role selector and persistent demo role
- Drawer/sidebar navigation
- Assessment list and search
- Student submission search
- Assessment brief + editable answer + mock submit/analyze flow
- AI-assisted rubric with faculty score overrides
- Demo citation verification states
- Faculty comment + finalization state
- Student skill profile and radar/progression charts
- Cohort analytics and heatmap
- Dean institutional intelligence
- Search modal across students/assessments/submissions
- Notification dropdown with navigation
- Create Assessment modal
- Institutional report generation + preview
- LocalStorage state persistence
- Responsive layout for desktop/tablet/mobile

## Intentionally backend-dependent / mocked

- Authentication
- Database persistence
- AI model inference
- Real legal citation verification
- PDF/Excel generation
- University ERP / SIS integrations
- Production authorization/security
- Real notifications

## Design fidelity

The supplied Stitch files are treated as the visual source of truth: the implementation keeps the same navy/gold editorial visual language, Inter + Newsreader + JetBrains Mono typography, compact cards, drawer navigation, competency/rubric structures, institutional analytics patterns, and faculty-governance messaging.
