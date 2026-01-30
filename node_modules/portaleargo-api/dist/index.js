var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/Client.ts
import { CookieClient } from "http-cookie-agent/undici";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join as join3 } from "node:path";
import { cwd, env } from "node:process";
import { CookieJar as CookieJar2 } from "tough-cookie";
import {
  fetch as fetch2,
  interceptors as interceptors2,
  Pool
} from "undici";

// src/util/Constants.ts
var clientId = "72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c";
var defaultVersion = "1.27.0";

// src/util/encryptCodeVerifier.ts
var encoder = new TextEncoder();
var encryptCodeVerifier = /* @__PURE__ */ __name(async (codeVerifier) => btoa(
  String.fromCharCode(
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier))
    )
  )
).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "encryptCodeVerifier");

// src/util/formatDate.ts
var formatDate = /* @__PURE__ */ __name((date) => {
  date = new Date(date);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date.getMilliseconds().toString().padStart(3, "0")}`;
}, "formatDate");

// src/util/randomString.ts
var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
var randomString = /* @__PURE__ */ __name((length) => {
  let result = "";
  for (let i = 0; i < length; i++)
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  return result;
}, "randomString");

// src/util/generateLoginLink.ts
var generateLoginLink = /* @__PURE__ */ __name(async ({
  redirectUri = "it.argosoft.didup.famiglia.new://login-callback",
  scopes = ["openid", "offline", "profile", "user.roles", "argo"],
  codeVerifier = randomString(43),
  challenge,
  id = clientId,
  state = randomString(22),
  nonce = randomString(22)
} = {}) => {
  challenge ??= await encryptCodeVerifier(codeVerifier);
  return {
    url: `https://auth.portaleargo.it/oauth2/auth?redirect_uri=${encodeURIComponent(
      redirectUri
    )}&client_id=${id}&response_type=code&prompt=login&state=${state}&nonce=${nonce}&scope=${encodeURIComponent(
      scopes.join(" ")
    )}&code_challenge=${challenge}&code_challenge_method=S256`,
    redirectUri,
    scopes,
    codeVerifier,
    challenge,
    clientId: id,
    state,
    nonce
  };
}, "generateLoginLink");

// src/util/getToken.ts
var getToken = /* @__PURE__ */ __name(async (code) => {
  const date = /* @__PURE__ */ new Date();
  const res = await fetch("https://auth.portaleargo.it/oauth2/token", {
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code: code.code,
      grant_type: "authorization_code",
      redirect_uri: "it.argosoft.didup.famiglia.new://login-callback",
      code_verifier: code.codeVerifier,
      client_id: clientId
    }).toString(),
    method: "POST"
  });
  const data = await res.json();
  const expireDate = new Date(res.headers.get("date") ?? date);
  if ("error" in data)
    throw new Error(`${data.error} ${data.error_description}`);
  expireDate.setSeconds(expireDate.getSeconds() + data.expires_in);
  return Object.assign(data, { expireDate });
}, "getToken");

// src/util/handleOperation.ts
var handleOperation = /* @__PURE__ */ __name((array, old = [], ...[pk]) => {
  const toDelete = [];
  const getPk = pk ?? ((a) => a.pk);
  for (const a of array)
    if (a.operazione === "D") toDelete.push(a.pk);
    else {
      const { operazione, ...rest } = a;
      const found = old.find((b) => a.pk === getPk(b));
      if (found) Object.assign(found, rest);
      else old.push(rest);
    }
  return old.filter((a) => {
    const p = getPk(a);
    toDelete.unshift(p);
    return !toDelete.includes(p, 1);
  });
}, "handleOperation");

// src/BaseClient.ts
var BaseClient = class _BaseClient {
  /**
   * @param options - Le opzioni per il client
   */
  constructor(options = {}) {
    /**
     * A custom fetch implementation
     */
    this.fetch = fetch;
    this.#ready = false;
    this.credentials = {
      schoolCode: options.schoolCode,
      password: options.password,
      username: options.username
    };
    this.token = options.token;
    this.loginData = options.loginData;
    this.profile = options.profile;
    this.dashboard = options.dashboard;
    this.debug = options.debug ?? false;
    this.version = options.version ?? defaultVersion;
    this.headers = options.headers;
    if (options.dataProvider !== null) this.dataProvider = options.dataProvider;
  }
  static {
    __name(this, "BaseClient");
  }
  static {
    this.BASE_URL = "https://www.portaleargo.it";
  }
  #ready;
  /**
   * Controlla se il client è pronto
   */
  isReady() {
    return this.#ready;
  }
  async apiRequest(path, options = {}) {
    const headers = {
      accept: "application/json",
      "argo-client-version": this.version,
      authorization: `Bearer ${this.token?.access_token ?? ""}`
    };
    options.method ??= options.body ? "POST" : "GET";
    if (options.body != null) headers["content-type"] = "application/json";
    if (this.loginData) {
      headers["x-auth-token"] = this.loginData.token;
      headers["x-cod-min"] = this.loginData.codMin;
    }
    if (this.token)
      headers["x-date-exp-auth"] = formatDate(this.token.expireDate);
    if (this.headers) Object.assign(headers, this.headers);
    const res = await this.fetch(
      `${_BaseClient.BASE_URL}/appfamiglia/api/rest/${path}`,
      {
        headers,
        method: options.method,
        body: options.body != null ? JSON.stringify(options.body) : void 0
      }
    );
    if (this.debug) console.debug(`${options.method} /${path} ${res.status}`);
    return options.noWait ? res : res.json();
  }
  /**
   * Effettua il login.
   * @returns Il client aggiornato
   */
  async login() {
    await Promise.all([
      this.token && this.dataProvider?.write("token", this.token),
      this.loginData && this.dataProvider?.write("login", this.loginData),
      this.profile && this.dataProvider?.write("profile", this.profile),
      this.dashboard && this.dataProvider?.write("dashboard", this.dashboard)
    ]);
    await this.loadData();
    const oldToken = this.token;
    await this.refreshToken();
    if (!this.loginData) await this.getLoginData();
    if (oldToken) {
      this.logToken({
        oldToken,
        isWhat: this.profile !== void 0
      }).catch(console.error);
      if (this.profile) {
        const whatData = await this.what(
          this.dashboard?.dataAggiornamento ?? this.profile.anno.dataInizio
        );
        if (whatData.isModificato || whatData.differenzaSchede) {
          Object.assign(this.profile, whatData);
          void this.dataProvider?.write("profile", this.profile);
        }
        this.#ready = true;
        if (whatData.mostraPallino || !this.dashboard)
          await this.getDashboard();
        this.aggiornaData().catch(console.error);
        return this;
      }
    }
    if (!this.profile) await this.getProfilo();
    this.#ready = true;
    await this.getDashboard();
    return this;
  }
  /**
   * Carica i dati salvati localmente.
   */
  async loadData() {
    if (!this.dataProvider?.read) return;
    const [token, loginData, profile, dashboard] = await Promise.all([
      this.token ? void 0 : this.dataProvider.read("token"),
      this.loginData ? void 0 : this.dataProvider.read("login"),
      this.profile ? void 0 : this.dataProvider.read("profile"),
      this.dashboard ? void 0 : this.dataProvider.read("dashboard")
    ]);
    if (token)
      this.token = { ...token, expireDate: new Date(token.expireDate) };
    if (loginData) this.loginData = loginData;
    if (profile) this.profile = profile;
    if (dashboard)
      this.dashboard = {
        ...dashboard,
        dataAggiornamento: new Date(dashboard.dataAggiornamento)
      };
  }
  /**
   * Aggiorna il client, se necessario.
   * @returns Il nuovo token
   */
  async refreshToken() {
    if (!this.token) return this.getToken();
    if (this.token.expireDate.getTime() <= Date.now()) {
      const date = /* @__PURE__ */ new Date();
      const res = await this.apiRequest("auth/refresh-token", {
        body: {
          "r-token": this.token.refresh_token,
          "client-id": clientId,
          scopes: `[${this.token.scope.split(" ").join(", ")}]`,
          "old-bearer": this.token.access_token,
          "primo-accesso": "false",
          "ripeti-login": "false",
          "exp-bearer": formatDate(this.token.expireDate),
          "ts-app": formatDate(date),
          proc: "initState_global_random_12345",
          username: this.loginData?.username
        },
        noWait: true
      });
      const expireDate = new Date(res.headers.get("date") ?? date);
      const token = await res.json();
      if ("error" in token)
        throw new Error(`${token.error} ${token.error_description}`);
      expireDate.setSeconds(expireDate.getSeconds() + token.expires_in);
      this.token = Object.assign(this.token, token, { expireDate });
      void this.dataProvider?.write("token", this.token);
    }
    return this.token;
  }
  /**
   * Ottieni il token tramite l'API.
   * @param code - The code for the access
   * @returns I dati del token
   */
  async getToken(code) {
    code ??= await this.getCode();
    const { expireDate, ...token } = await getToken(code);
    this.token = Object.assign(this.token ?? {}, token, { expireDate });
    void this.dataProvider?.write("token", this.token);
    return this.token;
  }
  /**
   * Rimuovi il profilo.
   */
  async logOut() {
    if (!this.token || !this.loginData)
      throw new Error("Client is not logged in!");
    await this.rimuoviProfilo();
    delete this.token;
    delete this.loginData;
    delete this.profile;
    delete this.dashboard;
  }
  /**
   * Ottieni i dettagli del profilo dello studente.
   * @returns I dati
   */
  async getDettagliProfilo(old) {
    this.checkReady();
    const body = await this.apiRequest("dettaglioprofilo", {
      method: "POST"
    });
    if (!body.success) throw new Error(body.msg);
    return Object.assign(old ?? {}, body.data);
  }
  /**
   * Ottieni l'orario giornaliero.
   * @param date - Il giorno dell'orario
   * @returns I dati
   */
  async getOrarioGiornaliero(date) {
    this.checkReady();
    const now = /* @__PURE__ */ new Date();
    const orario = await this.apiRequest(
      "orario-giorno",
      {
        body: {
          datGiorno: formatDate(
            `${date?.year ?? now.getFullYear()}-${date?.month ?? now.getMonth() + 1}-${date?.day ?? now.getDate() + 1}`
          )
        }
      }
    );
    if (!orario.success) throw new Error(orario.msg);
    return Object.values(orario.data.dati).flat();
  }
  /**
   * Ottieni il link per scaricare un allegato della bacheca.
   * @param uid - L'uid dell'allegato
   * @returns L'url
   */
  async getLinkAllegato(uid) {
    this.checkReady();
    const download = await this.apiRequest(
      "downloadallegatobacheca",
      { body: { uid } }
    );
    if (!download.success) throw new Error(download.msg);
    return download.url;
  }
  /**
   * Ottieni il link per scaricare un allegato della bacheca alunno.
   * @param uid - l'uid dell'allegato
   * @param pkScheda - L'id del profilo
   * @returns L'url
   */
  async getLinkAllegatoStudente(uid, pkScheda = this.profile?.scheda.pk) {
    this.checkReady();
    const download = await this.apiRequest(
      "downloadallegatobachecaalunno",
      { body: { uid, pkScheda } }
    );
    if (!download.success) throw new Error(download.msg);
    return download.url;
  }
  /**
   * Ottieni i dati di una ricevuta telematica.
   * @param iuv - L'iuv del pagamento
   * @returns La ricevuta
   */
  async getRicevuta(iuv) {
    this.checkReady();
    const ricevuta = await this.apiRequest(
      "ricevutatelematica",
      { body: { iuv } }
    );
    if (!ricevuta.success) throw new Error(ricevuta.msg);
    const { success, msg, ...rest } = ricevuta;
    return rest;
  }
  /**
   * Ottieni i voti dello scrutinio dello studente.
   * @returns I dati
   */
  async getVotiScrutinio() {
    this.checkReady();
    const voti = await this.apiRequest("votiscrutinio", {
      body: {}
    });
    if (!voti.success) throw new Error(voti.msg);
    return voti.data.votiScrutinio[0]?.periodi;
  }
  /**
   * Ottieni i dati riguardo i ricevimenti dello studente.
   * @returns I dati
   */
  async getRicevimenti(old) {
    this.checkReady();
    const ricevimenti = await this.apiRequest("ricevimento", {
      body: {}
    });
    if (!ricevimenti.success) throw new Error(ricevimenti.msg);
    return Object.assign(old ?? {}, ricevimenti.data);
  }
  /**
   * Ottieni le tasse dello studente.
   * @param pkScheda - L'id del profilo
   * @returns I dati
   */
  async getTasse(pkScheda = this.profile?.scheda.pk) {
    this.checkReady();
    const taxes = await this.apiRequest("listatassealunni", {
      body: { pkScheda }
    });
    if (!taxes.success) throw new Error(taxes.msg);
    const { success, msg, data, ...rest } = taxes;
    return {
      ...rest,
      tasse: data
    };
  }
  /**
   * Ottieni i dati del PCTO dello studente.
   * @param pkScheda - L'id del profilo
   * @returns I dati
   */
  async getPCTOData(pkScheda = this.profile?.scheda.pk) {
    this.checkReady();
    const pcto = await this.apiRequest("pcto", {
      body: { pkScheda }
    });
    if (!pcto.success) throw new Error(pcto.msg);
    return pcto.data.pcto;
  }
  /**
   * Ottieni i dati dei corsi di recupero dello studente.
   * @param pkScheda - L'id del profilo
   * @returns I dati
   */
  async getCorsiRecupero(pkScheda = this.profile?.scheda.pk, old) {
    this.checkReady();
    const courses = await this.apiRequest("corsirecupero", {
      body: { pkScheda }
    });
    if (!courses.success) throw new Error(courses.msg);
    return Object.assign(old ?? {}, courses.data);
  }
  /**
   * Ottieni il curriculum dello studente.
   * @param pkScheda - L'id del profilo
   * @returns I dati
   */
  async getCurriculum(pkScheda = this.profile?.scheda.pk) {
    this.checkReady();
    const curriculum = await this.apiRequest(
      "curriculumalunno",
      {
        body: { pkScheda }
      }
    );
    if (!curriculum.success) throw new Error(curriculum.msg);
    return curriculum.data.curriculum;
  }
  /**
   * Ottieni lo storico della bacheca.
   * @param pkScheda - L'id del profilo
   * @returns I dati
   */
  async getStoricoBacheca(pkScheda) {
    this.checkReady();
    const bacheca = await this.apiRequest("storicobacheca", {
      body: { pkScheda }
    });
    if (!bacheca.success) throw new Error(bacheca.msg);
    return handleOperation(bacheca.data.bacheca);
  }
  /**
   * Ottieni lo storico della bacheca alunno.
   * @param pkScheda - L'id del profilo
   * @returns I dati
   */
  async getStoricoBachecaAlunno(pkScheda) {
    this.checkReady();
    const bacheca = await this.apiRequest(
      "storicobachecaalunno",
      {
        body: { pkScheda }
      }
    );
    if (!bacheca.success) throw new Error(bacheca.msg);
    return handleOperation(bacheca.data.bachecaAlunno);
  }
  /**
   * Ottieni i dati della dashboard.
   * @returns La dashboard
   */
  async getDashboard() {
    this.checkReady();
    const date = /* @__PURE__ */ new Date();
    const res = await this.apiRequest("dashboard/dashboard", {
      body: {
        dataultimoaggiornamento: formatDate(
          this.dashboard?.dataAggiornamento ?? this.profile.anno.dataInizio
        ),
        opzioni: JSON.stringify(
          Object.fromEntries(
            (this.dashboard ?? this.loginData).opzioni.map((a) => [
              a.chiave,
              a.valore
            ])
          )
        )
      },
      noWait: true
    });
    const body = await res.json();
    if (!body.success) throw new Error(body.msg);
    const [data] = body.data.dati;
    this.dashboard = Object.assign(
      (data.rimuoviDatiLocali ? null : this.dashboard) ?? {},
      {
        ...data,
        fuoriClasse: handleOperation(
          data.fuoriClasse,
          data.rimuoviDatiLocali ? void 0 : this.dashboard?.fuoriClasse
        ),
        promemoria: handleOperation(
          data.promemoria,
          data.rimuoviDatiLocali ? void 0 : this.dashboard?.promemoria
        ),
        bacheca: handleOperation(
          data.bacheca,
          data.rimuoviDatiLocali ? void 0 : this.dashboard?.bacheca
        ),
        voti: handleOperation(
          data.voti,
          data.rimuoviDatiLocali ? void 0 : this.dashboard?.voti
        ),
        bachecaAlunno: handleOperation(
          data.bachecaAlunno,
          data.rimuoviDatiLocali ? void 0 : this.dashboard?.bachecaAlunno
        ),
        registro: handleOperation(
          data.registro,
          data.rimuoviDatiLocali ? void 0 : this.dashboard?.registro
        ),
        appello: handleOperation(
          data.appello,
          data.rimuoviDatiLocali ? void 0 : this.dashboard?.appello
        ),
        prenotazioniAlunni: handleOperation(
          data.prenotazioniAlunni,
          data.rimuoviDatiLocali ? void 0 : this.dashboard?.prenotazioniAlunni,
          (a) => a.prenotazione.pk
        ),
        dataAggiornamento: new Date(res.headers.get("date") ?? date)
      }
    );
    void this.dataProvider?.write("dashboard", this.dashboard);
    return this.dashboard;
  }
  async getProfilo() {
    const profile = await this.apiRequest("profilo");
    if (!profile.success) throw new Error(profile.msg);
    this.profile = Object.assign(this.profile ?? {}, profile.data);
    void this.dataProvider?.write("profile", this.profile);
    return this.profile;
  }
  async getLoginData() {
    const login = await this.apiRequest("login", {
      body: {
        "lista-opzioni-notifiche": "{}",
        "lista-x-auth-token": "[]",
        clientID: randomString(163)
      }
    });
    if (!login.success) throw new Error(login.msg);
    this.loginData = Object.assign(this.loginData ?? {}, login.data[0]);
    void this.dataProvider?.write("login", this.loginData);
    return this.loginData;
  }
  async logToken(options) {
    const res = await this.apiRequest("logtoken", {
      body: {
        bearerOld: options.oldToken.access_token,
        dateExpOld: formatDate(options.oldToken.expireDate),
        refreshOld: options.oldToken.refresh_token,
        bearerNew: this.token?.access_token,
        dateExpNew: this.token?.expireDate && formatDate(this.token.expireDate),
        refreshNew: this.token?.refresh_token,
        isWhat: (options.isWhat ?? false).toString(),
        isRefreshed: (this.token?.access_token === options.oldToken.access_token).toString(),
        proc: "initState_global_random_12345"
      }
    });
    if (!res.success) throw new Error(res.msg);
  }
  async rimuoviProfilo() {
    const res = await this.apiRequest("rimuoviprofilo", {
      body: {}
    });
    if (!res.success) throw new Error(res.msg);
    await this.dataProvider?.reset();
  }
  async what(lastUpdate, old) {
    const authToken = JSON.stringify([this.loginData?.token]);
    const opzioni = (this.dashboard ?? this.loginData)?.opzioni;
    const what = await this.apiRequest("dashboard/what", {
      body: {
        dataultimoaggiornamento: formatDate(lastUpdate),
        opzioni: opzioni && JSON.stringify(
          Object.fromEntries(opzioni.map((a) => [a.chiave, a.valore]))
        ),
        "lista-x-auth-token": authToken,
        "lista-x-auth-token-account": authToken
      }
    });
    if (!what.success) throw new Error(what.msg);
    return Object.assign(old ?? {}, what.data.dati[0]);
  }
  async aggiornaData() {
    const res = await this.apiRequest("dashboard/aggiornadata", {
      body: { dataultimoaggiornamento: formatDate(/* @__PURE__ */ new Date()) }
    });
    if (!res.success) throw new Error(res.msg);
  }
  checkReady() {
    if (!this.isReady()) throw new Error("Client is not logged in!");
  }
};

// src/util/getCode.ts
import { CookieAgent } from "http-cookie-agent/undici";
import { ok } from "node:assert";
import { URL, URLSearchParams as URLSearchParams2 } from "node:url";
import { CookieJar } from "tough-cookie";
import { interceptors, request } from "undici";
var getCode = /* @__PURE__ */ __name(async (credentials) => {
  const link = await generateLoginLink();
  const dispatcher = new CookieAgent({
    allowH2: true,
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: 1,
    cookies: { jar: new CookieJar() }
  }).compose(
    interceptors.retry(),
    interceptors.redirect({ maxRedirections: 3 })
  );
  const url = (await request(link.url, { dispatcher, maxRedirections: 0 })).headers.location;
  ok(typeof url === "string", "Invalid login url");
  const challenge = new URL(url).searchParams.get("login_challenge");
  ok(challenge, "Invalid login challenge");
  const { location } = await request(
    "https://www.portaleargo.it/auth/sso/login",
    {
      dispatcher,
      body: new URLSearchParams2({
        challenge,
        client_id: clientId,
        famiglia_customer_code: credentials.schoolCode,
        login: "true",
        password: credentials.password,
        username: credentials.username
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST"
    }
  ).then((r) => r.headers);
  ok(typeof location === "string", "Invalid login redirect");
  const code = new URL(location).searchParams.get("code");
  ok(code, "Invalid login code");
  return { ...link, code };
}, "getCode");

// src/util/importData.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
var importData = /* @__PURE__ */ __name(async (name, path) => {
  try {
    return JSON.parse(
      await readFile(join(path, `${name}.json`), {
        encoding: "utf8"
      })
    );
  } catch {
    return void 0;
  }
}, "importData");

// src/util/writeToFile.ts
import { writeFile } from "node:fs/promises";
import { join as join2 } from "node:path";
var writeToFile = /* @__PURE__ */ __name((name, value, path) => writeFile(`${join2(path, name)}.json`, JSON.stringify(value)).catch(
  console.error
), "writeToFile");

// src/Client.ts
var factory = /* @__PURE__ */ __name((origin, opts) => new CookieClient(origin, {
  ...opts,
  cookies: { jar: new CookieJar2() }
}), "factory");
var Client = class _Client extends BaseClient {
  /**
   * @param options - Le opzioni per il client
   */
  constructor(options = {}) {
    super(options);
    this.fetch = this.createFetch();
    this.credentials = {
      schoolCode: options.schoolCode ?? env.CODICE_SCUOLA,
      password: options.password ?? env.PASSWORD,
      username: options.username ?? env.NOME_UTENTE
    };
    this.dispatcher = new Pool(BaseClient.BASE_URL, {
      allowH2: true,
      autoSelectFamily: true,
      factory,
      ...options.poolOptions
    }).compose(
      interceptors2.retry({
        maxRetries: 4,
        minTimeout: 100,
        timeoutFactor: 4,
        maxTimeout: 1e4,
        ...options.retryOptions
      }),
      interceptors2.cache({
        cacheByDefault: 36e5,
        type: "private",
        ...options.cacheOptions
      })
    );
    if (options.dataProvider !== null)
      this.dataProvider ??= _Client.createDataProvider(
        options.dataPath ?? void 0
      );
  }
  static {
    __name(this, "Client");
  }
  static createDataProvider(dataPath = join3(cwd(), ".argo")) {
    let exists = existsSync(dataPath);
    return {
      read: /* @__PURE__ */ __name((name) => importData(name, dataPath), "read"),
      write: /* @__PURE__ */ __name(async (name, value) => {
        if (!exists) {
          exists = true;
          await mkdir(dataPath);
        }
        return writeToFile(name, value, dataPath);
      }, "write"),
      reset: /* @__PURE__ */ __name(() => rm(dataPath, { recursive: true, force: true }), "reset")
    };
  }
  createFetch() {
    return (info, init) => fetch2(info, {
      dispatcher: this.dispatcher,
      ...init
    });
  }
  async getCode() {
    if ([
      this.credentials?.password,
      this.credentials?.schoolCode,
      this.credentials?.username
    ].includes(void 0))
      throw new TypeError("Password, school code, or username missing");
    return getCode(this.credentials);
  }
};
export {
  Client,
  clientId,
  defaultVersion,
  encryptCodeVerifier,
  formatDate,
  generateLoginLink,
  getCode,
  getToken,
  handleOperation,
  importData,
  randomString,
  writeToFile
};
//# sourceMappingURL=index.js.map