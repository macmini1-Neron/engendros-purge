# Crew workflows

## Hlavní princip

Každá pozice musí mít vlastní zajímavou práci.

Ne jen „velitel vybírá cíl, zbytek čeká“.

Shilka je ideální pro kooperaci, protože její bojová efektivita vzniká z koordinace:

- řidič drží platformu a energii,
- velitel hlídá systém a rozhoduje,
- operátor vyhledávání najde a vede cíl,
- operátor dálky drží měření,
- technik/servisní vrstva drží stroj dlouhodobě živý.

## Režimy posádky

### Full crew

Každý člověk ovládá jednu pozici.

Nejlepší pro hardcore multiplayer.

### Assisted crew

Hráč je velitel, AI posádka provádí příkazy.

AI nečaruje. Kliká/ovládá skutečné panely.

### Single-player procedural

Hráč přeskakuje mezi pozicemi.

Čas běží dál, ale asistenti drží poslední rozkaz.

### Instructor mode

Instruktor spouští závady, hodnotí procedury a ukazuje chyby.

## Workflow: příprava k boji

### Fáze 1 - vozidlo

Řidič:

- nastartuje motor nebo připraví externí/SЭП zdroj,
- zkontroluje teplotu vody,
- zkontroluje tlak oleje,
- zkontroluje palivo,
- zavře poklop,
- nastaví otáčky pro zátěž.

Velitel:

- zkontroluje voltmetry,
- zapne napájení bojových systémů,
- zkontroluje blokace,
- ověří stopory,
- povolí pohony.

### Fáze 2 - zbraň

Operátor/technik:

- ověří stav nabití automatů,
- zkontroluje počitadla patronů,
- ověří hladinu OЖ,
- zapne chlazení,
- zkontroluje, že sběrač článků je zavřený,
- ověří omezovač úhlů podle režimu.

Velitel:

- sleduje lampy `заряжено`,
- sleduje `цепь стрельбы`,
- kontroluje `контроль блокировок`,
- povoluje palbu.

### Fáze 3 - RPK

Velitel:

- zajistí SЭП,
- kontroluje napětí,
- zapíná GAG/stabilizaci.

Operátor dálky:

- zapne nakal,
- po doběhu zapne anodové,
- nastaví indikátor dálky,
- hlásí připravenost.

Operátor vyhledávání:

- zapne motory/napájení panelů,
- vybere search režim,
- nastaví indikátor,
- hlásí search připraven.

## Workflow: zachycení cíle

### Varianta A - kruhový search

1. Velitel dá sektor nebo obecný rozkaz „hledat“.
2. Operátor vyhledávání zapne kruhový search.
3. Sleduje indikátor a hledá echo.
4. Při nálezu hlásí směr.
5. Velitel rozhodne přechod do doprovodu.
6. Operátor dálky začne držet dálku.
7. RPK/SRP vytvoří data.
8. Na pultu svítí `есть данные`.
9. Velitel povoluje palbu.

### Varianta B - sektorový search

1. Velitel dostane externí hlášení směru.
2. Operátor nastaví sektor.
3. Search běží jen ve vybraném sektoru.
4. Operátor ladí šířku.
5. Při kontaktu přechází do doprovodu.

Gameplay:

Sektorový search je silný, pokud posádka ví, kde hledat. Je slabý, pokud velitel špatně odhadne směr.

## Workflow: palba

### Normální palba

1. Velitel ověří `есть данные`.
2. Ověří chlazení.
3. Ověří, že blokace nesvítí.
4. Vybere režim palby.
5. Stiskne palbu nebo předá palebné právo operátorovi.
6. Systém vystřelí jen z automatů, které jsou nabité a neblokované.
7. Počitadla patronů se mění pro každý automat.
8. Teplota hlavní roste.
9. Velitel ukončí dávku.

### Nouzová palba

Použít když:

- RPK data chybí,
- cíl je blízko,
- situace je kritická,
- velitel přijímá horší přesnost a riziko.

Nouzová palba nemá rušit tvrdé fyzické blokace.

### Palba na pozemní cíl

Rozdíly:

