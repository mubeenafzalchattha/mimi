#!/usr/bin/env node
/* Run with:  npm run doctor
   Talks to Reminders exactly the way Mimi does, but prints everything,
   so you can see the real AppleScript error instead of a shrug. */
const reminders = require('../src/main/reminders');

(async () => {
  console.log('1. asking Reminders for your list names…');
  try {
    const t = Date.now();
    const names = await reminders.listNames();
    console.log(`   ok (${Date.now() - t}ms):`, names.join(', ') || '(no lists)');
  } catch (err) {
    console.error('   FAILED:', err.message);
    if (err.notAuthorized) {
      console.error('\n   macOS is blocking Apple events. System Settings → Privacy & Security →');
      console.error('   Automation → your terminal / Electron / Mimi → switch on "Reminders".');
    } else if (err.timedOut) {
      console.error('\n   Reminders never answered. Open the Reminders app once, let it finish syncing,');
      console.error('   then try again.');
    }
    process.exit(1);
  }

  console.log('2. looking for anything due in the next 24h (or overdue by up to 24h)…');
  const t = Date.now();
  const rows = await reminders.fetchDue(24 * 3600, -24 * 3600);
  console.log(`   ${rows.length} found in ${Date.now() - t}ms`);
  for (const r of rows.slice(0, 25)) {
    const mins = Math.round(r.secondsUntilDue / 60);
    console.log(`   - ${r.title}  [${r.list}]  ${mins >= 0 ? 'in ' + mins + 'm' : -mins + 'm late'}${r.allDay ? '  (all-day)' : ''}`);
  }
  if (!rows.length) {
    console.log('   Nothing due. Add a reminder with a time on it and run this again.');
  }
  console.log('\nIf both steps passed, Mimi will work. If step 2 was slow (>10s),');
  console.log('raise pollSeconds in the config file.');
})();
