# Skill: Modern Web UI & UX Guidance (Google Chrome Standards)

## 1. CSS Modern Layout & Styling
- **Layouts:** Use CSS Grid for 2D layouts and Flexible Box (Flexbox) for 1D alignments. Always use the `gap` property for spacing instead of managing complex directional margins.
- **Logical Properties:** Use abstract directional properties for layout control to ensure native multi-directional (RTL/LTR) support:
  - `margin-inline` / `margin-block` instead of `margin-left`/`right`/`top`/`bottom`.
  - `padding-inline` / `padding-block` instead of `padding-left`/`right`/`top`/`bottom`.
  - `inset-inline-start` / `inset-block-start` instead of `left` / `top`.
- **Component Componentization:** Use CSS Container Queries (`@container`) instead of Media Queries (`@media`) for responsive component styling, ensuring components adapt to their parent container size.
- **Modern Selectors:** Leverage power-selectors like `:has()`, `:is()`, and `:where()` to minimize CSS specificity wars and remove redundant JS toggles.

## 2. Semantic HTML & Accessibility (a11y)
- **Interactive Elements:** Never style a `<div>` or `<span>` to look like a button. Use native `<button>` for actions and `<a>` for navigation.
- **Native Over Custom:** Use native HTML elements for complex UI components to get built-in keyboard navigation and ARIA roles for free:
  - Use `<dialog>` for modal and non-modal overlays (always trigger via `.showModal()`).
  - Use the `popover` attribute for menus, tooltips, and non-modal dropdowns.
  - Use `<details>` and `<summary>` for accordions.
- **Focus Management:** Ensure `:focus-visible` is styled for keyboard users. Do not suppress focus rings without providing an accessible alternative.

## 3. Web Performance & Core Web Vitals (INP, CLS, LCP)
- **Cumulative Layout Shift (CLS):** Always provide explicit `width` and `height` aspect-ratio attributes on `<img>`, `<video>`, and `<iframe>` elements, or use the CSS `aspect-ratio` property to reserve space during render.
- **Interaction to Next Paint (INP):** For heavy JavaScript tasks, split long tasks using `scheduler.yield()` or `setTimeout()` to keep the main thread responsive to user inputs.
- **Resource Loading:** Use native `loading="lazy"` for images and frames below the fold. Avoid blocking scripts in the `<head>`.

## 4. Web Security & DOM Manipulation
- **XSS Mitigation:** Never use `.innerHTML` or React's `dangerouslySetInnerHTML` with untrusted user input. Use safe alternatives:
  - `element.textContent` or `element.innerText` for text.
  - Native Sanitizer API or trusted libraries (like DOMPurify) if rendering HTML is absolutely necessary.
- **Forms:** Always explicitly associate `<label>` elements with their inputs using `id` and `for`. Provide appropriate `autocomplete` attributes (`current-password`, `username`, `email`) to aid password managers and user security.