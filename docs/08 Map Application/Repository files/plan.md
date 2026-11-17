# Halifax Digital Twin – Map Application Plan V1

Nov 15, 2026 · @Profine

## Summary

The twin's front door is one web map that answers one registered business question at a time, starting with TRN-Q01: *Where is every bus right now, and is it on time?* It runs in a browser on phone and laptop, and each answered question is added as a **story**: a headline answer, the map layers that prove it, and where the data came from.

**Updated 15 November, evening.** The city is shown in realistic 3D: Google Photorealistic 3D Tiles from above, and the twin's own open-data 3D model up close and as the fallback. The section *The realistic 3D view* explains why and how.

The map can be built before the physical model is wired in. It reads only a small serving API. Behind that API the data first comes straight from the live feed, and later from the Gold tables, with no change to the map.

One job cannot wait: a collector that saves the live transit feed from today. The daily questions (late routes, missing trips, bunching) need weeks of history, and history that was not saved cannot be rebuilt.

**Assumptions taken where no answer was given. Each can be changed without rewriting the plan.**

| Decision | Assumed | Why |
| --- | --- | --- |
| Technology direction | Hybrid: open-source web map on an enterprise data platform, with Power BI or Tableau panels on top | Hands-on coding in the map, enterprise tools and certifications in the platform and BI |
| Budget | Free tiers and trials first; every paid item is flagged before use | Charter assumption: free or low-cost tools |
| Tonight's output | This plan and the agent task list | Written so any agent can build from it later without this conversation |
| First question | TRN-Q01, then the easiest open-data questions in the register | Real-time, open, high priority, and it is the charter's Phase 2 gate |

**Roles.** The architect owns the models (logical, physical, source-to-target), the contract approvals and every gate. Agents build to the contract and the task cards in this plan.

## The application

The application is one map shell plus a register of stories, and it grows by adding stories, never by adding separate apps. This is charter principle 8 (one application, many layers) made concrete.

**A story is one business question, answered.** Every story has the same five parts, in the same order, so the user always knows where to look:

1. **Question.** The exact wording and ID from the Business Questions register, for example TRN-Q01.
2. **Answer.** One sentence with its number, in this form: "212 buses are running; 81% are on time." (illustrative figures)
3. **Evidence.** The map layers that show it, with a legend.
4. **Context.** How it compares: with the schedule, with yesterday, with other routes.
5. **Trust.** Source, as-of time and reliability tier for every number (charter principle 1).

A story is configuration, not custom code. It names its layers, its numbers and its panels in a small file, and the shell draws it. Adding a question means adding one story file and the data behind it.

**Three lenses on the same map.**

| Lens | What it shows | Example |
| --- | --- | --- |
| Live | The city now, refreshed as data arrives | Buses moving, with delay colour |
| Replay | Any past window played back on the map | Yesterday's evening rush, hour by hour |
| Analytics | Summaries over time and area | Late departures by route and time of day |

**Seeing the city as a whole.** The map does not know about buses, permits or potholes. It knows the five things the conformed core knows: Location, Time, Party, Asset and Event, each tagged with its sector and subsector. A bus is an Asset, a delay is an Event, a road closure is an Event. Because every sector arrives in that same shape:

- The home screen (City view) shows all sectors at once as one event feed on one map.
- Choosing a sector filters the same map to that sector. Sectors start as separate layers and meet on shared places.
- A new sector, such as Hospitality, appears as a new row in the sector browser, with new layers. Nothing existing is rewritten (charter principle 4).

**Apps on top.** Clicking any feature opens its detail, and the detail can host a panel built in another tool: a Power BI report, a Tableau view or a custom chart, filtered to the thing that was clicked.

## Design principles

Ten rules decide every build choice for the map; each follows from the charter's nine principles or from the goal of learning by doing.

| # | Principle | What it means in the build |
| --- | --- | --- |
| 1 | Question first | Nothing ships without a Question\_ID. A layer with no question behind it is not built. |
| 2 | One map, many layers | One shell. Stories, sectors and panels are added as configuration. |
| 3 | Contract before plumbing | The map reads only the serving API. What sits behind the API can change from feed, to files, to Gold tables. |
| 4 | Hot path and cold path stay apart | Live data never waits on the warehouse. Analytics are computed in the platform, never in the browser. |
| 5 | Provenance on screen | Every number shows its source, as-of time and reliability tier. |
| 6 | Additive growth | A new sector is a new collector, new layers and new stories. No rewrite. |
| 7 | Small blast radius | If one source fails, only its layer greys out, with the time it last worked. |
| 8 | Phone first | Every story works one-handed on a phone. The 2D map always works; the realistic 3D view loads where the device can carry it. |
| 9 | Finish one before starting two | A story is done only when it meets the definition of done below. |
| 10 | Open data, attributed, no personal data | Licence text shown in the app; nothing about individuals stored or drawn. |

**Definition of done for a story.** All seven must hold before the next story starts:

- [ ] The answer sentence matches an independent check of the same data.
- [ ] It works on a phone and on a laptop.
- [ ] Source, as-of time and reliability tier are visible.
- [ ] Empty, loading and source-down states are designed, not accidental.
- [ ] The story is recorded in the story register with its Question\_ID, layers and data lineage.
- [ ] Automated tests pass for the API and the story.
- [ ] The architect has accepted it at a demo.

## Question roadmap

Seventeen of the register's 100 questions are sequenced below in five waves, easiest first; the rest stay in the backlog until these are done. All seventeen are marked Open in the register, so none waits on a partner.

**Rule for choosing the next question.** Take the question that is Open, High priority and needs the fewest new sources. When two tie, take the one that reuses a layer already on the map.

