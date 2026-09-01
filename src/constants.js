const CONFIG_KEYS = {
  // channels
  ANNOUNCEMENTS_CHANNEL:   'announcements_channel',
  MOD_LOG_CHANNEL:         'mod_log_channel',
  PROJECTS_CHANNEL:        'projects_channel',
  PROJECTS_REVIEW_CHANNEL: 'projects_review_channel',
  EVENTS_CHANNEL:          'events_channel',
  GENERAL_CHANNEL:         'general_channel',
  FAQ_CHANNEL:             'faq_channel',
  TICKET_CHANNEL:          'ticket_channel',
  // categories
  TICKET_CATEGORY:         'ticket_category',
  // roles
  ADMIN_ROLE:              'admin_role',
  COMMITTEE_ROLE:          'committee_role',
  MEMBER_ROLE:             'member_role',
};

// Shared choice list for /setup-add and /setup-remove
const SETUP_CHOICES = [
  { name: 'Announcements Channel',    value: 'announcements_channel'   },
  { name: 'Mod Log Channel',          value: 'mod_log_channel'         },
  { name: 'Projects Channel',         value: 'projects_channel'        },
  { name: 'Projects Review Channel',  value: 'projects_review_channel' },
  { name: 'Events Channel',           value: 'events_channel'          },
  { name: 'General Channel',          value: 'general_channel'         },
  { name: 'FAQ Channel',              value: 'faq_channel'             },
  { name: 'Ticket Panel Channel',     value: 'ticket_channel'          },
  { name: 'Ticket Category',          value: 'ticket_category'         },
  { name: 'Admin Role',               value: 'admin_role'              },
  { name: 'Committee Role',           value: 'committee_role'          },
  { name: 'Member Role',              value: 'member_role'             },
];

const CHANNEL_KEYS = new Set([
  'announcements_channel',
  'mod_log_channel',
  'projects_channel',
  'projects_review_channel',
  'events_channel',
  'general_channel',
  'faq_channel',
  'ticket_channel',
]);

const CATEGORY_KEYS = new Set([
  'ticket_category',
]);

const ROLE_KEYS = new Set([
  'admin_role',
  'committee_role',
  'member_role',
]);

module.exports = { CONFIG_KEYS, SETUP_CHOICES, CHANNEL_KEYS, CATEGORY_KEYS, ROLE_KEYS };
