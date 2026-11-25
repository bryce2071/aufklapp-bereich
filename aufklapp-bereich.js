/*
 * Aufklapp-Bereich – Karte für Home Assistant  –  v1.0.0
 *
 * Eine Überschrift mit Doppelpfeil ganz rechts. Darunter Karten, die immer sichtbar sind, und Karten,
 * die erst nach einem Tipp auf den Pfeil erscheinen (und mit einem zweiten Tipp wieder verschwinden).
 * In der Überschrift links neben dem Pfeil eine Vorschau: die Symbole der gewählten Geräte, solange
 * sie eingeschaltet sind.
 *
 * Alles lässt sich im grafischen Editor einstellen – auch die Karten selbst (hinzufügen, bearbeiten,
 * verschieben, löschen), genau wie in einem Stapel.
 *
 * type: custom:aufklapp-bereich
 * titel: Beleuchtung                 # Überschrift
 * icon: mdi:lightbulb-group          # optional, Symbol vor der Überschrift
 * stil: title                        # optional, title = groß (Standard), subtitle = klein
 * vorschau:                          # optional, Symbol in der Überschrift, solange das Gerät an ist
 *   - light.esstisch                 #   (das Symbol wird aus den Karten übernommen, falls dort eins steht)
 * aufgeklappt: false                 # optional, beim Öffnen des Dashboards schon aufgeklappt
 * merken: false                      # optional, letzten Zustand auf diesem Gerät merken
 * helfer: input_boolean.xyz          # optional, Zustand über einen Helfer – dann auf allen Geräten gleich
 * karten:                            # immer sichtbar
 *   - type: light
 *     entity: light.esstisch
 *     grid_options: { columns: 3, rows: 3 }   # optional, Breite/Höhe wie in einer Abschnitts-Ansicht
 * details:                           # aufklappbar
 *   - type: entities
 *     entities: [light.wohnzimmer]
 *
 * Breite der Karten: wie in einer Abschnitts-Ansicht auf einem Raster mit 12 Spalten. Jede Karte bringt
 * ihre übliche Breite mit (Kachel = halbe Breite, die meisten anderen = ganze Breite); „grid_options“
 * im Code-Editor einer Karte ändert das. Mehrere Karten nebeneinander geht auch mit einer Raster-Karte.
 *
 * Quelle: https://github.com/bryce2071/aufklapp-bereich (MIT-Lizenz)
 */
