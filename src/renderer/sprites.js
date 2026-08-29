/* ---------------------------------------------------------------
   sprites.js - hand-drawn pixel art for the cats.
   Every sprite is a list of strings, one char per pixel:
     .  transparent      o  outline
     B  coat colour      D  coat shadow
     W  belly (white)    P  pink (ears / nose / tongue)
     E  eye
   Sprites are layered: TAIL -> BODY -> LEGS -> face overlays.
   Body grid is 16x9, legs 16x3 (drawn at y+9), tail 6x8 (x-4, y+1).
---------------------------------------------------------------- */
(function () {
  'use strict';

  const COATS = {
    orange:    { blurb: 'classic tabby', label: 'Marmalade', B: '#f4a24c', D: '#d17f33', W: '#fff3e2', P: '#f2909f', E: '#2b6b3f', o: '#3a2a22' },
    grey:      { blurb: 'the quiet one', label: 'Ash',       B: '#aab4c2', D: '#7f8b9b', W: '#f2f5f9', P: '#f2909f', E: '#3f7f6b', o: '#2b2f3a' },
    tuxedo:    { blurb: 'wears a suit', label: 'Domino',    B: '#3f4250', D: '#2c2f3a', W: '#fbfbfd', P: '#f2909f', E: '#c9a227', o: '#191b23' },
    cream:     { blurb: 'buttery', label: 'Biscuit',   B: '#f6e0bd', D: '#d7bb92', W: '#fffaf0', P: '#f08a9c', E: '#6a8fd8', o: '#4a3a2c' },
    siamese:   { blurb: 'dramatic', label: 'Mocha',     B: '#e6d8c3', D: '#8c6a52', W: '#fdf6ea', P: '#f2909f', E: '#4aa3d8', o: '#43342a' },
    calico:    { blurb: 'chaos in three colours', label: 'Patch',     B: '#f2e5d0', D: '#e07b39', W: '#fffaf2', P: '#f2909f', E: '#5f9e4a', o: '#3d3128' },
    void:      { blurb: 'absorbs light', label: 'Void',      B: '#5a4a7a', D: '#3d3157', W: '#e9e2ff', P: '#ff9ecb', E: '#ffd166', o: '#221a33' },
    snow:      { blurb: 'walking snowball', label: 'Blizzard',  B: '#f4f6fa', D: '#d4dae6', W: '#ffffff', P: '#f2909f', E: '#7fb2e8', o: '#4a5568' },
    bubblegum: { blurb: 'far too sweet', label: 'Bubblegum', B: '#f7a8c9', D: '#d97fa8', W: '#fff0f6', P: '#ff7fae', E: '#7a4a63', o: '#5a2f45' },
    matcha:    { blurb: 'green tea energy', label: 'Matcha',    B: '#a8d8a0', D: '#7fb079', W: '#f2fff0', P: '#f2909f', E: '#3f7a35', o: '#2f4a2b' },
    blueberry: { blurb: 'cool customer', label: 'Blueberry', B: '#8fa8e0', D: '#6a80b8', W: '#eef2ff', P: '#f2909f', E: '#ffd166', o: '#2f3a5a' },
    honey:     { blurb: 'golden hour', label: 'Honey',     B: '#f7cf5a', D: '#d9a832', W: '#fff8e0', P: '#f2909f', E: '#8a6a1f', o: '#4a3a12' },
    ghost:     { blurb: 'barely there', label: 'Ghost',     B: '#dcd9f0', D: '#b8b4d8', W: '#ffffff', P: '#e0a8d8', E: '#8f7fd8', o: '#6a5f8a' }
  };
  const COAT_NAMES = Object.keys(COATS);

  // ---- body: 16 wide x 11 tall, facing right -----------------------
  const BODY = [
    '.........o....o.',
    '........oPo..oPo',
    '........oBBBBBBo',
    '.......oBBBBBBBo',
    '.......oBBEBBEBo',
    '.......oBBBBPBBo',
    '.......oBBBDBDBo',
    '.oBBBBBBBBBBBBo.',
    '.oBBBBBBBBWWWBo.',
    '.oBBBWWWWWWWBBo.',
    '..oBBBBBBBBBBo..'
  ];

  // ---- legs: 16 wide x 3 tall, drawn at body y+11 ------------------
  const LEGS = {
    stand: [
      '...oBo....oBo...',
      '...oBo....oBo...',
      '...ooo....ooo...'
    ],
    walk: [
      [ '..oBo......oBo..', '..oBo......oBo..', '..ooo......ooo..' ],
      [ '...oBo....oBo...', '...oBo....oBo...', '...ooo....ooo...' ],
      [ '....oBo..oBo....', '....oBo..oBo....', '....ooo..ooo....' ],
      [ '...oBo....oBo...', '...oBo....oBo...', '...ooo....ooo...' ]
    ],
    // loaf: paws tucked under, cat parked in one spot
    tuck: [
      '...oBBo..oBBo...',
      '...oooo..oooo...',
      '................'
    ]
  };

  // ---- tail: 6 wide x 8 tall, drawn at body (x-4, y+4) -------------
  const TAILS = [
    [ '..oo..', '.oDBo.', '.oBBo.', '.oBo..', '..oBo.', '...oBo', '...oBB', '......' ],
    [ '.oo...', 'oDBo..', 'oBBo..', '.oBo..', '..oBo.', '...oBo', '...oBB', '......' ],
    [ '......', '......', '.oo...', 'oDBo..', 'oBBo..', '.oBBo.', '..oBBB', '...oo.' ],
    [ '......', '......', '......', '......', 'oo....', 'oBoo..', '.oBBBB', '..oo..' ]
  ];

  // ---- tiny extras -------------------------------------------------
  const HEART = [ '.o.o.', 'ooooo', 'ooooo', '.ooo.', '..o..' ];
  const SPARK = [ '..o..', '.ooo.', 'ooooo', '.ooo.', '..o..' ];
  const BANG  = [ 'oo', 'oo', 'oo', 'oo', '..', 'oo', 'oo' ];
  const ZZZ   = [ 'ooo', '..o', '.o.', 'o..', 'ooo' ];

  const W = BODY[0].length;   // 16
  const H = BODY.length + 3;  // 14 with legs

  function drawGrid(ctx, grid, px, py, scale, colors) {
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const c = colors[ch];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(px + x * scale, py + y * scale, scale, scale);
      }
    }
  }

  // draw a loose grid (hearts, sparkles) with one flat colour
  function drawBlob(ctx, grid, px, py, scale, color, alpha) {
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === 'o') ctx.fillRect(px + x * scale, py + y * scale, scale, scale);
      }
    }
    ctx.restore();
  }

  window.SPRITES = {
    COATS, COAT_NAMES, BODY, LEGS, TAILS,
    HEART, SPARK, BANG, ZZZ,
    WIDTH: W, HEIGHT: H,
    drawGrid, drawBlob
  };
})();
