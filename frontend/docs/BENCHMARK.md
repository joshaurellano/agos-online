# AGOS benchmark: what similar flood apps do, and what we borrowed

| System | What it does well | What AGOS took from it |
|---|---|---|
| **UP NOAH / Project NOAH** (PH) - noah.up.edu.ph, Arko app | Type or pin a location, see flood / storm surge / landslide hazard around it; pin can be dragged and risk updates. Barangay-level hazard maps. | "Your Place" pin you can drag; hazard zone lookup at the pin using the 25-yr rainfall hazard map. |
| **HazardHunterPH** (PHIVOLCS / GeoRiskPH) | Double-tap a spot, get a plain-language hazard assessment report with recommendations, plus nearest critical facilities. Printable. | One-glance per-spot result with recommendations and nearest evacuation center. (Printable report is a next step.) |
| **Google Flood Hub** | Forecasts up to 7 days ahead, alerts surfaced where people already look (Search, Maps, Android notifications). Explicit "guidance, defer to official sources" framing. | Outlook line from the 14-day forecast; "guidance only, not an official warning" wording. (Push/Web Push is a next step.) |
| **GOV.UK Check for flooding** (England) | Separates long-term risk from today's risk, 5-day outlook in plain sentences, three named levels with action verbs (Prepare / Act / Survive). | Plain-language headline per level and a short action list per level; long-term zone shown next to live alert. |
| **Japan JMA Kikikuru + 5 alert levels** | Colour-coded 1-5 scale tied to what to do; guidance to evacuate by level 4, not wait for level 5; leaflets in many languages. | Personal tier shifts with local hazard; "leave now, do not wait for water to rise" copy; Filipino and Bikol strings. |

## Personal tier rule (src/lib/personalRisk.js)
Community alert from the model, adjusted by hazard class at the pin:
high zone +1 tier (only from WARNING up), medium +0, low or unmapped -1. NORMAL always stays NORMAL.
It is a transparent rule table, not a second ML model. Have CDRRMO review the offsets.

## Sources
- https://www.dost.gov.ph/index.php/knowledge-resources/news/44-2015-news/876-dost-s
- https://www.spaceclimateobservatory.org/noah
- https://hazardhunter.georisk.gov.ph/faqs
- https://www.phivolcs.dost.gov.ph/hazard-hunting-made-easier-with-hazardhunterph-mobile/
- https://sites.research.google/floodforecasting
- https://check-for-flooding.service.gov.uk
- https://www.newark-sherwooddc.gov.uk/flooding/ (UK warning level meanings)
- https://www.jma-net.go.jp/nagasaki-c/kikikuru/kikikuru.html
- https://www.preventionweb.net/news/japan-weather-alert-names-unified-flooding-heavy-rain-landslides-storm-surges

## Next ideas from the same benchmark
1. Web Push / SMS opt-in tied to the saved place (Flood Hub, GOV.UK warning sign-up).
2. Printable one-page "hazard + evacuation plan" per place (HazardHunterPH report).
3. Surface-water/flash-flood framing separate from river flooding (GOV.UK, Flood Hub 2026).
4. Inundation history layer: past flood extents from resident reports (Flood Hub).
5. Offline cache of last forecast + evacuation map (service worker).
