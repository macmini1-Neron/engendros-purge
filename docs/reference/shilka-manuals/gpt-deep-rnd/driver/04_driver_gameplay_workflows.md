# Driver gameplay workflows

Tento soubor popisuje řidiče jako sadu procedur, které se dají převést do misí, tutorialů, multiplayer rolí a QA scénářů.

## Workflow 1 - nástup a příprava stanoviště

Cíl:

- dostat řidiče na místo,
- připravit výhled,
- ověřit panel,
- připravit pohyb a energii.

Kroky:

1. Řidič zaujme místo.
2. Nastaví sedadlo a výhled.
3. Zkontroluje poklop a jeho zajištění.
4. Zkontroluje periskop/boční přístroj.
5. Zapne/ověří stěrače podle počasí.
6. Ověří, že řadicí páka je v neutrálu.
7. Ověří pedál horské brzdy ve výchozí poloze.
8. Připraví palivový kohout podle postupu.
9. Připraví ruční přívod paliva.
10. Zapne palubní síť a zkontroluje napětí.

Gameplay:

- v arkádovějším režimu to může být AI checklist,
- v sim režimu to hráč dělá ručně,
- v multiplayeru může velitel vidět jen hlášení, ne každý detail.

Failure points:

- poklop není zavřený,
- řazení není neutrál,
- slabé baterie,
- nefunkční stěrač,
- špatný palivový režim,
- pedál/brzda není ve výchozí poloze.

## Workflow 2 - start GТD

Cíl:

- bezpečně spustit GТD,
- připojit generátor,
- ohlásit veliteli readiness.

Kroky:

1. Zapnout palubní síť.
2. Ověřit baterie přes +27 V.
3. Otevřít/ověřit zaslonky GТD.
4. Dát zvukový signál.
5. Provést studené protočení.
6. Během protočení sledovat pokles napětí a tlak oleje.
7. Pokud není tlak oleje, provést maximálně povolený počet protočení.
8. Pokud jsou podmínky splněné, stisknout `ПУСК ГТД`.
9. Sledovat lampu startéru a otáčky.
10. Ověřit odpojení startéru.
11. Ověřit teplotu plynů a oleje.
12. Ověřit lampu generátoru.
13. Ohlásit veliteli GТD ready.

Kritické stavy:

- baterie pod 18 V při startéru,
- bez tlaku oleje,
- zaslonka GТD se neotevřela,
- startér nezhasl,
- GТD nepřechází na otáčky,
- teplota plynů neroste,
- pompaž po náběhu.

Herní pocit:

- start má být napjatý, ale čitelný,
- hráč sleduje budíky a lampy,
- zvuk GТD pomůže poznat stav,
- správný postup je odměněn rychlou připraveností RPK.

## Workflow 3 - SЭP z V-6R při jízdě

Cíl:

- držet elektrický komplex napájený z hlavního motoru během pohybu.

Kroky:

1. V-6R běží.
2. Řidič drží otáčky v požadovaném rozsahu.
3. Velitel/komplex zapíná převodník.
4. Řidič sleduje lampy `ПРЕОБРАЗ. ДИЗ.` a `ПРЕОБРАЗ.`.
5. Při poklesu otáček hrozí odpadnutí generátoru.
6. Řidič přidá otáčky nebo hlásí problém.

Gameplay:

- řidič při jízdě nesmí ignorovat otáčky,
- prudké manévry a řazení mohou způsobit krátké propady,
- při těžkém terénu může být nutné krátce přejít na GТD.

Failure points:

- otáčky pod hranicí,
- generátor odpadne,
- převodník vybíjí baterie,
- RPK začne být nestabilní,
- velitel musí rozhodnout: zpomalit, zastavit, spustit GТD, vypnout část spotřebičů.

## Workflow 4 - rozjezd a jízda

Cíl:

- pohnout se po povelu velitele,
- chránit RPK,
- držet taktickou pozici.

Kroky:

1. Velitel dá povel k pohybu.
2. Řidič potvrdí.
3. Dává zvukový signál před rozjezdem.
4. Volí převod.
5. Plynule pracuje s frikcionem a palivem.
6. Řídí levým/pravým systémem.
7. Sleduje teplotu vody, olej, rychlost, otáčky.
8. V těžkém terénu hlásí omezení.
9. Při aktivním RPK jede opatrněji.

Gameplay:

- řidič není penalizovaný za pomalou opatrnost, pokud tím chrání elektroniku,
- velitel může tlačit na rychlost,
- posádka cítí špatnou jízdu přes otřesy, ztrátu obrazu nebo kalibrační drift.

