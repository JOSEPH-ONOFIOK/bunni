export type Bunny = {
  id: string;
  no: string;
  name: string;
  /** The region of the world this one comes from. */
  realm: string;
  src: string;
  /** Dominant colour of the artwork — drives the card's rim light. */
  tint: string;
  /** How common the look is. Supply is unannounced, so this is a band, not a
      count out of a total we can't yet name. */
  rarity: string;
  blurb: string;
  traits: [string, string][];
};

/** Drop facts. Supply is deliberately unannounced; mint is free. */
export const DROP = {
  supply: "TBA",
  price: "Free",
  date: "TBA",
} as const;

export const BUNNIES: Bunny[] = [
  {
    id: "sage",
    no: "0001",
    name: "Sage",
    realm: "Still Temple",
    src: "/pfp/sage.jpeg",
    tint: "#17b3b0",
    rarity: "One of one",
    blurb:
      "Sat so still for so long that the mountain started asking him for advice.",
    traits: [
      ["Fur", "Temple Teal"],
      ["Fit", "Indigo robe, prayer beads"],
      ["Eyes", "Lantern glow"],
    ],
  },
  {
    id: "ember",
    no: "0342",
    name: "Ember",
    realm: "Ashfall Ridge",
    src: "/pfp/ember.jpeg",
    tint: "#ff6a2b",
    rarity: "Uncommon",
    blurb:
      "Half of him woke up on the cold side of the mountain. The jacket settles the argument.",
    traits: [
      ["Fur", "Split Coat"],
      ["Fit", "Lava puffer"],
      ["Mood", "Tongue out, fully committed"],
    ],
  },
  {
    id: "seraph",
    no: "0777",
    name: "Seraph",
    realm: "Gilded Reach",
    src: "/pfp/seraph.jpeg",
    tint: "#f5c344",
    rarity: "Rare",
    blurb:
      "Descended to bring peace. Stayed for the drama. Has not stopped smiling since.",
    traits: [
      ["Fur", "Cloudpelt"],
      ["Fit", "Gilded mantle, six wings"],
      ["Mood", "Suspiciously pleased"],
    ],
  },
  {
    id: "scout",
    no: "1204",
    name: "Scout",
    realm: "Fern Hollow",
    src: "/pfp/scout.jpeg",
    tint: "#7bc86c",
    rarity: "Common",
    blurb:
      "Knows every trail in the Hollow and will not be sharing the map with you.",
    traits: [
      ["Fur", "Fern Green"],
      ["Fit", "Camo rig, black mask"],
      ["Mood", "Unimpressed, on duty"],
    ],
  },
  {
    id: "husk",
    no: "3130",
    name: "Husk",
    realm: "The Dust Flats",
    src: "/pfp/husk.jpeg",
    tint: "#8fb9d4",
    rarity: "Uncommon",
    blurb:
      "Technically had a bad week. Technically still having it. Wonderful company.",
    traits: [
      ["Fur", "Dust Blue"],
      ["Fit", "One tank top, several bones"],
      ["Mood", "Perpetual surprise"],
    ],
  },
];

/**
 * The realms, in trail order. Each one owns a bunny, which is what the
 * explorer swaps between — so the id has to match a bunny above.
 */
export const REALMS = [
  {
    id: "fern-hollow",
    name: "Fern Hollow",
    bunny: "scout",
    color: "#7bc86c",
    tagline: "Where everybody starts",
    copy: "Soft ground, tall ferns, and the trailheads everybody starts at. Easy walking, if you can find your way back out.",
    sky: ["#bfe4ff", "#d8f0dd", "#e8f6d9"],
  },
  {
    id: "still-temple",
    name: "Still Temple",
    bunny: "sage",
    color: "#17b3b0",
    tagline: "Above the treeline",
    copy: "Up past the treeline, where the air thins and the bells do the talking. Nobody raises their voice here.",
    sky: ["#a8dcf0", "#cdeef0", "#e2f5f2"],
  },
  {
    id: "ashfall-ridge",
    name: "Ashfall Ridge",
    bunny: "ember",
    color: "#ff6a2b",
    tagline: "Warm rock underfoot",
    copy: "Warm rock underfoot the whole way across, and a sky that can't decide on a colour. Pack the good jacket.",
    sky: ["#ffd2b0", "#ffe3c4", "#fff0dd"],
  },
  {
    id: "dust-flats",
    name: "The Dust Flats",
    bunny: "husk",
    color: "#8fb9d4",
    tagline: "Long way across",
    copy: "Flat, bright and further across than it looks. Whatever you meet out here has been out here a while.",
    sky: ["#dfe8d8", "#f0ecd4", "#f7f0dc"],
  },
  {
    id: "gilded-reach",
    name: "Gilded Reach",
    bunny: "seraph",
    color: "#f5c344",
    tagline: "Above the cloud line",
    copy: "Above the cloud line, lit from somewhere nobody's found yet. No two bunnies agree on how to get there.",
    sky: ["#a9d0ff", "#cfe4ff", "#ffeec4"],
  },
] as const;

export type Realm = (typeof REALMS)[number];

/** Look up the bunny a realm belongs to. */
export function bunnyFor(realm: Realm): Bunny {
  const found = BUNNIES.find((b) => b.id === realm.bunny);
  if (!found) throw new Error(`No bunny "${realm.bunny}" for realm ${realm.id}`);
  return found;
}
