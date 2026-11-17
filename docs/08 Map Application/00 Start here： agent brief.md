# **Start here: agent brief**

This is the first document an agent reads before working on the Halifax Digital Twin map application. Everything it points to is in the same Drive folder: [08 Map Application](https://drive.google.com/drive/folders/19Ip8jbreU-RfPg5cs6jcjYc6vptOe_AQ).

## **What is being built**

One web map of Halifax that answers one registered business question at a time, on phone and laptop. The first question is TRN-Q01: Where is every bus right now, and is it on time? Each answered question is a story: the question, a one-sentence answer with its number, the map layers that prove it, context, and where the data came from.

The city is shown in realistic 3D: Google Photorealistic 3D Tiles from above, and the project's own open-data 3D model up close and as the fallback. A 2D map always works.

The map reads only a small serving API. Behind it, data comes first from the live feed and later from the Gold tables, with no change to the map.

## **Read in this order**

1. This brief.

2. [Map Application Plan V1](https://docs.google.com/document/d/13UBh3vM42Ky0p54qcP3HjdFZTR8PMiADtb1MkmFlOwM/edit). Read Summary, Architecture, The realistic 3D view, Interface rules and Agents and tasks first.

3. The wireframes: Wireframes/halifax-twin-wireframes.pdf and the six images beside it.

4. Agent task cards T01 to T30, in this folder.

5. For background: [Project Charter V1](https://docs.google.com/document/d/1XowLb9O2JuxJ3-cO5yi6S0cFWsZV9jtJNfaTWLcJ6Bc/edit), the [Business Questions register](https://docs.google.com/spreadsheets/d/1Zl0xTYPy1RzQD5fEkgHTlOl7AjKQeiY0YGt6puWCB1I/edit) and the [Domain Mapping](https://docs.google.com/spreadsheets/d/1u9ompZL5ZxIAROX2DkJC5EC1LA5vEcYDzFTdkt0Tii0/edit).

The logical model is still being finished by the architect. Do not invent entity or column names; ask.

## **What the architect provides before work starts**

| Needed | For | Card |
| :---- | :---- | :---- |
| An empty GitHub repository the agent can write to | All work | T01 |
| An Azure subscription with a US\$5 budget alert | Collector, API and hosting | T04, T06 |
| A Google Maps Platform key with the Map Tiles API on, limited to the project's addresses, with a daily cap | 3D engine test and 3D view | T27, T29 |
| A Blender model of a bus, or permission to use a placeholder | Pins | T30 |
| The physical model and source-to-target mapping for transit | Gold | T16 |

Keys are never pasted into a chat, a document or the repository. They go into GitHub secrets and cloud app settings.

## **Interim defaults**

Some decisions belong to the architect and are not yet made. So that work is not blocked, use these values, keep them in settings and never in code, and label them as not yet decided.

| Decision | Interim default | Where it lives |
| :---- | :---- | :---- |
| On-time rule | On time from 60 s early to 300 s late | config/business-rules.yaml |
| Frequent service (TRN-Q07) | A bus every 15 min or better, weekdays 07:00 to 19:00 | config/business-rules.yaml |
| Five-minute walk (TRN-Q07) | 400 m in a straight line | config/business-rules.yaml |
| Raw data retention | Keep everything | Collector settings |
| Stop key shown on the map | Store both the HRM stop number and the GTFS stop\_id; show the HRM stop number | API adapter |
| Clock format | 24-hour, Halifax time | Formatter |
| Sector groups | The five groups in the wireframes | config/sectors.json |
| Data platform | DuckDB over Bronze until card T15 reports | Not applicable |

## **Repository layout**

apps/web/            React, TypeScript, Vite; the installable map application  
services/collector/  Python; one package per source  
services/api/        Python; the serving API and its adapters  
data/                DuckDB SQL over Bronze  
assets/pins/         Blender sources, exported models, flat images, pins.json  
config/              business-rules.yaml, sectors.json, stories  
docs/                plan.md, contract, sources, decisions, runbooks, learning, wireframes, diagrams  
AGENTS.md            the rules below

## **Rules**

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

## **First prompt**

Paste this to the first agent, with access to this Drive folder and the empty repository.

You are the Lead agent for the Halifax Digital Twin map application.

Read, in this order, from the Drive folder 08 Map Application:  
1\. 00 Start here: agent brief  
2\. Halifax Digital Twin \- Map Application Plan V1  
3\. Wireframes/halifax-twin-wireframes.pdf  
4\. Agent task cards T01 to T30

Then do card T01 exactly as written. Copy plan.md, AGENTS.md,  
task-cards.md and the images from the Repository files and Wireframes  
folders into the repository.

When T01 is merged, start three lines of work side by side:  
T02 then T03 then T04; T05 then T06 then T07; and T27 with T28.  
The collector line comes first if you can only run one, because  
history that is not archived cannot be rebuilt.

Follow the rules in the brief. Use the interim defaults and mark  
them as not yet decided. Stop and ask me, the architect, when the  
brief says to. End each session with a session report: what is done,  
the evidence, what is blocked, and your questions for me.

## **Gates**

| Gate | Evidence the architect checks |
| :---- | :---- |
| 0 | 48 hours archived with no gap over 2 minutes; contract approved; shell opens on the phone |
| 1 | The live answer matches the raw feed at three sampled moments; definition of done met |
| 2 | One story served from Gold end to end; its numbers match a DuckDB check |
| 3 | Three sectors live in City view; a failed source greys out only its own layer |
| 4 | One cross-sector story and one embedded BI panel accepted |

