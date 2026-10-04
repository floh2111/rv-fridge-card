/**
 * RV Fridge Card - Lovelace-Karte fuer eine Kompressor-Kuehlbox
 *
 * Bildet die Bedienung der Kuehlbox-Seite des Fridolin-Displays als Karte
 * nach (Ring mit Zieltemperatur, Ist-Wert, Ein/Aus, Modus, Batterieschutz),
 * nur untereinander statt in Spalten. Gedacht fuer eine Kuehlbox, die ueber
 * ESPHome (z.B. Tuya-BLE) in Home Assistant steht:
 *
 *   - entity_power: switch   - Ein/Aus
 *   - entity_target: select  - Zieltemperatur, Optionen "-20 °C" ... "20 °C"
 *   - entity_mode: select    - Modus, Optionen "MAX" / "ECO"
 *   - entity_battery_protection: select - Optionen "L" / "M" / "H"
 *   - entity_temp: sensor    - Ist-Temperatur
 *   - entity_battery / entity_voltage: sensor (optional)
 *
 * Einbindung (siehe README.md):
 *   type: custom:rv-fridge-card
 *   title: Kühlbox
 *   entity_power: switch.fridolin_display_kuhlbox_power
 *   ...
 */

const TRANSLATIONS = {
  en: {
    default_title: "Fridge",
    connected: "Connected",
    disconnected: "Disconnected",
    cooling: "Cooling",
    ready: "Ready",
    off: "Off",
    no_data: "No data",
    actual: "Actual",
    power: "On/Off",
    mode: "Mode",
    battery_protection: "Battery protection",
    battery: "Battery",
    voltage: "Voltage",
    editor_title: "Title",
    editor_entity_power: "Power switch",
    editor_entity_target: "Target temperature (select)",
    editor_entity_mode: "Mode (select)",
    editor_entity_battery_protection: "Battery protection (select)",
    editor_entity_temp: "Temperature sensor",
    editor_entity_battery: "Battery sensor (optional)",
    editor_entity_voltage: "Voltage sensor (optional)",
  },
  de: {
    default_title: "Kühlbox",
    connected: "Verbunden",
    disconnected: "Getrennt",
    cooling: "Kühlt",
    ready: "Bereit",
    off: "Aus",
    no_data: "Keine Daten",
    actual: "Ist",
    power: "Ein/Aus",
    mode: "Modus",
    battery_protection: "Batterieschutz",
    battery: "Batterie",
    voltage: "Spannung",
    editor_title: "Titel",
    editor_entity_power: "Schalter Ein/Aus",
    editor_entity_target: "Zieltemperatur (Select)",
    editor_entity_mode: "Modus (Select)",
    editor_entity_battery_protection: "Batterieschutz (Select)",
    editor_entity_temp: "Temperatursensor",
    editor_entity_battery: "Batteriesensor (optional)",
    editor_entity_voltage: "Spannungssensor (optional)",
  },
};

function t(key, hass) {
  const lang = ((hass && hass.language) || "en").toLowerCase().split("-")[0];
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

const T_MIN = -20;
const T_MAX = 20;
// Verbindung gilt als "getrennt", wenn der Temperaturwert aelter ist
const STALE_MS = 5 * 60 * 1000;
// Kurze Ruhe nach dem letzten Klick auf -/+, dann geht EIN Befehl raus
const DEBOUNCE_MS = 600;

const RING = { cx: 130, cy: 130, r: 108, start: 135, sweep: 270 };

function polar(angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: RING.cx + RING.r * Math.cos(a), y: RING.cy + RING.r * Math.sin(a) };
}