(() => {
  const TAG = "aufklapp-bereich";
  const EDITOR_TAG = "aufklapp-bereich-editor";
  const VERSION = "1.0.0";
  if (customElements.get(TAG)) return;

  const ICON_ZU = "mdi:chevron-double-down";
  const ICON_AUF = "mdi:chevron-double-up";
  const ROW = "var(--row-height, 56px)";
  const GAP = "var(--row-gap, 8px)";

  const STYLE = `
    :host { display: block; }
    [hidden] { display: none !important; }
    .raster {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-auto-flow: row dense;
      gap: ${GAP} var(--column-gap, 8px);
    }
    .raster > * { grid-column: span 12; min-width: 0; box-sizing: border-box; }
    .details { margin-top: ${GAP}; }
    .details.zu-vorschau { opacity: 0.5; }
  `;

  // ---------- Hilfen ----------

  const liste = (v) => (Array.isArray(v) ? v : []);
  const kopie = (v) => JSON.parse(JSON.stringify(v));

  // Symbol einer Entität aus den Karten übernehmen (z. B. das eigene Symbol einer Licht-Karte)
  function symbolAusKarten(entityId, karten) {
    let gefunden = null;
    const suchen = (o) => {
      if (gefunden || !o || typeof o !== "object") return;
      if (Array.isArray(o)) {
        o.forEach(suchen);
        return;
      }
      if (o.entity === entityId && typeof o.icon === "string" && o.icon) {
        gefunden = o.icon;
        return;
      }
      Object.values(o).forEach(suchen);
    };
    suchen(karten);
    return gefunden;
  }

  function speicherSchluessel(cfg) {
    const ort = (typeof location !== "undefined" && location.pathname) || "";
    return `${TAG}:${ort}:${cfg.speicher_id || cfg.titel || ""}`;
  }

  function lesen(schluessel) {
    try {
      const v = window.localStorage.getItem(schluessel);
      return v === null ? null : v === "1";
    } catch (e) {
      return null;
    }
  }

  function schreiben(schluessel, offen) {
    try {
      window.localStorage.setItem(schluessel, offen ? "1" : "0");
    } catch (e) {
      /* z. B. privater Modus – dann eben nicht merken */
    }
  }

  // ---------- Karte ----------

  class AufklappBereich extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._id = `ab-${Math.random().toString(36).slice(2, 10)}`;
      this._offen = false;
      this._preview = false;
      this._karten = [];
      this._details = [];
      this.shadowRoot.addEventListener("ll-custom", (ev) => this._llCustom(ev));
      this.shadowRoot.addEventListener("card-updated", () => this._layout());
    }

    static getConfigElement() {
      return document.createElement(EDITOR_TAG);
    }

    static getStubConfig() {
      return { titel: "Neuer Bereich", karten: [], details: [] };
    }

    setConfig(config) {
      if (!config || typeof config !== "object") throw new Error("Ungültige Konfiguration.");
      for (const k of ["karten", "details", "vorschau"]) {
        if (config[k] !== undefined && config[k] !== null && !Array.isArray(config[k])) {
          throw new Error(`'${k}' muss eine Liste sein.`);
        }
      }
      if (config.helfer && !String(config.helfer).startsWith("input_boolean.")) {
        throw new Error("Der Helfer muss ein input_boolean sein (Ein/Aus-Schalter).");
      }
      this._config = {
        ...config,
        karten: liste(config.karten),
        details: liste(config.details),
        vorschau: liste(config.vorschau).filter((e) => typeof e === "string" && e),
      };
      this._schluessel = speicherSchluessel(this._config);
      this._offen = this._startZustand();
      this._aufbauen();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._config) return;
      if (this._config.helfer) {
        const st = hass.states[this._config.helfer];
        const offen = !!st && st.state === "on";
        if (offen !== this._offen) {
          this._offen = offen;
          this._anwenden();
        }
      }
      this._alle().forEach((el) => {
        el.hass = hass;
      });
      this._layout();
    }

    get hass() {
      return this._hass;
    }

    set preview(v) {
      this._preview = !!v;
      this._alle().forEach((el) => {
        el.preview = this._preview;
      });
      this._anwenden();
    }

    get preview() {
      return this._preview;
    }

    getCardSize() {
      const c = this._config || {};
      return 1 + liste(c.karten).length + (this._offen ? liste(c.details).length : 0);
    }

    getGridOptions() {
      return { columns: "full", rows: "auto", min_columns: 3 };
    }

    // ---------- Zustand ----------

    _startZustand() {
      const c = this._config;
      if (c.helfer) {
        const st = this._hass && this._hass.states[c.helfer];
        return !!st && st.state === "on";
      }
      if (c.merken) {
        const gemerkt = lesen(this._schluessel);
        if (gemerkt !== null) return gemerkt;
      }
      return c.aufgeklappt === true;
    }

    _umschalten() {
      const c = this._config;
      if (c.helfer) {
        if (this._hass) this._hass.callService("input_boolean", "toggle", { entity_id: c.helfer });
        return; // der neue Zustand kommt mit dem nächsten hass
      }
      this._offen = !this._offen;
      if (c.merken) schreiben(this._schluessel, this._offen);
      this._anwenden();
    }

    _llCustom(ev) {
      const d = ev.detail && ev.detail.aufklapp_bereich;
      if (!d || d.id !== this._id) return; // fremde Ereignisse (z. B. andere Karten) weiterreichen
      ev.stopPropagation();
      this._umschalten();
    }

    // ---------- Aufbau ----------

    _kopfConfig() {
      const c = this._config;
      const alleKarten = [...c.karten, ...c.details];
      const badges = c.vorschau.map((entity) => {
        const icon = symbolAusKarten(entity, alleKarten);
        return {
          type: "entity",
          entity,
          ...(icon ? { icon } : {}),
          show_state: false,
          show_icon: true,
          color: "state",
          tap_action: { action: "none" },
          visibility: [{ condition: "state", entity, state: "on" }],
        };
      });
      if (c.details.length) {
        badges.push({
          type: "button",
          icon: this._offen ? ICON_AUF : ICON_ZU,
          tap_action: { action: "fire-dom-event", aufklapp_bereich: { id: this._id } },
        });
      }
      return {
        type: "heading",
        heading: c.titel || "",
        heading_style: c.stil === "subtitle" ? "subtitle" : "title",
        ...(c.icon ? { icon: c.icon } : {}),
        badges,
      };
    }

    _neueKarte(cfg) {
      let el;
      if (customElements.get("hui-card")) {
        el = document.createElement("hui-card");
        el.preview = this._preview;
        el.config = cfg;
        if (this._hass) el.hass = this._hass;
        if (typeof el.load === "function") el.load();
      } else {
        // sehr alte Versionen ohne hui-card: Karte direkt erzeugen, sobald die Helfer geladen sind
        el = document.createElement("div");
        if (window.loadCardHelpers) {
          window.loadCardHelpers().then((helpers) => {
            const karte = helpers.createCardElement(cfg);
            karte.hass = this._hass;
            el.replaceWith(karte);
            this._ersetzen(el, karte);
            this._layout();
          });
        }
      }
      el._abConfig = cfg;
      return el;
    }

    _ersetzen(alt, neu) {
      neu._abConfig = alt._abConfig;
      for (const l of [this._karten, this._details]) {
        const i = l.indexOf(alt);
        if (i >= 0) l[i] = neu;
      }
      if (this._kopf === alt) this._kopf = neu;
    }

    _aufbauen() {
      const root = this.shadowRoot;
      root.innerHTML = `
        <style>${STYLE}</style>
        <div class="raster oben"></div>
        <div class="raster details"></div>`;
      const oben = root.querySelector(".oben");
      this._detailsBox = root.querySelector(".details");
      this._kopf = this._neueKarte(this._kopfConfig());
      oben.appendChild(this._kopf);
      this._karten = this._config.karten.map((k) => this._neueKarte(kopie(k)));
      this._karten.forEach((el) => oben.appendChild(el));
      this._details = this._config.details.map((k) => this._neueKarte(kopie(k)));
      this._details.forEach((el) => this._detailsBox.appendChild(el));
      this._anwenden(false);
      this._layout();
      // Karten, die erst nachgeladen werden, kennen ihre Größe später – dann noch einmal anordnen
      requestAnimationFrame(() => this._layout());
      setTimeout(() => this._layout(), 500);
      setTimeout(() => this._layout(), 2000);
    }

    _alle() {
      return [this._kopf, ...this._karten, ...this._details].filter(Boolean);
    }

    _anwenden(kopfNeu = true) {
      if (!this._detailsBox) return;
      const zeigen = this._offen || this._preview;
      this._detailsBox.hidden = !zeigen || this._details.length === 0;
      this._detailsBox.classList.toggle("zu-vorschau", this._preview && !this._offen);
      if (kopfNeu && this._kopf) {
        const cfg = this._kopfConfig();
        this._kopf._abConfig = cfg;
        if ("config" in this._kopf) this._kopf.config = cfg;
        else if (typeof this._kopf.setConfig === "function") this._kopf.setConfig(cfg);
      }
    }

    // Breite und Höhe wie in einer Abschnitts-Ansicht (12 Spalten, Zeilen zu 56 px)
    _layout() {
      this._alle().forEach((el) => {
        const cfg = el._abConfig || {};
        let opt = {};
        try {
          opt = (typeof el.getGridOptions === "function" && el.getGridOptions()) || {};
        } catch (e) {
          opt = {};
        }
        const eigene = cfg.grid_options || {};
        const spalten = eigene.columns !== undefined ? eigene.columns : opt.columns;
        const zeilen = eigene.rows !== undefined ? eigene.rows : opt.rows;
        const breite = spalten === "full" || spalten === undefined ? 12 : Math.max(1, Math.min(12, Number(spalten) || 12));
        const gc = `span ${breite}`;
        if (el.style.gridColumn !== gc) el.style.gridColumn = gc;
        const z = Number(zeilen);
        const hoehe = Number.isFinite(z) && z > 0 ? `calc(${z} * ${ROW} + ${z - 1} * ${GAP})` : "";
        if (el.style.height !== hoehe) el.style.height = hoehe;
      });
    }
  }

  // ---------- Editor ----------

  // HA lädt seine Formular-Bausteine (ha-form, Auswahlfelder) erst mit einem Editor –
  // einmal den Editor der Entitäten-Karte laden, dann sind sie da.
  let formVersprechen = null;
  function haFormLaden() {
    if (!formVersprechen) {
      formVersprechen = (async () => {
        try {
          if (window.loadCardHelpers) {
            const helpers = await window.loadCardHelpers();
            const c = await helpers.createCardElement({ type: "entities", entities: [] });
            if (c && c.constructor && c.constructor.getConfigElement) await c.constructor.getConfigElement();
          }
        } catch (e) {
          /* egal – ha-form kommt dann mit dem Editor */
        }
      })();
    }
    return formVersprechen.then(() => customElements.whenDefined("ha-form"));
  }

  // Den Karten-Editor des Stapels von HA ausleihen: Karten auswählen, bearbeiten, verschieben, löschen
  let stapelVersprechen = null;
  function stapelKlasse() {
    if (!stapelVersprechen) {
      stapelVersprechen = (async () => {
        if (!customElements.get("hui-vertical-stack-card") && window.loadCardHelpers) {
          const helpers = await window.loadCardHelpers();
          helpers.createCardElement({ type: "vertical-stack", cards: [] });
        }
        await customElements.whenDefined("hui-vertical-stack-card");
        return customElements.get("hui-vertical-stack-card");
      })();
    }
    return stapelVersprechen;
  }

  const SCHEMA = [
    { name: "titel", selector: { text: {} } },
    { name: "icon", selector: { icon: {} } },
    { name: "vorschau", selector: { entity: { multiple: true } } },
    {
      name: "",
      type: "grid",
      schema: [
        { name: "aufgeklappt", selector: { boolean: {} } },
        { name: "merken", selector: { boolean: {} } },
      ],
    },
    { name: "helfer", selector: { entity: { filter: { domain: "input_boolean" } } } },
    {
      name: "stil",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "title", label: "Groß" },
            { value: "subtitle", label: "Klein" },
          ],
        },
      },
    },
  ];

  const LABEL = {
    titel: "Überschrift",
    icon: "Symbol",
    vorschau: "Vorschau in der Überschrift",
    aufgeklappt: "Beim Öffnen aufgeklappt",
    merken: "Zustand auf diesem Gerät merken",
    helfer: "Helfer (optional)",
    stil: "Größe der Überschrift",
  };

  const HILFE = {
    vorschau: "Diese Geräte erscheinen als Symbol neben dem Pfeil, solange sie an sind.",
    merken: "Sonst ist der Bereich nach jedem Neuladen wieder im Ausgangszustand.",
    helfer: "Mit einem Ein/Aus-Helfer ist der Bereich auf allen Geräten gleich auf- oder zugeklappt.",
  };

  const EDITOR_STYLE = `
    :host { display: block; }
    .liste {
      margin-top: 16px;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
      border-radius: 12px;
      overflow: hidden;
    }
    .liste > summary {
      cursor: pointer;
      padding: 12px 16px;
      font-weight: 500;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .liste > summary::-webkit-details-marker { display: none; }
    .liste > summary ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); transition: transform 0.2s ease; }
    .liste[open] > summary ha-icon { transform: rotate(90deg); }
    .liste > summary .anzahl { color: var(--secondary-text-color); font-weight: 400; }
    .liste .inhalt { padding: 0 12px 12px; }
    .liste .tipp { color: var(--secondary-text-color); font-size: 0.9em; margin: 0 4px 8px; }
  `;

  class AufklappBereichEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._cfg = {};
      this._stapel = {};
      this._stapelJson = {};
    }

    set hass(h) {
      this._hass = h;
      if (this._form) this._form.hass = h;
      Object.values(this._stapel).forEach((s) => {
        s.hass = h;
      });
    }

    set lovelace(l) {
      this._lovelace = l;
      Object.values(this._stapel).forEach((s) => {
        s.lovelace = l;
      });
    }

    setConfig(cfg) {
      this._cfg = { ...(cfg || {}) };
      this._aktualisieren();
    }

    connectedCallback() {
      if (this._gestartet) return;
      this._gestartet = true;
      this._aufbauen();
    }

    async _aufbauen() {
      await haFormLaden();
      let Stapel = null;
      try {
        Stapel = await stapelKlasse();
      } catch (e) {
        Stapel = null;
      }
      const root = this.shadowRoot;
      root.innerHTML = `
        <style>${EDITOR_STYLE}</style>
        <div class="form"></div>
        <details class="liste" data-key="karten">
          <summary><ha-icon icon="mdi:chevron-right"></ha-icon>Immer sichtbare Karten <span class="anzahl"></span></summary>
          <div class="inhalt">
            <div class="tipp">Bleiben auch zugeklappt sichtbar, z. B. die wichtigsten Lampen.</div>
          </div>
        </details>
        <details class="liste" data-key="details">
          <summary><ha-icon icon="mdi:chevron-right"></ha-icon>Aufklappbare Karten <span class="anzahl"></span></summary>
          <div class="inhalt">
            <div class="tipp">Erscheinen erst nach einem Tipp auf den Doppelpfeil.</div>
          </div>
        </details>`;

      const form = document.createElement("ha-form");
      form.schema = SCHEMA;
      form.computeLabel = (s) => LABEL[s.name] || s.name;
      form.computeHelper = (s) => HILFE[s.name];
      form.hass = this._hass;
      form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._formGeaendert(ev.detail.value || {});
      });
      root.querySelector(".form").appendChild(form);
      this._form = form;

      for (const key of ["karten", "details"]) {
        const box = root.querySelector(`.liste[data-key="${key}"] .inhalt`);
        if (!Stapel || typeof Stapel.getConfigElement !== "function") {
          const hinweis = document.createElement("div");
          hinweis.className = "tipp";
          hinweis.textContent = "Der Karten-Editor ließ sich nicht laden – die Karten bitte im Code-Editor bearbeiten.";
          box.appendChild(hinweis);
          continue;
        }
        const ed = await Stapel.getConfigElement();
        ed.hass = this._hass;
        if (this._lovelace) ed.lovelace = this._lovelace;
        ed.addEventListener("config-changed", (ev) => {
          ev.stopPropagation();
          const cards = (ev.detail && ev.detail.config && ev.detail.config.cards) || [];
          this._kartenGeaendert(key, cards);
        });
        ed.addEventListener("GUImode-changed", (ev) => ev.stopPropagation());
        box.appendChild(ed);
        this._stapel[key] = ed;
      }
      // eine leere Liste gleich aufklappen, damit man sofort Karten hinzufügen kann
      root.querySelectorAll(".liste").forEach((d) => {
        if (!liste(this._cfg[d.dataset.key]).length) d.open = true;
      });
      this._aktualisieren();
    }

    _formDaten() {
      const c = this._cfg;
      return {
        titel: c.titel || "",
        icon: c.icon || "",
        vorschau: liste(c.vorschau),
        aufgeklappt: c.aufgeklappt === true,
        merken: c.merken === true,
        helfer: c.helfer || "",
        stil: c.stil === "subtitle" ? "subtitle" : "title",
      };
    }

    _aktualisieren() {
      if (!this._form) return;
      const daten = this._formDaten();
      if (JSON.stringify(this._form.data) !== JSON.stringify(daten)) this._form.data = daten;
      for (const key of ["karten", "details"]) {
        const cards = liste(this._cfg[key]);
        const anzahl = this.shadowRoot.querySelector(`.liste[data-key="${key}"] .anzahl`);
        if (anzahl) anzahl.textContent = `(${cards.length})`;
        const ed = this._stapel[key];
        if (!ed) continue;
        const j = JSON.stringify(cards);
        if (this._stapelJson[key] !== j) {
          this._stapelJson[key] = j;
          ed.setConfig({ type: "vertical-stack", cards: kopie(cards) });
        }
      }
    }

    _formGeaendert(v) {
      const neu = { ...this._cfg };
      neu.titel = v.titel || "";
      for (const k of ["icon", "helfer"]) {
        if (v[k]) neu[k] = v[k];
        else delete neu[k];
      }
      neu.vorschau = liste(v.vorschau);
      for (const k of ["aufgeklappt", "merken"]) {
        if (v[k] === true) neu[k] = true;
        else delete neu[k];
      }
      if (v.stil === "subtitle") neu.stil = "subtitle";
      else delete neu.stil;
      this._senden(neu);
    }

    _kartenGeaendert(key, cards) {
      this._stapelJson[key] = JSON.stringify(cards);
      this._senden({ ...this._cfg, [key]: cards });
    }

    _senden(cfg) {
      // feste Reihenfolge, damit der Code-Editor übersichtlich bleibt
      const ordnung = ["type", "titel", "icon", "stil", "vorschau", "aufgeklappt", "merken", "helfer", "karten", "details"];
      const sortiert = {};
      ordnung.forEach((k) => {
        if (cfg[k] !== undefined) sortiert[k] = cfg[k];
      });
      Object.keys(cfg).forEach((k) => {
        if (!(k in sortiert)) sortiert[k] = cfg[k];
      });
      this._cfg = sortiert;
      this._aktualisieren();
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: sortiert }, bubbles: true, composed: true }));
    }
  }

  customElements.define(TAG, AufklappBereich);
  if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, AufklappBereichEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: TAG,
    name: "Aufklapp-Bereich",
    description:
      "Überschrift mit Doppelpfeil: einige Karten immer sichtbar, weitere Karten per Tipp auf- und zuklappen. Vorschau eingeschalteter Geräte in der Überschrift.",
    preview: true,
  });
  console.info(`%c AUFKLAPP-BEREICH %c ${VERSION} `, "color:#fff;background:#4a90d9;font-weight:600", "color:#4a90d9");
})();