- jiná délka dávky,
- jiný úhlový limit,
- vyšší riziko munice waste,
- možnost ručního/poloautomatického míření,
- důležitá stabilita vozidla.

## Workflow: závada při palbě

### Symptom

Zbraň nestřílí.

### Velitelova diagnostika

1. Svítí `контроль блокировок`?
2. Svítí `люк открыт`?
3. Svítí `цепь стрельбы`?
4. Svítí `охлаждение`?
5. Svítí `уровень ОЖ`?
6. Svítí `заряжено` u daného automatu?
7. Svítí `есть данные`?
8. Je přepínač `командир-оператор` správně?

### Posádková reakce

- řidič zavře poklop,
- operátor zkontroluje data,
- střelec/technik řeší nabití,
- velitel přejde na nouzový režim,
- řidič stabilizuje vozidlo.

## Workflow: ztráta radaru

### Příčiny

- výpadek SЭП,
- ventilace RLS,
- přehřátí,
- rušení,
- ztráta echa,
- chyba operátora,
- porucha nakalu/anodového napětí,
- mechanická chyba antény.

### Reakce

1. Operátor vyhledávání hlásí ztrátu.
2. Operátor dálky potvrdí/odmítne dálku.
3. Velitel rozhodne:
   - pokračovat search,
   - přeladit,
   - sektorový search,
   - optika/poloautomat,
   - ruční režim,
   - přerušit palbu.

## Workflow: přesun a boj

Řidič je klíčový.

Při přesunu:

- poklop může být otevřený pro výhled,
- radar může být složený/omezený,
- posádka není plně připravena k palbě.

Při přechodu do boje:

- poklop zavřít,
- stabilizovat vozidlo,
- zapnout/ověřit SЭП,
- odstoporovat,
- zapnout pohony,
- připravit RPK,
- přejít do search.

## Workflow: PАЗ / zamoření

1. Velitel/řidič dostane hlášení nebo indikaci zamoření.
2. Posádka zavře poklopy a klapky podle režimu.
3. PАЗ přepne ventilaci/filtraci.
4. Kontrolky ověří stav klapek.
5. Vzniká přetlak.
6. Některé servisní/bojové akce jsou omezené.

Gameplay:

V zamořeném prostředí není jen filtr. Je to procedura, která mění dostupnost poklopů, ventilaci a únavu posádky.

## Workflow: požár

1. Detekce požáru nebo vizuální symptom.
2. UА PПО automaticky spustí okruh, pokud funguje.
3. Pokud automatika selže, řidič nebo velitel spustí ručně.
4. Požár je potlačen nebo pokračuje.
5. Použitý okruh je prázdný.
6. Po misi je nutná údržba.

## Workflow: po misi

### Posádka

- vypnout RPK ve správném pořadí,
- vypnout SЭП,
- zajistit věž a kolébku,
- vybít nebo zajistit zbraně,
- zkontrolovat munici,
- doplnit kapaliny,
- nahlásit závady.

### Technik/servis

- zkontrolovat hlavně,
- zkontrolovat pásy,
- zkontrolovat chlazení,
- zkontrolovat hydropohon,
- zkontrolovat RPK,
- zkontrolovat PАЗ/PПО,
- zkontrolovat podvozek,
- naplánovat opravy.

## AI posádka

AI posádka má používat stejné workflow.

Nesmí:

- ignorovat blokace,
- teleportovat stav,
- přepnout radar bez panelu,
- doplnit munici bez času,
- zavřít poklop bez animace.

Může:

- zrychlit jednoduché úkony podle obtížnosti,
- hlásit problémy,
- provádět checklist,
- navrhnout opravu.

## Komunikační design

Krátké hlášky:

- „Poklop otevřen.“
- „Hydropohon blokován.“
- „Chlazení neběží.“
- „Dálka drží.“
- „Data jsou.“
- „Cíl mimo zónu.“
- „Sektor nastaven.“
- „Rušení na frekvenci.“
- „Přelaďuji.“
- „Třetí automat nenabit.“

Hlášky mají být stručné, posádkové a navázané na skutečný stav.

