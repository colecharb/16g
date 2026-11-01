// <variable-text animation="…" repel>: splits its text into letters so each
// one can animate the variable font's weight on its own. The animations
// themselves live in style.css, keyed on the `animation` attribute. With
// `repel`, the letters also shy away from the pointer (see Repel below).
//
// Each letter gets:
//   --wght  the element's own font weight, the target the animation moves around
//   --rand  a random number from 0 to 1, for staggering the letters
// and the element itself gets --font-size, its font size in px (unitless).
class VariableText extends HTMLElement {
    connectedCallback() {
        if (this.split) return;
        this.split = true;

        const text = this.textContent.trim().replace(/\s+/g, " ");
        const weight = getComputedStyle(this).fontWeight;

        // Screen readers get the whole word; the letters are decoration.
        const label = document.createElement("span");
        label.className = "sr-only";
        label.textContent = text;

        const letters = document.createElement("span");
        letters.setAttribute("aria-hidden", "true");
        text.split(" ").forEach((chars, i) => {
            // Spaces stay as plain text between words, so the text wraps
            // there and only there.
            if (i > 0) letters.append(" ");
            const word = document.createElement("span");
            word.className = "vt-word";
            for (const char of chars) {
                const letter = document.createElement("span");
                letter.className = "vt-letter";
                letter.textContent = char;
                letter.style.setProperty("--wght", weight);
                letter.style.setProperty("--rand", Math.random().toFixed(3));
                word.append(letter);
            }
            letters.append(word);
        });

        this.replaceChildren(label, letters);

        // Watch the parent: the font size follows the layout, and inline
        // elements like this one never report resizes themselves.
        const measure = () =>
            this.style.setProperty(
                "--font-size",
                parseFloat(getComputedStyle(this).fontSize),
            );
        measure();
        if (this.parentElement) new ResizeObserver(measure).observe(this.parentElement);

        if (this.hasAttribute("repel")) repel.add(this.querySelectorAll(".vt-letter"));
    }
}

// Letters near the pointer move away from it and lose weight: a mouse
// anywhere, or a finger while it's on the screen, including while it scrolls
// the page. Listeners are passive, so scrolling is never held up.
const RADIUS = 130; // px from a letter's centre where the pointer starts to push
const PUSH = 0.45; // furthest a letter moves, in ems of its own font size
const THIN = 600; // most weight a letter loses
// Half-lives in ms: how long a letter takes to cover half the remaining way to
// where it's headed. Letters dodge quickly and drift back slowly.
const AWAY_MS = 50;
const BACK_MS = 150;
const WGHT_MIN = 200; // the font's weight range
const WGHT_MAX = 800;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

class Repel {
    letters = [];
    pointer = null; // viewport coordinates, or null when there's no pointer
    frame = 0;
    last = 0; // time of the last frame, or 0 when the letters are at rest

    add(elements) {
        if (!this.letters.length) this.listen();
        for (const el of elements) {
            const weight = parseFloat(getComputedStyle(el).fontWeight);
            this.letters.push({ el, weight: Math.min(weight, WGHT_MAX), x: 0, y: 0, thin: 0 });
        }
        this.measure();
    }

    listen() {
        const options = { passive: true };

        // Mouse and pen.
        const point = (e) => {
            if (e.pointerType !== "touch") this.point(e);
        };
        addEventListener("pointerdown", point, options);
        addEventListener("pointermove", point, options);
        addEventListener("pointerup", (e) => e.pointerType === "pen" && this.release(), options);
        addEventListener("pointercancel", (e) => e.pointerType === "pen" && this.release(), options);
        document.documentElement.addEventListener(
            "pointerleave",
            (e) => e.pointerType !== "touch" && this.release(),
        );

        // Fingers. The browser cancels pointer events once a press turns
        // into a scroll, but touch events keep coming while the finger moves.
        const touch = (e) => {
            if (e.touches.length) this.point(e.touches[0]);
            else this.release();
        };
        addEventListener("touchstart", touch, options);
        addEventListener("touchmove", touch, options);
        addEventListener("touchend", touch, options);
        addEventListener("touchcancel", touch, options);
        addEventListener("scroll", () => this.schedule(), options);
        // Letter positions only change with the layout.
        new ResizeObserver(() => this.measure()).observe(document.documentElement);
        document.fonts.ready.then(() => this.measure());
    }

    point(e) {
        if (reduceMotion.matches) return;
        this.pointer = { x: e.clientX, y: e.clientY };
        this.schedule();
    }

    release() {
        this.pointer = null;
        this.schedule();
    }

    // Records where each letter sits at rest, in page coordinates, and fixes
    // its width there so thinning it doesn't shift its neighbours.
    measure() {
        for (const l of this.letters) {
            l.el.style.width = l.el.style.transform = l.el.style.fontWeight = "";
            l.x = l.y = l.thin = 0;
        }
        const rests = this.letters.map((l) => ({
            rect: l.el.getBoundingClientRect(),
            size: parseFloat(getComputedStyle(l.el).fontSize),
        }));
        this.letters.forEach((l, i) => {
            const { rect, size } = rests[i];
            l.el.style.width = `${rect.width}px`;
            l.cx = rect.left + rect.width / 2 + scrollX;
            l.cy = rect.top + rect.height / 2 + scrollY;
            l.push = PUSH * size;
        });
        this.schedule();
    }

    schedule() {
        if (!this.frame) this.frame = requestAnimationFrame((now) => this.tick(now));
    }

    tick(now) {
        this.frame = 0;
        // Cap the step so a stalled tab doesn't make letters jump.
        const dt = this.last ? Math.min(now - this.last, 100) : 1000 / 60;
        const away = 1 - 0.5 ** (dt / AWAY_MS);
        const back = 1 - 0.5 ** (dt / BACK_MS);
        let moving = false;
        for (const l of this.letters) {
            let tx = 0;
            let ty = 0;
            let tthin = 0;
            if (this.pointer) {
                const dx = l.cx - (this.pointer.x + scrollX);
                const dy = l.cy - (this.pointer.y + scrollY);
                const d = Math.hypot(dx, dy);
                if (d < RADIUS) {
                    const f = (1 - d / RADIUS) ** 2;
                    const step = l.push * f / (d || 1);
                    tx = dx * step;
                    ty = dy * step;
                    tthin = THIN * f;
                }
            }
            const settled =
                Math.abs(tx - l.x) < 0.05 && Math.abs(ty - l.y) < 0.05 && Math.abs(tthin - l.thin) < 1;
            if (settled && tx === l.x && ty === l.y && tthin === l.thin) continue;
            if (settled) {
                l.x = tx;
                l.y = ty;
                l.thin = tthin;
            } else {
                const ease = tthin < l.thin ? back : away;
                l.x += (tx - l.x) * ease;
                l.y += (ty - l.y) * ease;
                l.thin += (tthin - l.thin) * ease;
                moving = true;
            }
            l.el.style.transform = l.x || l.y ? `translate(${l.x}px, ${l.y}px)` : "";
            l.el.style.fontWeight = l.thin ? Math.max(WGHT_MIN, Math.round(l.weight - l.thin)) : "";
        }
        this.last = moving ? now : 0;
        if (moving) this.schedule();
    }
}

const repel = new Repel();

customElements.define("variable-text", VariableText);
