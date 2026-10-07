export interface Mascot {
  id: string;
  name: string;
  image: string;
  quoteTemplate: (amount: string, handle: string) => string;
}

export const MASCOTS: Mascot[] = [
  {
    id: "doro-angel",
    name: "Doro Angel",
    image: "/couriers/doro-angel.jpg",
    quoteTemplate: (amount, handle) => `Carrying ${amount} MON to @${handle}.`,
  },
  {
    id: "chog-cyber",
    name: "Cyber Angel",
    image: "/couriers/cyber-angel.jpg",
    quoteTemplate: (amount, handle) => `${amount} MON, on its way to @${handle}.`,
  },
  {
    id: "barista-bear",
    name: "Hearth Angel",
    image: "/couriers/hearth-angel.jpg",
    quoteTemplate: (amount, handle) => `${amount} MON, with a note, for @${handle}.`,
  },
  {
    id: "star-bunny",
    name: "Starlight Angel",
    image: "/couriers/starlight-angel.jpg",
    quoteTemplate: (amount, handle) => `${amount} MON for @${handle}.`,
  },
];

export function getMascotById(id: string): Mascot {
  return MASCOTS.find((m) => m.id === id) || MASCOTS[0];
}
