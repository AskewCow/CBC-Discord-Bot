const CONFIG_KEYS = {
  // channels
  ANNOUNCEMENTS_CHANNEL: 'announcements_channel',
  MOD_LOG_CHANNEL:       'mod_log_channel',
  ONBOARDING_CHANNEL:    'onboarding_channel',
  PROJECTS_CHANNEL:      'projects_channel',
  EVENTS_CHANNEL:        'events_channel',
  GENERAL_CHANNEL:       'general_channel',
  HELP_CHANNEL:          'help_channel',
  // roles
  ADMIN_ROLE:            'admin_role',
  COMMITTEE_ROLE:        'committee_role',
  MOD_ROLE:              'mod_role',
};

// Shared choice list for /setup-add and /setup-remove
const SETUP_CHOICES = [
  { name: 'Announcements Channel', value: 'announcements_channel' },
  { name: 'Mod Log Channel',       value: 'mod_log_channel'       },
  { name: 'Onboarding Channel',    value: 'onboarding_channel'    },
  { name: 'Projects Channel',      value: 'projects_channel'      },
  { name: 'Events Channel',        value: 'events_channel'        },
  { name: 'General Channel',       value: 'general_channel'       },
  { name: 'Help Desk Channel',     value: 'help_channel'          },
  { name: 'Admin Role',            value: 'admin_role'            },
  { name: 'Committee Role',        value: 'committee_role'        },
  { name: 'Moderator Role',        value: 'mod_role'              },
];

const CHANNEL_KEYS = new Set([
  'announcements_channel',
  'mod_log_channel',
  'onboarding_channel',
  'projects_channel',
  'events_channel',
  'general_channel',
  'help_channel',
]);

const ROLE_KEYS = new Set([
  'admin_role',
  'committee_role',
  'mod_role',
]);

module.exports = { CONFIG_KEYS, SETUP_CHOICES, CHANNEL_KEYS, ROLE_KEYS };
