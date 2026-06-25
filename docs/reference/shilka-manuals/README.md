# ЗСУ-23-4(М) «Шилка» — primary-source manual library

Original Soviet technical manuals for the ZSU-23-4(M) Shilka, downloaded as the **canonical reference**
for the in-game vehicle (rig, drivetrain, radar/fire-control, crew mechanics). The goal is a faithful,
no-simplification simulator — every mechanic should trace back to these documents.

**Source:** military-references.com → `/books/anti-aircraft/ussr/zsu-23-4-shilka/`
(downloaded 2026-06-21). Scanned PDFs; the OCR text layer is garbled, so they are read **visually**
(page images). Per-manual deep-read extracts live in [`findings/`](findings/).

> Heavy binaries (~187 MB total). `docs/` is stripped from the Vercel deploy (`.vercelignore`), so these
> never ship to players — they are repository reference only.

| # | File | Pages | What it is |
|---|------|------:|------------|
| 01 | `01-rls-device-operation-part1-text.pdf` | 149 | Устройство и эксплуатация, Ч.1 — **РЛС (radar) construction & operation** |
| 02 | `02-troubleshoot-maint-figures.pdf` | 119 | Устранение неполадок и ТО — **troubleshooting & maintenance, figures album** |
| 03 | `03-operation-2a6m-part2-1980.pdf` | 152 | Инструкция по эксплуатации **2А6М (АЗП-23 gun), Ч.2, 1980** |
| 04 | `04-1rl33m-radar-tech-desc-1980.pdf` | 181 | Изделие **1РЛ33М — radar complex technical description, 1980** |
| 05 | `05-gm575-tracked-vehicle-figures.pdf` | 167 | **ГМ-575 chassis, figures album** (drivetrain/suspension) |
| 06 | `06-figures-schematics-part2-gm575-2012.pdf` | 60 | Альбом рисунков и схем, Ч.2 — **ГМ-575 schematics (electrical/hydraulic), 2012** |
| 07 | `07-figures-schematics-part1-azp23m-2011.pdf` | 42 | Альбом рисунков и схем, Ч.1 — **АЗП-23М gun schematics, 2011** |
| 08 | `08-zsu234-tech-description-text.pdf` | 40 | **ЗСУ-23-4 whole-system technical description** (top-level overview) |
| 09 | `09-gm575-parts-catalog-1974.pdf` | 424 | **ГМ-575 catalogue of units & parts, 1974** (exploded assemblies) |
| 10 | `10-zsu23-operation-manual-part1-1970.pdf` | 127 | **ЗСУ-23 crew operation manual, Ч.1, 1970** (procedures) |

**Total: 1461 pages.** The subsystem split across manuals (the system description #08 names ~16 companion
docs) means the same mechanism is often described in pieces — e.g. firing geometry appears in #03/#07/#08,
the power-dependency graph in #04/#06/#08, driving in #05/#06/#09. Findings are cross-linked so the whole
picture can be reassembled.

## Source URLs (for re-download)
Base: `https://www.military-references.com/wp-content/uploads/books/anti-aircraft/ussr/zsu-23-4-shilka/`
- 01 `ЗСУ-23-4М_Устройство_и_Эксплуатация_Часть_1_Устройство РЛС_Текст.pdf`
- 02 `ЗСУ-23-4М_Устранение_неполадок_и_техническое_обслуживание_Альбом_рисунков.pdf`
- 03 `ЗСУ-23-4М_Инструкция_по_эксплуатации_2А6М_Часть_2_1980.pdf`
- 04 `ЗСУ-23-4М_Изделие_1РЛ33М_Техническое_описание_1980.pdf`
- 05 `ЗСУ-23-4М_Гусеничная_машина_ГМ-575_Альбом рисунков.pdf`
- 06 `ЗСУ-23-4М_Альбом_рисунков_и_схем_Часть_2_ГМ-575_2012.pdf`
- 07 `ЗСУ-23-4М_Альбом_рисунков_и_схем_Часть_1_АЗП-23М_2011.pdf`
- 08 `ЗСУ-23-4_Техническое_описание_Текст.pdf`
- 09 `Гусеничная_машина_ГМ-575_Каталог_узлов_и_деталей_1974.pdf`
- 10 `23-мм_счетверенная_зенитная_самоходная_установка_ЗСУ-23_ИЭ_Часть_1_1970.pdf`
