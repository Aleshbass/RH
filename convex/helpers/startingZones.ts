/**
 * Starting home-visit travel zones covering all of Nigeria (owner-approved, Nov 2026).
 *
 * - Lagos, Abuja and Ibadan, where most physios are: small neighbourhood zones so the flat
 *   travel charge stays fair, plus an "other areas" zone for the outskirts.
 * - Every other state (and the rest of Oyo State): one state-wide zone. "*" in a zone's areas
 *   means "any other area in this city or state" (rehabifyPricing.zoneForArea), so every place
 *   in Nigeria belongs to exactly one zone. The named towns let people type a town ("Akure",
 *   "Warri") and still land in the right state.
 * - The physio keeps 100% of the travel charge (business model: "+ full travel").
 *
 * travelZones.seedStartingZones creates the zones that don't exist yet; edit them afterwards in
 * Admin › Travel zones. A zone is only bookable where a physio has ticked it.
 */
export type StartingZone = { city: string; state: string; name: string; surchargeNaira: number; areas: string[] };

/** "*" in a zone's areas: every other area in that city or state. */
export const OTHER_AREAS = "*";

const LAGOS: StartingZone[] = [
  { city: "Lagos", state: "Lagos", name: "Ikeja & Ogba", surchargeNaira: 4_000, areas: [
    "Ikeja", "Ikeja GRA", "Allen", "Opebi", "Alausa", "Oregun", "Maryland", "Ogba", "Agidingbi",
    "Omole", "Magodo", "Ojodu", "Berger", "Isheri", "Akiode",
  ] },
  { city: "Lagos", state: "Lagos", name: "Yaba & Surulere", surchargeNaira: 4_000, areas: [
    "Yaba", "Surulere", "Ebute Metta", "Akoka", "Onike", "Sabo", "Mushin", "Ojuelegba", "Itire",
    "Lawanson", "Iwaya", "Idi-Araba",
  ] },
  { city: "Lagos", state: "Lagos", name: "Gbagada & Ketu", surchargeNaira: 4_000, areas: [
    "Gbagada", "Anthony", "Ilupeju", "Palmgrove", "Onipanu", "Shomolu", "Bariga", "Obanikoro",
    "Ketu", "Mile 12", "Ojota", "Ogudu", "Oworonshoki", "Fadeyi", "Ikosi",
  ] },
  { city: "Lagos", state: "Lagos", name: "Island, Ikoyi & VI", surchargeNaira: 5_000, areas: [
    "Victoria Island", "Ikoyi", "Lagos Island", "Obalende", "Oniru", "Dolphin Estate",
    "Banana Island", "Marina", "Onikan", "Parkview",
  ] },
  { city: "Lagos", state: "Lagos", name: "Lekki", surchargeNaira: 5_000, areas: [
    "Lekki", "Lekki Phase 1", "Lekki Phase 2", "Ikate", "Elegushi", "Osapa", "Agungi", "Chevron",
    "Jakande", "Ologolo", "Idado", "Igbo Efon", "Orchid", "Ikota", "VGC",
  ] },
  { city: "Lagos", state: "Lagos", name: "Ajah & beyond", surchargeNaira: 7_000, areas: [
    "Ajah", "Sangotedo", "Abraham Adesanya", "Badore", "Addo", "Abijo", "Awoyaya", "Lakowe",
    "Ibeju-Lekki", "Thomas Estate", "Ogombo", "Eleko",
  ] },
  { city: "Lagos", state: "Lagos", name: "Festac & Isolo", surchargeNaira: 5_000, areas: [
    "Festac", "Amuwo Odofin", "Satellite Town", "Mile 2", "Ojo", "Okota", "Isolo", "Ago Palace",
    "Oshodi", "Ejigbo", "Ijesha", "Apapa", "Kirikiri",
  ] },
  { city: "Lagos", state: "Lagos", name: "Alimosho & Agege", surchargeNaira: 5_000, areas: [
    "Egbeda", "Ikotun", "Igando", "Idimu", "Akowonjo", "Ipaja", "Iyana Ipaja", "Abule Egba",
    "Agege", "Ifako-Ijaiye", "Ayobo", "Dopemu", "Alagbado", "Alimosho", "Iju", "Gowon Estate",
  ] },
  { city: "Lagos", state: "Lagos", name: "Ikorodu", surchargeNaira: 7_000, areas: [
    "Ikorodu", "Ijede", "Igbogbo", "Agric", "Owode Onirin", "Ebute Ikorodu", "Imota", "Isawo",
  ] },
  { city: "Lagos", state: "Lagos", name: "Lagos, other areas", surchargeNaira: 8_000, areas: [
    OTHER_AREAS, "Epe", "Badagry", "Agbara", "Morogbo", "Ijanikin", "Okokomaiko",
  ] },
];

