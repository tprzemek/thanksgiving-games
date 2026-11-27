// Procedural Canvas AI Artist & Visual Resemblance Grader
// Powers Prompt Panic!, Prompt Clone! (Reverse-Prompt Challenge), and Gobble Bomb Storybooks.

const AIArt = (() => {
  // Deterministic PRNG from string seed so the same prompt always renders reproducibly
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function makeRng(seedStr) {
    let s = hashStr(seedStr || 'thanksgiving') || 1;
    return () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    };
  }

  const COLOR_MAP = {
    red: '#D63838', crimson: '#9E2A2B', orange: '#E06D22', yellow: '#F2C14E',
    gold: '#D4941E', golden: '#D4941E', green: '#3D8B5F', emerald: '#2D7D53',
    blue: '#3A7BD5', navy: '#1F3A68', purple: '#7B4FA2', violet: '#7B4FA2',
    pink: '#E66BA2', teal: '#2A9D8F', cyan: '#2CC5D2', brown: '#7A4B2A',
    black: '#231F20', white: '#FBF9F5', silver: '#A8B2BC', rainbow: 'rainbow',
  };

  const SCENE_RULES = [
    { key: 'space', words: ['space', 'mars', 'moon', 'planet', 'galaxy', 'cosmic', 'orbit', 'universe', 'red planet', 'cosmos', 'zero gravity', 'crater'], label: 'Outer Space' },
    { key: 'beach', words: ['beach', 'island', 'ocean', 'tropical', 'palm', 'sand', 'surfing', 'wave', 'shore', 'coast', 'tides', 'vacation', 'sunshine'], label: 'Sunny Beach' },
    { key: 'snow', words: ['snow', 'winter', 'arctic', 'blizzard', 'ice', 'mountain', 'ski', 'igloo', 'north pole', 'frosty', 'chilly', 'freezing', 'peaks', 'alps'], label: 'Snowy Mountains' },
    { key: 'volcano', words: ['volcano', 'lava', 'magma', 'fiery', 'eruption', 'molten', 'hot rock'], label: 'Volcano' },
    { key: 'city', words: ['city', 'skyline', 'downtown', 'street', 'cyberpunk', 'metropolis', 'airport', 'skyscraper', 'buildings', 'urban', 'towers', 'traffic'], label: 'City Skyline' },
    { key: 'kitchen', words: ['kitchen', 'table', 'dinner', 'feast', 'dining', 'oven', 'bakery', 'restaurant', 'home', 'stove', 'counter', 'cooking room', 'tablecloth'], label: 'Dinner Table' },
    { key: 'underwater', words: ['underwater', 'sea', 'reef', 'submarine', 'coral', 'fishbowl', 'deep blue', 'bubbles', 'aquatic', 'scuba', 'submerged'], label: 'Underwater' },
    { key: 'night', words: ['night', 'midnight', 'starry', 'moonlight', 'dark', 'spooky', 'haunted', 'crescent', 'bedtime', 'evening', 'stars'], label: 'Starry Night' },
    { key: 'sunset', words: ['sunset', 'sunrise', 'dusk', 'golden hour', 'twilight', 'horizon', 'orange sky', 'evening glow', 'sundown'], label: 'Golden Sunset' },
    { key: 'forest', words: ['forest', 'woods', 'autumn', 'fall', 'park', 'farm', 'barn', 'meadow', 'leaves', 'garden', 'trees', 'nature', 'outdoors', 'foliage'], label: 'Autumn Woods' },
  ];

  const STYLE_RULES = [
    { key: 'pixel', words: ['pixel', '8-bit', '8bit', 'retro game', 'arcade', 'minecraft', 'blocky', 'square dots', 'video game'], label: 'Pixel Art' },
    { key: 'neon', words: ['neon', 'cyber', 'glowing', 'laser', 'synthwave', 'glow', 'electric', 'bright synth'], label: 'Neon Glow' },
    { key: 'vintage', words: ['vintage', 'sepia', 'old photo', '1621', 'antique', 'retro', 'polaroid', 'old-fashioned', 'faded brown'], label: 'Vintage Sepia' },
    { key: 'watercolor', words: ['watercolor', 'pastel', 'dreamy', 'painted', 'painting', 'soft', 'oil painting', 'brushstrokes'], label: 'Watercolor' },
    { key: 'sketch', words: ['sketch', 'pencil', 'drawing', 'black and white', 'ink', 'comic', 'doodle'], label: 'Ink Sketch' },
    { key: 'storybook', words: ['cartoon', 'storybook', 'cute', 'illustrated', '3d', 'pixar'], label: 'Storybook' },
  ];

  const WEATHER_RULES = [
    { key: 'rainbow', words: ['rainbow', 'colorful arch', 'seven colors', 'prism', 'multicolor arc'], label: 'Rainbow' },
    { key: 'snowflakes', words: ['snowing', 'snowflakes', 'snowfall', 'flurry', 'white flakes'], label: 'Snowfall' },
    { key: 'leaves', words: ['falling leaves', 'autumn leaves', 'leaves', 'windy', 'foliage'], label: 'Falling Leaves' },
    { key: 'fireworks', words: ['fireworks', 'explosion', 'sparks', 'celebration', 'confetti', 'party', 'sparklers', 'sky burst', 'booms'], label: 'Fireworks & Confetti' },
    { key: 'rain', words: ['rain', 'raining', 'storm', 'lightning', 'thunder', 'drizzle', 'puddles', 'downpour', 'wet weather'], label: 'Stormy Rain' },
  ];

  const SUBJECT_RULES = [
    { key: 'turkey', words: ['turkey', 'gobbler', 'gobble', 'bird', 'feathers', 'wattle', 'poultry', 'fowl', 'drumstick'], label: 'Turkey' },
    { key: 'pilgrim', words: ['pilgrim', 'settler', 'puritan', 'mayflower', 'colonist', 'pioneer', '1621'], label: 'Pilgrim' },
    { key: 'pie', words: ['pie', 'pumpkin pie', 'apple pie', 'tart', 'dessert', 'pastry', 'crust', 'whipped cream', 'sweet slice'], label: 'Pumpkin Pie' },
    { key: 'pumpkin', words: ['pumpkin', 'jack-o-lantern', 'gourd', 'squash', 'orange vegetable', 'halloween', 'carved'], label: 'Pumpkin' },
    { key: 'gravy', words: ['gravy', 'gravy boat', 'sauce', 'mashed potato', 'potatoes', 'brown liquid', 'broth', 'pouring'], label: 'Gravy Boat' },
    { key: 'dog', words: ['dog', 'puppy', 'pup', 'hound', 'corgi', 'golden retriever', 'canine', 'barking', 'woof', 'good boy'], label: 'Dog' },
    { key: 'cat', words: ['cat', 'kitten', 'kitty', 'tabby', 'feline', 'meow', 'whiskers', 'purr'], label: 'Cat' },
    { key: 'robot', words: ['robot', 'bot', 'android', 'cyborg', 'mech', 'machine', 'metal', 'beep', 'antenna', 'metallic'], label: 'Robot' },
    { key: 'alien', words: ['alien', 'ufo', 'martian', 'spaceship', 'saucer', 'flying disc', 'extraterrestrial', 'green creature', 'tractor beam'], label: 'Alien / UFO' },
    { key: 'astronaut', words: ['astronaut', 'spaceman', 'cosmonaut', 'space suit', 'helmet', 'nasa', 'moonwalker'], label: 'Astronaut' },
    { key: 'dragon', words: ['dragon', 'dinosaur', 'dino', 't-rex', 'trex', 'fire breather', 'reptile', 'scales', 'winged lizard'], label: 'Dragon / Dino' },
    { key: 'grandma', words: ['grandma', 'grandpa', 'chef', 'cook', 'baker', 'family', 'person', 'kid', 'nana', 'elder', 'apron'], label: 'Chef / Family' },
    { key: 'fox', words: ['fox', 'squirrel', 'owl', 'bear', 'raccoon', 'bushy tail', 'woodland critter', 'clever animal'], label: 'Woodland Critter' },
    { key: 'pizza', words: ['pizza', 'taco', 'burger', 'sushi', 'donut', 'ice cream', 'pepperoni', 'cheese slice', 'italian'], label: 'Wild Food' },
    { key: 'rocket', words: ['rocket', 'jetpack', 'spaceship', 'blastoff', 'thruster', 'shuttle', 'launch'], label: 'Rocket' },
  ];

  const PROP_RULES = [
    { key: 'skateboard', words: ['skateboard', 'skating', 'skater', 'scooter', 'roller', 'wheels', 'wooden board', 'kickflip', 'cruising', 'deck'], label: 'Skateboard' },
    { key: 'sunglasses', words: ['sunglasses', 'shades', 'cool glasses', 'glasses', 'dark lenses', 'eyewear'], label: 'Sunglasses' },
    { key: 'crown', words: ['crown', 'king', 'queen', 'royal', 'tiara', 'monarch', 'gold headpiece', 'majesty'], label: 'Royal Crown' },
    { key: 'wizardhat', words: ['wizard', 'witch', 'magic hat', 'magician', 'pointy hat', 'sorcerer', 'spells'], label: 'Wizard Hat' },
    { key: 'chefhat', words: ['chef hat', 'baker', 'cooking', 'apron', 'whisk', 'spatula', 'tall white hat'], label: 'Chef Hat' },
    { key: 'pilgrimhat', words: ['buckle hat', 'pilgrim hat', 'top hat', 'hat', 'buckle', 'tall black hat'], label: 'Buckle Hat' },
    { key: 'guitar', words: ['guitar', 'banjo', 'music', 'dj', 'headphones', 'microphone', 'singing', 'band', 'strings', 'rockstar', 'strumming', 'instrument'], label: 'Music Gear' },
    { key: 'balloon', words: ['balloon', 'balloons', 'parade', 'floating', 'helium', 'inflatable'], label: 'Balloons' },
    { key: 'candle', words: ['candle', 'candles', 'lantern', 'torch', 'campfire', 'fire', 'wax', 'flame', 'flickering'], label: 'Glowing Candles' },
    { key: 'umbrella', words: ['umbrella', 'parasol'], label: 'Umbrella' },
    { key: 'trophy', words: ['trophy', 'medal', 'champion', 'winner', 'gold cup', 'prize', 'first place', 'award'], label: 'Trophy' },
    { key: 'cranberry', words: ['cranberry', 'cranberries', 'juggling', 'corn', 'cornucopia', 'red berries', 'tart fruit', 'tossing'], label: 'Cranberries' },
    { key: 'cape', words: ['cape', 'superhero', 'flying', 'hero', 'cloak', 'soaring'], label: 'Hero Cape' },
  ];

  function parsePrompt(rawPrompt) {
    const text = (rawPrompt || '').toLowerCase();
    const matchRule = (rules) => rules.filter(r => r.words.some(w => text.includes(w)));

    const scenes = matchRule(SCENE_RULES);
    const styles = matchRule(STYLE_RULES);
    const weathers = matchRule(WEATHER_RULES);
    const subjects = matchRule(SUBJECT_RULES);
    const props = matchRule(PROP_RULES);

    const colors = [];
    for (const [name, hex] of Object.entries(COLOR_MAP)) {
      const rx = new RegExp(`\\b${name}\\b`, 'i');
      if (rx.test(text)) colors.push({ name, hex });
    }

    let count = 1;
    if (/\b(three|3)\b/.test(text)) count = 3;
    else if (/\b(two|2|pair|twin|couple|double)\b/.test(text)) count = 2;
    else if (/\b(giant|huge|massive|mega|enormous)\b/.test(text)) count = 1.35;
    else if (/\b(tiny|mini|little|small|baby)\b/.test(text)) count = 0.72;

    return {
      raw: rawPrompt || '',
      scene: scenes[0]?.key || 'forest',
      sceneLabel: scenes[0]?.label || 'Autumn Scene',
      style: styles[0]?.key || 'storybook',
      styleLabel: styles[0]?.label || 'Storybook',
      weathers: weathers.map(w => w.key),
      weatherLabels: weathers.map(w => w.label),
      subjects: subjects.length ? subjects.slice(0, 3).map(s => s.key) : ['turkey'],
      subjectLabels: subjects.length ? subjects.slice(0, 3).map(s => s.label) : ['Turkey'],
      props: props.map(p => p.key),
      propLabels: props.map(p => p.label),
      colors,
      count,
    };
  }

  // ---- Drawing helpers ----
  function drawBackground(ctx, w, h, parsed, rng) {
    const tint = parsed.colors[0]?.hex;
    const grad = ctx.createLinearGradient(0, 0, 0, h);

    switch (parsed.scene) {
      case 'space':
        grad.addColorStop(0, '#0B1026');
        grad.addColorStop(0.65, '#1B234A');
        grad.addColorStop(1, '#3D2748');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // Stars
        for (let i = 0; i < 65; i++) {
          ctx.fillStyle = `rgba(255,250,230,${0.35 + rng() * 0.65})`;
          ctx.beginPath();
          ctx.arc(rng() * w, rng() * h * 0.78, 0.8 + rng() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        // Ringed planet
        ctx.save();
        ctx.translate(w * 0.8, h * 0.22);
        ctx.fillStyle = tint && tint !== 'rainbow' ? tint : '#E58A4E';
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#F7D794'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(0, 2, 44, 11, -0.22, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        // Crater surface
        ctx.fillStyle = '#B85A3A';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.74);
        ctx.quadraticCurveTo(w * 0.5, h * 0.66, w, h * 0.76);
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8F3F26';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(w * (0.15 + i * 0.24), h * (0.83 + (i % 2) * 0.06), 24, 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'beach':
        grad.addColorStop(0, '#58B4E8');
        grad.addColorStop(0.55, '#A9E4F7');
        grad.addColorStop(1, '#FFE6A7');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        // Sun
        ctx.fillStyle = '#FFD15C';
        ctx.beginPath(); ctx.arc(w * 0.82, h * 0.2, 28, 0, Math.PI * 2); ctx.fill();
        // Ocean
        ctx.fillStyle = '#2B8CBE';
        ctx.fillRect(0, h * 0.58, w, h * 0.22);
        ctx.fillStyle = '#7FD1E8';
        for (let i = 0; i < 6; i++) {
          ctx.fillRect(20 + i * 75, h * 0.64 + (i % 2) * 10, 40, 4);
        }
        // Sand
        ctx.fillStyle = '#F2CF8D';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.74);
        ctx.quadraticCurveTo(w * 0.45, h * 0.68, w, h * 0.78);
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
        // Palm tree silhouette
        ctx.strokeStyle = '#7D512D'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(w * 0.12, h * 0.84); ctx.quadraticCurveTo(w * 0.17, h * 0.52, w * 0.2, h * 0.34); ctx.stroke();
        ctx.fillStyle = '#3A874D';
        for (let a = 0; a < 5; a++) {
          ctx.save(); ctx.translate(w * 0.2, h * 0.34); ctx.rotate(-2.4 + a * 1.15);
          ctx.beginPath(); ctx.ellipse(26, 0, 30, 8, 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        break;

      case 'snow':
        grad.addColorStop(0, '#4E7AA8');
        grad.addColorStop(0.6, '#A9CBE8');
        grad.addColorStop(1, '#EFF6FC');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        // Mountains
        const peaks = [[0.18, 0.32], [0.52, 0.26], [0.85, 0.36]];
        peaks.forEach(([px, py]) => {
          ctx.fillStyle = '#7395B8';
          ctx.beginPath(); ctx.moveTo(w * (px - 0.28), h * 0.78); ctx.lineTo(w * px, h * py); ctx.lineTo(w * (px + 0.28), h * 0.78); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath(); ctx.moveTo(w * (px - 0.09), h * (py + 0.16)); ctx.lineTo(w * px, h * py); ctx.lineTo(w * (px + 0.09), h * (py + 0.16)); ctx.closePath(); ctx.fill();
        });
        ctx.fillStyle = '#F7FBFF';
        ctx.fillRect(0, h * 0.72, w, h * 0.28);
        break;

      case 'volcano':
        grad.addColorStop(0, '#3D1518');
        grad.addColorStop(0.6, '#962E22');
        grad.addColorStop(1, '#E87424');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#4A2C2A';
        ctx.beginPath(); ctx.moveTo(w * 0.12, h * 0.8); ctx.lineTo(w * 0.44, h * 0.28); ctx.lineTo(w * 0.56, h * 0.28); ctx.lineTo(w * 0.88, h * 0.8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#FF9F1C';
        ctx.beginPath(); ctx.moveTo(w * 0.45, h * 0.28); ctx.quadraticCurveTo(w * 0.5, h * 0.52, w * 0.43, h * 0.78); ctx.lineTo(w * 0.55, h * 0.78); ctx.quadraticCurveTo(w * 0.53, h * 0.48, w * 0.55, h * 0.28); ctx.fill();
        ctx.fillStyle = '#3B2320'; ctx.fillRect(0, h * 0.75, w, h * 0.25);
        break;

      case 'city':
        grad.addColorStop(0, '#1D2944');
        grad.addColorStop(0.6, '#485A82');
        grad.addColorStop(1, '#E08E6D');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        // Buildings
        for (let i = 0; i < 9; i++) {
          const bw = 42 + (i % 3) * 14;
          const bh = 80 + ((i * 37) % 110);
          const bx = i * 52;
          ctx.fillStyle = i % 2 ? '#23304A' : '#2E3D5C';
          ctx.fillRect(bx, h * 0.76 - bh, bw, bh);
          ctx.fillStyle = '#FCD36B';
          for (let wy = h * 0.76 - bh + 12; wy < h * 0.72; wy += 16) {
            for (let wx = bx + 8; wx < bx + bw - 10; wx += 12) {
              if ((wx + wy) % 3 !== 0) ctx.fillRect(wx, wy, 6, 8);
            }
          }
        }
        ctx.fillStyle = '#3C4048'; ctx.fillRect(0, h * 0.75, w, h * 0.25);
        ctx.fillStyle = '#F2C14E';
        for (let x = 15; x < w; x += 55) ctx.fillRect(x, h * 0.87, 30, 5);
        break;

      case 'kitchen':
        grad.addColorStop(0, '#F7E7CE');
        grad.addColorStop(1, '#E8CCA5');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        // Window
        ctx.fillStyle = '#9ED0E8'; ctx.fillRect(w * 0.68, h * 0.12, 95, 75);
        ctx.strokeStyle = '#8C5A32'; ctx.lineWidth = 5;
        ctx.strokeRect(w * 0.68, h * 0.12, 95, 75);
        ctx.beginPath(); ctx.moveTo(w * 0.68 + 47.5, h * 0.12); ctx.lineTo(w * 0.68 + 47.5, h * 0.12 + 75); ctx.stroke();
        // Tablecloth & wooden table
        ctx.fillStyle = '#9E2A2B';
        ctx.fillRect(0, h * 0.68, w, h * 0.32);
        ctx.fillStyle = '#FAF2E4';
        for (let x = 0; x < w; x += 40) ctx.fillRect(x, h * 0.68, 20, h * 0.32);
        ctx.fillStyle = 'rgba(158,42,43,0.45)';
        ctx.fillRect(0, h * 0.68, w, 14);
        break;

      case 'underwater':
        grad.addColorStop(0, '#167D9A');
        grad.addColorStop(0.7, '#0D4B68');
        grad.addColorStop(1, '#0A2D42');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        // Bubbles
        ctx.strokeStyle = 'rgba(200,245,255,0.55)'; ctx.lineWidth = 2;
        for (let i = 0; i < 18; i++) {
          ctx.beginPath(); ctx.arc(rng() * w, rng() * h * 0.8, 3 + rng() * 9, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = '#D9B982'; ctx.fillRect(0, h * 0.78, w, h * 0.22);
        break;

      case 'night':
        grad.addColorStop(0, '#0F172A');
        grad.addColorStop(0.7, '#1E294B');
        grad.addColorStop(1, '#312E59');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        // Crescent Moon
        ctx.fillStyle = '#FDE68A';
        ctx.beginPath(); ctx.arc(w * 0.8, h * 0.2, 26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#141D35';
        ctx.beginPath(); ctx.arc(w * 0.83, h * 0.18, 22, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 45; i++) {
          ctx.fillStyle = '#FEF9C3';
          ctx.beginPath(); ctx.arc(rng() * w, rng() * h * 0.68, 1 + rng() * 1.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#1D332B'; ctx.fillRect(0, h * 0.74, w, h * 0.26);
        break;

      case 'sunset':
        grad.addColorStop(0, '#4E3168');
        grad.addColorStop(0.45, '#D95D39');
        grad.addColorStop(0.85, '#F4B942');
        grad.addColorStop(1, '#FFE19C');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#FFF3B0';
        ctx.beginPath(); ctx.arc(w * 0.5, h * 0.62, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5E3828';
        ctx.beginPath(); ctx.moveTo(0, h * 0.72); ctx.quadraticCurveTo(w * 0.35, h * 0.64, w, h * 0.74); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
        break;

      default: // Autumn woods
        grad.addColorStop(0, '#8EC5E8');
        grad.addColorStop(0.55, '#F5DFC0');
        grad.addColorStop(1, '#EBB678');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        // Warm sun
        ctx.fillStyle = 'rgba(255,232,163,0.9)';
        ctx.beginPath(); ctx.arc(w * 0.82, h * 0.2, 26, 0, Math.PI * 2); ctx.fill();
        // Rolling autumn hills
        ctx.fillStyle = '#C97B36';
        ctx.beginPath(); ctx.moveTo(0, h * 0.66); ctx.quadraticCurveTo(w * 0.3, h * 0.54, w * 0.65, h * 0.68); ctx.quadraticCurveTo(w * 0.88, h * 0.74, w, h * 0.62); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
        // Autumn trees
        const treeCols = ['#B83B28', '#D97224', '#DF9F28', '#8F3524'];
        for (let i = 0; i < 4; i++) {
          const tx = w * (0.12 + i * 0.25);
          const ty = h * 0.64;
          ctx.fillStyle = '#5C3A21'; ctx.fillRect(tx - 5, ty - 25, 10, 34);
          ctx.fillStyle = treeCols[i % treeCols.length];
          ctx.beginPath(); ctx.arc(tx, ty - 38, 24, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#6E8542';
        ctx.beginPath(); ctx.moveTo(0, h * 0.74); ctx.quadraticCurveTo(w * 0.5, h * 0.68, w, h * 0.76); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
        break;
    }

    // Subtle color tint wash if user explicitly mentioned a standout color
    if (tint && tint !== 'rainbow') {
      ctx.fillStyle = tint + '1C';
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawWeather(ctx, w, h, parsed, rng) {
    if (parsed.weathers.includes('rainbow') || parsed.colors.some(c => c.name === 'rainbow')) {
      const cols = ['#E63946', '#F48C06', '#F9C74F', '#43AA8B', '#3A86FF', '#8338EC'];
      cols.forEach((col, i) => {
        ctx.strokeStyle = col; ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.72, 175 - i * 7, Math.PI, 0);
        ctx.stroke();
      });
    }
    if (parsed.weathers.includes('snowflakes') || parsed.scene === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      for (let i = 0; i < 36; i++) {
        ctx.beginPath(); ctx.arc(rng() * w, rng() * h, 1.8 + rng() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (parsed.weathers.includes('leaves')) {
      const leafCols = ['#D64528', '#E08E24', '#C4382B', '#EBB134'];
      for (let i = 0; i < 22; i++) {
        ctx.save();
        ctx.translate(rng() * w, rng() * h * 0.85);
        ctx.rotate(rng() * Math.PI * 2);
        ctx.fillStyle = leafCols[i % leafCols.length];
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    if (parsed.weathers.includes('fireworks')) {
      const bursts = [[w * 0.25, h * 0.24, '#FF595E'], [w * 0.75, h * 0.22, '#FFCA3A'], [w * 0.5, h * 0.16, '#8AC926']];
      bursts.forEach(([bx, by, col]) => {
        ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(ang) * 26, by + Math.sin(ang) * 26); ctx.stroke();
        }
      });
    }
    if (parsed.weathers.includes('rain')) {
      ctx.strokeStyle = 'rgba(180,220,255,0.6)'; ctx.lineWidth = 1.6;
      for (let i = 0; i < 45; i++) {
        const rx = rng() * w, ry = rng() * h;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 5, ry + 16); ctx.stroke();
      }
    }
  }

  function drawHat(ctx, propKey, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (propKey === 'crown') {
      ctx.fillStyle = '#F2C14E'; ctx.strokeStyle = '#9E6D10'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, 6); ctx.lineTo(-26, -16); ctx.lineTo(-10, -4); ctx.lineTo(0, -22); ctx.lineTo(10, -4); ctx.lineTo(26, -16); ctx.lineTo(22, 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#D63838'; ctx.beginPath(); ctx.arc(0, -4, 3.5, 0, Math.PI * 2); ctx.fill();
    } else if (propKey === 'wizardhat') {
      ctx.fillStyle = '#3B358C';
      ctx.beginPath(); ctx.ellipse(0, 6, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-19, 4); ctx.lineTo(4, -38); ctx.lineTo(20, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F9D649'; ctx.beginPath(); ctx.arc(0, -14, 4, 0, Math.PI * 2); ctx.fill();
    } else if (propKey === 'chefhat') {
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#D6CFC7'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-14, -12, 13, 0, Math.PI * 2); ctx.arc(0, -18, 15, 0, Math.PI * 2); ctx.arc(14, -12, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-18, -6, 36, 15); ctx.strokeRect(-18, -6, 36, 15);
    } else if (propKey === 'pilgrimhat') {
      ctx.fillStyle = '#241E1C';
      ctx.beginPath(); ctx.ellipse(0, 6, 32, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-18, 4); ctx.lineTo(-22, -26); ctx.lineTo(22, -26); ctx.lineTo(18, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F2C14E'; ctx.fillRect(-19, -5, 38, 7);
      ctx.strokeStyle = '#241E1C'; ctx.lineWidth = 2.5; ctx.strokeRect(-6, -6, 12, 9);
    }
    ctx.restore();
  }

  function drawSubject(ctx, key, cx, cy, scale, accentColor, props) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Optional Hero Cape behind subject
    if (props.includes('cape')) {
      ctx.fillStyle = '#C92A2A';
      ctx.beginPath();
      ctx.moveTo(-16, -24); ctx.quadraticCurveTo(-55, 8, -46, 48); ctx.lineTo(14, 34); ctx.closePath();
      ctx.fill();
    }

    // Optional Skateboard underneath
    if (props.includes('skateboard')) {
      ctx.save(); ctx.translate(0, 56);
      ctx.fillStyle = accentColor || '#E06D22';
      ctx.beginPath(); ctx.roundRect(-52, -6, 104, 12, 6); ctx.fill();
      ctx.fillStyle = '#231F20';
      ctx.beginPath(); ctx.arc(-32, 10, 8, 0, Math.PI * 2); ctx.arc(32, 10, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F2C14E';
      ctx.beginPath(); ctx.arc(-32, 10, 3, 0, Math.PI * 2); ctx.arc(32, 10, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    const col = accentColor && accentColor !== 'rainbow' ? accentColor : null;
    let headTopY = -52;

    switch (key) {
      case 'turkey': {
        // Fan tail feathers
        const feathers = ['#9E2A2B', '#D96B27', '#E8A838', '#8C3B24', '#C85A17', '#E09F3E', '#9E2A2B'];
        feathers.forEach((fc, idx) => {
          const ang = -1.2 + idx * 0.4;
          ctx.save(); ctx.rotate(ang);
          ctx.fillStyle = col && idx % 2 === 0 ? col : fc;
          ctx.beginPath(); ctx.ellipse(0, -48, 14, 38, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#F7E3AF';
          ctx.beginPath(); ctx.ellipse(0, -72, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        // Body
        ctx.fillStyle = '#6E3F24';
        ctx.beginPath(); ctx.ellipse(0, 12, 38, 34, 0, 0, Math.PI * 2); ctx.fill();
        // Wings
        ctx.fillStyle = '#542D18';
        ctx.beginPath(); ctx.ellipse(-34, 14, 14, 24, 0.3, 0, Math.PI * 2); ctx.ellipse(34, 14, 14, 24, -0.3, 0, Math.PI * 2); ctx.fill();
        // Legs
        ctx.strokeStyle = '#E08E24'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-14, 42); ctx.lineTo(-14, 54); ctx.moveTo(14, 42); ctx.lineTo(14, 54); ctx.stroke();
        // Head
        ctx.fillStyle = '#7C492B';
        ctx.beginPath(); ctx.arc(0, -24, 21, 0, Math.PI * 2); ctx.fill();
        // Eyes
        ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(-8, -28, 6, 0, Math.PI * 2); ctx.arc(8, -28, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1C1410'; ctx.beginPath(); ctx.arc(-7, -28, 3, 0, Math.PI * 2); ctx.arc(7, -28, 3, 0, Math.PI * 2); ctx.fill();
        // Wattle & Beak
        ctx.fillStyle = '#D63838'; ctx.beginPath(); ctx.ellipse(7, -14, 5, 11, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#F2B830'; ctx.beginPath(); ctx.moveTo(-7, -20); ctx.lineTo(7, -20); ctx.lineTo(0, -9); ctx.closePath(); ctx.fill();
        headTopY = -48;
        break;
      }

      case 'pilgrim': {
        // Coat
        ctx.fillStyle = '#2B2625';
        ctx.beginPath(); ctx.roundRect(-28, -4, 56, 56, 12); ctx.fill();
        // White collar
        ctx.fillStyle = '#FFFDF9';
        ctx.beginPath(); ctx.moveTo(-22, -4); ctx.lineTo(22, -4); ctx.lineTo(14, 16); ctx.lineTo(0, 6); ctx.lineTo(-14, 16); ctx.closePath(); ctx.fill();
        // Head
        ctx.fillStyle = '#F2C9A5';
        ctx.beginPath(); ctx.arc(0, -26, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#231F20'; ctx.beginPath(); ctx.arc(-7, -28, 3, 0, Math.PI * 2); ctx.arc(7, -28, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#9E4B3A'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, -20, 7, 0.15, Math.PI - 0.15); ctx.stroke();
        drawHat(ctx, 'pilgrimhat', 0, -45, 1);
        headTopY = -72;
        break;
      }

      case 'pie': {
        // Pie tin
        ctx.fillStyle = '#B8C2CC';
        ctx.beginPath(); ctx.moveTo(-48, 12); ctx.lineTo(48, 12); ctx.lineTo(38, 42); ctx.lineTo(-38, 42); ctx.closePath(); ctx.fill();
        // Crust edge
        ctx.fillStyle = '#D9984A';
        ctx.beginPath(); ctx.ellipse(0, 12, 50, 16, 0, 0, Math.PI * 2); ctx.fill();
        // Pumpkin filling
        ctx.fillStyle = col || '#C85A17';
        ctx.beginPath(); ctx.ellipse(0, 11, 41, 12, 0, 0, Math.PI * 2); ctx.fill();
        // Whipped cream dollop
        ctx.fillStyle = '#FFFDF9';
        ctx.beginPath(); ctx.arc(0, 2, 13, 0, Math.PI * 2); ctx.arc(-7, 6, 9, 0, Math.PI * 2); ctx.arc(7, 6, 9, 0, Math.PI * 2); ctx.fill();
        // Cute face on pie
        ctx.fillStyle = '#2B1E16'; ctx.beginPath(); ctx.arc(-10, 25, 3, 0, Math.PI * 2); ctx.arc(10, 25, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2B1E16'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 27, 6, 0.2, Math.PI - 0.2); ctx.stroke();
        headTopY = -12;
        break;
      }

      case 'pumpkin': {
        const pCol = col || '#E06D22';
        ctx.fillStyle = '#4A6E36'; ctx.fillRect(-6, -42, 12, 18);
        ctx.fillStyle = pCol;
        ctx.beginPath(); ctx.ellipse(-22, 8, 22, 34, 0, 0, Math.PI * 2); ctx.ellipse(22, 8, 22, 34, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#EC7D2E';
        ctx.beginPath(); ctx.ellipse(0, 8, 24, 38, 0, 0, Math.PI * 2); ctx.fill();
        // Smiling face
        ctx.fillStyle = '#2B1E16';
        ctx.beginPath(); ctx.arc(-12, 0, 4, 0, Math.PI * 2); ctx.arc(12, 0, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 10, 12, 0.1, Math.PI - 0.1); ctx.fill();
        headTopY = -36;
        break;
      }

      case 'gravy': {
        // Saucer
        ctx.fillStyle = '#EAE2D6';
        ctx.beginPath(); ctx.ellipse(0, 38, 52, 12, 0, 0, Math.PI * 2); ctx.fill();
        // Boat body
        ctx.fillStyle = '#FFFDF9'; ctx.strokeStyle = '#C8B8A2'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-46, 4); ctx.quadraticCurveTo(-30, 38, 12, 38); ctx.quadraticCurveTo(44, 38, 42, 10); ctx.lineTo(-46, 4); ctx.fill(); ctx.stroke();
        // Handle
        ctx.beginPath(); ctx.arc(44, 18, 12, -1.2, 1.5); ctx.stroke();
        // Gravy pool + steam
        ctx.fillStyle = '#7A4B2A';
        ctx.beginPath(); ctx.ellipse(-4, 8, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
        for (let sx = -16; sx <= 16; sx += 16) {
          ctx.beginPath(); ctx.moveTo(sx, -2); ctx.quadraticCurveTo(sx - 6, -16, sx + 4, -28); ctx.stroke();
        }
        headTopY = -12;
        break;
      }

      case 'robot': {
        ctx.fillStyle = col || '#7D8E9F';
        ctx.beginPath(); ctx.roundRect(-30, -4, 60, 52, 10); ctx.fill();
        ctx.fillStyle = '#4B5B6B'; ctx.fillRect(-18, 8, 36, 22);
        ctx.fillStyle = '#38E8A5'; ctx.fillRect(-12, 14, 8, 8);
        ctx.fillStyle = '#FF6B6B'; ctx.fillRect(4, 14, 8, 8);
        // Head
        ctx.fillStyle = col || '#96A7B8';
        ctx.beginPath(); ctx.roundRect(-24, -44, 48, 36, 8); ctx.fill();
        // Antenna
        ctx.strokeStyle = '#4B5B6B'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(0, -58); ctx.stroke();
        ctx.fillStyle = '#FF595E'; ctx.beginPath(); ctx.arc(0, -60, 5, 0, Math.PI * 2); ctx.fill();
        // Glowing visor
        ctx.fillStyle = '#182433'; ctx.beginPath(); ctx.roundRect(-18, -36, 36, 16, 4); ctx.fill();
        ctx.fillStyle = '#4CC9F0'; ctx.beginPath(); ctx.arc(-8, -28, 4.5, 0, Math.PI * 2); ctx.arc(8, -28, 4.5, 0, Math.PI * 2); ctx.fill();
        headTopY = -62;
        break;
      }

      case 'alien': {
        // UFO saucer
        ctx.fillStyle = '#A8DADC';
        ctx.beginPath(); ctx.arc(0, -14, 24, Math.PI, 0); ctx.fill();
        // Green alien inside dome
        ctx.fillStyle = '#6BCB77';
        ctx.beginPath(); ctx.arc(0, -20, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(-4, -21, 3, 4.5, -0.2, 0, Math.PI * 2); ctx.ellipse(4, -21, 3, 4.5, 0.2, 0, Math.PI * 2); ctx.fill();
        // Saucer metal rim
        ctx.fillStyle = col || '#8D99AE';
        ctx.beginPath(); ctx.ellipse(0, -10, 54, 15, 0, 0, Math.PI * 2); ctx.fill();
        // Glowing lights + tractor beam
        ctx.fillStyle = 'rgba(138, 255, 193, 0.28)';
        ctx.beginPath(); ctx.moveTo(-22, 4); ctx.lineTo(22, 4); ctx.lineTo(44, 58); ctx.lineTo(-44, 58); ctx.closePath(); ctx.fill();
        ['#FF595E', '#FFCA3A', '#4CC9F0', '#FFCA3A', '#FF595E'].forEach((lc, i) => {
          ctx.fillStyle = lc; ctx.beginPath(); ctx.arc(-36 + i * 18, -10, 4, 0, Math.PI * 2); ctx.fill();
        });
        headTopY = -42;
        break;
      }

      case 'astronaut': {
        ctx.fillStyle = '#F5F7FA'; ctx.strokeStyle = '#C4CDD5'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(-28, -2, 56, 52, 14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#D63838'; ctx.fillRect(-14, 10, 28, 12);
        // Helmet
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, -26, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#25395C'; ctx.beginPath(); ctx.ellipse(0, -26, 19, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-7, -30, 6, 3.5, -0.4, 0, Math.PI * 2); ctx.fill();
        headTopY = -54;
        break;
      }

      case 'dog':
      case 'cat':
      case 'fox': {
        const fur = col || (key === 'cat' ? '#E89B48' : key === 'fox' ? '#D65A28' : '#C68B59');
        ctx.fillStyle = fur;
        ctx.beginPath(); ctx.ellipse(0, 20, 30, 28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -18, 25, 0, Math.PI * 2); ctx.fill();
        // Ears
        if (key === 'dog') {
          ctx.fillStyle = '#8C5A32';
          ctx.beginPath(); ctx.ellipse(-24, -14, 9, 18, 0.2, 0, Math.PI * 2); ctx.ellipse(24, -14, 9, 18, -0.2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = fur;
          ctx.beginPath(); ctx.moveTo(-22, -30); ctx.lineTo(-16, -52); ctx.lineTo(-4, -38); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(22, -30); ctx.lineTo(16, -52); ctx.lineTo(4, -38); ctx.closePath(); ctx.fill();
        }
        // Snout & eyes
        ctx.fillStyle = '#FFF5E8'; ctx.beginPath(); ctx.ellipse(0, -10, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#231F20';
        ctx.beginPath(); ctx.arc(-9, -22, 3.5, 0, Math.PI * 2); ctx.arc(9, -22, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -13, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        headTopY = -46;
        break;
      }

      case 'dragon': {
        const dCol = col || '#3D8B5F';
        // Wings
        ctx.fillStyle = '#2A6342';
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-56, -34); ctx.lineTo(-42, 16); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(56, -34); ctx.lineTo(42, 16); ctx.closePath(); ctx.fill();
        // Body + Belly
        ctx.fillStyle = dCol;
        ctx.beginPath(); ctx.ellipse(0, 18, 30, 32, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#F2D388';
        ctx.beginPath(); ctx.ellipse(0, 22, 18, 22, 0, 0, Math.PI * 2); ctx.fill();
        // Head + horns
        ctx.fillStyle = dCol;
        ctx.beginPath(); ctx.ellipse(0, -22, 24, 19, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#F2C14E';
        ctx.beginPath(); ctx.moveTo(-14, -36); ctx.lineTo(-22, -54); ctx.lineTo(-4, -38); ctx.fill();
        ctx.beginPath(); ctx.moveTo(14, -36); ctx.lineTo(22, -54); ctx.lineTo(4, -38); ctx.fill();
        ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(-9, -24, 5, 0, Math.PI * 2); ctx.arc(9, -24, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-9, -24, 2.5, 0, Math.PI * 2); ctx.arc(9, -24, 2.5, 0, Math.PI * 2); ctx.fill();
        headTopY = -48;
        break;
      }

      case 'rocket': {
        ctx.fillStyle = '#D63838';
        ctx.beginPath(); ctx.moveTo(-18, 24); ctx.lineTo(-34, 48); ctx.lineTo(-12, 42); ctx.fill();
        ctx.beginPath(); ctx.moveTo(18, 24); ctx.lineTo(34, 48); ctx.lineTo(12, 42); ctx.fill();
        ctx.fillStyle = '#F8F9FA';
        ctx.beginPath(); ctx.ellipse(0, 2, 20, 44, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col || '#D63838';
        ctx.beginPath(); ctx.moveTo(-17, -20); ctx.quadraticCurveTo(0, -58, 17, -20); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#4CC9F0'; ctx.strokeStyle = '#495057'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -4, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Flame
        ctx.fillStyle = '#FF9F1C';
        ctx.beginPath(); ctx.moveTo(-10, 44); ctx.lineTo(0, 68); ctx.lineTo(10, 44); ctx.closePath(); ctx.fill();
        headTopY = -52;
        break;
      }

      case 'pizza': {
        ctx.fillStyle = '#E09F3E';
        ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(42, 40); ctx.lineTo(-42, 40); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#F4D35E';
        ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(35, 32); ctx.lineTo(-35, 32); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#C92A2A';
        [[-8, 6], [10, 14], [0, -10], [-14, 22], [14, 24]].forEach(([px, py]) => {
          ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
        });
        headTopY = -44;
        break;
      }

      default: { // Grandma / Chef
        ctx.fillStyle = col || '#8C4A6E';
        ctx.beginPath(); ctx.roundRect(-28, -2, 56, 52, 14); ctx.fill();
        ctx.fillStyle = '#FFFDF9'; ctx.fillRect(-16, 4, 32, 44);
        ctx.fillStyle = '#F2C9A5'; ctx.beginPath(); ctx.arc(0, -24, 22, 0, Math.PI * 2); ctx.fill();
        // Hair bun
        ctx.fillStyle = '#D8D4D0'; ctx.beginPath(); ctx.arc(0, -44, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2B1E16'; ctx.beginPath(); ctx.arc(-7, -26, 3, 0, Math.PI * 2); ctx.arc(7, -26, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#9E4B3A'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, -18, 7, 0.15, Math.PI - 0.15); ctx.stroke();
        headTopY = -52;
        break;
      }
    }

    // Sunglasses prop
    if (props.includes('sunglasses')) {
      ctx.fillStyle = '#141414';
      ctx.fillRect(-19, -33, 16, 10);
      ctx.fillRect(3, -33, 16, 10);
      ctx.fillRect(-4, -30, 8, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(-16, -31, 5, 3); ctx.fillRect(6, -31, 5, 3);
    }

    // Hat props
    const hatProp = ['crown', 'wizardhat', 'chefhat', 'pilgrimhat'].find(h => props.includes(h));
    if (hatProp && !(key === 'pilgrim' && hatProp === 'pilgrimhat')) {
      drawHat(ctx, hatProp, 0, headTopY, 0.95);
    }

    // Side props
    if (props.includes('guitar')) {
      ctx.save(); ctx.translate(38, 12); ctx.rotate(0.45);
      ctx.fillStyle = '#C85A17'; ctx.beginPath(); ctx.arc(0, 14, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5C3A21'; ctx.fillRect(-3, -28, 6, 34);
      ctx.fillStyle = '#2B1E16'; ctx.beginPath(); ctx.arc(0, 14, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (props.includes('trophy')) {
      ctx.save(); ctx.translate(-44, 12);
      ctx.fillStyle = '#F2C14E';
      ctx.beginPath(); ctx.moveTo(-12, -16); ctx.lineTo(12, -16); ctx.lineTo(8, 4); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill();
      ctx.fillRect(-3, 4, 6, 12); ctx.fillRect(-10, 16, 20, 5);
      ctx.restore();
    }
    if (props.includes('balloon')) {
      const bCols = ['#E63946', '#F9C74F', '#4CC9F0'];
      bCols.forEach((bc, i) => {
        const bx = -44 + i * 14, by = -58 - (i % 2) * 12;
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bx, by + 12); ctx.lineTo(-26, 4); ctx.stroke();
        ctx.fillStyle = bc; ctx.beginPath(); ctx.ellipse(bx, by, 10, 13, 0, 0, Math.PI * 2); ctx.fill();
      });
    }
    if (props.includes('cranberry')) {
      ctx.fillStyle = '#9E2A2B';
      [[-36, -34], [-12, -52], [16, -50], [38, -30]].forEach(([bx, by]) => {
        ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(bx - 2, by - 2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9E2A2B';
      });
    }
    if (props.includes('candle')) {
      ctx.save(); ctx.translate(46, 24);
      ctx.fillStyle = '#FFF3D6'; ctx.fillRect(-6, -12, 12, 28);
      ctx.fillStyle = '#FF9F1C'; ctx.beginPath(); ctx.ellipse(0, -18, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFF3B0'; ctx.beginPath(); ctx.ellipse(0, -17, 2.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function applyStyleFilter(canvas, ctx, style) {
    const w = canvas.width, h = canvas.height;
    if (style === 'pixel') {
      const small = document.createElement('canvas');
      small.width = 56; small.height = 38;
      const sctx = small.getContext('2d');
      sctx.drawImage(canvas, 0, 0, 56, 38);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(small, 0, 0, 56, 38, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
    } else if (style === 'vintage') {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189 + 14);
        d[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168 + 6);
        d[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
      ctx.putImageData(img, 0, 0);
      const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.65);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(43,26,12,0.45)');
      ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
    } else if (style === 'neon') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#3A1C71';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(255,0,160,0.28)');
      g.addColorStop(1, 'rgba(0,245,255,0.28)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    } else if (style === 'sketch') {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = lum > 155 ? 248 : lum > 95 ? 165 : 42;
        d[i] = v; d[i + 1] = v - 3; d[i + 2] = v - 8;
      }
      ctx.putImageData(img, 0, 0);
    } else if (style === 'watercolor') {
      ctx.fillStyle = 'rgba(255,248,238,0.18)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  function renderToCanvas(canvas, prompt) {
    const w = canvas.width || 440;
    const h = canvas.height || 300;
    const ctx = canvas.getContext('2d');
    const parsed = parsePrompt(prompt);
    const rng = makeRng(prompt);

    ctx.clearRect(0, 0, w, h);
    drawBackground(ctx, w, h, parsed, rng);
    drawWeather(ctx, w, h, parsed, rng);

    const accent = parsed.colors[0]?.hex || null;
    const subs = parsed.subjects;
    const baseScale = typeof parsed.count === 'number' && parsed.count < 2 ? parsed.count : 1;

    if (subs.length === 1 && (parsed.count === 2 || parsed.count === 3)) {
      const n = parsed.count;
      for (let i = 0; i < n; i++) {
        const px = w * ((i + 1) / (n + 1));
        const py = h * 0.62 + (i % 2 === 0 ? 0 : -10);
        drawSubject(ctx, subs[0], px, py, n === 3 ? 0.78 : 0.9, accent, parsed.props);
      }
    } else {
      subs.forEach((sub, idx) => {
        const total = subs.length;
        const px = total === 1 ? w * 0.5 : w * (0.24 + (idx / (total - 1)) * 0.52);
        const py = h * (idx === 0 ? 0.62 : 0.65);
        const sc = (total === 1 ? 1.05 : total === 2 ? 0.88 : 0.74) * baseScale;
        drawSubject(ctx, sub, px, py, sc, idx === 0 ? accent : null, idx === 0 ? parsed.props : []);
      });
    }

    applyStyleFilter(canvas, ctx, parsed.style);
    return parsed;
  }

  function renderDataURL(prompt, w = 440, h = 300) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const parsed = renderToCanvas(c, prompt);
    return { dataUrl: c.toDataURL('image/png'), parsed, canvas: c };
  }

  // Compute perceptual visual similarity between two canvases (0..100)
  function compareCanvases(c1, c2) {
    const gw = 24, gh = 16;
    const sample = (src) => {
      const t = document.createElement('canvas');
      t.width = gw; t.height = gh;
      const g = t.getContext('2d');
      g.drawImage(src, 0, 0, gw, gh);
      return g.getImageData(0, 0, gw, gh).data;
    };
    const d1 = sample(c1);
    const d2 = sample(c2);
    let diffSum = 0;
    const n = gw * gh;
    for (let i = 0; i < d1.length; i += 4) {
      const dr = d1[i] - d2[i];
      const dg = d1[i + 1] - d2[i + 1];
      const db = d1[i + 2] - d2[i + 2];
      diffSum += Math.sqrt(dr * dr + dg * dg + db * db) / 441.67;
    }
    const sim = Math.max(0, 1 - (diffSum / n) * 1.45);
    return Math.round(sim * 100);
  }

  const STOP_WORDS = new Set([
    'the','and','with','from','that','this','into','onto','over','under','near','next','beside','inside',
    'wearing','holding','riding','sitting','standing','looking','very','cute','nice','good','cool','style',
    'image','picture','photo','illustration','drawing','painting','scene','background','foreground','front',
    'back','side','left','right','center','middle','there','their','they','them','some','many','more','most',
    'like','looks','made','have','has','are','was','were','for','its','his','her','you','your','who','what',
  ]);

  function extractTokens(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .map(w => w.replace(/(ing|ed|es|s)$/, w.length > 5 ? '' : '$1'))
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  }

  function lexicalMatch(targetPrompt, userPrompt) {
    const tToks = [...new Set(extractTokens(targetPrompt))];
    const uToks = [...new Set(extractTokens(userPrompt))];
    if (!tToks.length || !uToks.length) return { pct: 10, matched: [], missed: tToks };
    const matched = [];
    const missed = [];
    for (const tw of tToks) {
      const hit = uToks.some(uw =>
        uw === tw ||
        (tw.length >= 4 && uw.startsWith(tw.slice(0, 4))) ||
        (uw.length >= 4 && tw.startsWith(uw.slice(0, 4)))
      );
      if (hit) matched.push(tw);
      else missed.push(tw);
    }
    const recall = matched.length / tToks.length;
    const precision = matched.length / Math.max(1, uToks.length);
    // Weighted toward recall (catching target concepts) with precision & detail richness bonus
    const raw = recall * 0.78 + precision * 0.22;
    const pct = Math.max(8, Math.min(98, Math.round(raw * 100)));
    return { pct, matched, missed };
  }

  // Grade a Prompt Clone submission against the exact target checklist + lexical detail match.
  // NEVER uses the built-in cartoon turkey/prop catalog so tags & scores are 100% faithful to the real artwork!
  function gradeCloneSubmission(targetPrompt, userPrompt, targetCanvas, userCanvas, checklist) {
    const uLower = String(userPrompt || '').toLowerCase();
    const lex = lexicalMatch(targetPrompt, userPrompt);
    const breakdown = [];
    let checkPct = lex.pct;

    if (Array.isArray(checklist) && checklist.length > 0) {
      let earned = 0;
      let maxW = 0;
      for (const item of checklist) {
        const w = item.weight || 20;
        maxW += w;
        const words = item.words || [];
        const matchedWords = words.filter(kw => uLower.includes(kw.toLowerCase()));
        const hit = matchedWords.length > 0;
        if (hit) earned += w;
        breakdown.push({ label: item.label, hit, partial: false });
      }
      checkPct = Math.round((earned / Math.max(1, maxW)) * 100);
    } else {
      // Custom uploaded image: derive tags purely from the actual matched/missed words of the target description!
      lex.matched.slice(0, 4).forEach(w => breakdown.push({ label: w, hit: true, partial: false }));
      lex.missed.slice(0, 2).forEach(w => breakdown.push({ label: w, hit: false, partial: false }));
    }

    const wordCount = (userPrompt || '').trim().split(/\s+/).filter(Boolean).length;
    let total = Array.isArray(checklist) && checklist.length > 0
      ? Math.round(checkPct * 0.65 + lex.pct * 0.35)
      : lex.pct;

    if (wordCount < 2) total = Math.min(total, 14);
    else if (wordCount < 4) total = Math.min(total, 36);
    total = Math.max(8, Math.min(98, total));

    let comment = '';
    if (total >= 86) comment = 'Uncanny clone! Are you secretly the AI that drew this?!';
    else if (total >= 70) comment = 'Strong detective work — nailed the big picture and almost every key detail!';
    else if (total >= 50) comment = 'Solid direction! Got the core vibe right, with a few creative detours.';
    else if (total >= 30) comment = 'Same universe, totally different movie — hilarious creative remix!';
    else comment = 'Wild abstract plot twist! The AI went on a totally unexpected adventure.';

    return { score: total, semanticPct: checkPct, visualPct: lex.pct, lexicalPct: lex.pct, breakdown, comment };
  }

  return { parsePrompt, renderToCanvas, renderDataURL, compareCanvases, lexicalMatch, gradeCloneSubmission };
})();

if (typeof module !== 'undefined') module.exports = AIArt;
