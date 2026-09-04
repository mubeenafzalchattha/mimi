/* Talks to Apple Reminders over AppleScript.

   Notes from the school of hard knocks:
   - osascript gets the script on stdin and NO argv. Passing "-" plus arguments
     that start with a minus (like a negative number of seconds) is a good way to
     confuse it, so numbers are baked into the script text instead.
   - asking each reminder for each property is one Apple event per property per
     reminder, which times out on a real Reminders database. We ask for whole
     columns at once (`id of every reminder ... whose completed is false`) and
     fall back to the slow loop only if that fails.
   - a killed process gives us an empty stderr, so timeouts are reported as such. */
const { execFile } = require('child_process');

function osa(script, timeout) {
  return new Promise((resolve, reject) => {
    const child = execFile('osascript', {
      timeout: timeout || 90000,
      maxBuffer: 16 * 1024 * 1024,
      killSignal: 'SIGKILL'
    }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || '').trim();
        let msg = detail;
        if (!msg) {
          msg = err.killed
            ? `Reminders did not answer within ${Math.round((timeout || 90000) / 1000)}s`
            : (err.message || 'osascript failed');
        }
        const e = new Error(msg);
        e.timedOut = !!err.killed;
        e.notAuthorized = /-1743|not authori[sz]ed|not allowed to send apple events|user (has )?denied/i.test(detail);
        e.noReminders = /-1728|application isn.t running|can.t get application/i.test(detail);
        return reject(e);
      }
      resolve(String(stdout).replace(/\n$/, ''));
    });
    child.stdin.end(script);
  });
}

/* Reminders can drop the Apple event connection (-609 / -600), typically when
   the app was cold-launched by our own event and quit again while idle. Nudge it
   awake and try the script once more before giving up. */
const WAKE = `
if application "Reminders" is not running then
	launch application "Reminders"
	delay 1
end if
return "ok"
`;

function isConnectionLost(err) {
  return /-609|-600|connection is invalid|application isn.t running/i.test(err.message || '');
}

async function osaRetry(script, timeout) {
  try {
    return await osa(script, timeout);
  } catch (err) {
    if (!isConnectionLost(err)) throw err;
    try { await osa(WAKE, 30000); } catch (_) { /* fall through to the real retry */ }
    return osa(script, timeout);
  }
}

const FS = String.fromCharCode(31);
const RS = String.fromCharCode(30);

function fetchScript(horizonSeconds, backstopSeconds) {
  return `
set fs to (character id 31)
set rs to (character id 30)
set nowD to current date
set horizonS to ${Math.round(horizonSeconds)}
set backstopS to ${Math.round(backstopSeconds)}
set out to ""
with timeout of 600 seconds
	tell application "Reminders"
		repeat with l in lists
			set lname to name of l
			try
				set ids to id of (every reminder of l whose completed is false)
			on error
				set ids to {}
			end try
			if (count of ids) > 0 then
				set nms to name of (every reminder of l whose completed is false)
				set dds to due date of (every reminder of l whose completed is false)
				try
					set ads to allday due date of (every reminder of l whose completed is false)
				on error
					set ads to {}
				end try
				repeat with i from 1 to (count of ids)
					set d to item i of dds
					set isAllDay to "false"
					if d is missing value then
						set isAllDay to "true"
						if (count of ads) is greater than or equal to i then
							set d to item i of ads
						end if
					end if
					if d is not missing value then
						set secs to ((d - nowD) as integer)
						if secs < horizonS and secs > backstopS then
							set out to out & (item i of ids) & fs & (item i of nms) & fs & (secs as text) & fs & lname & fs & isAllDay & rs
						end if
					end if
				end repeat
			end if
		end repeat
	end tell
end timeout
return out
`;
}

const COMPLETE = (id) => `
set theId to "${String(id).replace(/["\\]/g, '\\$&')}"
with timeout of 300 seconds
	tell application "Reminders"
		try
			set r to first reminder whose id is theId
			set completed of r to true
			return "ok"
		on error
		end try
		repeat with l in lists
			repeat with r in (reminders of l whose completed is false)
				if (id of r as text) is theId then
					set completed of r to true
					return "ok"
				end if
			end repeat
		end repeat
	end tell
end timeout
return "notfound"
`;

const LISTS = `
with timeout of 120 seconds
	tell application "Reminders" to set ns to name of every list
end timeout
set AppleScript's text item delimiters to (character id 31)
return ns as text
`;

const PING = `
with timeout of 300 seconds
	tell application "Reminders" to set n to (count of lists)
end timeout
return n as text
`;

/** @returns {Promise<Array<{id,title,secondsUntilDue,list,allDay}>>} */
async function fetchDue(horizonSeconds, backstopSeconds) {
  const raw = await osaRetry(fetchScript(horizonSeconds, backstopSeconds), 90000);
  if (!raw) return [];
  return raw.split(RS).filter((r) => r.trim()).map((rec) => {
    const [id, title, secs, list, allday] = rec.split(FS);
    return {
      id: (id || '').trim(),
      title: (title || 'Untitled').trim(),
      secondsUntilDue: parseInt(secs, 10) || 0,
      list: (list || '').trim(),
      allDay: String(allday).trim() === 'true'
    };
  }).filter((r) => r.id);
}

async function complete(id) {
  const res = await osaRetry(COMPLETE(id), 60000);
  return res.trim() === 'ok';
}

async function listNames() {
  const raw = await osaRetry(LISTS, 60000);
  return raw ? raw.split(FS).map((s) => s.trim()).filter(Boolean) : [];
}

/** Cheap call whose only job is to trigger (and wait for) the permission prompt. */
async function ping() {
  await osaRetry(PING, 300000);
  return true;
}

module.exports = { fetchDue, complete, listNames, ping };
