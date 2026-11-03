/**
 * Starting home-visit travel zones (approved by the owner, Nov 2026): small neighbourhood
 * clusters so the flat travel charge stays fair. The physio keeps 100% of the travel charge
 * (business model: home services are "+ full travel" for the physio). Edit them afterwards in
 * Admin › Travel zones; travelZones.seedStartingZones only creates zones that don't exist yet.
 */
export type StartingZone = { city: string; name: string; surchargeNaira: number; areas: string[] };

export const STARTING_ZONES: StartingZone[] = [
  // Lagos
  { city: "Lagos", name: "Ikeja & Ogba", surchargeNaira: 4_000, areas: [
    "Ikeja", "Ikeja GRA", "Allen", "Opebi", "Alausa", "Oregun", "Maryland", "Ogba", "Agidingbi",
    "Omole", "Magodo", "Ojodu", "Berger", "Isheri", "Akiode",
  ] },
  { city: "Lagos", name: "Yaba & Surulere", surchargeNaira: 4_000, areas: [
    "Yaba", "Surulere", "Ebute Metta", "Akoka", "Onike", "Sabo", "Mushin", "Ojuelegba", "Itire",
    "Lawanson", "Iwaya", "Idi-Araba",
  ] },
  { city: "Lagos", name: "Gbagada & Ketu", surchargeNaira: 4_000, areas: [
    "Gbagada", "Anthony", "Ilupeju", "Palmgrove", "Onipanu", "Shomolu", "Bariga", "Obanikoro",
    "Ketu", "Mile 12", "Ojota", "Ogudu", "Oworonshoki", "Fadeyi", "Ikosi",
  ] },
  { city: "Lagos", name: "Island, Ikoyi & VI", surchargeNaira: 5_000, areas: [
    "Victoria Island", "Ikoyi", "Lagos Island", "Obalende", "Oniru", "Dolphin Estate",
    "Banana Island", "Marina", "Onikan", "Parkview",
  ] },
  { city: "Lagos", name: "Lekki", surchargeNaira: 5_000, areas: [
    "Lekki", "Lekki Phase 1", "Lekki Phase 2", "Ikate", "Elegushi", "Osapa", "Agungi", "Chevron",
    "Jakande", "Ologolo", "Idado", "Igbo Efon", "Orchid", "Ikota", "VGC",
  ] },
  { city: "Lagos", name: "Ajah & beyond", surchargeNaira: 7_000, areas: [
    "Ajah", "Sangotedo", "Abraham Adesanya", "Badore", "Addo", "Abijo", "Awoyaya", "Lakowe",
    "Ibeju-Lekki", "Thomas Estate", "Ogombo", "Eleko",
  ] },
  { city: "Lagos", name: "Festac & Isolo", surchargeNaira: 5_000, areas: [
    "Festac", "Amuwo Odofin", "Satellite Town", "Mile 2", "Ojo", "Okota", "Isolo", "Ago Palace",
    "Oshodi", "Ejigbo", "Ijesha", "Apapa", "Kirikiri",
  ] },
  { city: "Lagos", name: "Alimosho & Agege", surchargeNaira: 5_000, areas: [
    "Egbeda", "Ikotun", "Igando", "Idimu", "Akowonjo", "Ipaja", "Iyana Ipaja", "Abule Egba",
    "Agege", "Ifako-Ijaiye", "Ayobo", "Dopemu", "Alagbado", "Alimosho", "Iju", "Gowon Estate",
  ] },
  { city: "Lagos", name: "Ikorodu", surchargeNaira: 7_000, areas: [
    "Ikorodu", "Ijede", "Igbogbo", "Agric", "Owode Onirin", "Ebute Ikorodu", "Imota", "Isawo",
  ] },
  // Abuja (FCT)
  { city: "Abuja", name: "Central Abuja", surchargeNaira: 4_000, areas: [
    "Wuse", "Wuse 2", "Maitama", "Asokoro", "Garki", "Garki 2", "Central Business District",
    "Jabi", "Utako", "Wuye", "Mabushi", "Katampe", "Guzape", "Three Arms Zone",
  ] },
  { city: "Abuja", name: "Gwarinpa & Life Camp", surchargeNaira: 4_000, areas: [
    "Gwarinpa", "Life Camp", "Kado", "Dawaki", "Jahi", "Katampe Extension", "Mbora", "Dakibiyu", "Karmo",
  ] },
  { city: "Abuja", name: "Lugbe & Apo", surchargeNaira: 5_000, areas: [
    "Lugbe", "Apo", "Gudu", "Lokogoma", "Galadimawa", "Kabusa", "Pyakasa", "Durumi", "Dakwo", "Wumba", "Kyami",
  ] },
  { city: "Abuja", name: "Kubwa & Bwari", surchargeNaira: 6_000, areas: [
    "Kubwa", "Dutse", "Dutse Alhaji", "Bwari", "Byazhin", "Arab Road", "Ushafa",
  ] },
  { city: "Abuja", name: "Nyanya & Karu", surchargeNaira: 6_000, areas: [
    "Nyanya", "Karu", "Mararaba", "Jikwoyi", "Kurudu", "Orozo", "Karshi",
  ] },
];

/** Which state each zone city is in (for the WhatsApp sign-up form). */
export const ZONE_CITY_STATE: Record<string, string> = { Lagos: "Lagos", Abuja: "FCT" };