## Workflow 5 - zavření poklopu před palbou

Cíl:

- přepnout z jízdního pohodlí do bojové připravenosti.

Kroky:

1. Řidič jede s otevřeným poklopem nebo ne zcela spolehlivým kontaktem.
2. Velitel připravuje palbu.
3. Na velitelském/řidičově panelu se objeví stav poklopu.
4. Velitel dá povel zavřít poklop.
5. Řidič zavře poklop.
6. Kontakt PS-3 sepne.
7. Lampa/stav potvrdí zavření.
8. Palba a DSO-20 už nejsou blokované poklopem.

Failure variants:

- poklop fyzicky zavřen, ale kontakt nesepnut,
- špína nebo deformace brání dovření,
- spínač je špatně seřízený,
- hráč zapomene a posádka ztratí šanci na rychlou palbu.

Proč je to dobré:

- jednoduchá akce,
- silná vazba na dokument,
- obrovský dopad na boj,
- fyzicky modelovatelný mechanismus.

## Workflow 6 - jízda v dešti/sněhu/prachu

Cíl:

- udržet mobilitu a výhled bez porušení bojové bezpečnosti.

Kroky:

1. Počasí snižuje viditelnost.
2. Poklopy mají být zavřené, pokud to situace vyžaduje.
3. Řidič používá periskop/boční přístroje.
4. Zapíná stěrače a případně ostřik.
5. Volí nižší rychlost.
6. Sleduje teploty a otáčky.

Gameplay:

- počasí dělá řidiče důležitým,
- stěrače a ostřik mají hmatatelný efekt,
- otevřený poklop je risk.

## Workflow 7 - PАЗ / radioaktivní kontaminace

Cíl:

- uzavřít vozidlo a chránit posádku.

Kroky:

1. Velitel detekuje radiační nebezpečí.
2. Posádka zapíná PАЗ.
3. Řidič kontroluje lampu `СИГНАЛ ПАЗ`.
4. Řidič kontroluje ventilace a poklop.
5. Velitel kontroluje zhasnutí/indikaci řidičova poklopu.
6. Pokud je poklop otevřený, řidič ho zavře.
7. Pokud klapka nedosedla, posádka řeší závadu.

Gameplay:

- PАЗ zasahuje do výhledu, ventilace a komfortu,
- řidič má vlastní podíl na seal state,
- neúplné uzavření se projeví expozicí nebo kouřem/přetlakem.

## Workflow 8 - požár

Cíl:

- uhasit požár a zachránit posádku/stroj.

Automatický požár:

1. Senzor detekuje požár.
2. UА PПO automaticky zasahuje.
3. Řidič/velitel sleduje zónu.
4. Posádka nasazuje ochranné prostředky podle situace.

Ruční zásah řidiče:

1. Řidič vidí požár dřív než automatika nebo automatika selže.
2. Otevře dvířka automatu.
3. Přepne na `РУЧН.`.
4. Stiskne `ПЕРЕДН.` nebo `ЗАДН.`.
5. Sleduje efekt.
6. Pokud jedna láhev nestačí, opakuje pro další.

Požár v oddělení řízení/pod věží:

1. Zastavit ZSU.
2. Vypnout SЭP.
3. Otevřít příslušný zadní poklop.
4. Vzít CO2 hasicí přístroj.
5. Hasit od kraje kapaliny, ne přímo do hladiny.
6. Odvětrat.

Gameplay:

- stresová procedura,
- konkrétní zóny,
- spotřebovatelné hasicí láhve,
- otrava/škodlivé plyny po zásahu,
- servis po misi.

## Workflow 9 - GТD porucha za běhu

Spouštěče:

- pompaž,
- teplota plynů nad limitem,
- teplota oleje nad limitem,
- tlak oleje mimo limit,
- otáčky mimo limit,
- neobvyklý zvuk.

Správná reakce:

1. Řidič rozpozná odchylku.
2. Spustí V-6R nebo potvrdí jeho běh.
3. Nastaví 1550-1700 ot/min.
4. Zastaví GТD.
5. Hlásí veliteli.
6. Velitel rozhodne, zda pokračovat degradovaně.

Gameplay:

- GТD není jen „on/off“,
- posádka může zachránit situaci správným fallbackem,
- špatná reakce poškodí energetiku a může zastavit RPK.

## Workflow 10 - nouzové zastavení velitelem

Situace:

- výcvik,
- řidič ztrácí kontrolu,
- řidič vyřazen,
- hrozí náraz,
- hrozí poškození systému.

Akce:

