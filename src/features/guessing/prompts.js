export const PROMPTS = [
  // Cute & Romantic
  'Love letter',
  'Holding hands',
  'Box of chocolates',
  'Teddy bear',
  'Sunset beach',
  'First date',
  'Movie night',
  'Starlit sky',
  'Heart balloon',
  'Cup of coffee',
  'Bouquet of roses',
  'Candlelit dinner',

  // Animals & Pets
  'Cat',
  'Dog',
  'Penguin',
  'Butterfly',
  'Panda',
  'Elephant',
  'Giraffe',
  'Koala',
  'Dolphin',
  'Owl',
  'Bunny',
  'Little frog',

  // Food & Sweet Treats
  'Pizza slice',
  'Ice cream cone',
  'Cupcake',
  'Pancake stack',
  'Sushi roll',
  'Strawberry',
  'Taco',
  'Donut',
  'Cookie',
  'Birthday cake',

  // Fun Objects & Places
  'Airplane',
  'Bicycle',
  'Acoustic guitar',
  'Campfire',
  'Rainbow',
  'Snowman',
  'Eiffel tower',
  'Space rocket',
  'Polaroid camera',
  'Magic wand',
  'Sunflowers',
  'Hot air balloon',
]

export function getRandomPrompts(count = 6) {
  const shuffled = [...PROMPTS].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}

