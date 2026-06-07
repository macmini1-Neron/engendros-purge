# notes — 02 napínací kolo / IDLER (направляющее колесо), uzel IdlerL

## Rozměry (každý SE ZDROJEM — žádná halucinace)
| Rozměr | Hodnota | Zdroj | Conf |
|---|---|---|---|
| Obruč vnější Ø (běhoun) | ~0.54 m (R 0.27) | blueprint side `t62_side-top_clean_1265.jpg`: idler ≈ 0.65× kolo Ø0.81 | M |
| Šířka přes obě poloviny | ~0.25 m | odvozeno z pásu (šířka 0.58, vodící zuby uprostřed) ~ jako kolo | M |
| Středová mezera (vodící zuby) | ~0.044 m (2×GAP_H) | analogie pojezdového kola + MiniArt (vidět štěrbina) | M |
| Počet paprsků/oken | 12 `?` | MiniArt 37060 + blueprint: vypadá 10–12 — POTVRDIT head-on | L |
| Kupole náboje Ø | ~0.14 m | MiniArt (prominentní kulový náboj), analogie kola | M |
| Materiál obruče | KOV (bez gumy) | 1968 katalog: „Литые, с металлическими ободами" (vs kola „с резиновыми шинами") | H |

## Reference (v ../../ref/, ne kopírováno — sdílím s ostatními koly)
- `ref/blueprints/t62_side-top_clean_1265.jpg` — silueta + velikost idleru vs kolo (přední kolo)
- MiniArt **37060 T-62 wheels set** (Tomášův screenshot) — 3D odlitek idleru: spider/pinwheel,
  kulový náboj + věnec šroubů, zakřivené paprsky, vroubkovaný kovový obruč, dvojité
- `ref/manuals/t62_manual_1968_OCR_TEXT.txt:1403` „Направляющие колеса" + `:1458` „Литые, с металлическими ободами"
- `ref/manuals/t62-skorobogatov-2017-RU.txt:1920` rozpad idleru s mech. napínání (kривошип/броневой колпак)
- `ref/manuals/t62-operators-manual-US-MI-EN.txt` FIG 2-34 / 4-14 IDLER WHEEL
- reálné fotky `ref/walkaround/t-62_004/005/006.jpg` — přední idler vždy zakrytý pásem + stínem (špatně čitelný)

## Tvar / poznámky (faceting plán)
- DVOJITÉ kolo: 2 spider-disky (out/in) + spojovací barel; klokování vnitřního o půl rozteče.
- Každý disk = OBRUČ (tube) + N=12 ZAKŘIVENÝCH paprsků (swept, helper `swept_spoke`, sweep 16°) +
  NÁBOJ (flange + kulový dome + 12 šroubů) + 12 šroubů na obruči.
- Žádný plný web — mezi paprsky OKNA (průchozí), jako reálný odlitek.
- SEG=28 (jako kolo). Materiál = sdílený `wheel_atlas` (planar-X UV, F=0.34 → náboj green, obruč/paprsky olive,
  ŽÁDNÁ gumová zóna se neukáže).

## Nejistoty (`?` — potvrdit s Tomášem v loopu)
- **Počet paprsků** (12 vs 10/11/14) — head-on render proti MiniArt.
- **Sweep směr** obou disků (stejný vs zrcadlený) + míra zakřivení.
- **Přesný průměr** (0.54 m z blueprintu — doladit poměrem ke kolu).
- Šrouby na obruči — zda jsou, kolik, a jak velké.

## Odchylky od reálu (a proč)
- Mechanismus napínání (кривошип, броневой колпак, козырёк, червяky) = NENÍ součást kola →
  patří do dílu HULL (přední kronštejn). Tady jen samotné kolo (rig uzel IdlerL).
- Low-poly: paprsek = rovný šikmý slab (ne plynulá křivka) — pinwheel dojem při nízkém polycountu.