- velitel stiskne `ОТКЛЮЧЕНИЕ ДИЗЕЛЯ`,
- V-6R se zastaví,
- pohyb končí,
- posádka řeší následky.

Gameplay:

- velitel má skutečný bezpečnostní override,
- v multiplayeru to může být dramatický, ale reálný zásah,
- při vyřazení řidiče to zabraňuje nekontrolované jízdě.

## Driver AI

AI řidič má mít tři vrstvy.

### Basic AI

- jede podle waypointů,
- zastaví na povel,
- zavře poklop při combat ready,
- hlásí základní poruchy.

### Simulation AI

- drží otáčky pro SЭP,
- řeší GТD start,
- používá stěrače,
- zpomaluje kvůli RPK,
- spouští PПO podle zóny.

### Expert AI

- optimalizuje jízdu podle terénu a elektroniky,
- preventivně hlásí baterie/teploty,
- umí rozpoznat špatný kontakt poklopu,
- rozhoduje mezi V-6R a GТD podle situace,
- dělá servisní diagnostiku po misi.

## Výukové mise

### Mission D1 - panel a GТD

Cíl:

- naučit zapnout síť,
- zkontrolovat baterie,
- provést studené protočení,
- spustit GТD,
- ohlásit generátor.

### Mission D2 - poklop a palba

Cíl:

- hráč jede s otevřeným poklopem,
- posádka chce pálit,
- palba je blokovaná,
- hráč zavře poklop,
- kontakt sepne,
- palba povolena.

### Mission D3 - RPK na hrbolaté cestě

Cíl:

- projet trasu s aktivním RPK,
- chránit elektroniku,
- vybrat rychlost,
- neztratit readiness.

### Mission D4 - požár v zadním prostoru

Cíl:

- rozpoznat požární zónu,
- nepoužít špatný okruh,
- ručně spustit zadní PПO,
- odvětrat.

### Mission D5 - zimní start

Cíl:

- použít předehřev,
- sledovat olej,
- udělat 2-3 studená protočení podle potřeby,
- nerozbít GТD.

## QA scénáře

### QA-D-001 Slabé baterie při GТD startu

Postup:

1. Nastavit baterie tak, aby při startéru padly pod 18 V.
2. Provést studené protočení.

Očekávání:

- voltmetr ukáže pokles,
- start je zakázán nebo vysoce rizikový,
- vzniká diagnostika `battery_sag_below_gtd_start_limit`.

### QA-D-002 Start bez tlaku oleje

Postup:

1. Vypnout/porouchat olejové čerpadlo GТD.
2. Provést studené protočení.
3. Zkusit horký start.

Očekávání:

- tlak oleje není,
- hra varuje přes budík/posádku,
- po překročení limitu protočení vzniká damage risk.

### QA-D-003 Startér se neodpojí

Postup:

1. Simulovat stuck starter.
2. Spustit GТD.
3. Dosáhnout 44 % otáček.

Očekávání:

- lampa startéru nezhasne,
- správný postup je `СТОП ГТД`,
- ignorování poškodí startér.

### QA-D-004 Poklop fyzicky zavřen, kontakt nesepnut

Postup:

1. Nastavit `adjustmentError` spínače PS-3.
2. Zavřít poklop.
3. Zkusit palbu.

Očekávání:

- model ukazuje zavřený poklop,
- kontakt nedává closed,
- palba blokovaná,
- debug ukáže `driver_hatch_contact_open`.

### QA-D-005 Nízké otáčky V-6R při převodníku

Postup:

1. Nechat převodník běžet z V-6R.
2. Snížit otáčky pod hranici.

Očekávání:

- generátor odpadne nebo varuje,
- baterie se vybíjí,
- lampy odpovídají zdroji.

### QA-D-006 RPK damage from rough driving

Postup:

1. Aktivovat RPK.
2. Jet rychle přes hrbolatý terén.
3. Sledovat `roadShock`.

Očekávání:

- roste riziko rozladění nebo faultu,
- jemná jízda riziko snižuje,
- posádka hlásí příčinu.

### QA-D-007 Ruční PПO špatná zóna

Postup:

1. Zapálit zadní zónu.
2. Stisknout přední ruční okruh.
3. Stisknout zadní okruh.

Očekávání:

- přední okruh neuhasí zadní požár,
- zadní okruh funguje,
- láhve se spotřebují.

### QA-D-008 PАЗ a otevřený poklop

Postup:

1. Spustit PАЗ.
2. Nechat poklop řidiče otevřený.

Očekávání:

- velitel vidí otevřený poklop,
- řidičův panel dává odpovídající stav,
- přetlak/NBC ochrana není plná.