| Wave | Question | What it asks | Lens | New data it needs | Can start when |
| --- | --- | --- | --- | --- | --- |
| A | TRN-Q01 | Where is every bus right now, and is it on time? | Live | GTFS schedule, vehicle positions, trip updates | Now |
| B | TRN-Q07 | Which neighbourhoods are more than a 5-minute walk from frequent service? | Analytics | Neighbourhood boundaries | Now; needs no history |
| C | TRN-Q02 | Which routes are most often late, and at what times of day? | Analytics, Replay | None; uses the archive | 2 to 4 weeks archived |
| C | TRN-Q05 | Which scheduled trips never run? | Analytics | None | 2 to 4 weeks archived |
| C | TRN-Q04 | Actual wait between buses at each stop compared with the schedule | Analytics | None | After TRN-Q02 |
| C | TRN-Q03 | Where and when do buses bunch? | Replay, Analytics | None | After TRN-Q04 |
| C | TRN-Q11 | Which route segments are consistently slow? | Analytics | None | After TRN-Q03 |
| D | TRN-Q25 | How long does each road closure last, and what does it affect? | Live | Road closure source | Sector 2 starts |
| D | PWK-Q13 | Where does utility work restrict street access or parking, and for how long? | Live | Street work and permit source | With TRN-Q25 |
| D | PWK-Q07 | Which neighbourhoods have the least park space and tree canopy per resident? | Analytics | Parks, tree canopy, census population | After PWK-Q13 |
| D | HRE-Q29 | How many building permits are issued, for how many units, and where? | Analytics | Building permits | Sector 3 starts |
| D | HRE-Q01 | How are sale prices and assessed values changing by neighbourhood? | Analytics | Assessment data | After HRE-Q29 |
| E | TRN-Q09 | Which roadworks and closures cause the biggest bus delays? | Analytics | None; joins waves C and D | Waves C and D done |
| E | PWK-Q16 | Which planned closures will affect bus routes, traffic and walking before work starts? | Analytics | Planned capital projects | With TRN-Q09 |
| E | HRE-Q07 | Do rents rise faster near frequent transit than elsewhere? | Analytics | Rent data by area | Waves B and D done |
| E | TRN-Q08 | Which areas have the most homes but the least transit service per resident? | Analytics | Dwelling counts | With HRE-Q07 |
| E | TRN-Q06 | How much do snow days and storms reduce on-time performance, by route? | Analytics | Weather history; one winter of archive | After the first winter |

Wave A proves the live path. Wave B proves the analytics path while history builds up. Wave C is the first set served from Gold, which is the point where the physical model is wired in. Wave D adds the second and third sectors as separate layers. Wave E is where sectors meet and the city is seen as a whole.

Open question for wave C: TRN-Q12 (ferries compared with buses) joins the wave only if ferries appear in the real-time feed. The collector's first week of data will show this.

## Architecture

The map depends on one thing only, the serving API, so everything behind that API can be replaced without touching the map.

![Architecture: six layers, hot path and cold path](diagrams/architecture.png)

Read it top down. Each source has its own collector. Live data goes to a small cache and reaches the map in seconds; the same raw records go to Bronze and become history. Both paths meet at the contract.

**Why the map can be built before the physical model is wired in.**

- Bronze is source-shaped, so the collector needs no model. It saves exactly what the source sends, plus the source and load time.
- The contract is designed from the business questions and the conformed core (Location, Asset, Event), which the conceptual and logical models already fix.
- The data behind the contract is swapped in three steps, and the map code does not change at any of them.

| Step | Behind the contract | Used for | Needs the physical model |
| --- | --- | --- | --- |
| 1 | An adapter that reads the live feed and the GTFS schedule directly | TRN-Q01 | No |
| 2 | Files computed on the laptop over Bronze with DuckDB | TRN-Q07 and early checks | No |
| 3 | Serving files published from Gold | Wave C onward | Yes. This is the moment it is wired in. |

**The contract, version 0.** Seven read-only endpoints; the architect approves changes.

| Endpoint | Returns | Path |
| --- | --- | --- |
| `GET /v1/stories` | The story register: id, question, lens, layers, numbers, panels | Static |
| `GET /v1/stories/{id}` | One story's configuration | Static |
| `GET /v1/live/{layer}` | Current features of a live layer as GeoJSON, for example `vehicles` | Hot |
| `GET /v1/layers/{layer}` | A static or analytic layer: GeoJSON when small, PMTiles when large | Cold |
| `GET /v1/numbers/{id}` | A number or short series for an answer sentence or chart | Cold |
| `GET /v1/features/{kind}/{id}` | Detail and recent history for one clicked feature | Both |
| `GET /v1/sources` | Sources, licence text, last successful load, reliability tier | Both |

Every response has the same envelope: `data`, `as_of`, `source`, `reliability_tier`, `licence`. Every feature carries the conformed-core keys: `kind` (location, asset or event), `sector_id`, `subsector_id`, `id` and `source_key`. This is what lets one map draw every sector, and it is the same API that later opens to developers (charter principle 9).

**Hot path.** The transit collector polls the three real-time feeds on a fixed interval, starting at 30 seconds and tuned after measuring how often the feed really changes. Each raw response goes to Bronze unchanged. The decoded current state goes to the live cache. The API joins live positions to the schedule and labels each bus early, on time or late.

The on-time rule is a business rule, not a code detail. A common transit convention is no more than 1 minute early and 5 minutes late. The architect sets it and the data dictionary records it.

**Cold path.** Bronze, Silver and Gold follow the logical and physical models. Gold publishes small serving files on a schedule, and the API serves those files. The map never queries the warehouse directly, so a free-tier quota or an expired trial cannot take the map down.

**Raw data retention.** The charter keeps raw live records for a rolling window, then condenses them into events such as each bus's arrival at each stop. Until the physical model sets that window, the collector keeps everything.

## Technology choices and cost

The stack is open-source at the map and enterprise at the platform, and it should run for roughly US$0 to $5 a month through wave C. That figure is an estimate to confirm in the first week of collecting.

