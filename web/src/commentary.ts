/**
 * Spanish narrator "plugin" — speaks live commentary using the browser's
 * SpeechSynthesis API with a Spanish voice. Self-contained: import the
 * `commentary` singleton and call its event methods (goal, kickoff, shot, ...).
 * No external assets. Lines are original, generic football commentary.
 */

const KICKOFF = [
  "¡Comienza el partido!",
  "¡Rueda el balón!",
  "¡Arranca el encuentro entre {A} y {B}!",
  "¡Y se pone en marcha el partido!",
];
const GOAL = [
  "¡GOOOOL!",
  "¡GOOOOL de {T}!",
  "¡La clavó! ¡GOL de {T}!",
  "¡Qué golazo! ¡GOOOL!",
  "¡Imparable! ¡GOOOL!",
  "¡Y es gol! ¡Lo festeja {T}!",
];
const SHOT = [
  "¡Remate!",
  "¡Disparo a puerta!",
  "¡Uy, peligro!",
  "¡Buscó el arco!",
  "¡Casi, casi!",
  "¡Lo intentó desde lejos!",
];
const SAVE = ["¡Gran atajada!", "¡La detuvo el portero!", "¡Paradón!", "¡Voló el arquero!"];
const PEN_GOAL = ["¡Gol desde los doce pasos!", "¡Adentro!", "¡Cambió por gol!", "¡Picó al portero!"];
const PEN_MISS = ["¡La falló!", "¡Afuera! ¡Increíble!", "¡Qué desperdicio!"];
const PEN_SAVE = ["¡Atajada en los penales!", "¡La detuvo el arquero!", "¡Paradón decisivo!"];

const pick = (a: string[]) => a[(Math.random() * a.length) | 0];

class Commentary {
  enabled = true;
  private voice: SpeechSynthesisVoice | null = null;
  private lastShotAt = 0;

  constructor() {
    if (!this.supported) return;
    this.pickVoice();
    try {
      speechSynthesis.addEventListener("voiceschanged", () => this.pickVoice());
    } catch {
      /* some browsers don't fire this; getVoices already worked */
    }
  }

  private get supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private pickVoice() {
    const vs = speechSynthesis.getVoices();
    // prefer es-MX / es-ES / es-419, then any Spanish, then null (browser default)
    this.voice =
      vs.find((v) => /^es[-_](mx|419|us)/i.test(v.lang)) ||
      vs.find((v) => /^es[-_]es/i.test(v.lang)) ||
      vs.find((v) => v.lang.toLowerCase().startsWith("es")) ||
      null;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on && this.supported) speechSynthesis.cancel();
  }
  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  private say(text: string, opts: { excited?: boolean; interrupt?: boolean } = {}) {
    if (!this.enabled || !this.supported) return;
    if (opts.interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang || "es-ES";
    u.rate = opts.excited ? 1.18 : 1.05;
    u.pitch = opts.excited ? 1.25 : 1.0;
    u.volume = 1;
    speechSynthesis.speak(u);
  }

  // ---- event hooks ----
  kickoff(a: string, b: string) {
    this.say(pick(KICKOFF).replace("{A}", a).replace("{B}", b), { interrupt: true });
  }
  goal(scorer: string) {
    this.say(pick(GOAL).replace(/\{T\}/g, scorer), { excited: true, interrupt: true });
  }
  shot() {
    const t = performance.now();
    if (t - this.lastShotAt < 2600 || (this.supported && speechSynthesis.speaking)) return;
    this.lastShotAt = t;
    this.say(pick(SHOT));
  }
  save() {
    if (this.supported && speechSynthesis.speaking) return;
    this.say(pick(SAVE));
  }
  fullTime(text: string) {
    this.say(text, { interrupt: true });
  }
  penalty(kind: "goal" | "miss" | "save") {
    const bank = kind === "goal" ? PEN_GOAL : kind === "miss" ? PEN_MISS : PEN_SAVE;
    this.say(pick(bank), { excited: kind === "goal", interrupt: true });
  }
}

export const commentary = new Commentary();