function arcPath(fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0) return "";
  const sweep = RING.sweep * f;
  const p0 = polar(RING.start);
  const p1 = polar(RING.start + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${RING.r} ${RING.r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

const fmt = (v, digits = 0) => v.toFixed(digits).replace(".", ",").replace("-", "−");

const CARD_STYLE = `
  :host { display: block; }
  ha-card {
    --rf-bg: var(--rv-fridge-bg, #101820);
    --rf-panel: var(--rv-fridge-panel, #1b2a41);
    --rf-button: var(--rv-fridge-button, #2b3a55);
    --rf-active: var(--rv-fridge-active, #3fa8dc);
    --rf-text: var(--rv-fridge-text, #ffffff);
    --rf-muted: var(--rv-fridge-muted, #9fb0c7);
    background: var(--rf-bg);
    color: var(--rf-text);
    padding: 14px 16px 18px;
  }
  .rf-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .rf-title { font-size: 1.5em; font-weight: 600; }
  .rf-conn { font-size: 0.85em; color: var(--rf-muted); display: flex; align-items: center; gap: 6px; }
  .rf-dot { width: 9px; height: 9px; border-radius: 50%; background: #e0493f; }
  .rf-dot.ok { background: #3fa34d; }
  .rf-ring { position: relative; max-width: 300px; margin: 0 auto; }
  .rf-ring svg { display: block; width: 100%; height: auto; }
  .rf-track { fill: none; stroke: var(--rf-button); stroke-width: 18; stroke-linecap: round; }
  .rf-value { fill: none; stroke: var(--rf-active); stroke-width: 18; stroke-linecap: round; transition: stroke 200ms ease; }
  .rf-value.off { stroke: #55606f; }
  .rf-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    pointer-events: none; padding-bottom: 6%;
  }
  .rf-status { font-size: 1em; color: var(--rf-muted); margin-bottom: 2px; }
  .rf-target { font-size: 3em; font-weight: 600; line-height: 1.05; font-variant-numeric: tabular-nums; }
  .rf-actual { font-size: 1.05em; color: var(--rf-muted); margin-top: 4px; font-variant-numeric: tabular-nums; }
  .rf-adjust { display: flex; justify-content: center; gap: 56px; margin-top: -6px; }
  .rf-btn {
    appearance: none; border: none; cursor: pointer; font-family: inherit;
    background: var(--rf-button); color: var(--rf-text);
    border-radius: 14px; font-size: 1.05em; font-weight: 600;
    min-height: 52px; padding: 0 18px;
    transition: filter 150ms ease, background 150ms ease, transform 100ms ease;
  }
  .rf-btn:hover { filter: brightness(1.12); }
  .rf-btn:active { transform: translateY(1px); filter: brightness(0.95); }
  .rf-btn.active { background: var(--rf-active); color: #06121d; }
  .rf-btn:disabled { opacity: 0.45; cursor: default; }
  .rf-step { width: 96px; font-size: 1.8em; }
  .rf-power { width: 100%; margin-top: 14px; }
  .rf-group { margin-top: 14px; }
  .rf-label { font-size: 0.85em; color: var(--rf-muted); margin-bottom: 6px; }
  .rf-row { display: flex; gap: 10px; }
  .rf-row .rf-btn { flex: 1; }
  .rf-info { display: flex; justify-content: space-around; margin-top: 16px; color: var(--rf-muted); font-size: 0.9em; }
  .rf-info b { color: var(--rf-text); font-variant-numeric: tabular-nums; margin-left: 4px; }
`;

class RvFridgeCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get _schema() {
    return [
      { name: "title", selector: { text: {} } },
      { name: "entity_power", selector: { entity: { domain: "switch" } } },
      { name: "entity_target", selector: { entity: { domain: "select" } } },
      { name: "entity_mode", selector: { entity: { domain: "select" } } },
      { name: "entity_battery_protection", selector: { entity: { domain: "select" } } },
      { name: "entity_temp", selector: { entity: { domain: "sensor" } } },
      { name: "entity_battery", selector: { entity: { domain: "sensor" } } },
      { name: "entity_voltage", selector: { entity: { domain: "sensor" } } },
    ];
  }

  _computeLabel(schema) {
    return t("editor_" + schema.name, this._hass);
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._config = ev.detail.value;
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            detail: { config: this._config },
            bubbles: true,
            composed: true,
          })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = this._schema;
    this._form.computeLabel = this._computeLabel.bind(this);
  }
}

customElements.define("rv-fridge-card-editor", RvFridgeCardEditor);

class RvFridgeCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("rv-fridge-card-editor");
  }

  static getStubConfig(hass) {
    return {
      title: t("default_title", hass),
      entity_power: "",
      entity_target: "",
      entity_mode: "",
      entity_battery_protection: "",
      entity_temp: "",
      entity_battery: "",
      entity_voltage: "",
    };
  }

  setConfig(config) {
    this._config = {
      entity_power: "",
      entity_target: "",
      entity_mode: "",
      entity_battery_protection: "",
      entity_temp: "",
      entity_battery: "",
      entity_voltage: "",
      ...config,
    };
    if (this._built) this._render();
    else this._build();
  }

  getCardSize() {
    return 9;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    this._render();
  }

  _build() {
    if (this._built || !this._config) return;
    this._built = true;

    const style = document.createElement("style");
    style.textContent = CARD_STYLE;

    const card = document.createElement("ha-card");
    card.innerHTML = `
      <div class="rf-head">
        <div class="rf-title"></div>
        <div class="rf-conn"><span class="rf-dot"></span><span class="rf-conn-text"></span></div>
      </div>
      <div class="rf-ring">
        <svg viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg">
          <path class="rf-track" d="${arcPath(1)}"/>
          <path class="rf-value" d=""/>
        </svg>
        <div class="rf-center">
          <div class="rf-status"></div>
          <div class="rf-target">--</div>
          <div class="rf-actual"></div>
        </div>
      </div>
      <div class="rf-adjust">
        <button class="rf-btn rf-step" data-step="-1">−</button>
        <button class="rf-btn rf-step" data-step="1">+</button>
      </div>
      <button class="rf-btn rf-power"></button>
      <div class="rf-group">
        <div class="rf-label rf-label-mode"></div>
        <div class="rf-row" data-group="mode">
          <button class="rf-btn" data-option="MAX">MAX</button>
          <button class="rf-btn" data-option="ECO">ECO</button>
        </div>
      </div>
      <div class="rf-group">
        <div class="rf-label rf-label-bp"></div>
        <div class="rf-row" data-group="bp">
          <button class="rf-btn" data-option="L">L</button>
          <button class="rf-btn" data-option="M">M</button>
          <button class="rf-btn" data-option="H">H</button>
        </div>
      </div>
      <div class="rf-info">
        <span><span class="rf-lbl-batt"></span><b class="rf-batt">--</b></span>
        <span><span class="rf-lbl-volt"></span><b class="rf-volt">--</b></span>
      </div>
    `;

    this.innerHTML = "";
    this.appendChild(style);
    this.appendChild(card);

    const q = (s) => card.querySelector(s);
    this._els = {
      title: q(".rf-title"),
      dot: q(".rf-dot"),
      connText: q(".rf-conn-text"),
      value: q(".rf-value"),
      status: q(".rf-status"),
      target: q(".rf-target"),
      actual: q(".rf-actual"),
      power: q(".rf-power"),
      labelMode: q(".rf-label-mode"),
      labelBp: q(".rf-label-bp"),
      lblBatt: q(".rf-lbl-batt"),
      lblVolt: q(".rf-lbl-volt"),
      batt: q(".rf-batt"),
      volt: q(".rf-volt"),
      stepBtns: card.querySelectorAll(".rf-step"),
      modeBtns: card.querySelectorAll('[data-group="mode"] .rf-btn'),
      bpBtns: card.querySelectorAll('[data-group="bp"] .rf-btn'),
    };

    this._els.stepBtns.forEach((b) =>
      b.addEventListener("click", () => this._step(parseInt(b.dataset.step, 10)))
    );
    this._els.power.addEventListener("click", () => this._togglePower());
    this._els.modeBtns.forEach((b) =>
      b.addEventListener("click", () => this._select(this._config.entity_mode, b.dataset.option))
    );
    this._els.bpBtns.forEach((b) =>
      b.addEventListener("click", () =>
        this._select(this._config.entity_battery_protection, b.dataset.option)
      )
    );
  }

  _state(entityId) {
    return entityId && this._hass ? this._hass.states[entityId] : undefined;
  }

  _num(entityId) {
    const s = this._state(entityId);
    const v = s ? parseFloat(s.state) : NaN;
    return Number.isFinite(v) ? v : NaN;
  }

  _targetValue() {
    if (this._pending !== undefined) return this._pending;
    const s = this._state(this._config.entity_target);
    if (!s) return NaN;
    const v = parseFloat(String(s.state).replace(/[^\d.\-]/g, ""));
    return Number.isFinite(v) ? v : NaN;
  }

  _isConnected() {
    const s = this._state(this._config.entity_temp);
    if (!s || s.state === "unavailable" || s.state === "unknown") return false;
    const stamp = Date.parse(s.last_reported || s.last_updated || "");
    return !Number.isFinite(stamp) || Date.now() - stamp < STALE_MS;
  }

  _step(delta) {
    const base = Number.isFinite(this._targetValue()) ? this._targetValue() : 5;
    this._pending = Math.max(T_MIN, Math.min(T_MAX, base + delta));
    this._render();
    clearTimeout(this._sendTimer);
    this._sendTimer = setTimeout(() => this._sendTarget(), DEBOUNCE_MS);
    clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => {
      this._pending = undefined;
      this._render();
    }, 30000);
  }

  _sendTarget() {
    if (!this._hass || !this._config.entity_target || this._pending === undefined) return;
    this._hass.callService("select", "select_option", {
      entity_id: this._config.entity_target,
      option: `${this._pending} °C`,
    });
  }

  _togglePower() {
    const s = this._state(this._config.entity_power);
    if (!this._hass || !this._config.entity_power || !s) return;
    this._hass.callService("switch", s.state === "on" ? "turn_off" : "turn_on", {
      entity_id: this._config.entity_power,
    });
  }

  _select(entityId, option) {
    if (!this._hass || !entityId) return;
    this._hass.callService("select", "select_option", { entity_id: entityId, option });
  }

  _render() {
    if (!this._hass || !this._els) return;
    const h = this._hass;
    const e = this._els;
    e.title.textContent = this._config.title || t("default_title", h);

    const connected = this._isConnected();
    e.dot.classList.toggle("ok", connected);
    e.connText.textContent = connected ? t("connected", h) : t("disconnected", h);

    const powerState = this._state(this._config.entity_power);
    const on = !!powerState && powerState.state === "on";
    const target = this._targetValue();
    const actual = this._num(this._config.entity_temp);

    // Pending-Wert ist bestaetigt, sobald die Kuehlbox ihn zurueckmeldet
    if (this._pending !== undefined) {
      const s = this._state(this._config.entity_target);
      const reported = s ? parseFloat(String(s.state).replace(/[^\d.\-]/g, "")) : NaN;
      if (reported === this._pending) this._pending = undefined;
    }

    e.target.textContent = Number.isFinite(target) ? `${fmt(target)} °C` : "--";
    e.actual.textContent = Number.isFinite(actual) ? `${t("actual", h)}: ${fmt(actual, 1)} °C` : "";

    let status;
    if (!connected) status = t("no_data", h);
    else if (!on) status = t("off", h);
    else if (Number.isFinite(target) && Number.isFinite(actual) && actual > target) status = t("cooling", h);
    else status = t("ready", h);
    e.status.textContent = status;

    const frac = Number.isFinite(target) ? (target - T_MIN) / (T_MAX - T_MIN) : 0;
    e.value.setAttribute("d", arcPath(frac));
    e.value.classList.toggle("off", !on);

    e.power.textContent = t("power", h);
    e.power.classList.toggle("active", on);
    e.power.disabled = !powerState;
    e.stepBtns.forEach((b) => (b.disabled = !this._state(this._config.entity_target)));

    const mark = (btns, entityId) => {
      const s = this._state(entityId);
      btns.forEach((b) => {
        b.classList.toggle("active", !!s && s.state === b.dataset.option);
        b.disabled = !s;
      });
    };
    e.labelMode.textContent = t("mode", h);
    e.labelBp.textContent = t("battery_protection", h);
    mark(e.modeBtns, this._config.entity_mode);
    mark(e.bpBtns, this._config.entity_battery_protection);

    const batt = this._num(this._config.entity_battery);
    const volt = this._num(this._config.entity_voltage);
    e.lblBatt.textContent = t("battery", h) + ":";
    e.lblVolt.textContent = t("voltage", h) + ":";
    e.batt.textContent = Number.isFinite(batt) ? `${fmt(batt)} %` : "--";
    e.volt.textContent = Number.isFinite(volt) ? `${fmt(volt, 1)} V` : "--";
  }
}

customElements.define("rv-fridge-card", RvFridgeCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "rv-fridge-card",
  name: "RV Fridge Card",
  description: "Control a compressor fridge: target temperature ring, on/off, mode and battery protection.",
});
