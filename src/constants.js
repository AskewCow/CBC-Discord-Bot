// Every configurable setting, its storage key, and what kind of value it holds.
// This is the single source of truth — the CONFIG_KEYS map, the /setup-* choice
// list, and the kind Sets below are all derived from it.
const SETUP_SETTINGS = [
  { name: 'Announcements Channel',   key: 'announcements_channel',   kind: 'channel'  },
  { name: 'Mod Log Channel',         key: 'mod_log_channel',         kind: 'channel'  },
  { name: 'Projects Channel',        key: 'projects_channel',        kind: 'channel'  },
  { name: 'Projects Review Channel', key: 'projects_review_channel', kind: 'channel'  },
  { name: 'Events Channel',          key: 'events_channel',          kind: 'channel'  },
  { name: 'General Channel',         key: 'general_channel',         kind: 'channel'  },
  { name: 'FAQ Channel',             key: 'faq_channel',             kind: 'channel'  },
  { name: 'Ticket Panel Channel',    key: 'ticket_channel',          kind: 'channel'  },
  { name: 'Ticket Category',         key: 'ticket_category',         kind: 'category' },
  { name: 'Committee Role',          key: 'committee_role',          kind: 'role'     },
  { name: 'Ambassador Role',         key: 'ambassador_role',         kind: 'role'     },
  { name: 'Member Role',             key: 'member_role',             kind: 'role'     },
];

const CONFIG_KEYS = {
  ANNOUNCEMENTS_CHANNEL:   'announcements_channel',
  MOD_LOG_CHANNEL:         'mod_log_channel',
  PROJECTS_CHANNEL:        'projects_channel',
  PROJECTS_REVIEW_CHANNEL: 'projects_review_channel',
  EVENTS_CHANNEL:          'events_channel',
  GENERAL_CHANNEL:         'general_channel',
  FAQ_CHANNEL:             'faq_channel',
  TICKET_CHANNEL:          'ticket_channel',
  TICKET_CATEGORY:         'ticket_category',
  COMMITTEE_ROLE:          'committee_role',
  AMBASSADOR_ROLE:         'ambassador_role',
  MEMBER_ROLE:             'member_role',
};

// Choice list for /setup-add and /setup-remove ({ name, value } pairs).
const SETUP_CHOICES = SETUP_SETTINGS.map(({ name, key }) => ({ name, value: key }));

const keysOfKind = (kind) =>
  new Set(SETUP_SETTINGS.filter((s) => s.kind === kind).map((s) => s.key));

const CHANNEL_KEYS  = keysOfKind('channel');
const CATEGORY_KEYS = keysOfKind('category');
const ROLE_KEYS     = keysOfKind('role');

// setup key → 'channel' | 'category' | 'role'
const KIND_BY_KEY = Object.fromEntries(SETUP_SETTINGS.map((s) => [s.key, s.kind]));

const DEFAULT_EVENT_THANKYOU =
  'Thank you for attending! We hope to see you at our next event.';

module.exports = {
  CONFIG_KEYS,
  SETUP_SETTINGS,
  SETUP_CHOICES,
  CHANNEL_KEYS,
  CATEGORY_KEYS,
  ROLE_KEYS,
  KIND_BY_KEY,
  DEFAULT_EVENT_THANKYOU,
};