const ABUJA: StartingZone[] = [
  { city: "Abuja", state: "FCT", name: "Central Abuja", surchargeNaira: 4_000, areas: [
    "Wuse", "Wuse 2", "Maitama", "Asokoro", "Garki", "Garki 2", "Central Business District",
    "Jabi", "Utako", "Wuye", "Mabushi", "Katampe", "Guzape", "Three Arms Zone",
  ] },
  { city: "Abuja", state: "FCT", name: "Gwarinpa & Life Camp", surchargeNaira: 4_000, areas: [
    "Gwarinpa", "Life Camp", "Kado", "Dawaki", "Jahi", "Katampe Extension", "Mbora", "Dakibiyu", "Karmo",
  ] },
  { city: "Abuja", state: "FCT", name: "Lugbe & Apo", surchargeNaira: 5_000, areas: [
    "Lugbe", "Apo", "Gudu", "Lokogoma", "Galadimawa", "Kabusa", "Pyakasa", "Durumi", "Dakwo", "Wumba", "Kyami",
  ] },
  { city: "Abuja", state: "FCT", name: "Kubwa & Bwari", surchargeNaira: 6_000, areas: [
    "Kubwa", "Dutse Alhaji", "Bwari", "Byazhin", "Arab Road", "Ushafa",
  ] },
  { city: "Abuja", state: "FCT", name: "Nyanya & Karu", surchargeNaira: 6_000, areas: [
    "Nyanya", "Karu", "Mararaba", "Jikwoyi", "Kurudu", "Orozo", "Karshi",
  ] },
  { city: "Abuja", state: "FCT", name: "Abuja, other areas", surchargeNaira: 8_000, areas: [
    OTHER_AREAS, "Gwagwalada", "Kuje", "Abaji", "Kwali", "Zuba",
  ] },
];

const IBADAN: StartingZone[] = [
  { city: "Ibadan", state: "Oyo", name: "Ibadan North", surchargeNaira: 4_000, areas: [
    "Bodija", "UI", "University of Ibadan", "Agodi", "Mokola", "Sango", "Ojoo", "Agbowo", "Samonda",
    "Orogun", "Akinyele", "Moniya", "Ibadan North",
  ] },
  { city: "Ibadan", state: "Oyo", name: "Ibadan Central & South", surchargeNaira: 4_000, areas: [
    "Dugbe", "Ring Road", "Challenge", "Oke-Ado", "Molete", "Mapo", "Oja-Oba", "Iyaganku", "Oluyole",
    "Felele", "Apata", "Ibadan South West", "Ibadan South East",
  ] },
  { city: "Ibadan", state: "Oyo", name: "Ibadan East", surchargeNaira: 5_000, areas: [
    "Iwo Road", "Gbagi", "Old Ife Road", "Basorun", "Akobo", "Lagelu", "Olorunsogo", "Monatan", "Alakia",
  ] },
  { city: "Ibadan", state: "Oyo", name: "Ibadan West & Ido", surchargeNaira: 5_000, areas: [
    "Eleyele", "Apete", "Ologuneru", "Ido", "Omi Adio", "Jericho", "Idi-Ishin", "Awotan", "Ibadan North West",
  ] },
  { city: "Ibadan", state: "Oyo", name: "Ibadan, other areas", surchargeNaira: 8_000, areas: [OTHER_AREAS] },
];

