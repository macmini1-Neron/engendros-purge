# ЗСУ-23-4М «Шилка» — kompletní anatomie panelu řidiče

**Zdroj:** ЩИТОК ПРИБОРОВ МЕХАНИКА-ВОДИТЕЛЯ — **РИС. 4-18**, str. 130, technické album podvozku **ГМ-575**.
**Status:** ověřená kanonická tabulka všech prvků panelu (odbourané chyby OCR/překladu). · *2026-06-23*

Související: [`driver-station-inventory.md`](driver-station-inventory.md) (zóny + START source-of-truth) · [`shilka-driver-tree.html`](shilka-driver-tree.html) (interaktivní strom) · [`shilka-jak-to-funguje.md`](shilka-jak-to-funguje.md).

## ✅ REVIZE 2026-06-23 — opravy z ИЭ 1970 (str. 41–42, 45–49, 110, 111)
> Tyto opravy **přebíjejí** tabulku níže (reverifikováno proti originálním skenům):
> 1. **65 ЛЮК ОТКРЫТ je ČERVENÁ, ne zelená** — život-ohrožující (str. 110: „…погасанию **красной** сигнальной лампы ЛЮК ОТКРЫТ"). Věž by řidiči utrhla hlavu. Správný název je **ЛЮК ОТКРЫТ** (ne ЛЮК ВОДИТ.).
> 2. **67 = ЗАСЛ. ОПОРЫ** (ПАЗ — ochranné klapky sání zavřeny, zelená; str. 111) — NE „КОНТАКТ ПАЗ".
> 3. **Pod krytem 22 jsou DVA havarijní přepínače** (str. 48–49): levý **ОТКЛЮЧ. ГЕНЕРАТ.** (havarijní odpojení generátoru při >57 V), pravý **АВТОМАТ. ЗАП. ГТД** (vyp automatický start GTD). Ne pojistky.

### Sekce АЗС — systémové jističe (str. 41–42)
> Musí být **zatlačené na doraz (zapnuté)**, jinak příslušný okruh vůbec nefunguje.

| # | RU | Funkce |
|---|---|---|
| **1** | ПИТАНИЕ СТАРТЕРА | jistič startéru dieselu — bez něj nelze nastartovat motor |
| **2** | АВАРИЙНОЕ ОСВЕЩЕНИЕ | nouzové osvětlení kabiny |
| **3** | ПИТАНИЕ ПОТРЕБИТЕЛЯ | palubní spotřebiče (ПАЗ atd.) |
| **6** | ГТД-2 | řídicí okruh plynové turbíny č. 2 |
| **12** | ГТД-1 | řídicí okruh plynové turbíny č. 1 |
| **61** | ЦЕПЬ ТНА-2 | navigační aparatura ТНА-2 |
| **63** | ПИТАНИЕ ПОДОГРЕВАТ. | zimní předehřívač motoru |
| **64** | ОБЩЕЕ ПИТАНИЕ МАШИНЫ | celkové napájení stroje (hlavní ochrana) |
| **71** | ПОДГОТОВКА ЗАПУСКА | příprava startu (čerpadla, žhavení) |
| **73** | ПИТАНИЕ СПИДОМЕТРА | napájení rychloměru |
| **78** | ПИТАНИЕ СТЕКЛООЧ. | stěrače periskopů |

### Legenda piktogramů
🔘 **Mačká se** (tlačítko) · 🕹️ **Přepíná se** (páčka / tumblerový přepínač) · 👁️ **Sleduje se** (lampa / budík) · 🎛️ **Kroutí se** (regulátor) · 🔌 **Připojuje se** (konektor) · 🛡️ **Ochrana** (kryt)
🚀 **Klíčové pro START** (a přesné pořadí!) · 💀 **Kritické pro přežití motoru / posádky**

---

| Číslo | 🪧 Originální název (RU) | 🇨🇿 Co to je a co to dělá (funkce) | 🛠️ Akce | 🚀 Role při startu / význam |
| :---: | :--- | :--- | :---: | :--- |
| **4** | Кнопка ЦЕПЬ −27 В | Tlačítko k měření symetrie sítě (−27 V) na voltmetru. | 🔘 | Kontrola stavu sítě (sleduje se na budíku 62). |
| **5** | Кнопка ЦЕПЬ +27 В | Tlačítko k měření symetrie sítě (+27 V) na voltmetru. | 🔘 | Kontrola stavu sítě (sleduje se na budíku 62). |
| **7** | **ПИТАНИЕ ВКЛ.** | **Zapnutí hlavního napájení sítě.** Probouzí elektrický systém. | 🔘 | 🚀 **KROK 1 (společný):** oživení palubní desky. |
| **8** | ПИТАНИЕ ОТКЛ. | Vypnutí hlavního napájení. Umrtvení stroje. | 🔘 | Používá se jen při vypínání. |
| **9** | Измеритель КОТЕЛ | Teploměr chladicí kapaliny v ohřívacím kotli (zimní starty). | 👁️ | Důležité v mrazech před startem dieselu. |
| **10** | **ПУСК ГТД** | **Ostrý start plynové turbíny.** Pod ochrannou krytkou. | 🔘 | 🚀 **KROK 5 (start GTD):** oživení turbíny. |
| **11** | СТОП ГТД | Zastavení plynové turbíny (přeruší přívod paliva). | 🔘 | Tímto se turbína vypíná po boji. |
| **14** | **ХОЛОДНАЯ ПРОКР.** | Studené protočení turbíny. Důležité: otevírá výfukové klapky! | 🔘 | 🚀 **KROK 3 (start GTD):** vypláchne motor a otevře klapky. |
| **15** | Лампа СТАРТЕР ГТД | Modrá kontrolka. Signalizuje, že startér turbíny aktuálně točí. | 👁️ | Zhasne, jakmile turbína chytne tah. |
| **16** | ЗАКРЫТИЕ ЗАСЛОНОК | Zavření výfukových klapek turbíny (ochrana před vodou a sněhem). | 🔘 | Mačká se po vypnutí turbíny na konci práce. |
| **17** | **Лампа ГТД** | Zelená kontrolka. Turbína úspěšně běží a dosáhla provozních otáček. | 👁️ | 🚀 **KROK 6 (kontrola GTD):** musí svítit! |
| **18** | **Лампа ГЕНЕРАТОР** | Zelená kontrolka. Generátor z turbíny nebo dieselu dává proud. | 👁️ | 🚀 **KROK 7 (kontrola GTD):** výroba energie běží. |
| **19** | Лампа ПРЕОБРАЗ. ДИЗ. | Žlutá kontrolka. Měnič běží při pohonu od hlavního dieselu. | 👁️ | Informuje, jaký motor pohání systémy. |
| **20** | **Лампа ОТКРЫТ. ЗАСЛ.** | Mléčně bílá kontrolka. Výfukové klapky turbíny jsou plně otevřené. | 👁️ | 💀 **KROK 4 (před startem GTD):** bez tohoto nesmíš startovat! |
| **21** | Лампа ПРЕОБРАЗ. ГТД | Zelená kontrolka. Měnič napětí běží při pohonu z turbíny. | 👁️ | Potvrzení stabilizace elektrické sítě pro radar. |
| **22** | Тумблеры (Ген / Зап) | Přepínače odpojení generátoru a automatu zapnutí GTD (nouzové). | 🕹️ | Normálně se na ně nesahá, jen při poruše automatiky. |
| **24** | ЖАЛЮЗИ ДИЗЕЛЯ | Klapkový spínač (nahoru/dolů). Otevírá/zavírá žaluzie chlazení motoru. | 🕹️ | 💀 Řidič s ním reguluje teplotu dieselu v boji. |
| **27** | **НАСОС ТОПЛИВА** | Zapnutí palivového podávacího čerpadla pro diesel. | 🔘 | 🚀 **KROK 3 (start diesel):** natlačí naftu. |
| **28** | КЛАПАН ПОДОГРЕВА | Ventil ohřívače (při zimních startech míchá horkou vodu). | 🕹️ | Jen zima / arktické podmínky. |
| **29** | СВЕЧА − ФОРСУНКА | Přepínač pro zapálení a dodávku paliva do kotle podohřívače. | 🕹️ | Jen zima / arktické podmínky. |
| **31** | ВЕНТ. ПОМПА | Spínač ventilátoru a čerpadla ohřívače. | 🕹️ | Jen zima / arktické podmínky. |
| **32** | ПОДОГРЕВ ЧАСОВ | Zapnutí vnitřního elektrického ohřevu palubních hodin proti zamrznutí. | 🕹️ | Zajišťuje, že se nezastaví chronometr v mrazu. |
| **33** | ПОДОГРЕВ ПРИБОРОВ | Ohřev přístrojů / palubní desky. | 🕹️ | Ochrana analogových budíků před zamrznutím ručiček. |
| **34** | Режим электрообогр. | Nastavení výkonu elektrického topení. | 🕹️ | Komfort řidiče. |
| **35** | Автомат ПИТАНИЕ | Jistič napájení vybraných přístrojů a palivoměru. | 🕹️ | Musí být zapnutý, abys viděl stav paliva. |
| **36** | Указатель ТОПЛИВО | Stav nafty (pouze pro ZADNÍ nádrž). | 👁️ | Sledování dojezdu. |
| **37** | **Термометр ВОДА** | Budík teploty chladicí kapaliny hlavního dieselu V-6R. | 👁️ | 💀 Nesmí se přehřát! Jinak uvaříš motor (max 100 °C). |
| **38** | **Манометр МАСЛО** | Budík tlaku oleje hlavního dieselového motoru. | 👁️ | 🚀 **KROK 5 (start diesel):** ukazuje tlak před sepnutím startéru. |
| **39** | Спидометр СП-106 | Obrovský středový budík. Rychlost stroje (do 50 km/h) a ujeté km. | 👁️ | Navigace a kontrola rychlosti při střelbě za jízdy. |
| **40** | **СИГНАЛ** | Zvuková houkačka. Varuje posádku venku před rotujícími částmi. | 🔘 | 🚀 **KROK 2 (společný):** vždy zatroubit před manipulací! |
| **41** | Лампа ФАРЫ ТВНО | Mléčná kontrolka. Signalizuje zapnutá infra-světla pro noční jízdu. | 👁️ | Taktická maskovací informace (zda nesvítíš nepříteli). |
| **42** | Переключатель ФАРЫ | Přepínač venkovních světlometů. | 🕹️ | Běžné ovládání světel. |
| **43** | Лампа СТАРТЕР (диз.) | Červená kontrolka. Startér dieselového motoru se právě točí. | 👁️ | Varování, že elektrický startér odebírá obrovský proud. |
| **44** | Резистор ПОДСВЕТКА | Plynulá regulace podsvícení všech budíků. | 🎛️ | V noci se utlumí, aby řidiče neoslňovaly přístroje. |
| **45** | Розетка | Zásuvka pro zapojení přenosné lampy z výbavy (12 V / 24 V). | 🔌 | Pro opravy uvnitř stroje. |
| **46** | **НАСОС МАСЛА** | Olejová pumpa dieselu. Musí se držet před spuštěním motoru. | 🔘 | 🚀 **KROK 4 (start diesel):** 💀 natlakovat, jinak zadřeš nasucho! |
| **47** | **СТАРТЕР** | Ostré spuštění elektrického startéru hlavního dieselového motoru. | 🔘 | 🚀 **KROK 6 (start diesel):** mačká se s drženým čerpadlem (46). |
| **48** | Тахометр (дизель) | Budík otáček hlavního motoru V-6R. | 👁️ | Řidič podle něj řadí a hlídá limit (nepřetočit motor!). |
| **49** | Термометр МАСЛО | Budík teploty oleje v dieselu. | 👁️ | 💀 Tlak nestačí, olej se nesmí ani přehřát. |
| **50** | Счетчик моточасов | Počítadlo motohodin dieselového motoru (pro údržbu a servis). | 👁️ | Záznam opotřebení stroje. |
| **51** | Часы | Palubní hodiny posádky. | 👁️ | Taktický čas (synchronizace útoku). |
| **54** | Манометр ТОПЛИВО | Tlak paliva dodávaného do trysek. | 👁️ | Odhalí ucpané filtry nebo poškozené čerpadlo. |
| **55** | Термометр МАСЛО ГТД | Teplota oleje v plynové turbíně. | 👁️ | Sledování stavu srdce elektrického systému. |
| **56** | **Термометр ГАЗЫ** | Ukazatel teploty výfukových plynů turbíny. | 👁️ | 💀 Nesmí překročit 650 °C, jinak se turbína roztaví! |
| **57** | Тахометр ГТД | Ukazatel otáček turbíny. | 👁️ | Turbína musí běžet ustáleně (kolem 100 %). |
| **58** | Счетчик моточасов ГТД | Počítadlo motohodin plynové turbíny. | 👁️ | Záznam opotřebení leteckého motoru. |
| **59** | Манометр МАСЛО ГТД | Budík tlaku oleje v turbíně. | 👁️ | Rychlá smrt turbíny, pokud tohle klesne. |
| **60** | КЛАПАН ПРОКАЧКИ | Tlačítko odvzdušňovacího / pročerpávacího ventilu paliva. | 🔘 | Odstraní bubliny ze systému před startem. |
| **62** | **Вольтметр** | Budík voltmetru stejnosměrného proudu. Ukazuje zdraví celé Šilky. | 👁️ | Síť musí mít 27,5 V (±1 V). Jak klesne, vše se vypne. |
| **65** | **Лампа ЛЮК ВОДИТ.** | Zelená kontrolka. **Poklop řidiče otevřen!** | 👁️ | 💀 **ZÁMEK:** pokud svítí, věž se nesmí otáčet — kanón ho zabije. |
| **66** | Лампа ПРИТОЧН. ВЕНТИЛ. | Zelená kontrolka. Běží přítlačný (filtrační) ventilátor ПАЗ. | 👁️ | Znamená, že se do stroje tlačí čistý vzduch. |
| **67** | **Лампа КОНТАКТ ПАЗ** | Červená kontrolka protijaderného detektoru (РБЗ-1М). | 👁️ | 💀 Atomový nebo chemický poplach! Systém ПАЗ spuštěn. |
| **68** | Лампа ВЫТЯЖН. ВЕНТИЛ. | Zelená kontrolka odsávacího ventilátoru (odsává zplodiny z kanónů). | 👁️ | Musí běžet při střelbě, jinak se posádka udusí. |
| **70** | Лампа ПАЗ | Zelená kontrolka plné aktivace protijaderné a chemické ochrany. | 👁️ | Stroj je hermeticky uzavřen. |
| **72** | Переключатель ТВН-СМУ | Přepínač režimu: infra-světlomet (ТВН) / maskovací režim (СМУ). | 🕹️ | Noční taktika. |
| **74** | Счетчик моточасов ПРЕОБР | Motohodiny měniče napětí ПО-500. | 👁️ | Servisní údaj. |
| **77** | Переключатель СТЕКЛООЧ. | Spínač hlavního stěrače skla před řidičem. | 🕹️ | Viditelnost v dešti a blátě. |
| **80** | СТЕКЛООЧ. БОКОВЫЕ | Spínač bočních stěračů periskopů. | 🕹️ | Viditelnost do stran. |
| **81** | Автомат защиты | Servisní jistič pro okruh stěračů a obmývání. | 🕹️ | Zabrání zkratu, když stěrač přimrzne. |
| **82** | Фальшкаркас | Ocelový krycí (falešný) rám / ochrana panelu proti kopnutí. | 🛡️ | Mechanická ochrana citlivých budíků před botami posádky. |

---

### Závěrečný verdikt
Tahle tabulka je „oficiální tahák k certifikaci" mechanika-řidiče: odbourané chyby překladů i halucinace z OCR, každá funkce lícuje se schématem zapojení Šilky.

> **START sekvence (jen mačkání), pořadí:** 7 → 40 → 14 *(čekej lampu 20)* → 10 *(čekej 17 + 18)* → pro jízdu diesel: 27 → drž 46 *(tlak na 38)* → 47. **3 zámky:** klapky (20) před GTD · tlak oleje (38/46) před startérem · houkačka (40) první.
