// "יד ביד": the fixed table of areas. A person picks an area by hand (no GPS in stage 1); the server keeps only the area id.
// The distance shown to others is between two centres, as a range (rangeOf in yad-rules.ts), never a place. Centres are rough on purpose.

import { km, rangeOf } from './yad-rules';

export interface Region { id: string; name: string; lat: number; lng: number }
export const REGIONS: Region[] = [
  { id: 'jerusalem', name: 'ירושלים', lat: 31.77, lng: 35.21 }, { id: 'tel-aviv', name: 'תל אביב-יפו', lat: 32.08, lng: 34.78 },
  { id: 'haifa', name: 'חיפה', lat: 32.79, lng: 34.99 }, { id: 'beer-sheva', name: 'באר שבע', lat: 31.25, lng: 34.79 },
  { id: 'rishon', name: 'ראשון לציון', lat: 31.97, lng: 34.8 }, { id: 'petah-tikva', name: 'פתח תקווה', lat: 32.09, lng: 34.89 },
  { id: 'ashdod', name: 'אשדוד', lat: 31.8, lng: 34.65 }, { id: 'netanya', name: 'נתניה', lat: 32.33, lng: 34.86 },
  { id: 'holon', name: 'חולון', lat: 32.01, lng: 34.77 }, { id: 'bnei-brak', name: 'בני ברק', lat: 32.08, lng: 34.83 },
  { id: 'ramat-gan', name: 'רמת גן', lat: 32.07, lng: 34.82 }, { id: 'rehovot', name: 'רחובות', lat: 31.89, lng: 34.81 },
  { id: 'herzliya', name: 'הרצליה', lat: 32.17, lng: 34.84 }, { id: 'kfar-saba', name: 'כפר סבא', lat: 32.18, lng: 34.91 },
  { id: 'raanana', name: 'רעננה', lat: 32.18, lng: 34.87 }, { id: 'modiin', name: 'מודיעין', lat: 31.9, lng: 35.01 },
  { id: 'beit-shemesh', name: 'בית שמש', lat: 31.75, lng: 34.99 }, { id: 'ashkelon', name: 'אשקלון', lat: 31.67, lng: 34.57 },
  { id: 'hadera', name: 'חדרה', lat: 32.43, lng: 34.92 }, { id: 'afula', name: 'עפולה', lat: 32.61, lng: 35.29 },
  { id: 'nazareth', name: 'נצרת', lat: 32.7, lng: 35.3 }, { id: 'akko', name: 'עכו', lat: 32.93, lng: 35.08 },
  { id: 'karmiel', name: 'כרמיאל', lat: 32.92, lng: 35.3 }, { id: 'tiberias', name: 'טבריה', lat: 32.79, lng: 35.53 },
  { id: 'tzfat', name: 'צפת', lat: 32.96, lng: 35.5 }, { id: 'kiryat-shmona', name: 'קריית שמונה', lat: 33.21, lng: 35.57 },
  { id: 'eilat', name: 'אילת', lat: 29.56, lng: 34.95 }, { id: 'dimona', name: 'דימונה', lat: 31.07, lng: 35.03 },
  { id: 'arad', name: 'ערד', lat: 31.26, lng: 35.21 }, { id: 'maale-adumim', name: 'מעלה אדומים', lat: 31.78, lng: 35.3 },
  { id: 'gush-etzion', name: 'גוש עציון', lat: 31.65, lng: 35.12 }, { id: 'golan', name: 'רמת הגולן', lat: 33.0, lng: 35.8 },
  { id: 'emek-hefer', name: 'עמק חפר והשרון', lat: 32.35, lng: 34.95 }, { id: 'galil-elyon', name: 'הגליל העליון', lat: 33.05, lng: 35.5 },
  { id: 'galil-tachton', name: 'הגליל התחתון', lat: 32.75, lng: 35.4 }, { id: 'negev', name: 'הנגב', lat: 30.9, lng: 34.8 },
];
const BY = new Map(REGIONS.map((r) => [r.id, r]));
export const regionById = (id: string | null | undefined) => (id ? BY.get(id) : undefined);

/** the range between two areas, or null when one is not set (the screen then says only that the place is not known) */
export function rangeBetween(a: string | null | undefined, b: string | null | undefined) {
  const x = regionById(a), y = regionById(b);
  if (!x || !y) return null;
  return x.id === y.id ? rangeOf(0) : rangeOf(Math.max(1, km(x, y)));
}
