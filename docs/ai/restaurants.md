# Restaurants in the food portal: a proposal (for the owner to choose)

Vision batch 4, item 11. The food portal's slider ("עכשיו במטבח") already shows, without AI and at no cost, what in
the family's fridges is about to go off and the family's own recipes that use it. Restaurants are a new source of
content, so nothing is built until the owner chooses. The rules: a free user must cost about nothing, and every tool
works without AI.

## The options

| | Source | What it gives | Cost | Without AI |
|---|---|---|---|---|
| **A** | **The family's own list** | restaurants the family adds, with a note, a ❤ and "who went last"; shared like the recipe book | nothing | yes, entirely |
| **B** | **OpenStreetMap** (the Overpass API) | restaurants near a place: name, cuisine, opening hours, and whether they are kosher (`diet:kosher=yes/only`), with a link to the map | nothing (free, no key) | yes |
| **C** | **Google Places** (Nearby Search, "Pro") | rich data: ratings, photos, opening hours, price level | 5,000 searches a month free, then about $32 for every 1,000 (Google's price list, as of March 2025); photos and reviews cost more | yes |

### How each would work

- **A**: a "מסעדות שלנו" list next to the recipe book; the slider shows the family's favourites and the ones not
  visited for a while. It works for everyone at once, and costs nothing.
- **B**: needs a place. The city from the settings (proposed for Shabbat times and the weather too), or the
  device's location with the person's permission. The answer for each area (a square of about 2 km) is kept on the
  server for a week and shared by everyone in that area, so the free public service is asked rarely, as its fair-use
  rules ask. The quality in Israel varies by town: big cities are fairly full, small places less so. No photos and no
  ratings.
- **C**: the same, through Google. A shared week-long cache keeps a small user base inside the free 5,000. Google's
  terms limit how long its results may be kept, which needs checking before building. It needs a Maps API key from
  the owner, and it fits better as a paid extra than as part of the free core.

## The recommendation

**A now, and B after it** (both cost nothing and work without AI). A gives what the family really uses; B adds
"what is near us, and kosher", where OpenStreetMap knows it. **C** only if the owner wants ratings and photos, as a
paid extra, after a check of Google's caching terms.

What the owner decides: which of A, B and C, and (for B and C) whether the place comes from the city in the
settings, from the device's location, or both.

## The owner's choice (2026-11-12): A, then C

**A is built** (`/food/restaurants/`, server/restaurants.ts): the family's own list, and the ones missed in the slider.

**C, Google Places: what its terms allow, and so how it would work.** From Google's Places API policies page:
- Only **place IDs** may be stored indefinitely. Coordinates may be kept for up to 30 days. Names, addresses, ratings,
  hours and reviews may not be copied, stored or pre-fetched; fresh details are fetched when someone opens a place.
  So the shared week-long cache planned above is **not allowed**: every search is a real, billed call.
- Places content shown without a Google map needs Google's attribution (the Google Maps logo, or the words
  "Google Maps"), kept visibly apart from other content. Photos and reviews credit their author and link to them
  on Google Maps.

So C is built like this:
- **Only on request**: a button "מה יש בסביבה" in מסעדות שלנו, never on its own in the slider, so nobody spends a
  call by just opening the portal.
- **Nearby Search "Pro"** with a field mask (name, address, rating, opening now, kosher is not a Google field), 20
  results. **Details** (hours, phone, website) only when a result is opened. Photos not at first: they cost more and
  need their author's credit.
- **"Add to our list"** keeps only the Google place ID (allowed) together with the family's own fields, so the
  family's list stays theirs; details are fetched fresh when opened.
- **The cost guard**: a monthly cap of searches per person (counted in the meter like an AI call) and a daily
  quota cap set on the key in Google Cloud, so a bill can never run away. 5,000 searches a month are free; then
  about $32 per 1,000.
- **What the owner provides**: a Google Maps Platform API key restricted to "Places API (New)", with a daily quota
  cap, entered as the secret `GOOGLE_MAPS_API_KEY` (the owner enters it; it is never written in the code).

Sources (C's terms): [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies).
The Service Specific Terms page did not load fully; it is to be read before the build.

Sources: [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing),
[Google Places API pricing in 2026 (openplacesapi.com)](https://openplacesapi.com/blog/google-places-api-pricing),
[Overpass API (OSM wiki)](https://wiki.openstreetmap.org/wiki/Overpass_API),
[Key:diet:kosher (OSM wiki)](https://wiki.openstreetmap.org/wiki/Key:diet:kosher),
[FOSSGIS Overpass terms](https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen).
