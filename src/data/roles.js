// Attending roles (mutually exclusive per member) and non-attending statuses.

// Roles a member fills when they ARE coming. `group` maps to the custom
// role icon emoji (role_tank / role_dps / role_healer).
const ROLES = [
  { key: 'tank', label: 'Tank', emoji: '🛡️', group: 'tank' },
  { key: 'melee', label: 'Melee DPS', emoji: '⚔️', group: 'dps' },
  { key: 'ranged', label: 'Ranged DPS', emoji: '🏹', group: 'dps' },
  { key: 'support', label: 'Support', emoji: '✨', group: 'healer' },
];

const ROLE_BY_KEY = new Map(ROLES.map((r) => [r.key, r]));

// How the header summary line is grouped/labelled (Melee + Ranged collapse into
// one "DPS" bucket), to match the compact Tank / DPS / Healer-Support display.
const ROLE_GROUPS = [
  { label: 'Tank', emoji: '🛡️', group: 'tank', keys: ['tank'] },
  { label: 'DPS', emoji: '⚔️', group: 'dps', keys: ['melee', 'ranged'] },
  { label: 'Healer/Support', emoji: '➕', group: 'healer', keys: ['support'] },
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
