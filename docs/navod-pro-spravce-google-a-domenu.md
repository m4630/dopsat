# Dopsat. – podklady pro správce Google Workspace a školní domény

Tento návod popisuje, co je potřeba připravit pro bezpečný pilot aplikace **Dopsat.** se školními Google účty a později s adresou typu `dopisovani.skola.cz`.

> **Aktuální stav:** Google přihlášení zatím není živě ověřené. Aplikace má připravený serverový OAuth/OpenID Connect tok, ale chybějí konkrétní údaje a souhlasy školy uvedené v části „Co nyní chybí“. Současná ukázka používá pouze místní demonstrační účty a data v prohlížeči.

## Rychlé rozdělení odpovědností

### Co má správce školy pouze potvrdit nebo dodat

- přesnou primární nebo povolenou doménu Google Workspace, například `skola.cz`;
- kdo bude při pilotu student, učitel a správce (stačí několik testovacích školních účtů);
- seznam e-mailů učitelů a správců, nebo názvy Google Groups, které se pro role mají používat;
- zvolenou budoucí subdoménu, například `dopisovani.skola.cz`, a kdo spravuje její DNS;
- zda škola má Shared Drive a AppSheet licence v používané edici Workspace;
- pro budoucí export a e-maily: vlastníka/automatizační účet, cílový Shared Drive nebo Sheet a schváleného školního odesílatele.

### Co musí správce nastavit sám

- Google Cloud projekt pod školní organizací;
- interní publikum aplikace v Google Auth Platform;
- OAuth klient typu **Web application** a přesné redirect URI;
- případné povolení aplikace v Google Admin console pro dotčené organizační jednotky;
- přístupy automatizačního účtu nebo technické identity k budoucímu Sheetu/Shared Drivu;
- až po předání konkrétních hodnot od Vercelu příslušné DNS záznamy.

### Co uděláme my v aplikaci potom

- bezpečně vložíme OAuth konfiguraci do serverových proměnných prostředí;
- ověříme `state`, `nonce`, podpis a claims ID tokenu, včetně přesné školní domény;
- propojíme automatické založení uživatele a role se skutečnou databází;
- provedeme pilot student–učitel–správce a test odmítnutí soukromého účtu;
- podle rozhodnutí školy doplníme skupinové role, export do Sheets a denní e-maily;
- teprve po schválení připojíme produkční doménu a podle Vercelu předáme správci přesné DNS záznamy.

## Citlivost údajů

| Hodnota | Tajná? | Jak ji předat |
|---|---:|---|
| školní doména, Client ID, redirect URI | ne | běžný pracovní kanál je možný |
| e-maily rolí a testovacích účtů | ne, ale jde o osobní údaje | jen oprávněným členům projektu |
| OAuth Client Secret | **ano** | nikdy ne běžným e-mailem ani chatem; vložit přímo do správce tajemství / proměnných prostředí nebo použít schválený jednorázový trezor |
| `AUTH_SESSION_SECRET` | **ano** | generujeme my; škola jej nemusí dostat a nesmí být v repozitáři |
| privátní klíč service accountu nebo obnovovací token | **ano** | neposílat běžným e-mailem/chatem; preferovat správu bez stahovaného klíče, jinak schválený trezor a rotace |
| ID cílového Sheetu nebo Shared Drivu | samo o sobě ne | sdílet jen s projektovým týmem; přístup stále řídí oprávnění Google Drive |