/** State-wide zones: the state's capital and main towns, then every other area ("*"). */
const STATE_TOWNS: Record<string, string[]> = {
  Abia: ["Umuahia", "Aba", "Ohafia", "Arochukwu"],
  Adamawa: ["Yola", "Jimeta", "Mubi", "Numan"],
  "Akwa Ibom": ["Uyo", "Eket", "Ikot Ekpene", "Oron"],
  Anambra: ["Awka", "Onitsha", "Nnewi", "Ekwulobia"],
  Bauchi: ["Bauchi", "Azare", "Misau"],
  Bayelsa: ["Yenagoa", "Brass", "Ogbia"],
  Benue: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala"],
  Borno: ["Maiduguri", "Biu", "Bama"],
  "Cross River": ["Calabar", "Ikom", "Ogoja", "Obudu"],
  Delta: ["Asaba", "Warri", "Sapele", "Ughelli", "Agbor"],
  Ebonyi: ["Abakaliki", "Afikpo", "Onueke"],
  Edo: ["Benin City", "Benin", "Ekpoma", "Auchi", "Uromi"],
  Ekiti: ["Ado-Ekiti", "Ikere", "Ijero", "Ikole"],
  Enugu: ["Enugu", "Nsukka", "Agbani", "Oji River"],
  Gombe: ["Gombe", "Kumo", "Billiri"],
  Imo: ["Owerri", "Orlu", "Okigwe"],
  Jigawa: ["Dutse", "Hadejia", "Kazaure"],
  Kaduna: ["Kaduna", "Zaria", "Kafanchan"],
  Kano: ["Kano", "Wudil", "Bichi"],
  Katsina: ["Katsina", "Funtua", "Daura"],
  Kebbi: ["Birnin Kebbi", "Argungu", "Yauri"],
  Kogi: ["Lokoja", "Okene", "Anyigba", "Idah"],
  Kwara: ["Ilorin", "Offa", "Omu-Aran"],
  Nasarawa: ["Lafia", "Keffi", "Akwanga"],
  Niger: ["Minna", "Bida", "Suleja", "Kontagora"],
  Ogun: ["Abeokuta", "Ijebu-Ode", "Sagamu", "Ota", "Ifo", "Mowe", "Ibafo"],
  Ondo: ["Akure", "Ondo", "Owo", "Ikare"],
  Osun: ["Osogbo", "Ile-Ife", "Ife", "Ilesa", "Ede", "Iwo"],
  Oyo: ["Ogbomoso", "Oyo", "Iseyin", "Saki", "Igboho"], // Ibadan has its own zones
  Plateau: ["Jos", "Bukuru", "Pankshin"],
  Rivers: ["Port Harcourt", "Obio-Akpor", "Bonny", "Omoku", "Eleme"],
  Sokoto: ["Sokoto", "Tambuwal", "Wurno"],
  Taraba: ["Jalingo", "Wukari", "Bali"],
  Yobe: ["Damaturu", "Potiskum", "Nguru"],
  Zamfara: ["Gusau", "Kaura Namoda", "Talata Mafara"],
};

const STATE_WIDE: StartingZone[] = Object.entries(STATE_TOWNS).map(([state, towns]) => ({
  city: `${state} State`,
  state,
  name: state === "Oyo" ? "Oyo State (outside Ibadan)" : `${state} State`,
  surchargeNaira: 5_000,
  areas: [OTHER_AREAS, ...towns],
}));

export const STARTING_ZONES: StartingZone[] = [...LAGOS, ...ABUJA, ...IBADAN, ...STATE_WIDE];

/** Which state each zone city is in. */
export const ZONE_CITY_STATE: Record<string, string> = Object.fromEntries(STARTING_ZONES.map((zone) => [zone.city, zone.state]));

/**
 * Words in a physio's profile location that place them in a zone city, for their starting zones
 * (travelZones.assignStartingZonesToPhysios). Whole words; the physio adjusts afterwards.
 */
export const CITY_KEYWORDS: Record<string, string[]> = {
  Lagos: ["lagos", "ikeja", "lekki", "ikorodu", "ikoyi", "victoria island", "yaba", "surulere", "ajah"],
  Abuja: ["abuja", "abuj", "fct", "federal capital territory", "garki", "maitama", "wuse", "jabi", "asokoro"],
  Ibadan: ["ibadan", "akinyele", "lagelu"],
  ...Object.fromEntries(Object.entries(STATE_TOWNS).map(([state, towns]) => [
    `${state} State`,
    [state, ...towns].map((word) => word.toLowerCase()).filter((word) => !(state === "Oyo" && word === "oyo")),
  ])),
};
