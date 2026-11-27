// Curated Thanksgiving Family Game Night Content Packs for all 6 Games
// Built to be hilarious, kid-safe, and equally fun for 7-year-olds and grandparents.

const GAME_DATA = {
  avatars: ['🦃', '🥧', '🦊', '🐻', '🦉', '🐸', '🦁', '🎃', '🌽', '🍎', '🤖', '👑'],

  // GAME 1: TURKEY COURT
  turkeyCourt: {
    cases: [
      { title: 'The Great Taco Coup', charge: 'You are a turkey lawyer trying to convince the entire table to cancel turkey and order tacos instead.', kidsFriendly: true },
      { title: 'The Glowing Mashed Potatoes', charge: 'The mashed potatoes are mysteriously glowing neon green and everyone saw you walk out of the kitchen.', kidsFriendly: true },
      { title: 'The Maple Syrup Gravy Incident', charge: 'Someone swapped the gravy with pancake syrup 5 minutes before dinner. Defend yourself!', kidsFriendly: true },
      { title: 'The Missing Pie Slice', charge: 'One giant triangle is missing from the pumpkin pie, and there is whipped cream on your nose.', kidsFriendly: true },
      { title: 'The 1621 Time Traveler', charge: 'You accidentally brought a smartphone back to the first Thanksgiving and must explain TikTok to the Pilgrims.', kidsFriendly: true },
      { title: 'The Cranberry Cannon', charge: 'A can of cranberry sauce rolled off the table and launched into the living room. Prove it was an heroic rescue!', kidsFriendly: true },
      { title: 'The Gravy Monopoly', charge: 'You hid the gravy boat behind your plate and tried to charge your relatives $5 per spoonful.', kidsFriendly: false },
      { title: 'The Kid-Table Rebellion', charge: 'You led a peaceful revolution demanding that dessert be served BEFORE vegetables forever.', kidsFriendly: true },
      { title: 'The Dog Took the Turkey', charge: 'You left the back door open and the family dog walked away with a whole drumstick. Make your excuse!', kidsFriendly: true },
      { title: 'The Stuffing Sculpture', charge: 'Instead of eating dinner, you built a 2-foot castle out of stuffing and declared yourself Emperor.', kidsFriendly: true },
      { title: 'The Secret Wi-Fi Sabotage', charge: 'You turned off the house Wi-Fi right before the big football game so people would talk to you.', kidsFriendly: false },
      { title: 'The Marshmallow Mountain', charge: 'You ate ALL the toasted marshmallows off the top of the sweet potato casserole before anyone else sat down.', kidsFriendly: true },
      { title: 'The Dishwashing Escape Artist', charge: 'Explain why you are legally too famous and important to wash a single dish tonight.', kidsFriendly: true },
      { title: 'The Pilgrim Fashion Police', charge: 'Convince the court that everyone at dinner should be required to wear giant buckle hats.', kidsFriendly: true },
      { title: 'The Leftovers Heist', charge: 'You packed 90% of the leftovers into your own Tupperware before dinner even ended. Justify it!', kidsFriendly: false },
      { title: 'The Rogue Robot Chef', charge: 'You hired an AI robot to cook Thanksgiving dinner and it served everybody hot dog soup.', kidsFriendly: true },
    ],
    twists: [
      'OBJECTION! The family dog just took the witness stand and pointed a paw right at YOU!',
      'HOLD EVERYTHING! Security cameras caught you wearing a giant turkey costume at the scene!',
      'BREAKING NEWS! A mysterious witness says you did it in exchange for three extra slices of pie!',
      'PLOT TWIST! Your opponent just revealed they were secretly your accomplice the whole time!',
      'ORDER IN THE COURT! The turkey itself just walked in and wants an apology RIGHT NOW!',
      'SURPRISE EVIDENCE! We found your fingerprints all over the whipped cream can!',
      'OBJECTION! You now have to finish your defense while speaking like a dramatic movie trailer!',
      'NEW EVIDENCE! A tiny sticky note in your handwriting says "Operation Gravy Chaos was a success!"',
      'WAIT A SECOND! The Pilgrims just called from 1621 and they are NOT happy with your story!',
      'PLOT TWIST! A genie says you must include the word "BANANA" in your next sentence or lose!',
      'COURTROOM SHOCKER! The mashed potatoes just started talking and they are defending YOU!',
      'OBJECTION! The judge only accepts excuses that somehow blame outer space aliens!',
    ],
  },

  // GAME 2: PROMPT PANIC! (Taboo Speed AI Art Showdown)
  promptPanic: {
    targets: [
      { phrase: 'A turkey riding a skateboard at sunset', banned: ['turkey', 'skateboard', 'sunset'], hints: ['gobbler bird', 'wooden board with wheels', 'golden dusk'] },
      { phrase: 'A pilgrim astronaut eating pumpkin pie on Mars', banned: ['pilgrim', 'astronaut', 'pumpkin', 'pie', 'mars'], hints: ['1621 settler', 'space helmet', 'whipped cream dessert', 'red planet'] },
      { phrase: 'A robot chef juggling cranberries in the kitchen', banned: ['robot', 'chef', 'cranberries', 'kitchen'], hints: ['metal machine', 'tall white hat', 'red berries', 'dinner stove'] },
      { phrase: 'A cat wearing a royal crown guarding a gravy boat', banned: ['cat', 'crown', 'gravy'], hints: ['meow feline', 'gold king headpiece', 'brown sauce pouring'] },
      { phrase: 'A dragon wearing sunglasses on a sunny beach', banned: ['dragon', 'sunglasses', 'beach'], hints: ['fire breather', 'dark shades', 'sandy ocean shore'] },
      { phrase: 'A dog wearing a wizard hat in a snowy mountain', banned: ['dog', 'wizard', 'snow', 'mountain'], hints: ['barking pup', 'pointy magic hat', 'frosty winter peaks'] },
      { phrase: 'A UFO beaming up a giant pumpkin pie at night', banned: ['ufo', 'pumpkin', 'pie', 'night'], hints: ['flying saucer', 'huge orange dessert', 'crescent starry sky'] },
      { phrase: 'A turkey playing guitar under fireworks in the city', banned: ['turkey', 'guitar', 'fireworks', 'city'], hints: ['gobbler bird', 'rockstar strings', 'sky sparks', 'tall buildings'] },
      { phrase: 'A pixel art pumpkin wearing a buckle hat', banned: ['pixel', 'pumpkin', 'buckle', 'hat'], hints: ['blocky 8-bit', 'carved orange gourd', 'tall black settler cap'] },
      { phrase: 'A superhero fox flying over a rainbow forest', banned: ['superhero', 'fox', 'rainbow', 'forest'], hints: ['cloak hero', 'bushy tail critter', 'seven colors arch', 'autumn trees'] },
      { phrase: 'Two turkeys celebrating with balloons at a volcano', banned: ['turkey', 'balloons', 'volcano'], hints: ['pair of gobblers', 'floating helium', 'molten lava'] },
      { phrase: 'A neon cyberpunk robot eating pizza underwater', banned: ['neon', 'robot', 'pizza', 'underwater'], hints: ['glowing synth', 'metal android', 'pepperoni cheese slice', 'deep sea bubbles'] },
      { phrase: 'A vintage photo of a pilgrim riding a rocket', banned: ['vintage', 'pilgrim', 'rocket'], hints: ['old sepia', 'mayflower settler', 'blastoff shuttle'] },
      { phrase: 'Three tiny pumpkins glowing with candles at night', banned: ['pumpkin', 'candles', 'night'], hints: ['3 mini gourds', 'flickering wax flame', 'crescent starry sky'] },
      { phrase: 'A grandma chef winning a gold trophy in autumn woods', banned: ['grandma', 'chef', 'trophy', 'woods'], hints: ['nana baker', 'first place prize', 'falling leaves forest'] },
      { phrase: 'A skateboard dog delivering a pumpkin pie in the rain', banned: ['skateboard', 'dog', 'pumpkin', 'pie', 'rain'], hints: ['wheels board', 'good boy canine', 'whipped cream pastry', 'stormy drizzle'] },
    ],
    quickChips: [
      'gobbler bird', '1621 settler', 'whipped cream pastry', 'orange gourd', 'brown sauce',
      'metal android', 'barking pup', 'meow feline', 'fire breather', 'flying saucer', 'space helmet',
      'wooden board with wheels', 'dark shades', 'king gold headpiece', 'pointy magic hat', 'rockstar strings',
      'blastoff shuttle', 'red berries', 'first place prize', 'floating helium', 'flickering flame',
      'red planet cosmos', 'sandy shore', 'frosty peaks', 'molten lava', 'tall urban buildings',
      'deep sea bubbles', 'golden dusk', 'crescent starry sky', 'blocky 8-bit', 'glowing synth', 'old sepia'
    ]
  },

  // GAME 3: PASS THE GOBBLE BOMB (Hot-Potato AI Story)
  gobbleBomb: {
    starters: [
      'Five minutes before dinner, the roasted turkey suddenly stood up, put on sunglasses, and announced...',
      'When Grandma opened the oven, instead of pumpkin pie, a glowing portal opened and out stepped...',
      'The Thanksgiving parade balloon broke free from its ropes and landed right in our backyard carrying...',
      'Everyone was stunned when the family dog cleared its throat, picked up a fork, and said...',
      'Right as we sat down to eat, the mashed potatoes began floating toward the ceiling because...',
      'We found a dusty treasure map hidden inside the stuffing bowl that led directly to...',
      'A time-traveling Pilgrim knocked on the front door holding a giant glowing suitcase filled with...',
      'The cranberry sauce started humming a catchy song and turned everyone\'s shoes into...',
    ],
    twistWords: [
      'trampoline', 'gravy volcano', 'dinosaur', 'secret tunnel', 'marshmallow', 'laser beam',
      'tuba', 'skateboard', 'astronaut', 'broccoli', 'disco ball', 'pirate ship',
      'giant spoon', 'time machine', 'ninja squirrel', 'confetti', 'bubble bath', 'karate chop',
      'jetpack', 'whispering pie', 'rainbow cape', 'accordion', 'cheese wheel', 'magic wand',
      'roller skates', 'robot butler', 'karaoke', 'boomerang', 'cactus', 'crown',
      'megaphone', 'pancake', 'submarine', 'umbrella', 'pickle', 'fireworks',
      'pajamas', 'hammock', 'yo-yo', 'violin', 'glitter', 'magnet',
      'pillow fort', 'somersault', 'waffle', 'compass', 'dragon', 'kazoo',
    ],
    modifiers: [
      { label: 'NORMAL TURN', desc: 'Use the twist word and hit PASS!' },
      { label: '⚡ 4 WORDS MAX!', desc: 'Say your sentence in 4 words or fewer!' },
      { label: '🎵 RHYME TIME!', desc: 'Your sentence has to rhyme with the last one!' },
      { label: '🤫 WHISPER MODE!', desc: 'You MUST whisper your sentence dramatically!' },
      { label: '🤖 ROBOT VOICE!', desc: 'Speak like a malfunctioning robot!' },
      { label: '🔊 SOUND EFFECT!', desc: 'Include a loud sound effect in your turn!' },
      { label: '🏴‍☠️ PIRATE TALK!', desc: 'Deliver your line like a pirate, matey!' },
    ],
  },

  // GAME 4: SPOT THE BOT (Dinner Table Edition)
  spotTheBot: {
    prompts: [
      {
        q: 'Explain how Wi-Fi works to a 1621 Pilgrim in one sentence.',
        bots: [
          'Invisible carrier pigeons made of lightning fly through the walls to bring you cat paintings.',
          'It is like magic smoke signals, except if you unplug the blinking box everyone starts screaming.',
          'Tiny invisible wizards carry letters through the air at the speed of a very caffeinated horse.',
        ],
      },
      {
        q: 'Invent a Thanksgiving side dish that would get banned from the table immediately.',
        bots: [
          'Spicy gummy-worm casserole topped with crushed Doritos and lukewarm pickle juice.',
          'Sardine and marshmallow fluff gelatin shaped like Uncle Bob.',
          'Toothpaste-glazed Brussels sprouts served sizzling inside a cowboy boot.',
        ],
      },
      {
        q: 'What is the turkey secretly thinking at 2:00 PM on Thanksgiving Day?',
        bots: [
          'If I put on a fake mustache and hold a clipboard, maybe nobody will notice me leaving.',
          'Honestly, I have always said this family looks way more like a lasagna crowd.',
          'Quick, somebody distract them by mentioning politics so I can make a run for the patio.',
        ],
      },
      {
        q: 'What is the best excuse to get out of washing the Thanksgiving dishes?',
        bots: [
          'My doctor said warm soapy water lowers my competitive pie-eating performance by 40%.',
          'I am currently guarding the couch to make sure nobody steals the throw pillows.',
          'I would love to help, but I am in charge of supervising the leftovers from the living room.',
        ],
      },
      {
        q: 'What would a Pilgrim freak out about most if they visited your house today?',
        bots: [
          'The fact that we keep a glowing rectangle in our pockets just to watch dogs on skateboards.',
          'That we pay extra money for tiny heated boxes that toast bread in ninety seconds.',
          'Walking into a room and hearing a small plastic cylinder obey orders to play music.',
        ],
      },
      {
        q: 'Write a 1-sentence movie trailer voiceover for THIS family\'s Thanksgiving.',
        bots: [
          'One kitchen, twelve hungry relatives, and a gravy boat that could change history forever.',
          'In a world where the pie is running low, only the fastest fork will survive.',
          'They came for the turkey, they stayed because nobody could agree on what to watch after.',
        ],
      },
      {
        q: 'If pumpkin pie had a secret superpower, what would it be?',
        bots: [
          'Instantly putting every adult within a ten-foot radius into a peaceful two-hour nap.',
          'Making you genuinely believe you still have room for a second slice even when you do not.',
          'Turning a regular spoon into a magnet for the last swirl of whipped cream.',
        ],
      },
      {
        q: 'What is a terrible Thanksgiving parade balloon idea?',
        bots: [
          'A sixty-foot inflatable tax form slowly floating down Fifth Avenue.',
          'A gigantic wet sock that gently drips lukewarm water onto the marching band.',
          'An enormous alarm clock set to 5:30 AM on a Monday morning.',
        ],
      },
      {
        q: 'Give a terrible piece of cooking advice that sounds weirdly professional.',
        bots: [
          'Always whisper encouraging compliments to the stuffing so the bread cubes rise with confidence.',
          'If the oven timer beeps, ignore it for twenty minutes to show the turkey who is boss.',
          'Season the mashed potatoes exclusively while standing on one foot for balanced flavor.',
        ],
      },
      {
        q: 'What is the weirdest food combo you could sneak onto your Thanksgiving plate?',
        bots: [
          'A scoop of cranberry sauce rolled inside a dinner roll with three chocolate chips.',
          'Mashed potatoes dipped straight into apple cider like a very confused soup.',
          'Cold stuffing sandwiched between two slices of pumpkin pie like a Thanksgiving burger.',
        ],
      },
      {
        q: 'Why did the mashed potatoes cross the dinner table?',
        bots: [
          'Because someone yelled "pass the butter" and three people threw it at the exact same time.',
          'To escape the guy who was about to drown them in half a gallon of gravy.',
          'Because the kids\' table had better snacks and way fewer questions about school.',
        ],
      },
      {
        q: 'Describe your dream Thanksgiving superpower.',
        bots: [
          'The ability to pause time for ten minutes so I can eat the crispy turkey skin in peace.',
          'Telepathically knowing which Tupperware container actually has the matching lid.',
          'Snapping my fingers so every dirty pan instantly teleports into the dishwasher already clean.',
        ],
      },
    ],
  },

  // GAME 5: FEAST SHOWDOWN (Age-Balanced Family Game Show)
  feastShowdown: {
    trivia: {
      kid: [
        { q: 'What sound does a male turkey make?', a: 'Gobble! (Female turkeys actually cluck and purr!)' },
        { q: 'What is the name of the famous ship the Pilgrims sailed on?', a: 'The Mayflower' },
        { q: 'Which orange vegetable is actually a fruit and makes a famous Thanksgiving pie?', a: 'Pumpkin!' },
        { q: 'What red wiggly thing hangs over a turkey\'s beak?', a: 'A snood (or wattle under its chin!)' },
        { q: 'Which giant character parade happens in New York City every Thanksgiving morning?', a: 'The Macy\'s Thanksgiving Day Parade' },
        { q: 'What day of the week is Thanksgiving ALWAYS on in the United States?', a: 'Thursday (the 4th Thursday of November)' },
        { q: 'Which sport is famously played on TV all day on Thanksgiving?', a: 'Football!' },
        { q: 'Riddle: What key can\'t open any lock, even though it\'s on the Thanksgiving table?', a: 'A tur-KEY!' },
        { q: 'What little red berries bounce like rubber balls when they are fresh?', a: 'Cranberries!' },
        { q: 'Riddle: If April showers bring May flowers, what do Mayflowers bring?', a: 'Pilgrims!' },
        { q: 'Can wild turkeys fly?', a: 'YES! Wild turkeys can fly up to 55 mph in short bursts!' },
        { q: 'Which cartoon beagle hosts a famous Thanksgiving special serving toast and popcorn?', a: 'Snoopy (A Charlie Brown Thanksgiving)!' },
      ],
      teen: [
        { q: 'Which US President officially made Thanksgiving a national holiday in 1863?', a: 'Abraham Lincoln' },
        { q: 'True or False: Turkeys were almost chosen as the national bird of the United States.', a: 'Mostly a myth! Ben Franklin praised turkeys in a letter to his daughter, though he never formally proposed it.' },
        { q: 'Which iconic song was originally written as a Thanksgiving song, NOT a Christmas song?', a: 'Jingle Bells!' },
        { q: 'What year did the very first Macy\'s Thanksgiving Day Parade take place? (Closest within 10 yrs)', a: '1924 (with live zoo animals instead of balloons!)' },
        { q: 'How fast can a wild turkey run on land? (Within 5 mph)', a: 'Up to 20–25 mph!' },
        { q: 'What is a group of turkeys called?', a: 'A rafter (or a flock/gang)!' },
        { q: 'Which two NFL teams ALWAYS host a home game on Thanksgiving Day?', a: 'Detroit Lions and Dallas Cowboys' },
        { q: 'What kitchen accident in 1953 led to the invention of TV dinners?', a: 'Swanson ordered 260 TONS too much frozen turkey and packed it into airplane trays!' },
        { q: 'Which country ALSO celebrates Thanksgiving, but in October?', a: 'Canada!' },
        { q: 'Roughly how many feathers does an adult turkey have? (Closest wins)', a: 'About 5,000 to 6,000 feathers!' },
      ],
      adult: [
        { q: 'Which magazine editor campaigned for 17 years (writing 5 presidents) to make Thanksgiving a national holiday?', a: 'Sarah Josepha Hale (who also wrote "Mary Had a Little Lamb"!)' },
        { q: 'In 1939, why did President FDR briefly move Thanksgiving a week earlier ("Franksgiving")?', a: 'To extend the Christmas shopping season during the Great Depression!' },
        { q: 'Which amino acid in turkey gets blamed for sleepiness—even though cheddar cheese has more of it?', a: 'Tryptophan!' },
        { q: 'What year was the very first Presidential Turkey Pardon officially formalized by George H.W. Bush?', a: '1989' },
        { q: 'Which meat was definitely served at the 1621 Plymouth feast according to eyewitness Edward Winslow: turkey, venison, or ham?', a: 'Venison (5 deer brought by the Wampanoag, plus wild fowl & seafood!)' },
        { q: 'What is the busiest day of the year for plumbers in the United States?', a: 'Black Friday (the day after Thanksgiving!)' },
        { q: 'Which US state raises the most turkeys every year?', a: 'Minnesota!' },
        { q: 'Which balloon was the very first giant character balloon in the 1927 Macy\'s Parade?', a: 'Felix the Cat!' },
        { q: 'Why did cranberry growers invent the "bounce test" in the 1800s?', a: 'Ripe cranberries have tiny air pockets inside and bounce; rotten ones splat!' },
        { q: 'Which iconic band performed the first-ever Thanksgiving NFL halftime show in 1997? Wait—who headlined Dallas\'s famous 1997 Salvation Army kickoff?', a: 'Reba McEntire!' },
      ],
    },
    pitches: [
      { dish: 'Pumpkin Pie Sushi', taglineHint: 'Pitch a 10-second TV commercial slogan!' },
      { dish: 'Gravy Bubble Tea (with Mashed Potato Pearls)', taglineHint: 'Convince investors to fund this drink!' },
      { dish: 'Cranberry Pop-Rocks Pizza', taglineHint: 'Sell it like a hyper-excited infomercial host!' },
      { dish: 'Stuffing-Flavored Toothpaste', taglineHint: 'Give it a dentist-approved slogan!' },
      { dish: 'Turkey & Whipped Cream Energy Drink', taglineHint: 'Pitch it to extreme athletes!' },
      { dish: 'Sweet Potato Marshmallow Tacos', taglineHint: 'Invent the restaurant name and jingle!' },
      { dish: 'Green Bean Casserole Ice Cream Cone', taglineHint: 'Make kids beg their parents for a scoop!' },
      { dish: 'Hot Gravy Cotton Candy', taglineHint: 'Sell it at the Thanksgiving fair!' },
      { dish: 'Garlic Mashed Potato Lip Balm', taglineHint: 'Pitch it like a luxury Paris perfume ad!' },
      { dish: 'Bite-Sized Pilgrim Corn-Dog Waffles', taglineHint: 'Give it a catchy 5-word catchphrase!' },
      { dish: 'Sparkling Turkey-Broth Soda', taglineHint: 'Pitch it as the drink of the future!' },
      { dish: 'Cinnamon Roll Stuffing Burrito', taglineHint: 'Sell it as the ultimate Black Friday breakfast!' },
    ],
    categories: [
      'Things that are orange',
      'Foods you eat with a spoon',
      'Things a Pilgrim would freak out seeing today',
      'Excuses to skip doing the dishes',
      'Animals that could beat a turkey in a race',
      'Things you find inside a messy kitchen drawer',
      'Movies great to watch after a giant dinner',
      'Things that are round',
      'Pies (real or deliciously invented!)',
      'Things you are secretly thankful for',
      'Words that start with the letter T',
      'Items you would pack for a trip to Mars',
      'Superpowers that would be helpful at dinner',
      'Things that bounce',
      'Cartoon characters you\'d invite to Thanksgiving',
    ],
  },

  // GAME 6: PROMPT CLONE! (Reverse-Engineer the AI Image)
  promptClone: {
    challenges: [
      {
        id: 'clone-1',
        title: 'Skateboard Sunset Turkey',
        difficulty: 'Warm-Up',
        asset: 'assets/clone-1.jpg',
        secretPrompt: 'A cheerful cartoon turkey wearing sunglasses riding a red skateboard on a winding road at golden orange sunset with falling autumn leaves',
        tips: 'Spot the animal, eyewear, vehicle color, sky lighting, and what is swirling through the air!',
      },
      {
        id: 'clone-2',
        title: 'Martian Pie Mission',
        difficulty: 'Medium',
        asset: 'assets/clone-2.jpg',
        secretPrompt: 'A cute astronaut in a white spacesuit holding a giant slice of pumpkin pie with whipped cream on Mars in outer space with ringed planet and fireworks',
        tips: 'Notice who is holding what, the red cratered planet, what is in the sky, and the 3D illustration style!',
      },
      {
        id: 'clone-3',
        title: 'Royal Kitchen Cat',
        difficulty: 'Medium',
        asset: 'assets/clone-3.jpg',
        secretPrompt: 'A fluffy golden orange tabby cat wearing a royal gold crown sitting on a checkered kitchen table beside a steaming gravy boat and two glowing candles oil painting',
        tips: 'Spot the exact animal, color, headgear, table objects, lighting, and painting style!',
      },
      {
        id: 'clone-4',
        title: 'Neon Cyberpunk Bot',
        difficulty: 'Tricky',
        asset: 'assets/clone-4.jpg',
        secretPrompt: 'A neon cyberpunk retro silver robot playing an orange electric guitar on a city skyline rooftop at night with three colorful floating balloons',
        tips: 'Catch the glowing neon style, instrument, floating props, time of day, and background skyline!',
      },
      {
        id: 'clone-5',
        title: 'Snowy Wizard Pup',
        difficulty: 'Medium',
        asset: 'assets/clone-5.jpg',
        secretPrompt: 'Watercolor illustration of a golden retriever puppy wearing a blue starry wizard hat beside a glowing carved orange pumpkin on snowy mountains with snowfall',
        tips: 'Check the soft watercolor style, dog breed, hat, glowing companion, mountain terrain, and weather!',
      },
      {
        id: 'clone-6',
        title: 'Beach Party UFO',
        difficulty: 'Medium',
        asset: 'assets/clone-6.jpg',
        secretPrompt: 'A cartoon silver UFO beaming a green ray onto a sunny tropical beach with palm trees where a turkey wearing sunglasses relaxes under a rainbow',
        tips: 'Two very different visitors on vacation — catch the glowing beam, eyewear, beach props, and sky arch!',
      },
      {
        id: 'clone-7',
        title: 'Retro Arcade Pilgrim',
        difficulty: 'Tricky',
        secretPrompt: 'Pixel art pilgrim riding a rocket at starry night with rainbow',
        tips: 'Notice the ART STYLE first! Then catch every object and sky detail.',
      },
      {
        id: 'clone-8',
        title: 'Vintage Dragon Chef',
        difficulty: 'Tricky',
        secretPrompt: 'Vintage sepia dragon wearing a chef hat juggling cranberries near a volcano',
        tips: 'Notice the old-timey photo filter, the hat, the floating red berries, and the fiery background!',
      },
      {
        id: 'clone-9',
        title: 'Super Fox Victory',
        difficulty: 'Medium',
        secretPrompt: 'A superhero fox wearing a cape holding a trophy in autumn forest with falling leaves',
        tips: 'Check the woodland animal, costume piece, prize, and autumn scenery!',
      },
      {
        id: 'clone-10',
        title: 'Triple Pumpkin Sketch',
        difficulty: 'Expert',
        secretPrompt: 'Ink sketch of three pumpkins at starry night with glowing candles',
        tips: 'Count carefully, spot the exact black-and-white drawing style, and notice the light source!',
      },
      {
        id: 'clone-11',
        title: 'Underwater Pizza Party',
        difficulty: 'Medium',
        secretPrompt: 'A turkey and pizza wearing a royal crown underwater with balloons',
        tips: 'Check the submerged ocean world, main duo, hat, and floating party props!',
      },
      {
        id: 'clone-12',
        title: 'Grandma\'s Rainy Bakery',
        difficulty: 'Tricky',
        secretPrompt: 'Watercolor painting of grandma chef with pumpkin pie and gravy boat in the rain',
        tips: 'Look for the soft painted style, the trio of cozy elements, and the weather!',
      },
    ],
  },
};

if (typeof module !== 'undefined') module.exports = GAME_DATA;
