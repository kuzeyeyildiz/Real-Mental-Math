/**
 * Province centroids, used to turn a coordinate into a region name **on the
 * device**. Nothing here is precise, and that is the point: the output is a
 * province name like "Ankara", and the coordinates that produced it are thrown
 * away in the same function call. No latitude or longitude is ever stored or
 * transmitted.
 *
 * Türkiye's 81 provinces are bundled because that is where the app is used. A
 * coordinate outside the country falls back to the IANA time zone, which is
 * already available without asking for any permission at all.
 */

export interface RegionPoint {
  name: string;
  lat: number;
  lon: number;
}

/** Rough bounds of Türkiye. Outside this, the province table means nothing. */
export const TR_BOUNDS = { minLat: 35.6, maxLat: 42.4, minLon: 25.4, maxLon: 45.1 };

export const TR_PROVINCES: RegionPoint[] = [
  { name: 'Adana', lat: 37.0, lon: 35.32 },
  { name: 'Adıyaman', lat: 37.76, lon: 38.28 },
  { name: 'Afyonkarahisar', lat: 38.76, lon: 30.54 },
  { name: 'Ağrı', lat: 39.72, lon: 43.05 },
  { name: 'Aksaray', lat: 38.37, lon: 34.03 },
  { name: 'Amasya', lat: 40.65, lon: 35.83 },
  { name: 'Ankara', lat: 39.93, lon: 32.86 },
  { name: 'Antalya', lat: 36.9, lon: 30.7 },
  { name: 'Ardahan', lat: 41.11, lon: 42.7 },
  { name: 'Artvin', lat: 41.18, lon: 41.82 },
  { name: 'Aydın', lat: 37.85, lon: 27.84 },
  { name: 'Balıkesir', lat: 39.65, lon: 27.89 },
  { name: 'Bartın', lat: 41.64, lon: 32.34 },
  { name: 'Batman', lat: 37.88, lon: 41.13 },
  { name: 'Bayburt', lat: 40.26, lon: 40.23 },
  { name: 'Bilecik', lat: 40.14, lon: 29.98 },
  { name: 'Bingöl', lat: 38.88, lon: 40.5 },
  { name: 'Bitlis', lat: 38.4, lon: 42.11 },
  { name: 'Bolu', lat: 40.74, lon: 31.61 },
  { name: 'Burdur', lat: 37.72, lon: 30.28 },
  { name: 'Bursa', lat: 40.19, lon: 29.06 },
  { name: 'Çanakkale', lat: 40.15, lon: 26.41 },
  { name: 'Çankırı', lat: 40.6, lon: 33.62 },
  { name: 'Çorum', lat: 40.55, lon: 34.95 },
  { name: 'Denizli', lat: 37.78, lon: 29.09 },
  { name: 'Diyarbakır', lat: 37.91, lon: 40.24 },
  { name: 'Düzce', lat: 40.84, lon: 31.16 },
  { name: 'Edirne', lat: 41.68, lon: 26.56 },
  { name: 'Elazığ', lat: 38.68, lon: 39.22 },
  { name: 'Erzincan', lat: 39.75, lon: 39.49 },
  { name: 'Erzurum', lat: 39.9, lon: 41.27 },
  { name: 'Eskişehir', lat: 39.78, lon: 30.52 },
  { name: 'Gaziantep', lat: 37.07, lon: 37.38 },
  { name: 'Giresun', lat: 40.91, lon: 38.39 },
  { name: 'Gümüşhane', lat: 40.46, lon: 39.48 },
  { name: 'Hakkâri', lat: 37.57, lon: 43.74 },
  { name: 'Hatay', lat: 36.2, lon: 36.16 },
  { name: 'Iğdır', lat: 39.92, lon: 44.04 },
  { name: 'Isparta', lat: 37.76, lon: 30.55 },
  { name: 'İstanbul', lat: 41.01, lon: 28.98 },
  { name: 'İzmir', lat: 38.42, lon: 27.14 },
  { name: 'Kahramanmaraş', lat: 37.58, lon: 36.93 },
  { name: 'Karabük', lat: 41.2, lon: 32.62 },
  { name: 'Karaman', lat: 37.18, lon: 33.22 },
  { name: 'Kars', lat: 40.6, lon: 43.1 },
  { name: 'Kastamonu', lat: 41.39, lon: 33.78 },
  { name: 'Kayseri', lat: 38.73, lon: 35.49 },
  { name: 'Kilis', lat: 36.72, lon: 37.12 },
  { name: 'Kırıkkale', lat: 39.85, lon: 33.52 },
  { name: 'Kırklareli', lat: 41.74, lon: 27.22 },
  { name: 'Kırşehir', lat: 39.15, lon: 34.16 },
  { name: 'Kocaeli', lat: 40.85, lon: 29.88 },
  { name: 'Konya', lat: 37.87, lon: 32.48 },
  { name: 'Kütahya', lat: 39.42, lon: 29.99 },
  { name: 'Malatya', lat: 38.36, lon: 38.31 },
  { name: 'Manisa', lat: 38.61, lon: 27.43 },
  { name: 'Mardin', lat: 37.31, lon: 40.74 },
  { name: 'Mersin', lat: 36.8, lon: 34.63 },
  { name: 'Muğla', lat: 37.22, lon: 28.36 },
  { name: 'Muş', lat: 38.73, lon: 41.49 },
  { name: 'Nevşehir', lat: 38.62, lon: 34.71 },
  { name: 'Niğde', lat: 37.97, lon: 34.68 },
  { name: 'Ordu', lat: 40.98, lon: 37.88 },
  { name: 'Osmaniye', lat: 37.07, lon: 36.25 },
  { name: 'Rize', lat: 41.02, lon: 40.52 },
  { name: 'Sakarya', lat: 40.76, lon: 30.38 },
  { name: 'Samsun', lat: 41.29, lon: 36.33 },
  { name: 'Şanlıurfa', lat: 37.16, lon: 38.79 },
  { name: 'Siirt', lat: 37.93, lon: 41.94 },
  { name: 'Sinop', lat: 42.03, lon: 35.15 },
  { name: 'Şırnak', lat: 37.52, lon: 42.46 },
  { name: 'Sivas', lat: 39.75, lon: 37.02 },
  { name: 'Tekirdağ', lat: 40.98, lon: 27.51 },
  { name: 'Tokat', lat: 40.31, lon: 36.55 },
  { name: 'Trabzon', lat: 41.0, lon: 39.72 },
  { name: 'Tunceli', lat: 39.11, lon: 39.55 },
  { name: 'Uşak', lat: 38.68, lon: 29.41 },
  { name: 'Van', lat: 38.49, lon: 43.38 },
  { name: 'Yalova', lat: 40.66, lon: 29.28 },
  { name: 'Yozgat', lat: 39.82, lon: 34.81 },
  { name: 'Zonguldak', lat: 41.46, lon: 31.79 },
];

/** Longest region name a profile will accept, mirrored by a database check. */
export const MAX_REGION_LENGTH = 60;
