# ЗСУ-23-4 «Шилка» — jak to funguje, díl po dílu (a jak na sebe navazuje)

Krátký, ale konkrétní popis každé součástky: **co dělá** (1:1 z manuálů) a **jak je napojená** na zbytek. Čte se odshora dolů jako řetěz příčin.

---

## 1. Energetický řetězec — kdo vyrábí proud a komu ho dává

- **Baterie 4×12СТ-70М** — zásobník elektřiny (jmenovitě 24 V, na sběrnici drženo 27,5 V). Nastartují turbínu a drží stejnosměrný proud, když generátor neběží.
  → **napájejí** startér a stejnosměrné spotřebiče (rádio, lampy, spouště).

- **Plynová turbína ДГ4М-1 (GTD)** — pomocný motor; **na stojícím vozidle** roztáčí generátor (palivo vystačí na 1,5–2 hodiny). Naskočí s okamžitým jekotem (~30 000 otáček).
  → **pohání** reduktor СЭП, a tím generátor.

- **Diesel В-6М-1** — hlavní motor pro jízdu. Přes reduktor СЭП s odběrem výkonu může **také** točit generátor, ale jen při ≥ 1550 otáčkách (jinak generátor odpadne).
  → **pohání** pásy a (volitelně) generátor.

- **Reduktor СЭП** — převod, který roztáčí generátor. Bere výkon buď z turbíny, nebo z dieselu.
  → **roztáčí** generátor ГИСВ.

- **Generátor ГИСВ2-14/3000** — vyrábí stejnosměrných **±27,5 V** ve dvou kanálech (usměrňovače 5-В1 a 5-В2). Napětí drží automatický regulátor, posádka ho neladí.
  → **plní** stejnosměrnou sběrnici.

- **Stejnosměrná sběrnice ±27,5 V (okruh ①)** — hlavní stejnosměrný okruh; bufferují ho baterie. Rozpětí mezi oběma raily je 55 V.
  → **napájí** měnič, elektrické spouště, rádio, lampy, čerpadla a řízení pohonů.

- **Měnič ПС-14А (БПС)** — otáčivý měnič (stejnosměrný motor točí střídavý generátor): ze 27,5 V vyrábí **220 V / 400 Hz** střídavých. **Zapíná ho velitel**, ne řidič.
  → **plní** střídavou sběrnici.

- **Střídavá sběrnice 220 V / 400 Hz (okruh ②)** — třífázový bojový okruh. Tohle je hlavní brána: bez něj je z Šilky jen ručně mířený kanón.
  → **napájí** radar, počítač СРП, stabilizaci a (přes transformátor) silové pohony.

- **Transformátor Б-6В** — ze 220 V dělá 110 V a 115 V.
  → **115 V** pohání silové míření 2Э2.

- **Kroužkový sběrač ВКУ** — kontakt, který přenáší proud z korby do otáčející se věže.
  → **dopravuje** 27,5 V a 220 V do věže (radar, pohony, pulty).

> **Shrnutí řetězce:** turbína *nebo* diesel → reduktor СЭП → generátor → 27,5 V DC → měnič → 220 V AC → transformátor → 115 V → přes sběrač do věže. **Vypadne generátor = umře radar, počítač, stabilizace i silové míření; zbude jen 27,5 V z baterií a ruční kola.**

---

## 2. Bojové spotřebiče — co z proudu žije

- **Radar 1РЛ33М (РПК «Тобол»)** — hledá vzdušný cíl, sleduje ho a měří dálku. Běží na střídavém proudu a musí se napřed nažhavit (НАКАЛ → АНОДНОЕ → ВЫСОКОЕ).
  → **dává** úhly a dálku počítači СРП.

- **Analogový počítač СРП Б-1** — z úhlů, dálky a náklonu vozidla počítá palebné předsažení (kam mířit, aby letící cíl protnul střely).
  → **posílá** mířicí úhly silovým pohonům.

- **Stabilizace + gyro ГАГ** — drží mířicí linii klidnou a měří náklon korby; ten náklon krmí počítač.
  → **opravuje** míření za jízdy a dodává náklon do СРП.

- **Silové pohony 2Э2** — hydraulika, která otáčí věží (odměr) a zvedá zbraně (náměr). Běží na 115 V a 27,5 V. Záloha jsou ruční kola.
  → **natáčejí** věž a zbraně na bod spočítaný počítačem.

- **Kanón АЗП-23М (4 automaty)** — čtyři 23mm hlavně; elektrické spouště běží i na baterie. Hlavně chladí kapalina.
  → **pálí**, jakmile to dovolí palebný okruh a blokace.

---

## 3. Palebný řetězec — od echa k zásahu (jak to navazuje)

