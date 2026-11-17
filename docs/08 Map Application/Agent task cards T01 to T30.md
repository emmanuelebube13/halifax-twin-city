# **Agent task cards T01 to T30**

Thirty paste-ready prompts, one per task card, for the Halifax Digital Twin map application. Give an agent the standard rules once, then one card.

The plan explains why each card exists: [Map Application Plan V1](https://docs.google.com/document/d/13UBh3vM42Ky0p54qcP3HjdFZTR8PMiADtb1MkmFlOwM/edit).

## **Order of work**

| Order | Cards | Note |
| :---- | :---- | :---- |
| 1 | T01 | Alone |
| 2 | T02, T03, T04 | Collector chain. Start first: history that is not archived is lost. |
| 2 | T05, T06, T07 | Contract and shell chain, beside the collector |
| 2 | T27, T28 | 3D engine test and the twin's own 3D model, beside both chains |
| Gate 0 |  | 48 hours archived with no gaps; contract approved |
| 3 | T08, T09, T10, T11, T12 | Live buses in 2D |
| 3 | T30, then T29 | Pins, then the realistic 3D view |
| Gate 1 |  | Live answer checked against the raw feed |
| 4 | T13, T14, T15, then T16, T17, T18, T19 | First history |
| Gate 2 |  | One story served from Gold, end to end |
| 5 | T20, T21, T22, T23 | Three sectors |
| Gate 3 |  | Three sectors live in City view |
| 6 | T24, T25, T26 | City as a whole |
| Gate 4 |  | One cross-sector story and one embedded BI panel |

## **Standard rules**

These apply to every card. They are also in AGENTS.md.

1. Read docs/plan.md, AGENTS.md, docs/contract/openapi.yaml and docs/sources/ before you start. Look at docs/wireframes/ before any interface work.

2. One task card, one branch, one pull request. Name the branch after the card, for example t03-transit-collector.

3. Do not change the contract, a business rule or a model name. Propose the change to the architect and wait.

4. Confirm every external address, limit, price and licence yourself at build time. The plan's facts are as of 15 November 2026\.

5. No personal data. Show the licence attribution wherever data is shown.

6. Never commit a key or password. Use environment variables, GitHub secrets and cloud app settings. Commit only .env.example.

7. No emoji anywhere: interface, pins, alerts, documents, commit messages, code comments. Sentence case for all interface text.

8. Every number shown to a user goes through the shared formatter. Every piece of interface text lives in the language file.

9. Every pull request carries tests and a short note headed "How I verified".

10. Finish every card with docs/learning/\<card\>.md: what you built, why, how to run it, and one exercise for the architect to do by hand.

11. Spend nothing without asking. If a step would create a paid resource or leave a free tier, stop and ask.

12. The verifier is always a separate session that has not seen the build. It reports; it does not fix.

Stop and ask the architect when a source is not open or its licence is unclear, when a business rule or model name is missing, when the acceptance test cannot be met as written, when a step would cost money, or when you need a key or account you were not given.

## **Stage 0: Foundations**

### **T01 Scaffold the repository**

Role: Lead. After: None.

You are the Lead on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T01: Scaffold the repository  
Question served: Foundation  
Depends on: None

Goal: Give every later card a place to work, with checks that run on every pull request.

Build:  
\- Create the folders: apps/web (React, TypeScript, Vite), services/collector (Python), services/api (Python), data (DuckDB SQL), assets/pins, config, docs (with contract, sources, learning, decisions, runbooks, wireframes, diagrams).  
\- Copy plan.md, AGENTS.md, task-cards.md and the wireframe and diagram images from the Drive folder into docs/ and the repository root.  
\- Add CI on GitHub Actions: lint and tests for the web app, the collector and the API on every pull request.  
\- Add a CI check that fails when an emoji code point appears in source, interface text or documents.  
\- Add a pull request template with two required headings: How I verified, and Learning note.  
\- Add .env.example, a .gitignore that excludes .env and keys, and secret scanning.  
\- Create config/business-rules.yaml with the interim defaults from the start-here brief, each marked as not yet decided.  
\- Create config/sectors.json with the 17 sectors and the five groups from the wireframes, read from the Domain Mapping sheet.  
\- Write a README that explains how to run each part locally.

Done when: CI is green on an empty test in each part. The README runs each part. The plan is in docs/plan.md.

Also stop and ask when: Ask which open-source licence the repository should carry before adding one.

### **T02 Source note for Halifax Transit**

Role: Source scout. After: T01.

You are the Source scout on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T02: Source note for Halifax Transit  
Question served: TRN-Q01 and every later transit question  
Depends on: T01

Goal: Establish the facts about the transit feeds that every later card depends on.

Build:  
\- Confirm the four addresses and whether each answers on https: the schedule file gtfs.halifax.ca/static/google\_transit.zip, and the live feeds gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb, .../TripUpdate/TripUpdates.pb and .../Alert/Alerts.pb. These come from public feed registries, so check them against the HRM open data page.  
\- Poll each live feed every 10 s for 2 hours. Record how often the feed header timestamp changes, the payload size, and the number of entities.  
\- Record which fields are filled in: position, bearing, speed, trip and route ids, stop sequence, delay, occupancy.  
\- Check whether ferries appear in the schedule and in the live feeds.  
\- Copy the licence name, the licence address and the exact attribution wording HRM asks for.  
\- Note any stated rate limit or fair-use rule, and the fact that HRM calls the feed a beta.  
\- Save three sample payloads of each feed under services/collector/tests/fixtures/.  
\- Write everything to docs/sources/halifax-transit.md.

Done when: docs/sources/halifax-transit.md has the addresses, measured refresh rate, sizes, fields, ferry finding, licence and attribution.

Also stop and ask when: A feed is unreachable for more than an hour, or the licence does not clearly allow this use.

### **T03 Transit collector**

Role: Collector engineer. After: T02.

You are the Collector engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T03: Transit collector  
Question served: TRN-Q01 and all history questions  
Depends on: T02

Goal: Save every raw record from the transit feeds, unchanged, with where it came from and when.

Build:  
\- Write one Python package for this source. No other source shares its code path.  
\- Poll each live feed on the interval in the settings. Start at 30 s and set it from the T02 measurement.  
\- Skip a response whose feed header timestamp has not changed since the last saved one.  
\- Save the raw bytes, compressed, with no decoding beyond the header: bronze/halifax\_transit/\<feed\>/\<date\>/\<hour\>/\<feed\>\_\<fetch time UTC\>.pb.gz.  
\- Append one line per saved file to an hourly manifest: source id, feed, fetch time, header timestamp, HTTP status, bytes, SHA-256.  
\- Fetch the schedule file once a day. Keep every version: save it only when its hash changes, under bronze/halifax\_transit/static/\<hash\>/.  
\- Put storage behind one interface with two implementations: a local folder and Azure Blob Storage.  
\- Retry with backoff. A failed poll is logged and the loop carries on.  
\- Leave a hook that hands each new response to the live cache. Card T08 fills it in.

Done when: It runs locally for 1 hour, files and manifests land in the right folders, and tests replay the T02 fixtures.

Also stop and ask when: The feed format differs from the GTFS Realtime standard in a way that breaks the header read.

### **T04 Deploy the collector and watch it**

Role: Collector engineer. After: T03.

You are the Collector engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T04: Deploy the collector and watch it  
Question served: TRN-Q01 and all history questions  
Depends on: T03

Goal: Keep the collector running all day without the laptop, and know within minutes when it stops.

Build:  
\- Deploy the collector to Azure Functions on a timer, writing to Azure Blob Storage. Describe the resources as code.  
\- Write a gap report that reads the manifests and lists every gap over 2 minutes.  
\- Raise an alert when no file has landed for 5 minutes.  
\- Set a budget alert at US\$5 a month on the subscription.  
\- Measure storage used per day after 48 hours and record it in the source note.  
\- Write docs/runbooks/collector.md: how to deploy, check, restart and read the gap report.

Done when: 48 hours are archived with no gap over 2 minutes. Storage per day is measured and recorded.

Also stop and ask when: You need Azure credentials, or the projected cost is above US\$5 a month.

### **T05 Contract version 0**

Role: API engineer. After: T01.

You are the API engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T05: Contract version 0  
Question served: Foundation  
Depends on: T01

Goal: Write down the one thing the map is allowed to read, before anything is built on either side of it.

Build:  
\- Write docs/contract/openapi.yaml in OpenAPI 3.1 with the seven read-only endpoints in the plan's Architecture section.  
\- Define the envelope every response uses: data, as\_of, source, reliability\_tier, licence.  
\- Define a feature as GeoJSON with the conformed-core keys: kind (location, asset or event), sector\_id, subsector\_id, id, source\_key.  
\- Give a worked example for vehicles: route id and short name, headsign, bearing, speed, delay in seconds, status (early, on time, late, unknown), next stop id and name, observed time.  
\- Define a story: id, question id, question text, sector, lens, layers, numbers, panels and the answer sentence template.  
\- Define the error format and the rule for version changes.  
\- Add a mock server that returns the examples, and a contract test the API must pass.

Done when: The architect approves the file. The mock server returns the examples.

Also stop and ask when: An endpoint needs an entity or column name that the logical model has not fixed.

### **T06 Map shell**

Role: Map engineer. After: T05.

You are the Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T06: Map shell  
Question served: Foundation  
Depends on: T05

Goal: Stand up the empty application on phone and laptop, laid out as the wireframes show.

Build:  
\- Draw the 2D map with MapLibre and a Nova Scotia PMTiles basemap from Protomaps, with the OpenStreetMap credit.  
\- Laptop layout: header with search, left rail of pinned sectors, map, right panel. Follow docs/wireframes/01 to 03\.  
\- Phone layout: search, a scrolling row of pinned sectors, map, and a bottom sheet with three heights. Follow docs/wireframes/04 to 06\.  
\- Add the lens switch (Live, Replay, Analytics), the 2D and 3D switch (3D stays off until T29) and the list view entry.  
\- Load stories from GET /v1/stories on the mock server.  
\- Design the loading, empty, error and source-down states. Use skeletons, not spinners.  
\- Keep story, lens, time and selection in the address so any view can be shared.  
\- Create the language file and the shared number and date formatter from the plan's Interface rules.  
\- Make it installable as a PWA. Cache the app shell only. Never cache Google tiles.  
\- Deploy to Azure Static Web Apps on the Free plan, with a preview link for every pull request.

Done when: It opens on a phone from a preview link, the first map shows in under 3 seconds on a mid-range phone, and it installs to the home screen.

Also stop and ask when: The basemap extract is larger than the hosting plan allows.

### **T07 Design tokens and parts**

Role: Map engineer. After: T06.

You are the Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T07: Design tokens and parts  
Question served: Foundation  
Depends on: T06

Goal: Build the small set of parts every story reuses, to the interface rules.

Build:  
\- Define tokens for colour, type sizes and spacing as CSS variables. One typeface family with tabular figures.  
\- Build the parts: rail item, sector chip, All sectors browser (read from config/sectors.json), search box, bottom sheet, answer sentence, numbers strip, legend, trust footer.  
\- Show status by shape as well as colour: disc for on time, diamond for late, ring for early.  
\- Add a gallery page that shows every part in every state.  
\- Add automated accessibility checks to CI. Check keyboard use and the focus outline by hand.

Done when: Every part renders in the gallery. Contrast meets WCAG 2.2 AA. The automated checks pass.

Also stop and ask when: A wireframe and an interface rule disagree.

### **T27 3D engine test**

Role: Map engineer. After: T01.

You are the Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T27: 3D engine test  
Question served: Foundation for the realistic 3D view  
Depends on: T01

Goal: Choose the engine and settings for the realistic 3D view from measurements on the architect's own devices.

Build:  
\- Build three minimal pages that load Google Photorealistic 3D Tiles over downtown Halifax (about 44.6488 N, 63.5752 W): one in CesiumJS, one in 3DTilesRendererJS with three.js, one in deck.gl.  
\- Fly the same scripted camera path in each: citywide, then the harbour, then down toward a street.  
\- Measure on the architect's phone and laptop: time to the first sharp view, average and worst frame time, memory, and the number of tile requests.  
\- Find the camera height at which the mesh stops looking real. Start at 300 m from the ground.  
\- Try the settings that trade detail for speed: level-of-detail error, simultaneous requests, tile memory cap.  
\- Confirm Google's logo and data credits display correctly in each engine.  
\- Count the sessions the test used against the free 1,000 a month.  
\- Write docs/decisions/3d-engine.md with the numbers, screen recordings and a recommendation.

Done when: A one-page result with numbers and recordings. The architect picks the engine and the handover height.

Also stop and ask when: No Google Maps key has been provided, or Halifax is not covered at usable quality.

### **T28 The twin's own 3D model**

Role: Source scout, Data engineer. After: T01.

You are the Source scout, Data engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T28: The twin's own 3D model  
Question served: Foundation for the realistic 3D view  
Depends on: T01

Goal: Build a 3D city the project owns, from open data, for close-up views and as the fallback.

Build:  
\- Write source notes for HRM building outlines, the HRM 1 m LiDAR ground and surface models, and the provincial LiDAR point cloud. Check each licence.  
\- Compute each building's height from the surface model minus the ground model inside its outline.  
\- Produce simple extruded buildings with height, ground elevation and a building id, on terrain from the ground model.  
\- Publish them as 3D Tiles with an open-source tiler of your choice. Record the choice and why.  
\- Keep the building id and source key on every building so a story can colour it later.  
\- Start with downtown Halifax and one suburb, then extend to the municipality.  
\- Check the heights of 10 known buildings against published heights and report the differences.

Done when: Downtown and one suburb load in the browser. The 10 height checks are reported.

Also stop and ask when: A source is not open, or the LiDAR is too old to match current buildings downtown.

## **Stage 1: Live buses**

### **T08 Live adapter and the vehicles endpoint**

Role: API engineer. After: T03, T05.

You are the API engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T08: Live adapter and the vehicles endpoint  
Question served: TRN-Q01  
Depends on: T03, T05

Goal: Serve every bus's position and on-time status within seconds of the feed changing.

Build:  
\- Decode vehicle positions and trip updates with the standard GTFS Realtime bindings.  
\- Join route name, headsign and next stop from the schedule version that is current for the service date.  
\- Take the delay from the trip update for the next stop. When there is none, the status is unknown.  
\- Apply the on-time rule from config/business-rules.yaml.  
\- Keep the latest state in a small cache with its as\_of time.  
\- Serve GET /v1/live/vehicles, the numbers for the answer sentence, GET /v1/sources, and GET /v1/features/asset/{id}, all matching the contract.  
\- Drop any field that could identify a person.  
\- Test by replaying the recorded fixtures.

Done when: It passes the contract test, tests replay recorded feeds, and it responds in under 300 ms.

Also stop and ask when: Trip updates do not carry enough to compute a delay for most buses.

### **T09 Story TRN-Q01 on the 2D map**

Role: Map engineer. After: T06, T07, T08.

You are the Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T09: Story TRN-Q01 on the 2D map  
Question served: TRN-Q01: Where is every bus right now, and is it on time?  
Depends on: T06, T07, T08

Goal: Answer the first question on the map, in one sentence with its numbers.

Build:  
\- Draw the live vehicles with deck.gl over the MapLibre map.  
\- Move each bus smoothly between updates. Never let it jump.  
\- Show status by the base shape and colour, with the legend.  
\- Add the route filter.  
\- Write the answer sentence and the numbers strip from the numbers endpoint, through the formatter.  
\- Refresh on an interval with backoff when the API is slow.

Done when: Every bus in the feed is on the map. The layer stays smooth on a mid-range phone.

Also stop and ask when: The story needs something the contract does not provide.

### **T10 Feature detail, trust footer and stale states**

Role: Map engineer. After: T09.

You are the Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T10: Feature detail, trust footer and stale states  
Question served: TRN-Q01  
Depends on: T09

Goal: Let the user open one bus, and always show how far the data can be trusted.

Build:  
\- Open a card for the selected bus: route and destination, status in words, next stop, data age. Follow wireframes 03 and 06\.  
\- Add Open detail and Follow.  
\- Show the trust footer: source, time of last update, reliability tier, and a link to the sources page.  
\- Show a running data-age clock. Mark the layer stale when the data is older than 2 minutes.  
\- When the source is down, grey out only that layer and show the last good time.

Done when: Cutting the feed in a test greys the layer and shows the last good time. Nothing else changes.

Also stop and ask when: None beyond the standard ones.

### **T11 Verify TRN-Q01**

Role: Verifier. After: T10.

You are the Verifier on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T11: Verify TRN-Q01  
Question served: TRN-Q01  
Depends on: T10

Goal: Check the answer independently, from the raw files, without reading the build's code.

Build:  
\- Work in a fresh session. Do not read the adapter's code.  
\- At three moments, capture the API response and note the matching raw files in Bronze.  
\- Decode those raw files with your own script and apply the on-time rule yourself.  
\- Compare the count of buses and the count in each status with the API and the screen.  
\- Go through the definition of done in the plan, item by item.  
\- Report pass or fail with the evidence. Do not fix anything.

Done when: A pass or fail report against the definition of done.

Also stop and ask when: The raw files for a chosen moment are missing from Bronze.

### **T12 Demo script and learning note for Gate 1**

Role: Lead. After: T11.

You are the Lead on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T12: Demo script and learning note for Gate 1  
Question served: TRN-Q01  
Depends on: T11

Goal: Let the architect run the Gate 1 demo alone and understand what was built.

Build:  
\- Write a step-by-step demo for a phone: open the link, find the story, read the answer, open a bus, cut the feed.  
\- Write one page on how live data travels from the feed to the screen, with the file and function names.  
\- List three exercises the architect can do by hand, for example decoding one raw file in a notebook.

Done when: The architect can run the demo alone on a phone.

Also stop and ask when: None beyond the standard ones.

### **T29 Realistic 3D view**

Role: Map engineer. After: T09, T27, T28.

You are the Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T29: Realistic 3D view  
Question served: TRN-Q01 in 3D  
Depends on: T09, T27, T28

Goal: Show the city in realistic 3D, with live buses in it, without depending on Google.

Build:  
\- Use the engine and settings the architect chose after T27.  
\- Draw Google Photorealistic 3D Tiles from above. Hold a camera floor at the handover height.  
\- Below that height, cross over to the twin's own model from T28.  
\- Place the live buses in the scene, using the pins from T30 when they exist.  
\- Display Google's logo and data credits exactly as its policy requires.  
\- Count sessions and stop loading Google tiles before the free 1,000 a month is used up. Fall back to the twin's own model.  
\- With no Google key, show the twin's own model. On a weak device, start in 2D and offer 3D.  
\- Turn off fly-through animation when the device asks for reduced motion.  
\- Never store or cache Google tiles, and never derive data from them.

Done when: Flying over downtown stays smooth on the test phone. Removing the Google key still leaves a working 3D city.

Also stop and ask when: The architect has not yet chosen an engine.

### **T30 Pin pipeline**

Role: Map engineer. After: T27.

You are the Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T30: Pin pipeline  
Question served: Foundation for all pins  
Depends on: T27

Goal: Turn one Blender file per pin family into everything the map needs, the same way every time.

Build:  
\- Write docs/pins.md for the Blender artist: build in metres, origin on the ground at the centre, one fixed forward direction, naming, materials, and the size budgets from the plan.  
\- Write an export script that runs Blender from the command line and produces the near and middle models as compressed GLB and the far level as a flat image.  
\- Write a check that fails when a file is over its budget.  
\- Create assets/pins/pins.json, the register that maps each kind of thing to its pin files.  
\- Draw the status base in the application, not in the model, so one model serves every status.  
\- The bus is the first family. If no Blender model has been provided, make a plain placeholder and say so clearly.

Done when: The bus pin shows at all three levels in 3D and as a flat image in 2D, inside the budget, with its status base.

Also stop and ask when: The chosen engine cannot load the compressed format.

## **Stage 2: First history**

### **T13 DuckDB over Bronze**

Role: Data engineer. After: T04.

You are the Data engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T13: DuckDB over Bronze  
Question served: All history questions  
Depends on: T04

Goal: Make the archive queryable on a laptop before any platform exists.

Build:  
\- Decode the archive into Parquet tables for vehicle positions, stop-time updates and alerts, partitioned by date.  
\- Keep the source's own field names and add the load metadata. Do not invent model names.  
\- Rebuild everything with one command.  
\- Reconcile row counts against the manifests.  
\- Describe it in docs/learning/T13.md as a prototype of Silver.

Done when: One command rebuilds the tables. Row counts reconcile with the raw files.

Also stop and ask when: None beyond the standard ones.

### **T14 Story TRN-Q07**

Role: Data engineer, Map engineer. After: T06, T13.

You are the Data engineer, Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T14: Story TRN-Q07  
Question served: TRN-Q07: Which neighbourhoods are more than a 5-minute walk from frequent service?  
Depends on: T06, T13

Goal: Answer the first analytics question while history builds up.

Build:  
\- Find and document an open source of neighbourhood boundaries.  
\- From the schedule, find the stops with frequent service under the rule in config/business-rules.yaml.  
\- Draw the area within the walking distance of those stops, and the neighbourhoods outside it.  
\- Compute the answer sentence. Use only measures the data supports.  
\- Serve the layer and numbers as files through GET /v1/layers and GET /v1/numbers.  
\- Have the verifier check the result independently.

Done when: The story is live from files and passes verification.

Also stop and ask when: The architect has not confirmed the two rules and the interim defaults would mislead.

### **T15 Platform test**

Role: Data engineer. After: T04.

You are the Data engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T15: Platform test  
Question served: Foundation for Gold  
Depends on: T04

Goal: Find out, cheaply, whether the recommended platform can read the archive.

Build:  
\- Load one day of Bronze into Databricks Free Edition and query it.  
\- Record how the files got in: direct read from storage, or upload.  
\- Record the limits you hit.  
\- Write docs/decisions/data-platform.md with the result and a recommendation.  
\- Do not start the Microsoft Fabric trial. That is the architect's decision, because the 60 days start at once.

Done when: A written result: it works, or why not and what the fallback is.

Also stop and ask when: The platform asks for payment details.

### **T16 Bronze to Silver to Gold for transit**

Role: Data engineer, with the architect. After: T15 and the physical model.

You are the Data engineer, with the architect on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T16: Bronze to Silver to Gold for transit  
Question served: Wave C questions  
Depends on: T15 and the physical model

Goal: Implement the architect's physical model for transit, exactly as modelled.

Build:  
\- Use the entity, column and key names from the physical model and the source-to-target mapping. Invent none.  
\- Keep history where the model says to.  
\- Add data quality checks at each layer.  
\- Reconcile Gold against the T13 tables for one sample week.  
\- The architect builds the first pipeline by hand. Your part is to pair, review and then extend.

Done when: Gold tables reconcile with T13 on a sample week.

Also stop and ask when: The physical model or the mapping is missing something you need.

### **T17 Serving-file publisher**

Role: API engineer. After: T16.

You are the API engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T17: Serving-file publisher  
Question served: Wave C questions  
Depends on: T16

Goal: Carry results from Gold to the map without the map ever querying the warehouse.

Build:  
\- On a schedule, write Gold results to storage as small files: JSON for numbers, GeoJSON or PMTiles for layers.  
\- Write a manifest beside them with as\_of, source and reliability tier.  
\- Serve the files through the API with sensible cache headers.

Done when: A change in Gold reaches the map with no code change.

Also stop and ask when: None beyond the standard ones.

### **T18 Stories TRN-Q02, Q05, Q04, Q03, Q11**

Role: Map engineer, Verifier. After: T17.

You are the Map engineer, Verifier on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T18: Stories TRN-Q02, Q05, Q04, Q03, Q11  
Question served: TRN-Q02, TRN-Q05, TRN-Q04, TRN-Q03, TRN-Q11  
Depends on: T17

Goal: Answer the history questions one at a time, each finished before the next starts.

Build:  
\- Before each story, write its definition in one paragraph and get the architect's agreement. For example, what counts as a trip that never ran.  
\- Add the story file, its numbers, its layer and its chart.  
\- Have the verifier recompute the answer from the T13 tables.  
\- Start the next story only when this one meets the definition of done.

Done when: Each story meets the definition of done. The first one passes Gate 2\.

Also stop and ask when: A definition is not agreed.

### **T19 Replay lens**

Role: Map engineer, API engineer. After: T17.

You are the Map engineer, API engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T19: Replay lens  
Question served: TRN-Q02, TRN-Q03  
Depends on: T17

Goal: Play back any past window on the map.

Build:  
\- Propose the contract change for reading past positions and wait for approval.  
\- Publish archived positions as files by hour.  
\- Add the time control: pick a window, play, pause, change speed.

Done when: Yesterday's evening rush plays back on a phone.

Also stop and ask when: The contract change is not approved.

## **Stage 3: Three sectors**

### **T20 Source notes for wave D**

Role: Source scout. After: Gate 2\.

You are the Source scout on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T20: Source notes for wave D  
Question served: TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29, HRE-Q01  
Depends on: Gate 2

Goal: Establish the facts about each new source before any collector is written.

Build:  
\- Write one note each for road closures, street and utility work, parks and tree canopy, building permits and property assessment.  
\- For each: address, format, refresh rate, fields, licence and attribution.  
\- Check each licence separately. Assessment data may not be under the HRM licence.

Done when: One note per source. Any source that is not open is flagged to the architect.

Also stop and ask when: A source needs an agreement or a fee.

### **T21 Collectors for wave D**

Role: Collector engineer. After: T20.

You are the Collector engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T21: Collectors for wave D  
Question served: Wave D questions  
Depends on: T20

Goal: Land each new source in Bronze, independently of the others.

Build:  
\- Write one collector per source, each its own package.  
\- Save raw records unchanged with source and load time.  
\- Add each to the gap report and the alerts.

Done when: Each lands raw data in Bronze. Stopping one affects no other.

Also stop and ask when: None beyond the standard ones.

### **T22 City view**

Role: Map engineer. After: T21.

You are the Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T22: City view  
Question served: The city as a whole  
Depends on: T21

Goal: Show every sector on one map, drawn from what the data says it is.

Build:  
\- Build the City view: pinned sectors, the All sectors browser, and one event feed.  
\- Draw features with one generic renderer driven by kind and sector\_id.  
\- Read sectors and groups from config/sectors.json.

Done when: A new sector's features draw with no new map code.

Also stop and ask when: None beyond the standard ones.

### **T23 Stories TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29, HRE-Q01**

Role: Data engineer, Map engineer, Verifier. After: T22.

You are the Data engineer, Map engineer, Verifier on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T23: Stories TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29, HRE-Q01  
Question served: TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29, HRE-Q01  
Depends on: T22

Goal: Bring the second and third sectors to life, one story at a time.

Build:  
\- Agree each story's definition with the architect first.  
\- Build, verify and finish one before starting the next.

Done when: Each meets the definition of done. Three sectors are live.

Also stop and ask when: A definition is not agreed.

## **Stage 4: City as a whole**

### **T24 Cross-sector stories**

Role: Data engineer, Map engineer, Verifier. After: Gate 3\.

You are the Data engineer, Map engineer, Verifier on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T24: Cross-sector stories  
Question served: TRN-Q09, PWK-Q16, HRE-Q07, TRN-Q08  
Depends on: Gate 3

Goal: Answer questions that need more than one sector.

Build:  
\- Agree each definition with the architect first.  
\- Join sectors on shared places and times in Gold, not in the browser.  
\- Build, verify and finish one before starting the next.

Done when: One is accepted by the architect.

Also stop and ask when: A definition is not agreed.

### **T25 Panel host and the first Power BI report**

Role: Map engineer; the architect builds the report. After: T24.

You are the Map engineer; the architect builds the report on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T25: Panel host and the first Power BI report  
Question served: TRN-Q02  
Depends on: T24

Goal: Show a report from another tool inside the map, filtered to what was clicked.

Build:  
\- Build the panel host: a registered panel opens inside a story or a feature's detail.  
\- Level 1: show the published report.  
\- Level 2: open it filtered to the clicked route.  
\- The report reads Gold. A report that computes its own version of a number is not accepted.

Done when: Clicking a route opens the report filtered to that route.

Also stop and ask when: The report cannot be filtered from its address.

### **T26 Data on buildings**

Role: Map engineer. After: T23, T28.

You are the Map engineer on the Halifax Digital Twin map application.  
Follow the standard rules in AGENTS.md.

Card T26: Data on buildings  
Question served: HRE-Q29 or HRE-Q01  
Depends on: T23, T28

Goal: Show a housing answer on the buildings themselves.

Build:  
\- Colour and raise the twin's own buildings by a story's numbers, such as assessed value or permits.  
\- Add the legend and the plain-number alternative in the panel.

Done when: One housing story shows its answer on the buildings themselves.

Also stop and ask when: None beyond the standard ones.