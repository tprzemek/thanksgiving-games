// Pure JS ISO/IEC 18004 QR Code Generator (Byte Mode, Versions 1-10, ECC Level M)
// Zero dependencies — renders crisp inline SVG scannable by any phone camera.

const QR = (() => {
  // GF(256) with primitive polynomial 0x11d
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  }

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGenerator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsRemainder(data, ecCount) {
    const gen = rsGenerator(ecCount);
    const res = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      for (let j = 0; j < ecCount - 1; j++) res[j] = res[j + 1];
      res[ecCount - 1] = 0;
      if (factor !== 0) {
        for (let j = 0; j < ecCount; j++) {
          res[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return res;
  }

  // Version table for ECC Level M (Versions 1..10):
  // [totalCodewords, ecPerBlock, [[numBlocks, dataCwPerBlock], ...], alignmentCenters]
  const VERSIONS = [
    null,
    [26, 10, [[1, 16]], []],
    [44, 16, [[1, 28]], [6, 18]],
    [70, 26, [[1, 44]], [6, 22]],
    [100, 18, [[2, 32]], [6, 26]],
    [134, 24, [[2, 43]], [6, 30]],
    [172, 16, [[4, 27]], [6, 34]],
    [196, 18, [[4, 31]], [6, 22, 38]],
    [242, 22, [[2, 38], [2, 39]], [6, 24, 42]],
    [292, 22, [[3, 36], [2, 37]], [6, 26, 46]],
    [346, 26, [[4, 43], [1, 44]], [6, 28, 50]],
  ];

  // Precomputed 15-bit format info for ECC Level M (00) and mask 0..7
  function computeFormatBits(mask) {
    const data = (0b00 << 3) | mask; // ECC M = 00
    let rem = data << 10;
    const poly = 0x537;
    for (let i = 14; i >= 10; i--) {
      if ((rem >>> i) & 1) rem ^= poly << (i - 10);
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  // Precomputed 18-bit version info for versions 7..10
  function computeVersionBits(version) {
    let rem = version << 12;
    const poly = 0x1f25;
    for (let i = 17; i >= 12; i--) {
      if ((rem >>> i) & 1) rem ^= poly << (i - 12);
    }
    return (version << 12) | rem;
  }

  function encodeUTF8(str) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.from(new TextEncoder().encode(str));
    }
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return bytes;
  }

  function buildCodewords(text) {
    const bytes = encodeUTF8(text);
    let version = -1;
    let totalDataCw = 0;

    for (let v = 1; v <= 10; v++) {
      const spec = VERSIONS[v];
      const dataCw = spec[2].reduce((s, [n, d]) => s + n * d, 0);
      const countBits = v <= 9 ? 8 : 16;
      const neededBits = 4 + countBits + bytes.length * 8;
      if (neededBits <= dataCw * 8) {
        version = v;
        totalDataCw = dataCw;
        break;
      }
    }
    if (version === -1) throw new Error('QR payload too long');

    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };

    // Byte mode indicator 0100
    pushBits(0b0100, 4);
    pushBits(bytes.length, version <= 9 ? 8 : 16);
    for (const b of bytes) pushBits(b, 8);

    // Terminator (up to 4 zeros)
    const maxBits = totalDataCw * 8;
    const term = Math.min(4, maxBits - bits.length);
    for (let i = 0; i < term; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const dataCw = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      dataCw.push(byte);
    }

    // Pad bytes 0xEC, 0x11
    let padToggle = true;
    while (dataCw.length < totalDataCw) {
      dataCw.push(padToggle ? 0xec : 0x11);
      padToggle = !padToggle;
    }

    // Split into blocks & compute ECC
    const spec = VERSIONS[version];
    const ecPerBlock = spec[1];
    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (const [numBlocks, blockLen] of spec[2]) {
      for (let b = 0; b < numBlocks; b++) {
        const block = dataCw.slice(offset, offset + blockLen);
        offset += blockLen;
        dataBlocks.push(block);
        ecBlocks.push(Array.from(rsRemainder(block, ecPerBlock)));
      }
    }

    // Interleave data codewords, then EC codewords
    const finalCw = [];
    const maxBlockLen = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxBlockLen; i++) {
      for (const b of dataBlocks) {
        if (i < b.length) finalCw.push(b[i]);
      }
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (const b of ecBlocks) finalCw.push(b[i]);
    }

    return { version, codewords: finalCw };
  }

  function makeMatrix(text) {
    const { version, codewords } = buildCodewords(text);
    const size = version * 4 + 17;
    const mod = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    const setFunc = (r, c, val) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        mod[r][c] = val ? 1 : 0;
        isFunc[r][c] = 1;
      }
    };

    // Finder patterns + separators
    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
          const dark = dist !== 2 && dist !== 4;
          setFunc(r, c, dark);
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Alignment patterns
    const centers = VERSIONS[version][3];
    for (const r of centers) {
      for (const c of centers) {
        if (isFunc[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dist = Math.max(Math.abs(dr), Math.abs(dc));
            setFunc(r + dr, c + dc, dist !== 1);
          }
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (!isFunc[6][i]) setFunc(6, i, i % 2 === 0);
      if (!isFunc[i][6]) setFunc(i, 6, i % 2 === 0);
    }

    // Dark module & reserve format areas
    setFunc(size - 8, 8, 1);
    for (let i = 0; i < 9; i++) {
      if (!isFunc[8][i]) setFunc(8, i, 0);
      if (!isFunc[i][8]) setFunc(i, 8, 0);
    }
    for (let i = size - 8; i < size; i++) {
      if (!isFunc[8][i]) setFunc(8, i, 0);
      if (!isFunc[i][8]) setFunc(i, 8, 0);
    }

    // Version info for versions >= 7
    if (version >= 7) {
      const vBits = computeVersionBits(version);
      for (let i = 0; i < 18; i++) {
        const bit = (vBits >>> i) & 1;
        const a = Math.floor(i / 3);
        const b = size - 11 + (i % 3);
        setFunc(a, b, bit);
        setFunc(b, a, bit);
      }
    }

    // Place data bits in upward/downward zigzag
    const dataBits = [];
    for (const cw of codewords) {
      for (let i = 7; i >= 0; i--) dataBits.push((cw >>> i) & 1);
    }

    let bitIdx = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        const r = upward ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunc[r][c]) {
            mod[r][c] = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
          }
        }
      }
      upward = !upward;
    }

    // Evaluate all 8 mask patterns and pick lowest penalty
    const maskCond = [
      (r, c) => (r + c) % 2 === 0,
      (r, c) => r % 2 === 0,
      (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ];

    function applyFormat(grid, mask) {
      const fBits = computeFormatBits(mask);
      for (let i = 0; i <= 5; i++) grid[8][i] = (fBits >>> (14 - i)) & 1;
      grid[8][7] = (fBits >>> 8) & 1;
      grid[8][8] = (fBits >>> 7) & 1;
      grid[7][8] = (fBits >>> 6) & 1;
      for (let i = 9; i < 15; i++) grid[14 - i][8] = (fBits >>> (14 - i)) & 1;

      for (let i = 0; i < 8; i++) grid[8][size - 1 - i] = (fBits >>> i) & 1;
      for (let i = 0; i < 7; i++) grid[size - 1 - i][8] = (fBits >>> (14 - i)) & 1;
      grid[size - 8][8] = 1;
    }

    function penalty(grid) {
      let score = 0;
      // N1: consecutive runs >= 5
      for (let r = 0; r < size; r++) {
        let run = 1;
        for (let c = 1; c < size; c++) {
          if (grid[r][c] === grid[r][c - 1]) run++;
          else { if (run >= 5) score += run - 2; run = 1; }
        }
        if (run >= 5) score += run - 2;
      }
      for (let c = 0; c < size; c++) {
        let run = 1;
        for (let r = 1; r < size; r++) {
          if (grid[r][c] === grid[r - 1][c]) run++;
          else { if (run >= 5) score += run - 2; run = 1; }
        }
        if (run >= 5) score += run - 2;
      }
      // N2: 2x2 blocks
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const v = grid[r][c];
          if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
        }
      }
      // N4: dark ratio
      let dark = 0;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += grid[r][c];
      const pct = Math.abs((dark * 100) / (size * size) - 50);
      score += Math.floor(pct / 5) * 10;
      return score;
    }

    let bestGrid = null;
    let bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      const g = mod.map(row => new Uint8Array(row));
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!isFunc[r][c] && maskCond[m](r, c)) g[r][c] ^= 1;
        }
      }
      applyFormat(g, m);
      const p = penalty(g);
      if (p < bestScore) {
        bestScore = p;
        bestGrid = g;
      }
    }
    return bestGrid;
  }

  function toSVG(text, { fg = '#2B1E16', bg = '#FFFFFF', quiet = 3 } = {}) {
    const grid = makeMatrix(text);
    const n = grid.length;
    const total = n + quiet * 2;
    let paths = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (grid[r][c]) {
          paths += `M${c + quiet},${r + quiet}h1v1h-1z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${total}" height="${total}" fill="${bg}"/><path d="${paths}" fill="${fg}"/></svg>`;
  }

  return { makeMatrix, toSVG };
})();

if (typeof module !== 'undefined') module.exports = QR;
