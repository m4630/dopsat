# Google Workspace přihlášení – integrační hranice

Verze 2.0 používá serverový OpenID Connect authorization-code tok. V klientu se neověřují tokeny a klientský secret se nikdy neposílá do prohlížeče.

## Co už je připravené

- `/api/auth/google/start` vytváří náhodné `state` a `nonce`, ukládá je do podepsané HttpOnly cookie a přesměruje na Google.
- `/api/auth/google/callback` porovná `state`, na serveru vymění kód za ID token a kryptograficky ověří podpis, issuer, audience, expiraci, `nonce`, ověřený e-mail a přesnou hodnotu claimu `hd`.
- Uživatel se mapuje podle stabilního Google `sub`, nikoli podle měnitelného e-mailu.
- Výchozí role je `student`. Seznamy `GOOGLE_TEACHER_EMAILS` a `GOOGLE_ADMIN_EMAILS` přiřadí zvýšené role.
- Podepsaná osmihodinová relace je v HttpOnly, SameSite=Lax cookie. V produkci je cookie Secure.

## Co musí dodat škola

1. Správce Google Workspace potvrdí přesnou školní doménu a kdo smí aplikaci používat.
2. V Google Cloud vytvoří OAuth Client typu **Web application**.
3. Do Authorized redirect URIs vloží přesně `http://localhost:3000/api/auth/google/callback` pro místní zkoušku a později samostatnou HTTPS adresu produkce.
4. Bezpečně předá `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`; secret nesmí být v Gitu ani v klientském kódu.
5. Doplní se `.env.local` podle `.env.example`, včetně náhodného `AUTH_SESSION_SECRET` o délce alespoň 32 znaků.
6. Vyplní se čárkou oddělené seznamy účtů učitelů a správců. V dlouhodobém provozu je vhodnější řízení rolí v databázi nebo přes spravovanou skupinu Workspace.

## Produkční databázová hranice

Současná lokální ukázka záměrně ukládá demonstrační termíny a rezervace jen v prohlížeči. Před živým pilotem musí funkce `provisionGoogleUser()` provést transakční upsert uživatele do skutečné databáze s unikátním `google_sub`. Doporučené minimum:

- `users(id, google_sub UNIQUE, email, display_name, role, created_at, last_login_at)`
- `slots(..., created_by_user_id, updated_by_user_id, created_at, updated_at)`
- `reservations(..., student_user_id, created_by_user_id, updated_by_user_id, created_at, updated_at)`

Zápisy termínů musí na serveru povolit pouze roli `teacher` nebo `admin`; obě role smějí měnit všechny termíny. Studentské rezervace musí server vždy svázat s identitou z relace, nikoli s identifikátorem poslaným klientem.

## Pilotní ověření

Pro živý test jsou potřeba alespoň tři školní účty: student, učitel a správce. Ověří se odmítnutí soukromého Google účtu, automatické založení uživatele podle `sub`, přiřazení rolí, přihlášení/odhlášení a serverová autorizace všech zápisů. Teprve potom lze lokální data nahradit sdílenou databází.
