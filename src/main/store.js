/* Tiny JSON config store in ~/Library/Application Support/Mimi/config.json */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  leadMinutes: 15,          // spawn a cat this many minutes before the due time
  pollSeconds: 20,          // how often we ask Reminders what's due
  ignoreOlderThanHours: 24, // don't summon cats for ancient overdue reminders
  maxPets: 10,              // sanity cap so 40 reminders don't melt your screen
  sound: true,
  volume: 0.5,
  meowEverySeconds: 25,     // per cat, before the deadline
  overdueMeowEverySeconds: 10,
  scale: 3,                 // pixel size. 3 = 48x42 cat, 4 = chonky
  clickBodyToComplete: false, // false = click cat to pet it, click the ✓ to finish
  includeAllDay: false,     // all-day reminders have no time, they'd spawn at midnight
  lists: [],                // e.g. ["Work", "Personal"]; empty = every list
  coat: 'random',           // a coat name from sprites.js, or 'random' per reminder
  homeSeen: false           // the home screen opens itself on the very first run
};

let cache = null;
let file = null;

function filePath() {
  if (!file) file = path.join(app.getPath('userData'), 'config.json');
  return file;
}

function load() {
  if (cache) return cache;
  let onDisk = {};
  try {
    onDisk = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
  } catch (_) { /* first run, or someone typo'd the json */ }
  cache = Object.assign({}, DEFAULTS, onDisk);
  return cache;
}

function save(patch) {
  cache = Object.assign(load(), patch || {});
  try {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true });
    fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('[petpet] could not save config:', e.message);
  }
  return cache;
}

module.exports = { load, save, filePath, DEFAULTS };