| Layer | Choice | Why | Cost |
| --- | --- | --- | --- |
| Map engine | [MapLibre GL JS](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre) | Open-source vector map that runs well on phones | Free |
| Data layers | [deck.gl](https://deck.gl/docs/api-reference/maplibre/overview) drawn over MapLibre | Handles thousands of moving points, and 3D tiles later | Free |
| Basemap | [Protomaps](https://protomaps.com/) PMTiles extract of Nova Scotia | One file on static storage, no tile server | Free |
| Front end | TypeScript, React, Vite, installable as a PWA | One codebase for phone and laptop | Free |
| Front-end hosting | [Azure Static Web Apps, Free plan](https://learn.microsoft.com/en-us/azure/static-web-apps/plans) | Free hosting and SSL, 100 GB a month, 3 preview environments to review changes on a phone | Free |
| Collector and API | Python on Azure Functions, with a timer for the collector | Runs all day without the laptop; HTTP and timer in one small app | Near zero; needs an Azure account with a payment card |
| Bronze landing | Azure Blob Storage | Cheap, and every data platform can read it | Cents to low dollars a month; measure in week 1 |
| Local analytics | DuckDB with its spatial extension | Query Bronze files on the laptop before any platform exists | Free |
| Data platform | Architect's decision; see below | Where Silver and Gold live | Free tier or trial |
| BI panels | Power BI first, Tableau Public as the second tool | Both embed in a web page | Free for public open data |
| Realistic 3D view | [Google Photorealistic 3D Tiles](https://developers.google.com/maps/billing-and-pricing/pricing) through deck.gl | The photorealistic city under the data | 1,000 free sessions a month, then US$6 per 1,000 |
| Code and CI | GitHub and GitHub Actions | Agents and the architect work from one repository | Free |

**Data platform: recommendation, not yet a decision.**

| Option | Fits | Limits to know |
| --- | --- | --- |
| [Databricks Free Edition](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations) (recommended home for Silver and Gold) | No time limit; medallion and Delta skills; Databricks certifications | Serverless only, one 2X-Small SQL warehouse, non-commercial use, restricted outbound internet |
| [Microsoft Fabric trial](https://learn.microsoft.com/en-us/fabric/fundamentals/fabric-trial) (a time-boxed sprint) | Real-Time Intelligence, lakehouse and Power BI in one place; Fabric certifications | 60 days, then paid capacity. Start it only when Bronze holds a month of data. |
| DuckDB on the laptop (always available) | Proves every transformation before it is ported | Not an enterprise platform; the laptop must be on |

Because Databricks Free Edition restricts outbound internet, the collector lives outside it and lands files in storage. The first platform task is a short test that Free Edition can load those files. If it cannot, the Fabric trial becomes the home for Silver and Gold.

**Three notes on these choices.**

- **Which engine draws the map.** The 2D map stays on MapLibre and deck.gl, which are light on phones. The engine for the realistic 3D view is chosen by a test, described in the next section. Esri stays in the picture as a source, since HRM publishes through ArcGIS, and as an optional later track for enterprise GIS skills.
- **3D is now core.** Decided on 15 November 2026: the realistic 3D view is part of the first build, not a Stage 4 extra. The charter puts 3D city models out of scope for Phase 1, so Charter V2 should record the change.
- **Power BI embedding.** Publish to web makes a report visible to anyone, which suits open data only. A [secure embed](https://learn.microsoft.com/en-us/power-bi/service-embed-secure) needs each viewer to sign in. Private instances later would use the secure route.

## The realistic 3D view

The city is drawn with Google Photorealistic 3D Tiles from above and with the twin's own open-data model up close. Nothing free matches Google's realism for Halifax, and at this project's size Google costs nothing, so it serves the build without another paid alternative.

**What the research found about Google's tiles.**

| Concern | Finding | Can it be fixed |
| --- | --- | --- |
| Does it cover Halifax | Yes. Halifax is on the [list of cities with Google's 3D imagery](https://list.fandom.com/wiki/List_of_3D_locations_in_Google_Earth), the same source the tiles use. Task T27 confirms it on the API. | Not needed |
| What the rent is | [1,000 sessions a month are free, then US$6 per 1,000](https://developers.google.com/maps/billing-and-pricing/pricing). One session is one opening of the 3D view and [lasts at least 3 hours](https://developers.google.com/maps/documentation/tile/3d-tiles). | About 33 openings a day stay free |
| Melted mesh and blocky buildings close up | The mesh is made from aerial photos and is [designed for city-block to citywide viewing](https://mapsplatform.google.com/resources/blog/create-immersive-3d-map-experiences-photorealistic-3d-tiles/). Google [does not release its most detailed layer](https://community.cesium.com/t/quality-comparison-googlemaps-vs-cesium/38156) through the API. | No setting fixes it. Design around it: see the two layers below. |
| Freezing and slow loading | Caused by the engine and its settings: how much detail it asks for, how many tiles at once, how much it holds in memory. | Yes. Engine test and the rules below. |
| What renting means | Tiles are for display only. [No caching, no offline use, no extracting data](https://developers.google.com/maps/documentation/tile/policies), and Google's logo and data credits must show. A billing account is required. | No. So the twin must never depend on it. |

**Two layers in one scene.** Each layer is used only where it looks right.

| Camera | What is drawn | Why |
| --- | --- | --- |
| Citywide down to about a city block | Google photorealistic tiles | This is the range where they look real |
| Closer than that | The twin's own model: clean buildings on LiDAR terrain, coloured by the story's data | Sharp at any distance, ours to keep, and it can carry data |
| Any height, when Google is slow, capped or switched off | The twin's own model, or the 2D map on a weak device | The twin keeps working without the rented layer |

The height where one layer hands over to the other is set by test T27. Start the test with the camera 300 m from the ground and adjust from what looks right over downtown Halifax.

**Free options compared.**

| Option | Realism | Cost | Ours to keep | Role in the build |
| --- | --- | --- | --- | --- |
| Google Photorealistic 3D Tiles | Highest: a textured mesh of the real city | Free to 1,000 sessions a month | No | The view from above |
| The twin's own model from [HRM building outlines and 1 m LiDAR](https://www.halifax.ca/home/news/new-building-permit-lidar-digital-surface-model-data-expands-municipal-open-data) plus the [provincial LiDAR point cloud](https://nsgi.novascotia.ca/datalocator/) | Clean shapes and true heights, no photo texture | Free | Yes | Close-up view, data on buildings, fallback |
| [Google 3D Maps in the Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/3d-maps-overview), using Google's own renderer | Same imagery, drawn by Google | 5,000 map loads a month free, then US$7 per 1,000 | No | Plan B if every engine in T27 stutters; fewer data layers are possible |

Building the twin's own model is also the stronger learning exercise: deriving building heights from LiDAR is real spatial data engineering, and the result belongs to the project.

**Rules that keep it sharp and smooth.**

- **Choose the engine by test, not by habit.** T27 compares CesiumJS, 3DTilesRendererJS and deck.gl on the architect's own phone and laptop. A [deck.gl report](https://github.com/visgl/deck.gl/issues/7955) describes Google's tiles looking less sharp there than in CesiumJS; it is from 2023 and may be fixed, which is why it is tested.
- **Keep the camera where the mesh looks real.** A camera floor and the handover to the twin's own model stop anyone flying into the melted range.
- **Ask for less on small screens.** Cap the level of detail on phones, limit how many tiles load at once, and cap tile memory. Google's [renderer guide](https://developers.google.com/maps/documentation/tile/use-renderer) gives starting settings for CesiumJS.
- **Never freeze while loading.** Draw what has arrived and sharpen it as more comes in. Load the destination before a fly-to starts.
- **Start weak devices in 2D.** The app measures the device on first load and offers 3D instead of forcing it.
- **Count sessions.** A counter and a cap keep usage inside the free 1,000, and the cap falls back to the twin's own model.

**What the rental terms mean for the design.** Google's layer is a backdrop and nothing more. No twin data is derived from it and nothing of it is stored. Every building, road and parcel the twin knows comes from open data, so one switch can turn Google off and the city is still there.

## Screens

The application has four screens, and all four are the same map with a different panel beside it.

![Layout sketch: laptop and phone](diagrams/layout-sketch.png)

The answer sentence is the one emphasised element on every screen. The five numbered parts are the five parts of a story, in the same order on both devices.

The full wireframes, three screens for each device including the All sectors browser, are on the design canvas: [Map Application Wireframes](https://claude.ai/artifact/Ayi5rJU8nQfWT6nk2FAtQo).

| Screen | Purpose | What is on it |
| --- | --- | --- |
| City view (home) | The city as a whole, now | All sectors as one event feed on the map; pinned sectors; search; live counts per sector |
| Story view | One question, answered | The five story parts; the lens switch; a time control in Replay |
| Feature detail | One clicked thing | What it is, its state now, its recent history, and its panels from other tools |
| Data and sources | Trust | Every source with its licence, last successful load and reliability tier; a link to the API |

**Interaction rules.**

- **Colour means one thing per story.** It always comes with a legend and a text label, so it never carries meaning alone.
- **Live data moves, and shows its age.** Buses glide between positions and never jump. A clock shows how old the data is, and a layer older than 2 minutes is marked stale.
- **Every view has a link.** Story, lens, time and selected feature live in the URL, so any view can be shared or bookmarked.
- **One thumb on a phone.** The bottom sheet has three heights (peek, half, full) and touch targets are at least 44 px.
- **Speed budget.** The first map is visible in under 3 seconds on a mid-range phone, and the live layer stays smooth with the whole fleet on screen.
- **Accessible.** Contrast meets WCAG 2.1 AA, everything is reachable by keyboard, and a list view shows what the map shows.

**Devices for using it and for building it.**

| Device | Using the app | Building the app |
| --- | --- | --- |
| Phone | Full app in the browser, installable to the home screen | Start and direct agent sessions, review preview links, accept or reject at gates |
| Laptop | Full app in the browser | Run the app locally, DuckDB checks, Power BI Desktop, erwin, code review |

The code lives in one GitHub repository. Agents work on that repository from the cloud, so a build session can be started from either device and nothing depends on the laptop staying on.

## Interface rules

These rules settle where things go, how sectors scale, how pins are made and how every word and number is written, so designers and agents can build without asking each time.

**Navigation that scales to every sector.** Listing sectors across the top stops working after four or five. The layout never lists them all.

| Rule | Laptop | Phone |
| --- | --- | --- |
| Only pinned sectors are always visible, five at most | A rail down the left edge | A scrolling row of chips under the search box |
| Every sector lives in one browser | An All sectors panel beside the rail: 17 sectors in 5 groups, with a search box | A full-screen list with the same groups |
| Search reaches everything | One box finds places, questions and sectors | The same box, at the top |
| A new sector changes nothing in the layout | One more row in the browser | One more row in the list |

The sector list is read from the sector register, so it is data and not code. The five groups in the wireframes (Moving around, Built city, People and services, Economy, Civic life and nature) are a proposal for the architect to confirm.

**Where things go.**

- The map fills the screen. Controls sit on its edges and never in the middle.
- On a laptop, navigation is on the left, the map in the centre and the answer panel on the right.
- On a phone, search is at the top, the map is behind, and the answer is in a bottom sheet with three heights. This is the [sheet pattern Apple documents for maps](https://developer.apple.com/design/human-interface-guidelines/maps) and the one most map apps use.
- Lens switch and legend sit on the left of the map. Zoom and view controls sit on the right. Source, data age and Google's credits sit at the bottom right.
- Each panel has one main action.
- A list view of what the map shows is always one tap away.

**Pins, made in Blender.** The project's own models are exported from Blender as GLB files, a format [Blender exports](https://docs.blender.org/manual/en/4.4/addons/import_export/scene_gltf2.html) and [deck.gl loads directly](https://deck.gl/docs/api-reference/mesh-layers/scenegraph-layer). Each pin family has three levels, so it can be realistic up close and still readable from far away.

| Level | Shown when | Asset | Starting budget |
| --- | --- | --- | --- |
| Far | The whole city is in view | A flat image rendered from the same Blender model | 64 px, all pins in one image sheet |
| Middle | A neighbourhood is in view | A simplified model | 500 triangles |
| Near | A street is in view | The full realistic model | 5,000 triangles, 200 KB compressed, textures up to 512 px |

The budgets are starting values; task T30 confirms them on the test phone.

- **One source, every output.** One Blender file per pin family produces all three levels, so the 2D map and the 3D view show the same object.
- **True size and a fixed forward direction.** Models are built in metres with the origin on the ground, so a bus sits on the road and turns to its heading.
- **Status is a shape, not only a colour.** The base under a pin is a disc when on time, a diamond when late and a ring when early.
- **Readable on a photo.** Every pin stands on a contrasting base. The selected pin gets an outline and grows.
- **Never too small.** A pin is at least 24 px on screen, and its touch area is 44 px.
- **Crowds become counts.** Overlapping pins of one kind merge into one pin with a number.
- **A register, not code.** One file maps each kind of thing to its pin. A new pin is a new entry.

**Words.**

- **No emoji, anywhere.** Not in the interface, pins, alerts or documents. Icons come from the project's own set, and every icon has a text label or a spoken name.
- **Sentence case.** No all-capital labels. IDs such as TRN-Q01 are the one exception.
- **Short and plain.** A label is at most three words. An answer sentence is at most 20 words. A button says what it does: "Open detail", not "OK".
- **Canadian spelling.** Neighbourhood, colour, centre.
- **Ready for French.** All text lives in a language file, and layouts leave room for text 30% longer.
- **Errors give direction.** They say what happened and what to do next.

**Numbers.** Every number is formatted by one shared function, never by hand, and is set in tabular figures so columns line up and live values do not jitter.

| Kind | Rule | Written as |
| --- | --- | --- |
| Counts | Exact, with a thousands separator | 1,240 |
| Percentages | Whole numbers; one decimal only below 10% | 81%, 4.5% |
| Durations | The largest sensible unit, with a space before it | 4 min, 12 s |
| Early and late | Words, never plus or minus signs | 2 min early, 4 min late |
| Distances | Metric | 300 m, 1.2 km |
| Money | Canadian dollars, no cents above $100 | $412,000 |
| Clock times | 24-hour, Halifax time | 19:42 |
| Dates | Day, short month, year | 15 Nov 2026 |
| No value | A dash with the reason available; never a zero | – |

The examples show format only. The 24-hour clock is a proposal for the architect to confirm.

**Letters and type.**

- One typeface family for the whole app, with tabular figures. The wireframes use IBM Plex Sans, which is free to use.
- Body text is 16 px on a phone and 14 px on a laptop. Nothing is smaller than 12 px.
- Three weights at most: regular, medium and semibold.
- Text over the map sits on a plate or has a halo. It is never placed bare on photo imagery.
- Lines in a panel are at most 70 characters.

**Accessibility.** The target is WCAG 2.2 level AA.

- Text contrast is at least 4.5 to 1. Controls and meaningful graphics are at least 3 to 1.
- The standard's [minimum target is 24 by 24 px](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/). This app uses 44 px for anything touched.
- Everything works by keyboard, with a visible focus outline.
- When the device asks for reduced motion, fly-through animation is off.
- Every pin has a spoken name, and the list view carries everything the map shows.

**Speed is a design rule.** A panel opens in under 100 ms. The first map shows in under 3 seconds. Nothing waits on 3D: the 2D map and the answer appear first, and the realistic view sharpens behind them.

## Apps on top of the map

Anything built in another tool appears as a panel inside the map, attached to a story, a kind of feature or a single place. It is registered as configuration and is never a separate site.

**How a panel is attached.** A panel is one entry in the register: its type (Power BI, Tableau, custom chart or link), its title, its address, and what it is attached to. Three attachment points cover every case:

| Attached to | Opens when | Example |
| --- | --- | --- |
| A story | The story is open | A Power BI page of on-time performance beside TRN-Q02 |
| A kind of feature | Any feature of that kind is clicked | Every bus route opens the same route report, filtered to that route |
| One place | That place is clicked | A terminal or a neighbourhood opens its own small application |

**Three levels, built in order.** Each level is a complete, useful step and a distinct skill.

| Level | What the user sees | How | Stage |
| --- | --- | --- | --- |
| 1. Linked | A published report shown in the panel | Embed the report's public address | 4 |
| 2. Filtered | The report opens already filtered to what was clicked | Pass the route, area or time window to the report | 4 |
| 3. Two-way | Selecting in the report highlights on the map, and the reverse | The BI tool's embedding API, with signed-in viewers | Later |

**One rule keeps the numbers honest.** Every panel reads the same Gold tables that feed the map's serving files. A report that computes its own version of on-time performance is not accepted. This is also what the Gold star schemas are for: Power BI and Tableau connect to them directly.

## Build stages and gates

The build runs in five stages, and a stage starts only when the gate before it is met, the same rule the charter uses for phases. No dates are fixed here; each gate sets the dates for the next stage.

![Roadmap: five stages, five gates](diagrams/roadmap.png)

Stage 2 cannot be hurried, because it needs 2 to 4 weeks of archived feed. That is why the collector is the first thing built in Stage 0.

| Stage | Delivers | Evidence at the gate | The architect's parallel work |
| --- | --- | --- | --- |
| 0 Foundations | Repository and CI; contract v0; transit collector in the cloud saving the schedule and all three live feeds; empty map shell with basemap; the 3D engine test and the twin's own 3D model | 48 hours archived with no gap over 2 minutes; contract approved; shell opens on the phone | Finish the logical model; begin the transit physical model |
| 1 Live buses | The TRN-Q01 story: every bus, on-time status, feature detail, source and data age, in 2D and in the realistic 3D view | The answer matches the raw feed at three sampled moments; definition of done met | Transit physical model and source-to-target mapping; choose the data platform |
| 2 First history | TRN-Q07 from laptop files; then TRN-Q02, Q05, Q04, Q03 and Q11 from Gold; the Replay lens | One story served from Gold end to end; its numbers match a DuckDB check | Build Bronze to Silver to Gold for transit; data dictionary |
| 3 Three sectors | Collectors and stories for TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29 and HRE-Q01; City view with chips and one event feed | Three sectors live in City view; a failed source greys out only its own layer | Physical models for Public Works and Housing |
| 4 City as a whole | TRN-Q09, PWK-Q16, HRE-Q07, TRN-Q08; BI panels at levels 1 and 2; buildings coloured by data | One cross-sector story and one embedded BI panel accepted | Charter V2: 3D scope and the public launch |

The modelling work runs beside the build and does not block it until Gate 2. If the physical model is not ready when the archive is, the DuckDB files from step 2 keep new stories moving.

**First three actions.**

1. Create the GitHub repository and save this plan in it as `docs/plan.md`.
2. Create the Azure account and set a budget alert at US$5 a month.
3. Give an agent task card T01, then T02. T02 starts the archive, and every day it is not running is a day of history lost.

## Agents and tasks

Seven agent roles and 30 task cards cover the build to Gate 4. The cards are written so any capable coding agent can pick one up with only this plan and the repository.

**Agent roles.** One agent can hold several roles, except the verifier, which is always a separate session that has not seen the build.

| Role | Does | Never does |
| --- | --- | --- |
| Lead | Picks the next card, breaks it down, opens the pull request, reports at gates | Merges without the architect's approval at a gate |
| Source scout | Confirms each source: address, format, refresh rate, licence, sample | Writes pipeline code |
| Collector engineer | Builds one collector per source and its monitoring | Shares code paths between sources in a way that couples their failures |
| API engineer | Owns the contract file, the serving API and its adapters | Changes the contract without approval |
| Map engineer | Builds the shell, layers, stories and panels | Reads data from anywhere but the API |
| Data engineer | Writes DuckDB transforms, then implements Bronze to Gold to the architect's model | Invents entity or column names |
| Verifier | Recomputes each answer independently from raw data; runs the definition of done | Fixes what it finds; it reports only |

**Rules every agent follows.**

- Read `docs/plan.md`, the contract file and `AGENTS.md` before starting.
- One task card, one branch, one pull request.
- Do not change the contract, a business rule or a model name. Propose the change to the architect.
- Confirm every address, limit and licence in this plan at build time. Treat the plan's facts as of 15 November 2026.
- No personal data. Show the licence attribution wherever data is shown.
- Every pull request carries tests and a short note on how the work was verified.
- Every card ends with `docs/learning/<card>.md`: what was built, why, how to run it, and one exercise for the architect to do by hand.

**Kept for the architect, not given to agents.** The logical and physical models, the source-to-target mapping, the business rules (on time, frequent service, walking distance), gate reviews, and building at least the first Power BI report and the first Bronze to Gold pipeline by hand. These are the skills the project exists to teach.

### Stage 0: Foundations

| Card | Task | Role | After | Done when |
| --- | --- | --- | --- | --- |
| T01 | Scaffold the repository: `apps/web`, `services/collector`, `services/api`, `data`, `docs`; CI with lint and tests; `AGENTS.md` holding the rules above | Lead | None | CI is green; the README runs each part; this plan is in `docs/plan.md` |
| T02 | Source note for Halifax Transit: confirm the schedule file and the three live feeds, measure how often each changes over 2 hours, copy the licence and attribution text | Source scout | T01 | `docs/sources/halifax-transit.md` has addresses, measured refresh, sizes, licence, and whether ferries appear |
| T03 | Transit collector: poll each live feed, save the raw response compressed and unchanged with source, load time and feed timestamp; skip unchanged responses; fetch the schedule daily and keep every version | Collector engineer | T02 | Runs locally for 1 hour; files land under `bronze/halifax_transit/<feed>/<date>/<hour>/`; tests use recorded samples |
| T04 | Deploy the collector to Azure Functions with Blob Storage; add a gap report and an alert when no file lands for 5 minutes | Collector engineer | T03 | 48 hours archived with no gap over 2 minutes; storage per day measured and recorded |
| T05 | Write contract v0 as an OpenAPI file with the envelope, the feature keys and worked examples for `vehicles` | API engineer | T01 | The architect approves it; a mock server returns the examples |
| T06 | Map shell: MapLibre with a Nova Scotia PMTiles basemap, side panel and bottom sheet, story loader, empty and error states, installable PWA; deploy with preview links | Map engineer | T05 | Opens on a phone from a preview link; first map in under 3 seconds; installs to the home screen |
| T07 | Design tokens and parts: colours for early, on time and late that survive colour blindness; rail, sheet, answer sentence, numbers strip, trust footer; all built to the interface rules and the wireframes | Map engineer | T06 | Parts render in a gallery page; contrast meets WCAG 2.1 AA |
| T27 | 3D engine test: load Google Photorealistic 3D Tiles over downtown Halifax in CesiumJS, 3DTilesRendererJS and deck.gl; on the architect's phone and laptop measure time to a sharp view, smoothness while flying, memory, and how close the camera can go before the mesh breaks down | Map engineer | T01 | A one-page result with numbers and screen recordings; the architect picks the engine and the handover height |
| T28 | The twin's own 3D model: buildings from HRM building outlines, heights from the LiDAR surface and ground models, set on LiDAR terrain, published as 3D Tiles the project hosts. Confirm each source's licence first | Source scout, Data engineer | T01 | Downtown and one suburb load in the browser; heights spot-checked against 10 known buildings |

### Stage 1: Live buses

| Card | Task | Role | After | Done when |
| --- | --- | --- | --- | --- |
| T08 | Live adapter and `GET /v1/live/vehicles`: decode positions and trip updates, join route name, headsign and next stop from the schedule, apply the architect's on-time rule, cache the result | API engineer | T03, T05 | Matches the contract; tests replay recorded feeds; responds in under 300 ms |
| T09 | Story TRN-Q01: live vehicle layer in deck.gl with smooth movement, colour by status, route filter, answer sentence and numbers strip | Map engineer | T06, T07, T08 | Every bus in the feed is on the map; the layer stays smooth on a mid-range phone |
| T10 | Feature detail for a bus, the trust footer, and the stale and source-down states | Map engineer | T09 | Cutting the feed in a test greys the layer and shows the last good time |
| T11 | Verify TRN-Q01: at three moments, decode the raw Bronze files yourself and compare counts and statuses with the app | Verifier | T10 | A pass or fail report against the definition of done |
| T12 | Demo script and learning note for Gate 1 | Lead | T11 | The architect can run the demo alone on a phone |
| T29 | Realistic 3D view: Google tiles from above, a camera floor, a handover to the twin's own model up close, live buses in the scene, Google's required credits, a session counter with a cap, and automatic fallback to the twin's own model or the 2D map | Map engineer | T09, T27, T28 | Flying over downtown stays smooth on the test phone; removing the Google key still leaves a working 3D city |
| T30 | Pin pipeline: from one Blender file per pin family, export the three levels as GLB and the flat image, check them against the size budget, and record them in the pin register. The bus is the first family; the architect or a 3D artist makes the model | Map engineer | T27 | The bus pin shows at all three levels in 3D and as a flat image in 2D, inside the budget, with its status base |

### Stage 2: First history

| Card | Task | Role | After | Done when |
| --- | --- | --- | --- | --- |
| T13 | DuckDB over Bronze: decode the archive into Parquet tables for vehicle positions and stop-time updates, as a prototype of Silver | Data engineer | T04 | One command rebuilds the tables; row counts reconcile with the raw files |
| T14 | Story TRN-Q07: stops with frequent service, walking-distance areas and neighbourhood boundaries, using the architect's two rules | Data engineer, Map engineer | T06, T13 | Served through `/v1/layers` and `/v1/numbers`; verified by the verifier |
| T15 | Platform test: load one day of Bronze into the chosen platform and query it | Data engineer | T04 | A written result: works, or why not and the fallback |
| T16 | Implement Bronze to Silver to Gold for transit from the architect's physical model and mapping | Data engineer, with the architect | T15 and the physical model | Gold tables reconcile with T13 on a sample week |
| T17 | Serving-file publisher: write Gold results to storage on a schedule and serve them through the API | API engineer | T16 | A Gold change reaches the map with no code change |
| T18 | Stories TRN-Q02, Q05, Q04, Q03, Q11, one at a time, each verified before the next starts | Map engineer, Verifier | T17 | Each meets the definition of done; the first one passes Gate 2 |
| T19 | Replay lens: a time control that plays archived positions for any past window | Map engineer, API engineer | T17 | Yesterday's evening rush plays back on a phone |

### Stage 3: Three sectors

| Card | Task | Role | After | Done when |
| --- | --- | --- | --- | --- |
| T20 | Source notes for wave D: road closures, street and utility work, parks and tree canopy, building permits, property assessment. Check each licence separately; assessment data may not be under the HRM licence | Source scout | Gate 2 | One note per source; any that are not open are flagged to the architect |
| T21 | One collector per wave D source, each independent | Collector engineer | T20 | Each lands raw data in Bronze with provenance; stopping one affects no other |
| T22 | City view: pinned sectors, the All sectors browser, one event feed, and a generic renderer driven by `kind` and `sector_id` | Map engineer | T21 | A new sector's features draw with no new map code |
| T23 | Stories TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29, HRE-Q01, one at a time | Data engineer, Map engineer, Verifier | T22 | Each meets the definition of done; three sectors are live |

### Stage 4: City as a whole

| Card | Task | Role | After | Done when |
| --- | --- | --- | --- | --- |
| T24 | Cross-sector stories TRN-Q09, PWK-Q16, HRE-Q07, TRN-Q08, one at a time | Data engineer, Map engineer, Verifier | Gate 3 | One is accepted by the architect |
| T25 | Panel host, then one Power BI report at level 1 and level 2 | Map engineer; the architect builds the report | T24 | Clicking a route opens the report filtered to that route |
| T26 | Data on buildings: colour and raise the twin's own buildings by a story's numbers, such as assessed value or permits | Map engineer | T23, T28 | One housing story shows its answer on the buildings themselves |

Once T01 is merged, two chains can run side by side: T02, T03, T04 for the collector, and T05, T06, T07 for the contract and shell. T27 and T28 can run beside them. Everything else runs in the order its "After" column gives.

**Card template.** Paste this to an agent with the row filled in.

```text
You are the <role> on the Halifax Digital Twin map application.
Read first: docs/plan.md, AGENTS.md, docs/contract/openapi.yaml, docs/sources/.

Card <ID>: <task>
Question served: <Question_ID and wording, or "foundation">
Depends on: <cards already merged>
Done when: <the row's acceptance test>

Rules: one branch, one pull request. Do not change the contract,
a business rule or a model name; propose it instead. Confirm every
external address, limit and licence yourself. No personal data.
Include tests and a note on how you verified the work.
Finish with docs/learning/<ID>.md: what you built, why, how to run it,
and one exercise for the architect to do by hand.

Stop and ask the architect when: a source is not open, a business
rule is missing, or the acceptance test cannot be met as written.
```

## Skills and certifications

Each stage is chosen to exercise a skill that enterprise data teams hire for, so the project doubles as a study plan. Exam names change often; confirm the current list with each vendor before booking.

| Stage | Skills practised by hand | Enterprise tools touched | Certification track it supports |
| --- | --- | --- | --- |
| Design, now | Conceptual, logical and physical modelling; source-to-target mapping; data dictionary | erwin | Data modelling and data management credentials |
| 0 Foundations | Streaming ingestion, landing zones, provenance, cloud functions and storage, API contracts | Azure Functions, Blob Storage, GitHub Actions | Azure fundamentals and data fundamentals |
| 1 Live buses | Real-time serving, caching, joining live data to reference data | Azure, OpenAPI | Azure data engineering |
| 2 First history | Medallion pipelines, slowly changing dimensions, star schemas, data quality checks, reconciliation | Databricks or Microsoft Fabric, Delta tables, SQL | Databricks data engineer; Fabric data engineer and analytics engineer |
| 3 Three sectors | Multi-source integration, conformed dimensions, spatial joins, working with ArcGIS services | ArcGIS REST services, spatial SQL | GIS and spatial analytics credentials |
| 4 City as a whole | Semantic models, report design, embedding, cross-domain analysis | Power BI, Tableau | Power BI data analyst; Tableau analyst |

The learning notes that close every task card are the study material: each one explains a piece of the system and gives one exercise to repeat by hand.

## Risks and open decisions

Eight decisions belong to the architect, and the first three should be made before Stage 0 starts.

**Open decisions.**

- [ ] Accept or change the three assumptions in the Summary: hybrid stack, free tiers first, plan before prototype.
- [ ] Cloud and data platform: Azure with Databricks Free Edition (recommended), or the Microsoft Fabric trial.
- [ ] The on-time rule: how early and how late still counts as on time.
- [ ] For TRN-Q07: what counts as frequent service, and how many metres is a 5-minute walk.
- [ ] The raw data retention window before records are condensed into events.
- [ ] Which key the map shows for a stop: the HRM stop number or the GTFS `stop_id`. This is already an open question in the logical model.
- [ ] Record in Charter V2 that realistic 3D is in scope (decided 15 November), and pick the 3D engine after test T27.
- [ ] The application's public name, and whether preview links may be shared before the public launch.

**Risks.**

| Risk | Effect | Response |
| --- | --- | --- |
| The collector starts late or fails silently | History is lost and wave C slips | Build it first; gap report and alert from day one |
| The transit feed changes or goes offline; HRM labels it a beta | The live layer stops | Its own collector and layer; the map shows the last good time; nothing else is affected |
| A free tier limit is hit or a trial ends | The platform pauses | The map reads serving files, not the warehouse; DuckDB remains as a fallback |
| Building what looks good instead of what answers a question | Effort with no learning or value | No Question\_ID, no build; one story finished before the next |
| Agents build faster than the architect learns | A working app nobody on the project understands | Learning notes, hands-on exercises, and the work kept for the architect |
| A source outside HRM has a different licence | Data shown without the right to show it | The scout checks every licence; anything not open is flagged before use |
| Cost surprises from 3D tiles or storage | Bills on a free-first project | US$5 budget alert; a session cap on Google tiles |
| Facts in this plan go out of date | Agents build on stale limits or addresses | Agents confirm every external fact at build time |
| Google changes the price, terms or quality of its 3D tiles | The realistic view becomes costly or unavailable | Google is a backdrop only; the twin's own 3D model and the 2D map keep every story working |

## Sources

Project artifacts read for this plan, and web pages checked on 15 November 2026.

**Project artifacts**

- [Halifax Digital Twin – Project Charter V1](https://docs.google.com/document/d/1XowLb9O2JuxJ3-cO5yi6S0cFWsZV9jtJNfaTWLcJ6Bc/edit)
- [Business Questions register](https://docs.google.com/spreadsheets/d/1Zl0xTYPy1RzQD5fEkgHTlOl7AjKQeiY0YGt6puWCB1I/edit): Transportation, Public Works, Housing & Real Estate sheets
- [Domain Mapping](https://docs.google.com/spreadsheets/d/1u9ompZL5ZxIAROX2DkJC5EC1LA5vEcYDzFTdkt0Tii0/edit)
- [Logical Model V1](https://claude.ai/artifact/LDAxLKkDAGVtMeSmtsV39r) and its project note

**Data sources**

- [Halifax Transit vehicle positions feed, Mobility Database](https://mobilitydatabase.org/feeds/gtfs_rt/mdb-1607); [service alerts feed](https://mobilitydatabase.org/feeds/gtfs_rt/mdb-1606); [schedule feed](https://mobilitydatabase.org/feeds/gtfs/mdb-734)
- [HRM Open Data Downloads](https://data-hrm.hub.arcgis.com/pages/open-data-downloads), including the beta notice for the transit feed
- [HRM Open Data Licence](https://data-hrm.hub.arcgis.com/pages/open-data-licence)
- [GTFS Realtime best practices](https://gtfs.org/documentation/realtime/)

**Technology**

- [deck.gl with MapLibre](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre) and [deck.gl with 3D Tiles](https://deck.gl/docs/developer-guide/base-maps/using-with-3d-tiles)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing): Photorealistic 3D Tiles row
- [Protomaps](https://protomaps.com/)
- [Azure Static Web Apps hosting plans](https://learn.microsoft.com/en-us/azure/static-web-apps/plans) and [pricing](https://azure.microsoft.com/pricing/details/app-service/static/)
- [Databricks Free Edition limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations)
- [Microsoft Fabric trial capacity](https://learn.microsoft.com/en-us/fabric/fundamentals/fabric-trial)
- [Power BI: embed a report in a secure portal or website](https://learn.microsoft.com/en-us/power-bi/service-embed-secure)

**Realistic 3D**

- [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles), [usage and billing](https://developers.google.com/maps/documentation/tile/usage-and-billing), [policies](https://developers.google.com/maps/documentation/tile/policies) and [renderer guide](https://developers.google.com/maps/documentation/tile/use-renderer)
- [Google's launch post for Photorealistic 3D Tiles](https://mapsplatform.google.com/resources/blog/create-immersive-3d-map-experiences-photorealistic-3d-tiles/)
- [List of 3D locations in Google Earth](https://list.fandom.com/wiki/List_of_3D_locations_in_Google_Earth), a community-kept list
- [Cesium community: quality of Google's tiles](https://community.cesium.com/t/quality-comparison-googlemaps-vs-cesium/38156) and [root tile requests](https://community.cesium.com/t/google-tiles-limitations/31034)
- [deck.gl issue 7955: Google 3D tiles less sharp than in Cesium](https://github.com/visgl/deck.gl/issues/7955)
- [Google 3D Maps in the Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/3d-maps-overview)
- [HRM: LiDAR surface model added to open data](https://www.halifax.ca/home/news/new-building-permit-lidar-digital-surface-model-data-expands-municipal-open-data)
- [Nova Scotia DataLocator, Elevation Explorer](https://nsgi.novascotia.ca/datalocator/) and [provincial LiDAR release](https://geonova.novascotia.ca/news-blog/provincial-lidar-available)

**Interface design**

- [Apple Human Interface Guidelines: Maps](https://developer.apple.com/design/human-interface-guidelines/maps)
- [Esri Press, Designing Map Interfaces](https://www.esri.com/content/dam/esrisites/en-us/esri-press/browse/designing-map-interfaces-sample-pages.pdf), sample pages on map interface patterns
- [W3C: What's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [deck.gl ScenegraphLayer](https://deck.gl/docs/api-reference/mesh-layers/scenegraph-layer) and the [Blender glTF 2.0 exporter](https://docs.blender.org/manual/en/4.4/addons/import_export/scene_gltf2.html)
