# The public site runs on Cloudflare, with the API on the build machine

- Date: 25 Nov 2026
- Decided by: Emmanuel (project owner)
- Status: decided

## Context

The 16 Nov decision kept the web app local and left a public host open. The owner now wants a public address
anyone can open: hfxtwin.profine.ca. The domain profine.ca is already managed in Cloudflare. The rule is still to
spend nothing.

## Decision

- The web app is built as static files and served by Cloudflare Pages (free) at https://hfxtwin.profine.ca.
  `scripts/deploy-public-site.ps1` builds and uploads it. The basemap (halifax.pmtiles, 15.2 MB) goes with it.
- The serving API keeps running on the build machine. A second copy on 127.0.0.1:8020 is reached from the internet
  only through a Cloudflare Tunnel (free) at https://hfxtwin-api.profine.ca: no router port is opened.
  `scripts/start-public-api.ps1` starts both; `scripts/stop-public-api.ps1` takes the data offline.
- Cloudflare shares API answers at its edge for a few seconds (`s-maxage`), so many visitors make few requests here.
- The site opens in 2D. 3D is offered on request, with a separate Cesium ion token restricted in ion to the public
  address. The API hands it out only when someone opens 3D, at most 30 times a Halifax day (`HALIFAX_TWIN_3D_DAILY_LIMIT`),
  which keeps a month under the free plan's Google tile allowance. After that, 3D says it comes back tomorrow.
- The local token is never offered through the tunnel: the API treats any request with proxy headers as not local,
  and the public copy is started without the local token at all.

## Why

Free, no new account beyond Cloudflare, which already holds the domain. Static files from Cloudflare's edge stay
fast for any number of visitors; the API on the build machine is protected by edge caching and the daily 3D limit.

## Replaces

The 16 Nov decision's "the web app runs locally only". Local running is unchanged.

## Consequences

- The public data is live only while the build machine, the database, the collector and the tunnel are running.
- Cesium ion's Community plan is for non-commercial use; a commercial launch needs a paid plan or another 3D source.
- Moving the API off the build machine (for example, static snapshots on the edge) is the next step if traffic grows.
