// .tilt: the element leans in 3D toward the pointer, as if it were a card
// pressed down where the pointer is, and settles back flat when it leaves.
// Only for a mouse or pen: a finger on the screen is scrolling the page.
//
// Each element gets:
//   --tilt-x, --tilt-y  its rotation about each axis, in degrees
//   --tilt-perspective  a viewing distance in proportion to its size, so big
//                       and small elements lean by the same amount
// The transform, and the easing back to flat, live in style.css.
const MAX_TILT = 10; // degrees, with the pointer at an edge
const PERSPECTIVE = 3; // viewing distance, in multiples of the element's width
// While the pointer is over it, the rotation follows a critically damped
// spring: it starts from rest and speeds up, so it eases in rather than
// jumping to wherever the pointer came in. Higher is stiffer and quicker.
const STIFFNESS = 18; // the spring's angular frequency, per second

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

class Tilt {
    // Current rotation, its velocity, and where it's headed, in degrees.
    x = 0;
    y = 0;
    vx = 0;
    vy = 0;
    targetX = 0;
    targetY = 0;
    frame = null;
    last = 0;

    constructor(el) {
        this.el = el;
        el.addEventListener("pointerenter", (e) => this.enter(e));
        el.addEventListener("pointermove", (e) => this.move(e));
        el.addEventListener("pointerleave", () => this.leave());
    }

    enter(e) {
        if (e.pointerType === "touch" || reduceMotion.matches) return;
        // Start the spring from wherever the last settle back to flat has got
        // to (the angles are registered, so CSS transitions them directly).
        const style = getComputedStyle(this.el);
        this.x = parseFloat(style.getPropertyValue("--tilt-x")) || 0;
        this.y = parseFloat(style.getPropertyValue("--tilt-y")) || 0;
        this.vx = this.vy = 0;
        this.el.style.setProperty("--tilt-perspective", `${this.el.offsetWidth * PERSPECTIVE}px`);
        this.el.classList.add("tilting");
        this.move(e);
    }

    move(e) {
        if (!this.el.classList.contains("tilting")) return;
        const box = this.el.getBoundingClientRect();
        // -1 to 1 across each axis, 0 in the middle.
        const px = ((e.clientX - box.left) / box.width) * 2 - 1;
        const py = ((e.clientY - box.top) / box.height) * 2 - 1;
        this.targetX = -py * MAX_TILT;
        this.targetY = px * MAX_TILT;
        if (this.frame === null) {
            this.last = performance.now();
            this.frame = requestAnimationFrame((t) => this.step(t));
        }
    }

    step(now) {
        // Capped, so a frame after the tab was in the background doesn't fling it.
        const dt = Math.min((now - this.last) / 1000, 1 / 30);
        this.last = now;
        const w = STIFFNESS;
        this.vx += (w * w * (this.targetX - this.x) - 2 * w * this.vx) * dt;
        this.vy += (w * w * (this.targetY - this.y) - 2 * w * this.vy) * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.el.style.setProperty("--tilt-x", `${this.x.toFixed(2)}deg`);
        this.el.style.setProperty("--tilt-y", `${this.y.toFixed(2)}deg`);

        const settled =
            Math.abs(this.targetX - this.x) + Math.abs(this.targetY - this.y) < 0.01 &&
            Math.abs(this.vx) + Math.abs(this.vy) < 0.01;
        this.frame = settled ? null : requestAnimationFrame((t) => this.step(t));
    }

    leave() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        // Hands back to the CSS transition, which eases it from here to flat.
        this.el.classList.remove("tilting");
        this.el.style.removeProperty("--tilt-x");
        this.el.style.removeProperty("--tilt-y");
    }
}

for (const el of document.querySelectorAll(".tilt")) new Tilt(el);
