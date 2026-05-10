'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatDuration,
  buildEventEmbed,
  buildCancelledEmbed,
  buildRegisterRow,
  buildWithdrawRow,
  buildAttendanceRow,
  buildRegistrationDMEmbed,
  EVENT_COLORS,
  EVENT_TYPE_LABELS,
} = require('../../src/utils/eventHandlers');

// ── formatDuration ────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  test('0 minutes', () => assert.equal(formatDuration(0), '0 minutes'));
  test('1 minute (singular)', () => assert.equal(formatDuration(1), '1 minute'));
  test('2 minutes', () => assert.equal(formatDuration(2), '2 minutes'));
  test('59 minutes', () => assert.equal(formatDuration(59), '59 minutes'));
  test('60 minutes → 1 hour', () => assert.equal(formatDuration(60), '1 hour'));
  test('61 minutes → 1 hour 1 minute', () => assert.equal(formatDuration(61), '1 hour 1 minute'));
  test('90 minutes → 1 hour 30 minutes', () => assert.equal(formatDuration(90), '1 hour 30 minutes'));
  test('120 minutes → 2 hours', () => assert.equal(formatDuration(120), '2 hours'));
  test('121 minutes → 2 hours 1 minute', () => assert.equal(formatDuration(121), '2 hours 1 minute'));
  test('180 minutes → 3 hours', () => assert.equal(formatDuration(180), '3 hours'));
  test('150 minutes → 2 hours 30 minutes', () => assert.equal(formatDuration(150), '2 hours 30 minutes'));
});

// ── EVENT_COLORS / EVENT_TYPE_LABELS ─────────────────────────────────────────

describe('EVENT_COLORS', () => {
  test('workshop is Sky blue', () => assert.equal(EVENT_COLORS.workshop, 0x6A9BCC));
  test('hackathon is Terracotta', () => assert.equal(EVENT_COLORS.hackathon, 0xD97757));
  test('research_salon is Sage', () => assert.equal(EVENT_COLORS.research_salon, 0x788C5D));
  test('committee_meeting is Sand', () => assert.equal(EVENT_COLORS.committee_meeting, 0xCD9D7D));
  test('tabling is Mist', () => assert.equal(EVENT_COLORS.tabling, 0xE8E6DC));
});

