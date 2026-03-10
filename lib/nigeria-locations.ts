/**
 * Nigeria Locations Database
 * Comprehensive state capitals and major cities with coordinates.
 * Used to geocode physiotherapist location strings to map coordinates.
 */

export interface NigeriaLocationCoords {
  lat: number;
  lng: number;
}

// Nigeria center point (for default map view)
export const NIGERIA_CENTER: NigeriaLocationCoords = {
  lat: 9.0820,
  lng: 8.6753,
};

export const NIGERIA_BOUNDS = {
  sw: { lat: 4.2, lng: 2.7 },
  ne: { lat: 13.9, lng: 14.7 },
};

/**
 * Major Nigerian cities/locations with coordinates.
 * Keys are lowercase for easy matching.
 */
export const NIGERIA_LOCATIONS: Record<string, NigeriaLocationCoords> = {
  // --- State Capitals & Major Cities ---
  "lagos": { lat: 6.5244, lng: 3.3792 },
  "ikeja": { lat: 6.6018, lng: 3.3515 },
  "victoria island": { lat: 6.4281, lng: 3.4219 },
  "lekki": { lat: 6.4698, lng: 3.5852 },
  "ikoyi": { lat: 6.4541, lng: 3.4382 },
  "surulere": { lat: 6.5059, lng: 3.3509 },
  "yaba": { lat: 6.5158, lng: 3.3752 },
  "ajah": { lat: 6.4663, lng: 3.5714 },
  "oshodi": { lat: 6.5563, lng: 3.3413 },
  "mushin": { lat: 6.5389, lng: 3.3547 },
  "alimosho": { lat: 6.6108, lng: 3.2585 },
  "agege": { lat: 6.6206, lng: 3.3261 },
  "ikorodu": { lat: 6.6194, lng: 3.5105 },
  "badagry": { lat: 6.4153, lng: 2.8814 },
  "epe": { lat: 6.5844, lng: 3.9833 },
  "festac": { lat: 6.4664, lng: 3.2808 },
  "maryland": { lat: 6.5673, lng: 3.3631 },
  "gbagada": { lat: 6.5524, lng: 3.3886 },
  "ogba": { lat: 6.6298, lng: 3.3383 },
  "magodo": { lat: 6.6316, lng: 3.3892 },
  
  "abuja": { lat: 9.0579, lng: 7.4951 },
  "garki": { lat: 9.0370, lng: 7.4870 },
  "wuse": { lat: 9.0735, lng: 7.4863 },
  "maitama": { lat: 9.0833, lng: 7.5000 },
  "asokoro": { lat: 9.0420, lng: 7.5271 },
  "gwarinpa": { lat: 9.1108, lng: 7.3925 },
  "kubwa": { lat: 9.1544, lng: 7.3266 },
  "lugbe": { lat: 8.9803, lng: 7.3797 },
  "jabi": { lat: 9.0683, lng: 7.4257 },
  "utako": { lat: 9.0817, lng: 7.4417 },

  "kano": { lat: 12.0022, lng: 8.5920 },
  "ibadan": { lat: 7.3775, lng: 3.9470 },
  "port harcourt": { lat: 4.8156, lng: 7.0498 },
  "benin city": { lat: 6.3350, lng: 5.6037 },
  "benin": { lat: 6.3350, lng: 5.6037 },
  "kaduna": { lat: 10.5105, lng: 7.4165 },
  "enugu": { lat: 6.4584, lng: 7.5464 },
  "calabar": { lat: 4.9757, lng: 8.3417 },
  "uyo": { lat: 5.0510, lng: 7.9335 },
  "warri": { lat: 5.5544, lng: 5.7932 },
  "owerri": { lat: 5.4836, lng: 7.0333 },
  "abeokuta": { lat: 7.1475, lng: 3.3619 },
  "jos": { lat: 9.8965, lng: 8.8583 },
  "ilorin": { lat: 8.4966, lng: 4.5426 },
  "akure": { lat: 7.2526, lng: 5.1931 },
  "osogbo": { lat: 7.7669, lng: 4.5562 },
  "ado-ekiti": { lat: 7.6211, lng: 5.2214 },
  "ado ekiti": { lat: 7.6211, lng: 5.2214 },
  "abakaliki": { lat: 6.3249, lng: 8.1137 },
  "awka": { lat: 6.2209, lng: 7.0678 },
  "asaba": { lat: 6.1946, lng: 6.7335 },
  "makurdi": { lat: 7.7337, lng: 8.5210 },
  "lokoja": { lat: 7.7969, lng: 6.7406 },
  "minna": { lat: 9.6139, lng: 6.5569 },
  "lafia": { lat: 8.5145, lng: 8.5158 },
  "yola": { lat: 9.2035, lng: 12.4954 },
  "jalingo": { lat: 8.8932, lng: 11.3674 },
  "bauchi": { lat: 10.3158, lng: 9.8442 },
  "gombe": { lat: 10.2897, lng: 11.1673 },
  "damaturu": { lat: 11.7470, lng: 11.9608 },
  "maiduguri": { lat: 11.8311, lng: 13.1510 },
  "sokoto": { lat: 13.0607, lng: 5.2476 },
  "birnin kebbi": { lat: 12.4539, lng: 4.1975 },
  "gusau": { lat: 12.1628, lng: 6.6608 },
  "katsina": { lat: 13.0059, lng: 7.6019 },
  "dutse": { lat: 11.7563, lng: 9.3389 },
  "ado": { lat: 7.6211, lng: 5.2214 },
  "onitsha": { lat: 6.1453, lng: 6.7857 },
  "nnewi": { lat: 6.0195, lng: 6.9150 },
  "aba": { lat: 5.1066, lng: 7.3667 },
  "umuahia": { lat: 5.5261, lng: 7.4939 },
  "eket": { lat: 4.6407, lng: 7.9225 },
  "ikot ekpene": { lat: 5.1831, lng: 7.7150 },
  "sapele": { lat: 5.8805, lng: 5.6757 },
  "effurun": { lat: 5.5631, lng: 5.7831 },
  "agbor": { lat: 6.2550, lng: 6.2000 },
  "auchi": { lat: 7.0667, lng: 6.2667 },
  "ekpoma": { lat: 6.7458, lng: 6.1408 },
  "ore": { lat: 6.7485, lng: 4.8717 },
  "ondo": { lat: 7.0908, lng: 4.8356 },
  "ile-ife": { lat: 7.4869, lng: 4.5617 },
  "ilesa": { lat: 7.6167, lng: 4.7333 },
  "ogbomoso": { lat: 8.1336, lng: 4.2433 },
  "oyo": { lat: 7.8511, lng: 3.9317 },
  "ife": { lat: 7.4869, lng: 4.5617 },
  "sango otta": { lat: 6.7109, lng: 3.2364 },
  "sagamu": { lat: 6.8431, lng: 3.6467 },
  "ijebu ode": { lat: 6.8192, lng: 3.9267 },
  "offa": { lat: 8.1500, lng: 4.7167 },
  "zaria": { lat: 11.0667, lng: 7.7000 },
  "kontagora": { lat: 10.4044, lng: 5.4688 },
  "suleja": { lat: 9.1817, lng: 7.1786 },
  "bida": { lat: 9.0833, lng: 6.0167 },
  "nsukka": { lat: 6.8567, lng: 7.3958 },
  "afikpo": { lat: 5.8928, lng: 7.9353 },
};

/**
 * Try to geocode a location string to coordinates.
 * Attempts fuzzy matching against known Nigerian locations.
 */
export function geocodeNigerianLocation(locationString: string): NigeriaLocationCoords | null {
  if (!locationString) return null;

  const normalized = locationString.toLowerCase().trim();

  // Direct match
  if (NIGERIA_LOCATIONS[normalized]) {
    return NIGERIA_LOCATIONS[normalized];
  }

  // Check if any known location is contained in the string
  for (const [key, coords] of Object.entries(NIGERIA_LOCATIONS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }

  // Try matching individual words (for strings like "Lagos, Nigeria")
  const words = normalized.split(/[\s,]+/).filter(w => w.length > 2);
  for (const word of words) {
    if (NIGERIA_LOCATIONS[word]) {
      return NIGERIA_LOCATIONS[word];
    }
  }

  return null;
}
