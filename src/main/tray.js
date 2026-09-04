/* Menu bar cat (a smiling one). Lists every cat on screen with a way to finish it. */
const { Tray, Menu, nativeImage } = require('electron');

const ICON_1X = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAXUlEQVR4nN1RQQ7AIAwCs/9/WS8uWRWLMzuNYwsIFfgQ9YRbDkwCZzRwJtPu2iWucCd40z88oioAADdn0oDdnWYWXFcV7N5VqA+xrJD9wiiQKegICQjEI8qImfgnaHIXEhXKGQ2PAAAAAElFTkSuQmCC';
const ICON_2X = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAl0lEQVR4nO2V0Q6AIAhFsfX/v1wvsSWZXjRCN87WUxZwECUKnhzX88t/N4NAKvbKO842Dcao2pzaANNrAtpHSxhgLCbD38C9ryYVtmK7G9AkkAibBHSdOgETkCngauR5IPcMui7D3cDIFMg+d33vbkBzEsqevlUM9Z5ZygB6K6r2gruBUjXWd0IWc0oDzNcmirHcDQRBcAJvBxcy6z/lxwAAAABJRU5ErkJggg==';

function timeLabel(dueAt) {
  const mins = Math.round((dueAt - Date.now()) / 60000);
  if (mins > 1) return `in ${mins}m`;
  if (mins === 1) return 'in 1m';
  if (mins === 0) return 'now';
  if (mins > -60) return `${-mins}m late`;
  const h = Math.round(-mins / 60);
  return `${h}h late`;
}

function createTray(handlers) {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,' + ICON_1X);
  icon.addRepresentation({
    scaleFactor: 2,
    dataURL: 'data:image/png;base64,' + ICON_2X
  });
  icon.setTemplateImage(true);

  const tray = new Tray(icon);

  function update() {
    const pets = handlers.getPets();
    const cfg = handlers.getConfig();
    const err = handlers.getError();

    const items = [];
    if (err) {
      items.push({ label: 'Cannot read Reminders — check Automation permission', enabled: false });
      items.push({ type: 'separator' });
    }
    items.push({
      label: pets.length ? `${pets.length} cat${pets.length > 1 ? 's' : ''} on your screen` : 'No cats right now',
      enabled: false
    });
    for (const p of pets) {
      const title = p.title.length > 40 ? p.title.slice(0, 39) + '…' : p.title;
      items.push({
        label: `✓  ${title}  (${timeLabel(p.dueAt)})`,
        click: () => handlers.onComplete(p.id)
      });
    }
    items.push({ type: 'separator' });
    items.push({
      label: 'Sound',
      type: 'checkbox',
      checked: cfg.sound,
      click: () => handlers.onConfig({ sound: !cfg.sound })
    });
    items.push({
      label: 'Cats arrive',
      submenu: [5, 10, 15, 30, 60].map((m) => ({
        label: `${m} minutes before due`,
        type: 'radio',
        checked: cfg.leadMinutes === m,
        click: () => handlers.onConfig({ leadMinutes: m })
      }))
    });
    items.push({
      label: 'Cat size',
      submenu: [2, 3, 4, 5].map((s) => ({
        label: `${s}x` + (s === 3 ? ' (default)' : ''),
        type: 'radio',
        checked: cfg.scale === s,
        click: () => handlers.onConfig({ scale: s })
      }))
    });
    items.push({ type: 'separator' });
    items.push({ label: 'Open Mimi…', accelerator: 'Command+O', click: handlers.onHome });
    items.push({ label: 'Summon a test cat', click: handlers.onSummon });
    items.push({ label: 'Check reminders now', click: handlers.onRefresh });
    // items.push({ label: 'Open config file…', click: handlers.onOpenConfig });
    items.push({ type: 'separator' });
    items.push({ label: 'Quit Mimi', click: handlers.onQuit });

    tray.setToolTip(pets.length ? `Mimi — ${pets.length} waiting` : 'Mimi');
    tray.setContextMenu(Menu.buildFromTemplate(items));
  }

  update();
  return { tray, update };
}

module.exports = { createTray };
