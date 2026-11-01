// <variable-text animation="…">: splits its text into letters so each one can
// animate the variable font's weight on its own. The animations themselves
// live in style.css, keyed on the `animation` attribute.
//
// Each letter gets:
//   --wght  the element's own font weight, the target the animation moves around
//   --rand  a random number from 0 to 1, for staggering the letters
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
        for (const char of text) {
            // Spaces stay as plain text so the title can still wrap between words.
            if (char === " ") {
                letters.append(" ");
                continue;
            }
            const letter = document.createElement("span");
            letter.className = "vt-letter";
            letter.textContent = char;
            letter.style.setProperty("--wght", weight);
            letter.style.setProperty("--rand", Math.random().toFixed(3));
            letters.append(letter);
        }

        this.replaceChildren(label, letters);
    }
}

customElements.define("variable-text", VariableText);
