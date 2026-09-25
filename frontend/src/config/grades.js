// Organizational seniority grade (1-9), a lightweight stand-in for BEL's
// real E1-E9 executive ladder. This is rank/seniority for the reports-to
// chain (managerId) — independent of clearanceLevel, which gates access to
// classified assets. A manager's grade must be >= their direct report's.
export const GRADE_LABELS = {
  1: 'E1 — Engineer',
  2: 'E2 — Senior Engineer',
  3: 'E3 — Deputy Manager',
  4: 'E4 — Manager',
  5: 'E5 — Senior Manager',
  6: 'E6 — Deputy General Manager',
  7: 'E7 — Additional General Manager',
  8: 'E8 — General Manager',
  9: 'E9 — Executive Director',
};

export const GRADE_OPTIONS = Object.entries(GRADE_LABELS).map(([value, label]) => ({
  value: Number(value),
  label,
}));

export const gradeLabel = (grade) => (grade ? GRADE_LABELS[grade] || `Grade ${grade}` : 'Not set');
