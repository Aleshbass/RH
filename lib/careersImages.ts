/**
 * Photos on /careers. Paste any image URL (Cloudinary or elsewhere) into `src`; an empty `src`
 * hides that slot, and the hero falls back to an existing Rehabify photo until it's set.
 */
export const CAREERS_IMAGES = {
  hero: { src: "", alt: "The Rehabify team at work" },
  /** Up to three photos in the "Life at Rehabify" strip */
  gallery: [
    { src: "", alt: "" },
    { src: "", alt: "" },
    { src: "", alt: "" },
  ],
};

export const CAREERS_HERO_FALLBACK = {
  src: "https://res.cloudinary.com/dubeogufg/image/upload/f_auto,q_auto/v1741105202/IMG_6326_nmmqal.png",
  alt: "A Rehabify physiotherapist with a patient",
};
