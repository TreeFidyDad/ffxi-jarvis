// Attending roles (mutually exclusive per member) and non-attending statuses.

// Roles a member fills when they ARE coming.
const ROLES = [
  { key: 'tank', label: 'Tank', emoji: '🛡️' },
  { key: 'melee', label: 'Melee DPS', emoji: '⚔️' },
  { key: 'ranged', label: 'Ranged DPS', emoji: '🏹' },
  { key: 'support', label: 'Support', emoji: '✨' },
];

const ROLE_BY_KEY = new Map(ROLES.map((r) => [r.key, r]));

// How the header summary line is grouped/labelled (Melee + Ranged collapse into
// one "DPS" bucket), to match the compact Tank / DPS / Healer-Support display.
const ROLE_GROUPS = [
  { label: 'Tank', emoji: '🛡️', keys: ['tank'] },
  { label: 'DPS', emoji: '⚔️', keys: ['melee', 'ranged'] },
  { label: 'Healer/Support', emoji: '➕', keys: ['support'] },
];

// Signup statuses. "attending" means they filled a role above.
const STATUS = {
  ATTENDING: 'attending',
  TENTATIVE: 'tentative',
  ABSENCE: 'absence',
};

const EXTRA_STATUSES = [
  { key: STATUS.TENTATIVE, label: 'Tentative', emoji: '❔' },
  { key: STATUS.ABSENCE, label: 'Absence', emoji: '❌' },
];

module.exports = { ROLES, ROLE_BY_KEY, ROLE_GROUPS, STATUS, EXTRA_STATUSES };
