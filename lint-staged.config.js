// Two separate ESLint installs live in backend/ and frontend/ (different
// configs, different plugin sets), so each group of staged files needs
// eslint run from its own directory with paths relative to it — lint-staged
// gives us paths relative to the repo root by default.
import path from 'path';

function eslintIn(dir) {
  return (filenames) => {
    const rel = filenames.map((f) => path.relative(dir, f)).filter((f) => !f.startsWith('..'));
    if (rel.length === 0) return 'true';
    const quoted = rel.map((f) => JSON.stringify(f)).join(' ');
    return `sh -c 'cd ${dir} && npx eslint --fix ${quoted}'`;
  };
}

export default {
  'backend/**/*.js': [eslintIn('backend'), 'prettier --write'],
  'frontend/**/*.{ts,tsx}': [eslintIn('frontend'), 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