describe('EVENT_TYPE_LABELS', () => {
  test('workshop label', () => assert.equal(EVENT_TYPE_LABELS.workshop, 'Workshop'));
  test('hackathon label', () => assert.equal(EVENT_TYPE_LABELS.hackathon, 'Hackathon'));
  test('research_salon label', () => assert.equal(EVENT_TYPE_LABELS.research_salon, 'Research Salon'));
  test('committee_meeting label', () => assert.equal(EVENT_TYPE_LABELS.committee_meeting, 'Committee Meeting'));
  test('tabling label', () => assert.equal(EVENT_TYPE_LABELS.tabling, 'Tabling'));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);
const FUTURE = NOW + 86400; // tomorrow

function makeEvent(overrides = {}) {
  return {
    id:               1,
    name:             'Test Event',
    description:      null,
    location:         'Room 101',
    type:             'workshop',
    starts_at:        FUTURE,
    duration_minutes: 60,
    guild_id:         'guild1',
    event_channel_id: 'ch1',
    message_id:       'msg1',
    ...overrides,
  };
}

// ── buildEventEmbed ───────────────────────────────────────────────────────────

describe('buildEventEmbed', () => {
  test('uses the correct color for event type', () => {
    for (const [type, color] of Object.entries(EVENT_COLORS)) {
      const data = buildEventEmbed(makeEvent({ type }), [], 0).toJSON();
      assert.equal(data.color, color, `Wrong color for type=${type}`);
    }
  });

  test('falls back to brand blue for unknown type', () => {
    const data = buildEventEmbed(makeEvent({ type: 'mystery' }), [], 0).toJSON();
    assert.equal(data.color, 0x5865f2);
  });

  test('shows event name as title', () => {
    const data = buildEventEmbed(makeEvent({ name: 'Hackfest 2026' }), [], 0).toJSON();
    assert.equal(data.title, 'Hackfest 2026');
  });

  test('shows correct Type field with human-readable label', () => {
    const data = buildEventEmbed(makeEvent({ type: 'research_salon' }), [], 0).toJSON();
    const typeField = data.fields.find(f => f.name === 'Type');
    assert.equal(typeField.value, 'Research Salon');
  });

  test('shows Location field', () => {
    const data = buildEventEmbed(makeEvent({ location: 'Library' }), [], 0).toJSON();
    assert.equal(data.fields.find(f => f.name === 'Location').value, 'Library');
  });

  test('defaults Location to TBD when null', () => {
    const data = buildEventEmbed(makeEvent({ location: null }), [], 0).toJSON();
    assert.equal(data.fields.find(f => f.name === 'Location').value, 'TBD');
  });

  test('shows N/A when no organizers', () => {
    const data = buildEventEmbed(makeEvent(), [], 0).toJSON();
    assert.equal(data.fields.find(f => f.name === 'Organiser(s)').value, 'N/A');
  });

  test('joins multiple organizers with comma and mention', () => {
    const data = buildEventEmbed(makeEvent(), ['uid1', 'uid2'], 0).toJSON();
    const val = data.fields.find(f => f.name === 'Organiser(s)').value;
    assert.ok(val.includes('<@uid1>'));
    assert.ok(val.includes('<@uid2>'));
    assert.ok(val.includes(','));
  });

  test('shows participant count', () => {
    const data = buildEventEmbed(makeEvent(), [], 42).toJSON();
    assert.equal(data.fields.find(f => f.name === 'Participants').value, '42');
  });

  test('shows Duration field using formatDuration', () => {
    const data = buildEventEmbed(makeEvent({ duration_minutes: 90 }), [], 0).toJSON();
    assert.equal(data.fields.find(f => f.name === 'Duration').value, '1 hour 30 minutes');
  });

  test('description shown when set', () => {
    const data = buildEventEmbed(makeEvent({ description: 'A great event.' }), [], 0).toJSON();
    assert.equal(data.description, 'A great event.');
  });

  test('no description when null', () => {
    const data = buildEventEmbed(makeEvent({ description: null }), [], 0).toJSON();
    assert.ok(!data.description);
  });

  test('footer says "CBC Events" for active event', () => {
    const data = buildEventEmbed(makeEvent(), [], 0).toJSON();
    assert.equal(data.footer.text, 'CBC Events');
  });

  test('footer says "This event has ended." when ended=true', () => {
    const data = buildEventEmbed(makeEvent(), [], 0, true).toJSON();
    assert.equal(data.footer.text, 'This event has ended.');
  });

  test('footer says "This event has ended." when starts_at is in the past past duration', () => {
    const pastEvent = makeEvent({ starts_at: NOW - 7200, duration_minutes: 60 }); // ended 1h ago
    const data = buildEventEmbed(pastEvent, [], 0).toJSON();
    assert.equal(data.footer.text, 'This event has ended.');
  });
});

// ── buildCancelledEmbed ───────────────────────────────────────────────────────

describe('buildCancelledEmbed', () => {
  test('uses red color', () => {
    const data = buildCancelledEmbed(makeEvent()).toJSON();
    assert.equal(data.color, 0xed4245);
  });

  test('title contains event name', () => {
    const data = buildCancelledEmbed(makeEvent({ name: 'My Event' })).toJSON();
    assert.ok(data.title.includes('My Event'));
  });

  test('title contains Cancelled', () => {
    const data = buildCancelledEmbed(makeEvent()).toJSON();
    assert.ok(data.title.includes('Cancelled'));
  });

  test('footer is CBC Events', () => {
    assert.equal(buildCancelledEmbed(makeEvent()).toJSON().footer.text, 'CBC Events');
  });
});

// ── buildRegisterRow ──────────────────────────────────────────────────────────

describe('buildRegisterRow', () => {
  test('button label is Register', () => {
    const [btn] = buildRegisterRow(5).toJSON().components;
    assert.equal(btn.label, 'Register');
  });

  test('custom ID contains event ID', () => {
    const [btn] = buildRegisterRow(5).toJSON().components;
    assert.ok(btn.custom_id.includes('5'));
  });

  test('enabled by default', () => {
    const [btn] = buildRegisterRow(5).toJSON().components;
    assert.equal(btn.disabled, false);
  });

  test('disabled when passed true', () => {
    const [btn] = buildRegisterRow(5, true).toJSON().components;
    assert.equal(btn.disabled, true);
  });
});

// ── buildWithdrawRow ──────────────────────────────────────────────────────────

describe('buildWithdrawRow', () => {
  test('button label is Withdraw Registration', () => {
    const [btn] = buildWithdrawRow(7).toJSON().components;
    assert.equal(btn.label, 'Withdraw Registration');
  });

  test('custom ID contains event ID', () => {
    const [btn] = buildWithdrawRow(7).toJSON().components;
    assert.ok(btn.custom_id.includes('7'));
  });

  test('enabled by default', () => {
    assert.equal(buildWithdrawRow(7).toJSON().components[0].disabled, false);
  });

  test('can be disabled', () => {
    assert.equal(buildWithdrawRow(7, true).toJSON().components[0].disabled, true);
  });
});

// ── buildAttendanceRow ────────────────────────────────────────────────────────

describe('buildAttendanceRow', () => {
  test('has two buttons', () => {
    assert.equal(buildAttendanceRow(1).toJSON().components.length, 2);
  });

  test('first button custom ID contains yes and event ID', () => {
    const [yes] = buildAttendanceRow(10).toJSON().components;
    assert.ok(yes.custom_id.includes('yes'));
    assert.ok(yes.custom_id.includes('10'));
  });

  test('second button custom ID contains no and event ID', () => {
    const [, no] = buildAttendanceRow(10).toJSON().components;
    assert.ok(no.custom_id.includes('no'));
    assert.ok(no.custom_id.includes('10'));
  });

  test('buttons enabled by default', () => {
    const [yes, no] = buildAttendanceRow(1).toJSON().components;
    assert.equal(yes.disabled, false);
    assert.equal(no.disabled, false);
  });

  test('buttons disabled when passed true', () => {
    const [yes, no] = buildAttendanceRow(1, true).toJSON().components;
    assert.equal(yes.disabled, true);
    assert.equal(no.disabled, true);
  });
});

// ── buildRegistrationDMEmbed ──────────────────────────────────────────────────

describe('buildRegistrationDMEmbed', () => {
  test('uses event type color', () => {
    const data = buildRegistrationDMEmbed(makeEvent({ type: 'hackathon' }), []).toJSON();
    assert.equal(data.color, EVENT_COLORS.hackathon);
  });

  test('title contains event name', () => {
    const data = buildRegistrationDMEmbed(makeEvent({ name: 'Hackfest' }), []).toJSON();
    assert.ok(data.title.includes('Hackfest'));
  });

  test('shows Location field', () => {
    const data = buildRegistrationDMEmbed(makeEvent({ location: 'Hall A' }), []).toJSON();
    assert.equal(data.fields.find(f => f.name === 'Location').value, 'Hall A');
  });

  test('organizers N/A when empty', () => {
    const data = buildRegistrationDMEmbed(makeEvent(), []).toJSON();
    assert.equal(data.fields.find(f => f.name === 'Organiser(s)').value, 'N/A');
  });

  test('shows multiple organizers as mentions', () => {
    const data = buildRegistrationDMEmbed(makeEvent(), ['u1', 'u2']).toJSON();
    const val = data.fields.find(f => f.name === 'Organiser(s)').value;
    assert.ok(val.includes('<@u1>') && val.includes('<@u2>'));
  });

  test('footer is CBC Events', () => {
    assert.equal(buildRegistrationDMEmbed(makeEvent(), []).toJSON().footer.text, 'CBC Events');
  });
});
