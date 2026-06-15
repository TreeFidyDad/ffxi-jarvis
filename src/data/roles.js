// Attending roles (mutually exclusive per member) and non-attending statuses.

// Roles a member fills when they ARE coming. `icons` lists the custom role-icon
// emoji names to try, in priority order (most specific first), falling back to
// the unicode `emoji`. `group` is the summary bucket (tank / dps / healer).
const ROLES = [
  { key: 'tank', label: 'Tank', emoji: '🛡️', group: 'tank', icons: ['tank'] },
  { key: 'melee', label: 'Melee DPS', emoji: '⚔️', group: 'dps', icons: ['melee', 'dps'] },
  { key: 'pranged', label: 'Physical Ranged DPS', emoji: '🏹', group: 'dps', icons: ['pranged', 'ranged', 'dps'] },
  { key: 'mranged', label: 'Magical Ranged DPS', emoji: '🔮', group: 'dps', icons: ['mranged', 'ranged', 'dps'] },
  { key: 'support', label: 'Healer/Support', emoji: '➕', group: 'healer', icons: ['healer', 'support'] },
];

// Legacy/compat role keys that may still exist in the database from older
// signups but are no longer offered as buttons. Rendered, never selectable.
const LEGACY_ROLES = [
  { key: 'ranged', label: 'Ranged DPS', emoji: '🏹', group: 'dps', icons: ['ranged', 'pranged', 'dps'] },
];

const ROLE_BY_KEY = new Map([...ROLES, ...LEGACY_ROLES].map((r) => [r.key, r]));

// The three top-level role buttons on the public board. `dps` is not a role on
// its own — clicking it opens an ephemeral picker for the three DPS subtypes.
const MAIN_ROLE_BUTTONS = [
  { kind: 'role', key: 'tank', label: 'Tank', emoji: '🛡️', icons: ['tank'] },
  { kind: 'dps', label: 'DPS', emoji: '⚔️', icons: ['dps'] },
  { kind: 'role', key: 'support', label: 'Healer/Support', emoji: '➕', icons: ['healer', 'support'] },
];

// The DPS subtype choices shown in the ephemeral picker.
const DPS_ROLES = ROLES.filter((r) => r.group === 'dps');

// How the header summary line is grouped/labelled (the DPS subtypes collapse
// into one "DPS" bucket), matching the compact Tank / DPS / Healer-Support row.
const ROLE_GROUPS = [
  { label: 'Tank', emoji: '🛡️', icons: ['tank'], keys: ['tank'] },
  { label: 'DPS', emoji: '⚔️', icons: ['dps'], keys: ['melee', 'pranged', 'mranged', 'ranged'] },
  { label: 'Healer/Support', emoji: '➕', icons: ['healer', 'support'], keys: ['support'] },
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

module.exports = {
  ROLES,
  ROLE_BY_KEY,
  MAIN_ROLE_BUTTONS,
  DPS_ROLES,
  ROLE_GROUPS,
  STATUS,
  EXTRA_STATUSES,
};
