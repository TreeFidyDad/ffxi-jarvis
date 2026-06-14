// FFXI jobs. `code` is the in-game abbreviation, `name` the full job name,
// `emoji` a best-effort thematic icon used in roster columns.
const JOBS = [
  { code: 'WAR', name: 'Warrior', emoji: '🪓' },
  { code: 'MNK', name: 'Monk', emoji: '👊' },
  { code: 'WHM', name: 'White Mage', emoji: '⛅' },
  { code: 'BLM', name: 'Black Mage', emoji: '🔥' },
  { code: 'RDM', name: 'Red Mage', emoji: '🌹' },
  { code: 'THF', name: 'Thief', emoji: '🗝️' },
  { code: 'PLD', name: 'Paladin', emoji: '🛡️' },
  { code: 'DRK', name: 'Dark Knight', emoji: '🌑' },
  { code: 'BST', name: 'Beastmaster', emoji: '🐺' },
  { code: 'BRD', name: 'Bard', emoji: '🎵' },
  { code: 'RNG', name: 'Ranger', emoji: '🏹' },
  { code: 'SAM', name: 'Samurai', emoji: '🗡️' },
  { code: 'NIN', name: 'Ninja', emoji: '🥷' },
  { code: 'DRG', name: 'Dragoon', emoji: '🐉' },
  { code: 'SMN', name: 'Summoner', emoji: '🔮' },
];

const JOB_BY_CODE = new Map(JOBS.map((j) => [j.code, j]));

function jobLabel(code) {
  const job = JOB_BY_CODE.get(code);
  return job ? job.code : code || '???';
}

function jobEmoji(code) {
  return JOB_BY_CODE.get(code)?.emoji || '❔';
}

function jobName(code) {
  return JOB_BY_CODE.get(code)?.name || code || 'No Job';
}

module.exports = { JOBS, JOB_BY_CODE, jobLabel, jobEmoji, jobName };