> **Radar** najde echo → **dálkař** zastrobuje dálku → **naváděč** zamkne úhly → **počítač СРП** spočítá předsažení → **pohony** natočí věž i zbraně → **řetěz blokací** (poklop zavřen · stopory sňaty · chlazení běží · náměr nad omezovačem · „jsou data") to povolí → **spouště** vypálí.

Klíč: dálková brána dálkaře zároveň otevírá úhlový kanál, takže **dálkař a naváděč musí spolupracovat** — jeden bez druhého cíl nezamkne.

---

## 4. Mobilita — jak se to hýbe

- **Diesel В-6М** → **hlavní frikcion (spojka)** → **převodovka** → **planetové řízení ПМП** → **koncové převody** → **hnací kola** → **pásy**.
- **Řídicí páky** brzdí vnitřní pás dané strany, čímž vozidlo zatáčí (nemá pivotní otáčení na místě).
- **Odpružení** je na torzních tyčích, bez podpěrných kladek (horní větev pásu leží na 3. a 4. kole).

---

## 5. Bezpečnost a podpora — co hlídá posádku a stroj

- **Poklop řidiče + kontakt ПС-3** — fyzická poloha poklopu a její elektrický kontakt. Otevřený poklop **blokuje** zapnutí pohonů (DSO-20) i palbu.
  → vstupuje do palebného řetězce jako tvrdá blokace.

- **Chlazení hlavní (85 l)** — kapalina, kterou žene čerpadlo, chladí čtyři hlavně. Bez běžícího chlazení se **nesmí** pálit.
  → podmínka palby.

- **ПАЗ (protiatomová ochrana)** — nagnetatel (přetlakové dmychadlo) a klapky uzavřou vozidlo a vytvoří přetlak, který nepustí dovnitř radioaktivní prach.
  → chrání posádku; v režimu ПАЗ se vypíná turbína a měnič.

- **ППО «Роса» (hašení)** — automatické i ruční hašení (přední / zadní zóna). Řidič umí spustit ruční okruh, když automatika selže.
  → chrání stroj i posádku při požáru.

---

## 6. Power-up celé posádky — kdo dělá kterou část (štafeta)

Sekvence v dokumentu „START/SHUTDOWN" je **jen řidičova část** (vyrobit proud). Plný start je štafeta přes všechny 4 členy — a **gyro (ГАГ) řidič NEzapíná, dělá to velitel:**

1. **Řidič — vyrobí proud (energetická páteř):** ПИТАНИЕ → houkačka → studené protočení (otevře klapky) → ПУСК ГТД → generátor online. Tím vznikne 27,5 V; sám o sobě ještě neoživí věž.
2. **Velitel — pustí bojové napájení a stabilizaci:** zapne měnič **БПС** (220 V do věže) + napájení 27/115 V; **zapne gyro «ГАГ»** (item 35 na svém pultu) → čeká ~**3 minuty**, než se gyroskopy roztočí (lampa ЗАСТОПОРЕНО zhasne → rozsvítí se ОТСТОПОРЕНО), pak zmáčkne **КОНТРОЛЬ** (lampa НЕИСПРАВНО nesmí svítit — jinak gyro vypne a není stabilizace). Nastaví **omezovač úhlů** a drží **palebné právo**.
3. **Operátor dálnosti (dálkař) — nažhaví radar:** **НАКАЛ** (žhavení) → **АНОДНОЕ** → **ВЫСОКОЕ**, pak nastaví proud magnetronu. (To „vysoké napětí" do radaru.)
4. **Naváděč (vyhledávač) — pohony a sledování:** zapne silové napájení pohonů, spustí hledání, zamkne cíl («146 АВТ.»).

Kroky věže (2–4) se prolínají — gyro se třeba ~3 minuty roztáčí, zatímco dálkař žhaví radar. **Klíč:** řidič udělá jen proud; **gyro, radar, převodník i pohony jsou věc velitele a operátorů, ne řidiče.**

> Sourcing 1:1: velitelský pult ovládá ГАГ — finding 08 (пульт командира 29) · finding 01 §8.3 + finding 10 (krok velitele „35 ГАГ ON, 3 min, КОНТРОЛЬ").

## 7. Nejkratší shrnutí (jedna věta na vrstvu)

1. **Motor vyrobí otáčky** (turbína na místě, diesel za jízdy).
2. **Otáčky točí generátor**, ten dělá **27,5 V** stejnosměrných.
3. **Měnič** z toho dělá **220 V / 400 Hz** střídavých (zapne velitel).
4. **Střídavý proud** oživí **radar, počítač, stabilizaci a pohony**.
5. **Radar najde cíl → počítač spočítá předsažení → pohony zamíří → blokace povolí → kanón vypálí.**
6. **Bez střídavého proudu** zbývá jen ruční míření a kanón na baterie.