V repozitáři zůstává pouze `.env.example` bez skutečných hodnot. Google doporučuje ukládat klientský secret mimo veřejně dostupná místa a mimo zdrojový strom. Vercel umožňuje pro Preview a Production označit tajné proměnné jako **Sensitive**, takže po uložení nejsou čitelné v dashboardu. Zdroje: [OAuth pro webové serverové aplikace](https://developers.google.com/identity/protocols/oauth2/web-server), [Vercel Sensitive Environment Variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## 1. Google Cloud a interní přihlášení

1. V Google Cloud Console založ nebo vyber projekt, který vlastní **školní Google Cloud organizace**. Nezakládej ho pod soukromým účtem.
2. V **Google Auth Platform** vyplň Branding (název `Dopsat.`, školní kontaktní e-mail) a v **Audience** zvol `Internal`. Interní publikum je dostupné jen projektu přidruženému ke Google Cloud Organization a omezuje autorizaci na členy dané organizace. [Konfigurace publika](https://support.google.com/cloud/answer/15549945), [konfigurace OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent).
3. V **Data Access** nastav pouze minimální scopes:
   - `openid`
   - `email`
   - `profile`

   Pro samotné přihlášení aplikace nemá žádat Drive, Sheets, Calendar ani Gmail scopes. Případná budoucí automatizace se autorizuje odděleně a jen pro konkrétní účel.
4. V Clients vytvoř klienta typu **Web application**. Google tento typ určuje pro serverový authorization-code tok, který bezpečně drží secret a stav relace. [Vytvoření přístupových údajů](https://developers.google.com/workspace/guides/create-credentials#oauth-client-id), [OAuth pro webovou serverovou aplikaci](https://developers.google.com/identity/protocols/oauth2/web-server).
5. Přidej autorizované redirect URI. Musí se shodovat znak po znaku, včetně schématu a případného koncového lomítka:
   - lokální pilot: `http://localhost:3000/api/auth/google/callback`
   - produkce: například `https://dopisovani.skola.cz/api/auth/google/callback` – až bude doména definitivně potvrzena.
6. Ulož Client ID a Client Secret. Client ID lze sdělit běžným projektovým kanálem; Client Secret vlož bezpečnou cestou podle tabulky výše.

### Co aplikace při přihlášení ověří

Aplikace nepovažuje parametr `hd` v přihlašovacím odkazu za bezpečnostní kontrolu. Na serveru ověří podpis ID tokenu, issuer, audience, expiraci, `nonce`, `email_verified` a přesnou hodnotu claimu `hd`. Uživatele identifikuje stabilním Google `sub`, ne e-mailem. Viz [Google OpenID Connect reference](https://developers.google.com/identity/openid-connect/reference).

## 2. Povolení aplikace v Google Admin console

I interní aplikaci může blokovat politika organizace, zvlášť u Google Workspace for Education a účtů mladších 18 let.

1. Otevři **Admin console → Security → Access and data control → API controls → Manage App Access**.
2. Vyhledej aplikaci podle OAuth Client ID.
3. Zkontroluj dotčené organizační jednotky a povol jen potřebný přístup. Pro přihlašovací scopes má být přístup co nejužší; není důvod důvěřovat Drive/Gmail scopes, které aplikace nepoužívá.
4. Po změně počítej s tím, že propagace může trvat až 24 hodin.

Oficiální postup a význam stavů Trusted/Limited/Specific/Blocked: [Control which apps access Google Workspace data](https://support.google.com/a/answer/7281227).

## 3. Role v Dopsat.

- Každý nový ověřený účet v povolené školní doméně dostane výchozí roli **student**.
- **Učitel** i **správce** mohou upravovat všechny termíny; u změny se ukládá autor a čas.
- Pro první pilot je nejjednodušší předat uzavřený seznam e-mailů učitelů a správců.
- Pro dlouhodobý provoz doporučujeme spravované Google Groups, například `dopsat-ucitele@skola.cz` a `dopsat-spravci@skola.cz`. Správce školy pak udržuje členství. Napojení skupin ale vyžaduje samostatné rozhodnutí o serverové integraci a minimálních oprávněních; současná lokální verze čte pouze seznamy z `GOOGLE_TEACHER_EMAILS` a `GOOGLE_ADMIN_EMAILS`.

Role nebudeme určovat podle údajů poslaných prohlížečem. Autorizační kontrola zápisů musí být na serveru a uživatel bude v databázi veden podle Google `sub`.

## 4. Budoucí export do Sheets a denní e-maily

Přihlášení uživatelů a automatizaci držíme odděleně. Student nebude kvůli exportu udělovat aplikaci přístup ke svému Drivu nebo Gmailu.

Správce má předem určit:

- stabilní školní účet vlastníka automatizace (ne osobní účet zaměstnance, který může odejít), nebo schválenou technickou identitu;
- cílový Shared Drive a složku, případně konkrétní Google Sheet;
- kdo smí export číst a upravovat;
- školní adresu odesílatele a adresu pro odpovědi;
- komu a v jaký čas se denní souhrn posílá;
- retenční dobu exportů a auditních záznamů.

Shared Drives jsou dostupné jen v podporovaných edicích Workspace. Service account není automaticky členem školní domény a doménové sdílení mu samo o sobě přístup nedá; musí dostat explicitní oprávnění nebo bezpečně zosobnit schváleného uživatele. Viz [Manage shared drives](https://developers.google.com/workspace/drive/api/guides/manage-shareddrives) a [Drive permissions](https://developers.google.com/workspace/drive/api/guides/manage-sharing).

Pokud by se pro jednoduchou automatizaci použil Apps Script, instalovatelný časový trigger běží pod účtem svého tvůrce a jeho čas může být v rámci zvolené hodiny mírně posunutý. Odesílání přes `MailApp` podléhá denním kvótám, které je nutné před spuštěním ověřit. Zdroje: [installable triggers](https://developers.google.com/apps-script/guides/triggers/installable), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

## 5. Vlastní subdoména a DNS

Doporučený tvar je `dopisovani.skola.cz`. Správce teď pouze:

1. potvrdí, že subdoména může být použita;
2. sdělí, u koho se spravuje DNS a kdo může záznam změnit;
3. **nevytváří žádný DNS záznam naslepo**.

Konkrétní CNAME/A hodnotu doplní až podle instrukcí, které Vercel zobrazí po přidání domény ke konkrétnímu projektu. Vercel výslovně doporučuje použít hodnoty z dashboardu nebo `vercel domains inspect`, protože projekt může dostat konkrétní záznam. Po ověření DNS Vercel vystaví SSL certifikát. Viz [Set up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain) a [Add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## 6. Bezpečnost a ochrana studentských údajů

- shromažďovat jen údaje potřebné k rezervaci a organizaci testu;
- nenechávat tajemství, studentské seznamy ani exporty v Gitu, veřejných odkazech nebo běžných chatech;
- oddělit testovací a produkční tajemství a pravidelně je rotovat;
- omezit přístup do databáze, Sheetu a Vercelu na nezbytné osoby;
- vést audit založení a změn termínů i rezervací;
- v databázi vynutit kapacitu a rezervaci transakčně, aby současné požadavky nepřekročily limit;
- stanovit retenční dobu, postup opravy údajů a mazání starých záznamů podle pravidel školy;
- pilotovat pouze s několika určenými účty a fiktivním nebo minimálním obsahem testů;
- před ostrým provozem projít školní posouzení ochrany osobních údajů a incidentní postup.

## 7. Doporučený pilot

1. Správce dokončí Cloud/OAuth a povolení aplikace.
2. My vložíme hodnoty do lokálního bezpečného prostředí; nic nepíšeme do externích školních systémů.
3. Ověříme jeden účet studenta, učitele a správce a jeden soukromý účet, který musí být odmítnut.
4. Ověříme založení uživatele podle `sub`, role, odhlášení, expiraci relace a zamítnutí neoprávněných serverových zápisů.
5. Teprve potom připojíme databázi a otestujeme souběžné rezervace, kapacitu, rušení po uzávěrce a audit.
6. Export, e-maily a vlastní doménu zapneme samostatně až po jejich schválení.

## Co nyní chybí pro živý Google test

- přesná povolená školní Workspace doména;
- Google Cloud projekt pod školní organizací s Audience = Internal;
- OAuth Client ID a bezpečně vložený Client Secret pro Web application;
- potvrzený lokální redirect `http://localhost:3000/api/auth/google/callback` v OAuth klientu;
- rozhodnutí a hodnoty pro učitelské a správcovské role;
- alespoň tři pilotní školní účty a možnost ověřit odmítnutí neškolního účtu;
- potvrzení správce, že politika App Access daný OAuth Client ID neblokuje.

Produkční hostname, produkční redirect URI, DNS a Vercel proměnné nejsou potřeba pro první lokální Google test a zatím se nenastavují.

## Jednodušší alternativy – praktické srovnání

### Google Forms + Sheets + Apps Script

Nejrychlejší a levná cesta k provoznímu pilotu. Forms ukládají odpovědi přímo do propojeného Sheetu ([oficiální postup](https://support.google.com/docs/answer/2917686)). Apps Script umí reagovat na odeslání formuláře, spouštět časové úlohy a posílat e-maily. Pro kapacitu ale musí skript po odeslání atomicky přepočítat obsazenost a chránit zápis pomocí [LockService](https://developers.google.com/apps-script/reference/lock). Rušení, společný přehled všech termínů, role a spolehlivé zabránění souběžnému přeplnění nejsou hotové funkce formuláře; musely by se doprogramovat a uživatelský tok by byl roztříštěný.

**Verdikt pro 150 studentů:** použitelné jako krátký nouzový pilot, pokud škole nevadí ruční dohled a méně pohodlné rušení. Pro dlouhodobý provoz se skript rychle stane vlastní aplikací schovanou v tabulce.

### Google Calendar appointment schedules

Calendar nabízí booking page, minimální i maximální předstih, vlastní pole, potvrzení, připomínky, spoluorganizátory a limit počtu rezervací za den. Některé funkce vyžadují způsobilou edici Workspace. Oficiální popis pracuje s jednotlivými rezervovatelnými schůzkami a denním limitem, ne s jedním společným termínem o kapacitě například 12 studentů. [Create an appointment schedule](https://support.google.com/calendar/answer/10729749), [změny appointment schedules](https://support.google.com/calendar/answer/190998).

**Verdikt:** výborné pro individuální konzultace, ale nevhodné jako hlavní řešení skupinového dopisování s kapacitou, společným seznamem testů a školními rolemi.

### AppSheet

AppSheet je rozumný kompromis: umí vynutit přihlášení, povolit jen vybrané uživatele nebo doménové skupiny, filtrovat řádky podle uživatele a auditovat identitu změn. Google současně upozorňuje, že security filters nejsou samy o sobě úplná ochrana datového zdroje. Pro nasazení přibližně 150 uživatelům je nutné ověřit, zda školní edice zahrnuje odpovídající AppSheet Core licence; po bezplatném prototypu se licence počítají podle aktivních uživatelů. [Require sign-in](https://support.google.com/appsheet/answer/10104975), [Users and licensing](https://support.google.com/appsheet/answer/10105090), [subscription selection](https://support.google.com/appsheet/answer/10105400).

**Verdikt:** nejlepší jednoduchá alternativa, pokud škola už má potřebné licence a přijme méně vlastní vzhled. Kapacity, storno lhůta, učitelská správa a automatizace se stále musí navrhnout a otestovat.

### Doporučení

Pro požadovaný tok – 150 studentů, více učitelů, sdílené termíny s kapacitou, bezpečné rušení, audit, školní role, vlastní vzhled, export a upozornění – doporučujeme pokračovat v **Dopsat.** se skutečnou databází. AppSheet má smysl porovnat jako rychlejší variantu, pokud licence už škola má. Forms + Sheets + Apps Script ponechat jen jako dočasnou zálohu; Calendar appointment schedules pro tento skupinový model nedoporučujeme.

## Závěrečný checklist před spuštěním

- [ ] Cloud projekt vlastní školní organizace a Audience je Internal.
- [ ] OAuth klient je Web application a obě redirect URI jsou přesné.
- [ ] Aplikace žádá jen `openid email profile` pro přihlášení.
- [ ] Client Secret a session secret jsou mimo Git a v chráněném úložišti.
- [ ] Google Admin politika aplikaci povoluje pro správné organizační jednotky.
- [ ] Role učitelů a správců mají určeného vlastníka a postup změny členství.
- [ ] Produkční databáze vynucuje kapacity, vlastnictví rezervací a serverové role.
- [ ] Je schválena retence, přístup k údajům, zálohy a incidentní postup.
- [ ] Pilot prošel studentem, učitelem, správcem i odmítnutým soukromým účtem.
- [ ] Export a e-mail mají vlastníka, cílové úložiště, oprávnění a monitoring kvót/chyb.
- [ ] DNS záznam odpovídá přesně hodnotě z Vercelu a HTTPS je ověřené.

