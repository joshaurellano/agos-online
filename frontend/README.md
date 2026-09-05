# 🌊 AGOS — Flood Early Warning System
### Capstone Prototype | Barangay Triangulo, Naga City

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run development server
npm run dev

# 3. Open in browser
# http://localhost:5173
```

## Demo Login Accounts

| Username | Password | Role |
|---|---|---|
| `barangay_captain` | `agos2024` | Barangay Official |
| `bgy_secretary` | `agos2024` | Barangay Secretary |
| `drrm_officer` | `agos2024` | DRRM Team |

---

## Features

- ✅ **Dashboard** — Alert level, live water gauge (auto-updates every 5s), weather forecast, one-click evacuation button
- ✅ **Real-Time Water Level** — Chart + table view, visual gauge, color-coded thresholds
- ✅ **Rainfall Accumulation** — Hourly/daily charts and tables from PAGASA
- ✅ **Flood Zone Map** — SVG map of Barangay Triangulo with Zone 1–4 risk levels
- ✅ **Historical Flood Events** — Timeline of past typhoons affecting the barangay
- ✅ **Alert Notification Log** — Send/view/filter alerts; exportable log (SOP #6)
- ✅ **Data Sources Panel** — Live status of PAGASA, DOST-ASTI, OCD Region V, LGU

## Research Question Mapping

| RQ | Component |
|---|---|
| RQ1 & RQ2 — Current limitations | Historical Events, Data Sources Panel |
| RQ3 — Functional requirements | Water Level Gauge, Rainfall Chart, Alert Levels |
| RQ5 — Non-technical visualization | Flood Zone Map, Plain-language status, Evacuation button |
| RQ6 — Usability | Mobile-responsive layout, Notification Log |

## Tech Stack

- **React 18** + **Vite** — Frontend framework
- **Recharts** — Charts (water level, rainfall)
- **SweetAlert2** — Evacuation/alert modals
- **DM Sans + Syne** — Typography
- **Simulated Data** — PAGASA/DOST-ASTI data emulated for prototype

## Notes

> This is a **capstone prototype** using simulated data. PAGASA covers regional stations; a deployed local IoT sensor node would be required for hyper-local real-time accuracy (per Assumption 1 of the study).

---

*AGOS v1.0 — Capstone Prototype · Bicol Region, Philippines*
